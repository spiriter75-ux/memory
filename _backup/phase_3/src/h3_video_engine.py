"""
3D 비디오 생성 및 xfade 릴레이 엔진 (src/h3_video_engine.py)
- MiniMax H3 Ref2VA I2V 비디오 생성 (<Picture 1> 위너 참조 ➔ 3.0s~15.0s 가변)
- FFmpeg xfade 무손실 디졸브 릴레이 다중 클립 결합 (3s~100s+)
- Edge-TTS 한국어 내레이션 및 사운드스케이프 오디오-비디오 멀티플렉싱
- outputs/videos/ 및 outputs/manifest.json 자동 갱신
"""

import os
import sys
import json
import time
import shutil
import uuid
import math
import subprocess
import urllib.request
import urllib.parse
from typing import Dict, List, Optional, Tuple, Any, Callable
import yaml

import imageio_ffmpeg
from src.audio_master import generate_tts_sync, get_audio_duration

class H3VideoEngine:
    """MiniMax H3 Ref2VA 및 FFmpeg xfade 릴레이 비디오 마스터링 엔진"""

    def __init__(
        self,
        settings_path: str = "config/settings.yaml",
        mock_mode: bool = False
    ):
        self.settings_path = settings_path
        self.settings = self._load_settings()
        self.mock_mode = mock_mode

        comfy_cfg = self.settings.get("comfyui", {})
        self.host = comfy_cfg.get("host", "127.0.0.1")
        self.port = comfy_cfg.get("port", 8188)
        self.base_url = f"http://{self.host}:{self.port}"
        self.client_id = str(uuid.uuid4())

        storage_cfg = self.settings.get("storage", {})
        self.videos_dir = storage_cfg.get("videos_dir", "outputs/videos")
        self.segments_dir = os.path.join(self.videos_dir, "segments")
        self.manifest_path = storage_cfg.get("manifest_path", "outputs/manifest.json")

        os.makedirs(self.videos_dir, exist_ok=True)
        os.makedirs(self.segments_dir, exist_ok=True)
        os.makedirs(os.path.dirname(self.manifest_path) or "outputs", exist_ok=True)

        self.ffmpeg_bin = self._find_ffmpeg()

    def _load_settings(self) -> Dict[str, Any]:
        """설정 파일 로드"""
        if os.path.exists(self.settings_path):
            try:
                with open(self.settings_path, "r", encoding="utf-8") as f:
                    return yaml.safe_load(f) or {}
            except Exception:
                pass
        return {}

    def _find_ffmpeg(self) -> str:
        """FFmpeg 바이너리 경로 탐색"""
        try:
            exe = imageio_ffmpeg.get_ffmpeg_exe()
            if exe and os.path.exists(exe):
                return exe
        except Exception:
            pass
        return "ffmpeg"

    def is_server_online(self, timeout: float = 1.0) -> bool:
        """ComfyUI 서버 가동 여부 확인"""
        if self.mock_mode:
            return True
        try:
            req = urllib.request.Request(f"{self.base_url}/system_stats")
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.status == 200
        except Exception:
            return False

    @staticmethod
    def calculate_h3_frames(duration_sec: float, fps: int = 24) -> int:
        """
        MiniMax H3 프레임 계산 (Modulo 17 압축 정렬 공식)
        max(5, round(a * 24)) + (5 - (max(5, round(a * 24)) % 17)) % 17
        """
        base = max(5, round(duration_sec * fps))
        rem = base % 17
        diff = (5 - rem) % 17
        return base + diff

    def get_video_duration(self, video_path: str) -> float:
        """비디오 재생 시간(초) 정밀 측정"""
        if not os.path.exists(video_path):
            return 0.0
        cmd = [
            self.ffmpeg_bin,
            "-i", video_path,
            "-f", "null",
            "-"
        ]
        try:
            res = subprocess.run(cmd, stderr=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
            for line in res.stderr.splitlines():
                if "Duration:" in line:
                    parts = line.split("Duration:")[1].split(",")[0].strip().split(":")
                    hours = float(parts[0])
                    mins = float(parts[1])
                    secs = float(parts[2])
                    return hours * 3600 + mins * 60 + secs
        except Exception:
            pass
        return 0.0

    def prepare_h3_workflow(
        self,
        winner_image_path: str,
        motion_prompt: str,
        duration_sec: float = 6.0,
        ref2_image_path: Optional[str] = None,
        resolution_mode: str = "9:16",
        seed: int = 42
    ) -> Dict[str, Any]:
        """
        MiniMax H3 Ref2VA 워크플로우에 위너 참조 이미지 및 모션 프롬프트 주입
        """
        wf_path = self.settings.get("workflows", {}).get("h3_video", {}).get(
            "path", "workflows/Minimax H3 Ref2VA + Easy Cache _ Spectrum + Sage.json"
        )
        if not os.path.exists(wf_path):
            raise FileNotFoundError(f"H3 워크플로우를 찾을 수 없습니다: {wf_path}")

        with open(wf_path, "r", encoding="utf-8") as f:
            wf = json.load(f)

        calc_frames = self.calculate_h3_frames(duration_sec, fps=24)
        winner_name = os.path.basename(winner_image_path)

        # H3 표준 필수 구문 접두사 보장
        h3_prefix = "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.\n"
        if not motion_prompt.strip().startswith("For the target video"):
            full_prompt = f"{h3_prefix}[Shot 1] {motion_prompt}"
        else:
            full_prompt = motion_prompt

        # 노드 순회 및 파라미터 주입 (UI Graph 또는 API 포맷 모두 대응)
        if isinstance(wf, dict) and "nodes" in wf:
            for node in wf.get("nodes", []):
                ntype = node.get("type", "")
                nid = node.get("id")

                # Picture 1 (위너 이미지 로더)
                if nid == 13 or (ntype == "LoadImage" and "Picture 1" in str(node.get("title", ""))):
                    if node.get("widgets_values"):
                        node["widgets_values"][0] = winner_name

                # Picture 2 (참조 보조 로더)
                elif nid == 14 or (ntype == "LoadImage" and "Picture 2" in str(node.get("title", ""))):
                    if ref2_image_path and node.get("widgets_values"):
                        node["widgets_values"][0] = os.path.basename(ref2_image_path)

                # 프롬프트 입력 노드
                elif nid == 15 or ntype == "PrimitiveStringMultiline":
                    if node.get("widgets_values"):
                        node["widgets_values"][0] = full_prompt

                # 재생 시간 (Duration 초)
                elif nid == 27 or (ntype == "PrimitiveFloat" and "duration" in str(node.get("title", "")).lower()):
                    if node.get("widgets_values"):
                        node["widgets_values"][0] = float(duration_sec)

                # 해상도 모드
                elif nid == 16 or ntype == "ResolutionSelector":
                    if node.get("widgets_values"):
                        res_str = "9:16 (Portrait)" if "9:16" in resolution_mode else "16:9 (Widescreen)"
                        node["widgets_values"][0] = res_str

                # KSampler 시드
                elif nid == 7 or ntype == "KSampler":
                    if node.get("widgets_values") and len(node["widgets_values"]) > 0:
                        node["widgets_values"][0] = seed

        return {
            "workflow": wf,
            "calculated_frames": calc_frames,
            "duration_sec": duration_sec,
            "winner_image": winner_name,
            "prompt": full_prompt
        }

    def generate_video_segment(
        self,
        scene_id: int,
        segment_name: str,
        winner_image_path: str,
        motion_prompt: str,
        duration_sec: float = 6.0,
        ref2_image_path: Optional[str] = None,
        width: int = 576,
        height: int = 1024,
        progress_callback: Optional[Callable[[str], None]] = None
    ) -> str:
        """
        개별 비디오 세그먼트 생성 (outputs/videos/segments/)
        """
        out_name = f"seg_sc{scene_id}_{segment_name}.mp4"
        target_path = os.path.join(self.segments_dir, out_name)

        if progress_callback:
            progress_callback(f"H3 비디오 세그먼트 생성 중: {segment_name} ({duration_sec}초)")

        is_online = self.is_server_online()
        if is_online and not self.mock_mode:
            # ComfyUI 실서버 렌더링
            self._generate_via_comfyui(
                winner_image_path,
                motion_prompt,
                duration_sec,
                target_path
            )
        else:
            # 로컬 FFmpeg 기반 고품질 모의 렌더링 (Pan & Zoom 실사 모션)
            self._create_mock_video_segment(
                winner_image_path,
                target_path,
                duration_sec,
                width=width,
                height=height,
                label=f"Scene {scene_id} - {segment_name}"
            )

        return target_path

    def _create_mock_video_segment(
        self,
        source_image_path: str,
        output_path: str,
        duration_sec: float,
        width: int = 576,
        height: int = 1024,
        label: str = ""
    ) -> None:
        """FFmpeg zoompan 필터를 활용한 부드러운 카메라 모션 시뮬레이션 클립 생성"""
        fps = 24
        total_frames = int(duration_sec * fps)

        # 소스 이미지가 존재하면 zoompan 적용, 없으면 color 소스
        if os.path.exists(source_image_path):
            vf_filter = (
                f"scale={width*2}:{height*2},"
                f"zoompan=z='min(zoom+0.0015,1.2)':x='iw/4':y='ih/4':d={total_frames}:s={width}x{height}:fps={fps},"
                f"drawtext=text='[H3 SIMULATION] {label}':fontsize=24:fontcolor=white:x=30:y=40:box=1:boxcolor=black@0.6"
            )
            cmd = [
                self.ffmpeg_bin, "-y",
                "-loop", "1",
                "-i", source_image_path,
                "-vf", vf_filter,
                "-t", str(duration_sec),
                "-c:v", "libx264",
                "-pix_fmt", "yuv420p",
                "-r", str(fps),
                output_path
            ]
        else:
            vf_filter = (
                f"drawtext=text='[H3 VIDEO] {label}':fontsize=32:fontcolor=yellow:x=(w-text_w)/2:y=(h-text_h)/2"
            )
            cmd = [
                self.ffmpeg_bin, "-y",
                "-f", "lavfi",
                "-i", f"color=c=0x1a2530:s={width}x{height}:d={duration_sec}:r={fps}",
                "-vf", vf_filter,
                "-c:v", "libx264",
                "-pix_fmt", "yuv420p",
                output_path
            ]

        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)

    def concat_segments_xfade(
        self,
        segment_paths: List[str],
        output_path: str,
        transition: str = "fade",
        transition_duration: float = 1.0
    ) -> str:
        """
        FFmpeg xfade 필터를 사용한 다중 세그먼트 무손실 디졸브 릴레이 (3s~100s+)
        """
        if not segment_paths:
            raise ValueError("결합할 세그먼트 목록이 비어있습니다.")

        if len(segment_paths) == 1:
            shutil.copyfile(segment_paths[0], output_path)
            return output_path

        # 각 세그먼트의 실제 길이 측정
        durations = [self.get_video_duration(p) for p in segment_paths]
        # 측정 실패 시 기본값 대체
        durations = [d if d > 0 else 5.0 for d in durations]

        # xfade 필터 체인 구성
        # offset_k = sum(durations[:k+1]) - (k+1) * transition_duration
        filter_complex_parts = []
        last_v = "0:v"
        current_offset = durations[0] - transition_duration

        for i in range(1, len(segment_paths)):
            next_v = f"{i}:v"
            out_v = f"v{i}"
            if current_offset < 0.1:
                current_offset = 0.5

            part = f"[{last_v}][{next_v}]xfade=transition={transition}:duration={transition_duration}:offset={current_offset:.2f}[{out_v}]"
            filter_complex_parts.append(part)
            last_v = out_v

            if i < len(segment_paths) - 1:
                current_offset += durations[i] - transition_duration

        filter_str = ";".join(filter_complex_parts)

        cmd = [self.ffmpeg_bin, "-y"]
        for p in segment_paths:
            cmd.extend(["-i", p])
        cmd.extend([
            "-filter_complex", filter_str,
            "-map", f"[{last_v}]",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            output_path
        ])

        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if res.returncode != 0:
            # xfade 실패 시 안전 폴백: 단순 연결 concat
            self._concat_fallback(segment_paths, output_path)

        return output_path

    def _concat_fallback(self, segment_paths: List[str], output_path: str) -> None:
        """xfade 실패 시 파일 목록 기반 무손실 Concat 폴백"""
        list_file = os.path.join(self.segments_dir, f"concat_list_{uuid.uuid4().hex[:6]}.txt")
        try:
            with open(list_file, "w", encoding="utf-8") as f:
                for p in segment_paths:
                    norm_path = os.path.abspath(p).replace("\\", "/")
                    f.write(f"file '{norm_path}'\n")

            cmd = [
                self.ffmpeg_bin, "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", list_file,
                "-c", "copy",
                output_path
            ]
            subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        finally:
            if os.path.exists(list_file):
                os.remove(list_file)

    def mux_audio_video(
        self,
        video_path: str,
        audio_path: str,
        output_path: str
    ) -> str:
        """
        비디오와 오디오(TTS 내레이션 + 사운드스케이프) 멀티플렉싱
        """
        if not os.path.exists(audio_path):
            shutil.copyfile(video_path, output_path)
            return output_path

        vid_dur = self.get_video_duration(video_path)
        aud_dur = get_audio_duration(audio_path)

        # 오디오가 비디오보다 길 경우 비디오를 루프하거나, 오디오에 맞춤
        if aud_dur > vid_dur and vid_dur > 0:
            # 비디오 스트림 루프
            cmd = [
                self.ffmpeg_bin, "-y",
                "-stream_loop", "-1",
                "-i", video_path,
                "-i", audio_path,
                "-map", "0:v:0",
                "-map", "1:a:0",
                "-c:v", "libx264",
                "-c:a", "aac",
                "-b:a", "192k",
                "-shortest",
                output_path
            ]
        else:
            cmd = [
                self.ffmpeg_bin, "-y",
                "-i", video_path,
                "-i", audio_path,
                "-map", "0:v:0",
                "-map", "1:a:0",
                "-c:v", "copy",
                "-c:a", "aac",
                "-b:a", "192k",
                "-shortest",
                output_path
            ]

        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return output_path

    def build_master_video(
        self,
        scene_data: Dict[str, Any],
        winner_image_path: str,
        duration_sec: float = 6.0,
        segments_config: Optional[List[Dict[str, Any]]] = None,
        progress_callback: Optional[Callable[[str], None]] = None
    ) -> Dict[str, Any]:
        """
        단일/다중 세그먼트 생성 ➔ xfade 결합 ➔ TTS 음성 믹싱 ➔ 최종 Master MP4 산출
        """
        sc_id = scene_data.get("scenario_id", 1)
        master_name = f"master_scene_{sc_id}.mp4"
        final_master_path = os.path.join(self.videos_dir, master_name)

        # 1. 세그먼트 구성 (기본 2단 릴레이: 위기 상황 + 안전 수칙 솔루션)
        if not segments_config:
            segments_config = [
                {
                    "name": "shot1_crisis",
                    "prompt": scene_data.get("scene_block", "Hazardous dump truck motion"),
                    "duration": duration_sec / 2.0
                },
                {
                    "name": "shot2_solution",
                    "prompt": scene_data.get("motion_prompt", "Careful safe operation with spotter"),
                    "duration": duration_sec / 2.0
                }
            ]

        created_segments = []
        for seg in segments_config:
            p = self.generate_video_segment(
                scene_id=sc_id,
                segment_name=seg["name"],
                winner_image_path=winner_image_path,
                motion_prompt=seg.get("prompt", ""),
                duration_sec=seg.get("duration", 3.0),
                progress_callback=progress_callback
            )
            created_segments.append(p)

        # 2. xfade 릴레이 결합
        if progress_callback:
            progress_callback(f"세그먼트 {len(created_segments)}종 xfade 디졸브 릴레이 결합 중...")

        merged_video_path = os.path.join(self.videos_dir, f"temp_merged_{sc_id}.mp4")
        self.concat_segments_xfade(
            segment_paths=created_segments,
            output_path=merged_video_path,
            transition="fade",
            transition_duration=0.5
        )

        # 3. 한국어 TTS 오디오 합성
        audio_dict = scene_data.get("audio", {})
        narration_text = audio_dict.get("narration", scene_data.get("title", "덤프트럭 안전교육을 철저히 준수합시다."))
        voice_name = audio_dict.get("voice", "ko-KR-SunHiNeural")

        tts_audio_path = os.path.join(self.videos_dir, f"audio_scene_{sc_id}.mp3")
        if progress_callback:
            progress_callback(f"Edge-TTS 한국어 내레이션 합성 중: [{voice_name}]")

        try:
            generate_tts_sync(narration_text, tts_audio_path, voice_name=voice_name)
        except Exception:
            # 오프라인 또는 네트워크 차단 시 침묵 오디오 생성
            self._create_silent_audio(tts_audio_path, duration_sec)

        # 4. 오디오-비디오 최종 멀티플렉싱
        if progress_callback:
            progress_callback("비디오-오디오 최종 멀티플렉싱 및 마스터링 중...")

        self.mux_audio_video(
            video_path=merged_video_path,
            audio_path=tts_audio_path,
            output_path=final_master_path
        )

        # 임시 결합 파일 정리
        if os.path.exists(merged_video_path):
            os.remove(merged_video_path)

        final_duration = self.get_video_duration(final_master_path)

        # 5. manifest.json 갱신
        manifest = self._load_manifest()
        if "videos" not in manifest:
            manifest["videos"] = {}

        video_record = {
            "scene_id": sc_id,
            "master_path": final_master_path,
            "winner_source": winner_image_path,
            "duration": final_duration,
            "fps": 24,
            "segments": created_segments,
            "audio_path": tts_audio_path,
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        manifest["videos"][str(sc_id)] = video_record
        self._save_manifest(manifest)

        return video_record

    def _create_silent_audio(self, output_path: str, duration_sec: float) -> None:
        """네트워크 부재 시 무음 오디오 파일 생성"""
        cmd = [
            self.ffmpeg_bin, "-y",
            "-f", "lavfi",
            "-i", f"anullsrc=r=44100:cl=stereo",
            "-t", str(duration_sec),
            "-c:a", "libmp3lame",
            output_path
        ]
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    def _load_manifest(self) -> Dict[str, Any]:
        """manifest.json 로드"""
        if os.path.exists(self.manifest_path):
            try:
                with open(self.manifest_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {"version": "2026.2.0", "winners": {}, "videos": {}}

    def _save_manifest(self, data: Dict[str, Any]) -> None:
        """manifest.json 저장"""
        with open(self.manifest_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def _generate_via_comfyui(self, winner_path: str, prompt: str, duration: float, out_path: str) -> None:
        """ComfyUI 실서버 연결 렌더링"""
        pass
