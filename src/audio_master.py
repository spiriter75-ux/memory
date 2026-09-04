"""
사운드 및 자막 마스터링 엔진 (src/audio_master.py)
- Edge-TTS 한국어 고품질 신경망 음성 합성
- FFmpeg 듀얼 레이아웃 자막 오버레이 (상단 경고 배지 + 하단 고대비 자막 바)
- 9:16 세로형(576x1024) 및 16:9 가로형 자동 종횡비 감지 합성
"""

import os
import sys
import time
import asyncio
import subprocess
import imageio_ffmpeg
import edge_tts
from PIL import ImageFont

VOICES = {
    "announcer_male": "ko-KR-InJoonNeural",       # 신뢰감 있는 표준 남성 아나운서 (기본값)
    "announcer_female": "ko-KR-SunHiNeural",     # 명확하고 부드러운 여성 아나운서
    "safety_turtle": "ko-KR-HyunsuNeural",       # 친근한 안전 거북이
    "warning_male": "ko-KR-BongJinNeural"        # 단호하고 무게감 있는 현장 경고
}

DEFAULT_VOICE = "ko-KR-InJoonNeural"

def find_korean_font(size: int = 24):
    """시스템 내 한글 폰트(맑은고딕, 나눔고딕 등) 자동 탐색"""
    candidates = [
        "C:/Windows/Fonts/malgunbd.ttf",
        "C:/Windows/Fonts/malgun.ttf",
        "C:/Windows/Fonts/gulim.ttc",
        "C:/Windows/Fonts/arial.ttf"
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                return p
            except Exception:
                pass
    return "C:/Windows/Fonts/malgun.ttf"

async def _generate_audio_async(text: str, output_path: str, voice_name: str = DEFAULT_VOICE, rate: str = "+0%"):
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    communicate = edge_tts.Communicate(text, voice_name, rate=rate)
    await communicate.save(output_path)
    return output_path

def generate_tts_sync(text: str, output_path: str, voice_name: str = DEFAULT_VOICE, rate: str = "+0%"):
    """Edge-TTS 기반 고품질 한국어 음성 동기 생성"""
    try:
        asyncio.run(_generate_audio_async(text, output_path, voice_name, rate))
        return output_path
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(_generate_audio_async(text, output_path, voice_name, rate))
        return output_path

def get_audio_duration(audio_path: str) -> float:
    """FFprobe/imageio_ffmpeg을 사용하여 오디오 재생 시간(초)을 정밀 측정"""
    if not os.path.exists(audio_path):
        return 0.0
    
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [ffmpeg_exe, "-i", audio_path]
    p = subprocess.run(cmd, stderr=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    output = p.stderr
    
    for line in output.split("\n"):
        if "Duration:" in line:
            try:
                parts = line.split("Duration:")[1].split(",")[0].strip().split(":")
                hours = float(parts[0])
                mins = float(parts[1])
                secs = float(parts[2])
                return hours * 3600 + mins * 60 + secs
            except Exception:
                pass
    return 0.0

def overlay_subtitles_and_audio(
    input_video_path: str,
    output_video_path: str,
    title_text: str,
    subtitle_text: str,
    audio_path: str = None,
    width: int = 576,
    height: int = 1024
) -> str:
    """
    영상에 상단 타이틀 경고 배지, 하단 안전 수칙 자막, Edge-TTS 음성을 합성하여 최종 MP4 생성
    """
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    os.makedirs(os.path.dirname(os.path.abspath(output_video_path)), exist_ok=True)
    
    font_path_raw = find_korean_font()
    font_path = font_path_raw.replace("\\", "/").replace(":", "\\\\:")
    
    clean_title = title_text.replace(":", "\\:").replace("'", "").replace('"', '')
    clean_sub = subtitle_text.replace(":", "\\:").replace("'", "").replace('"', '')
    
    # 세로형(9:16) vs 가로형(16:9) 레이아웃 자동 계산
    is_vertical = height > width
    
    if is_vertical:
        # 9:16 (576x1024) 세로형 레이아웃
        top_box_y = 30
        top_box_h = 50
        top_text_y = 42
        top_font_size = 20
        
        bot_box_h = 100
        bot_box_y = height - bot_box_h - 40
        bot_text_y = bot_box_y + 36
        bot_font_size = 22
    else:
        # 16:9 가로형 레이아웃
        top_box_y = 15
        top_box_h = 36
        top_text_y = 21
        top_font_size = 18
        
        bot_box_h = 65
        bot_box_y = height - bot_box_h - 10
        bot_text_y = bot_box_y + 20
        bot_font_size = 19
        
    vf_filters = [
        f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}",
        # 상단 타이틀 박스 (노란색 텍스트 경고 배지)
        f"drawbox=x=15:y={top_box_y}:w={width-30}:h={top_box_h}:color=black@0.70:t=fill",
        f"drawtext=fontfile='{font_path}':text='{clean_title}':x=(w-text_w)/2:y={top_text_y}:fontsize={top_font_size}:fontcolor=yellow:shadowcolor=black:shadowx=1:shadowy=1",
        # 하단 자막 박스 (고대비 화이트 텍스트)
        f"drawbox=x=0:y={bot_box_y}:w={width}:h={bot_box_h}:color=black@0.85:t=fill",
        f"drawtext=fontfile='{font_path}':text='{clean_sub}':x=(w-text_w)/2:y={bot_text_y}:fontsize={bot_font_size}:fontcolor=white:shadowcolor=black:shadowx=1:shadowy=1"
    ]
    vf_chain = ",".join(vf_filters)
    
    cmd = [ffmpeg_exe, "-y", "-i", input_video_path]
    if audio_path and os.path.exists(audio_path):
        cmd.extend(["-i", audio_path, "-c:a", "aac", "-b:a", "192k", "-shortest"])
    else:
        cmd.extend(["-c:a", "copy"])
        
    cmd.extend([
        "-vf", vf_chain,
        "-c:v", "libx264",
        "-preset", "fast",
        "-pix_fmt", "yuv420p",
        output_video_path
    ])
    
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return output_video_path
