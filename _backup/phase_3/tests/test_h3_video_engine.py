"""
3D 비디오 생성 및 xfade 릴레이 엔진 단위 테스트 (tests/test_h3_video_engine.py)
"""

import os
import json
import unittest

from src.h3_video_engine import H3VideoEngine

class TestH3VideoEngine(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = H3VideoEngine(
            settings_path="config/settings.yaml",
            mock_mode=True
        )
        cls.test_winner = "outputs/winners/test_winner.png"
        os.makedirs("outputs/winners", exist_ok=True)
        # 테스트용 더미 위너 이미지 생성
        from PIL import Image
        img = Image.new("RGB", (576, 1024), color=(40, 50, 70))
        img.save(cls.test_winner)

        cls.sample_scene = {
            "scenario_id": 8,
            "title": "현장 사각지대 인식",
            "scene_block": "대형 덤프트럭 우회전 중 보행자 사각지대 주의",
            "motion_prompt": "The 25-ton dump truck turns right slowly, stopping for pedestrian.",
            "audio": {
                "narration": "우회전 전에는 반드시 일시 정지하고 우측 사각지대를 거울과 카메라로 확실히 확인해야 합니다.",
                "voice": "ko-KR-SunHiNeural"
            }
        }

    def test_calculate_h3_frames(self):
        """MiniMax H3 Frame Modulo 17 계산 공식 정합성 검증"""
        # 3.0s @ 24fps -> 73 frames
        self.assertEqual(H3VideoEngine.calculate_h3_frames(3.0, 24), 73)
        # 5.0s @ 24fps -> 124 frames
        self.assertEqual(H3VideoEngine.calculate_h3_frames(5.0, 24), 124)
        # 6.0s @ 24fps -> 158 frames
        self.assertEqual(H3VideoEngine.calculate_h3_frames(6.0, 24), 158)
        # 10.0s @ 24fps -> 243 frames
        self.assertEqual(H3VideoEngine.calculate_h3_frames(10.0, 24), 243)
        # 15.0s @ 24fps -> 362 frames
        self.assertEqual(H3VideoEngine.calculate_h3_frames(15.0, 24), 362)

    def test_prepare_h3_workflow(self):
        """H3 워크플로우에 <Picture 1> 위너 및 모션 프롬프트 주입 검증"""
        res = self.engine.prepare_h3_workflow(
            winner_image_path=self.test_winner,
            motion_prompt="The truck moves steadily forward.",
            duration_sec=6.0,
            resolution_mode="9:16"
        )
        self.assertIn("workflow", res)
        self.assertEqual(res["calculated_frames"], 158)
        self.assertEqual(res["duration_sec"], 6.0)
        self.assertIn("For the target video", res["prompt"])
        self.assertEqual(res["winner_image"], "test_winner.png")

    def test_generate_video_segment(self):
        """개별 비디오 세그먼트 생성 및 실물 MP4 파일 유효성 검증"""
        seg_path = self.engine.generate_video_segment(
            scene_id=8,
            segment_name="test_seg",
            winner_image_path=self.test_winner,
            motion_prompt="Slow motion test",
            duration_sec=2.0
        )
        self.assertTrue(os.path.exists(seg_path), f"세그먼트 파일이 생성되어야 합니다: {seg_path}")
        duration = self.engine.get_video_duration(seg_path)
        self.assertGreater(duration, 1.5, f"세그먼트 재생시간이 1.5초 이상이어야 합니다: {duration}")

    def test_concat_segments_xfade(self):
        """2개 세그먼트 xfade 디졸브 릴레이 결합 검증"""
        seg1 = self.engine.generate_video_segment(
            scene_id=8, segment_name="xfade_1",
            winner_image_path=self.test_winner,
            motion_prompt="Clip 1", duration_sec=2.0
        )
        seg2 = self.engine.generate_video_segment(
            scene_id=8, segment_name="xfade_2",
            winner_image_path=self.test_winner,
            motion_prompt="Clip 2", duration_sec=2.0
        )

        out_merged = os.path.join(self.engine.videos_dir, "test_xfade_merged.mp4")
        res_path = self.engine.concat_segments_xfade(
            segment_paths=[seg1, seg2],
            output_path=out_merged,
            transition="fade",
            transition_duration=0.5
        )
        self.assertTrue(os.path.exists(res_path))
        dur = self.engine.get_video_duration(res_path)
        self.assertGreater(dur, 2.5, f"결합 비디오 길이가 유효해야 합니다: {dur}")

    def test_mux_audio_video(self):
        """비디오와 오디오 멀티플렉싱 검증"""
        seg = self.engine.generate_video_segment(
            scene_id=8, segment_name="mux_test",
            winner_image_path=self.test_winner,
            motion_prompt="Mux clip", duration_sec=2.0
        )
        # 더미 오디오 생성
        dummy_audio = os.path.join(self.engine.videos_dir, "test_dummy.mp3")
        self.engine._create_silent_audio(dummy_audio, 2.0)

        out_mux = os.path.join(self.engine.videos_dir, "test_muxed.mp4")
        self.engine.mux_audio_video(seg, dummy_audio, out_mux)
        self.assertTrue(os.path.exists(out_mux))
        dur = self.engine.get_video_duration(out_mux)
        self.assertGreater(dur, 1.5)

    def test_build_master_video(self):
        """엔드투엔드 Master 비디오 생성 및 manifest.json 등록 검증"""
        record = self.engine.build_master_video(
            scene_data=self.sample_scene,
            winner_image_path=self.test_winner,
            duration_sec=3.0
        )
        self.assertIn("master_path", record)
        self.assertTrue(os.path.exists(record["master_path"]))
        self.assertEqual(record["scene_id"], 8)
        self.assertGreater(record["duration"], 1.5)

        # manifest.json 확인
        with open(self.engine.manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)
        self.assertIn("videos", manifest)
        self.assertIn("8", manifest["videos"])
        self.assertEqual(manifest["videos"]["8"]["master_path"], record["master_path"])

if __name__ == "__main__":
    unittest.main()
