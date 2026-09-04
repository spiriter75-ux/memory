"""
2D 고증 듀얼 파이프라인 엔진 단위 테스트 (tests/test_krea_qwen_engine.py)
"""

import os
import json
import unittest
from PIL import Image

from src.krea_qwen_engine import KreaQwenEngine, QWEN_COMPLIANCE_PRESETS
from src.prompt_builder import PromptBuilder

class TestKreaQwenEngine(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = KreaQwenEngine(
            settings_path="config/settings.yaml",
            mock_mode=True
        )
        cls.sample_scene = {
            "scenario_id": 8,
            "title": "현장 사각지대 인식",
            "site_preset": "urban_crossroad",
            "cargo_state": "loaded_soil",
            "weather_preset": "dry_daylight",
            "role_preset": "driver_cabin",
            "scene_block": "우회전 중 사각지대 보행자 확인"
        }

    def test_engine_initialization_and_directories(self):
        """엔진 초기화 및 저장소 디렉터리 자동 생성 확인"""
        self.assertTrue(os.path.exists(self.engine.candidates_dir))
        self.assertTrue(os.path.exists(self.engine.winners_dir))
        self.assertTrue(self.engine.is_server_online())

    def test_prepare_krea_t2i_prompt(self):
        """Krea T2I 워크플로우 파라미터 주입 검증"""
        wf = self.engine.prepare_krea_t2i_prompt(
            self.sample_scene,
            seed=42,
            steps=8,
            cfg=1.0,
            width=576,
            height=1024
        )
        self.assertIsInstance(wf, dict)
        self.assertIn("7", wf, "Positive Prompt 노드가 존재해야 합니다.")
        self.assertIn("9", wf, "Negative Prompt 노드가 존재해야 합니다.")
        self.assertIn("10", wf, "Empty Latent 노드가 존재해야 합니다.")
        self.assertIn("13", wf, "KSampler 노드가 존재해야 합니다.")

        # 노드 값 검증
        self.assertIn("Korean cab-over", wf["7"]["inputs"]["text"])
        self.assertTrue("urban" in wf["7"]["inputs"]["text"] or "Korean" in wf["7"]["inputs"]["text"])
        self.assertEqual(wf["10"]["inputs"]["width"], 576)
        self.assertEqual(wf["10"]["inputs"]["height"], 1024)
        self.assertEqual(wf["13"]["inputs"]["seed"], 42)
        self.assertEqual(wf["13"]["inputs"]["steps"], 8)

    def test_prepare_qwen_i2i_prompt(self):
        """Qwen I2I 워크플로우 파라미터 주입 검증"""
        instruction = self.engine.get_compliance_preset_instruction("plate_and_helmet")
        wf = self.engine.prepare_qwen_i2i_prompt(
            init_image_name_or_path="outputs/candidates/test_init.png",
            edit_instruction=instruction,
            seed=999,
            steps=8,
            denoise=0.65
        )
        self.assertIsInstance(wf, dict)
        self.assertIn("78", wf, "LoadImage 노드가 존재해야 합니다.")
        self.assertIn("119", wf, "TextEncodeQwenImageEditPlus 노드가 존재해야 합니다.")
        self.assertIn("117", wf, "Seed 노드가 존재해야 합니다.")

        self.assertEqual(wf["78"]["inputs"]["image"], "test_init.png")
        self.assertIn("orange South Korean", wf["119"]["inputs"]["prompt"])
        self.assertEqual(wf["117"]["inputs"]["value"], 999)

    def test_qwen_compliance_presets(self):
        """Qwen 8대 고증 및 다각도 프리셋 텍스트 검증"""
        expected_keys = [
            "plate_and_helmet",
            "wheel_chocks",
            "hangul_signs",
            "air_tank_inspection",
            "angle_front_quarter",
            "angle_side_profile",
            "angle_rear_spotter",
            "angle_driver_pov"
        ]
        for key in expected_keys:
            self.assertIn(key, QWEN_COMPLIANCE_PRESETS)
            instruction = self.engine.get_compliance_preset_instruction(key)
            self.assertGreater(len(instruction), 20)

    def test_generate_krea_candidates(self):
        """Krea 1차 후보 4분할 생성 및 실물 파일 검증"""
        candidates = self.engine.generate_krea_candidates(
            scene_data=self.sample_scene,
            count=4,
            base_seed=5000,
            width=576,
            height=1024
        )
        self.assertEqual(len(candidates), 4)

        for cand in candidates:
            self.assertTrue(os.path.exists(cand["path"]), f"후보 파일이 존재해야 합니다: {cand['path']}")
            self.assertEqual(cand["scene_id"], 8)
            self.assertEqual(cand["stage"], "krea_t2i")

            # 실물 이미지 크기 검증
            with Image.open(cand["path"]) as img:
                self.assertEqual(img.size, (576, 1024))

    def test_apply_qwen_compliance_edit(self):
        """Qwen 2차 고증 반영 및 Before/After 페어 검증"""
        candidates = self.engine.generate_krea_candidates(self.sample_scene, count=1, base_seed=777)
        cand_path = candidates[0]["path"]

        result = self.engine.apply_qwen_compliance_edit(
            candidate_path=cand_path,
            edit_preset_or_custom="wheel_chocks"
        )
        self.assertIn("before_path", result)
        self.assertIn("after_path", result)
        self.assertTrue(os.path.exists(result["before_path"]))
        self.assertTrue(os.path.exists(result["after_path"]))
        self.assertEqual(result["edit_preset"], "wheel_chocks")

    def test_approve_winner_and_manifest(self):
        """Winner 승인 및 manifest.json 기록 검증"""
        candidates = self.engine.generate_krea_candidates(self.sample_scene, count=1, base_seed=888)
        cand_path = candidates[0]["path"]

        approval = self.engine.approve_winner(
            candidate_path=cand_path,
            scene_id=8,
            notes="테스트 승인본"
        )
        self.assertEqual(approval["status"], "APPROVED")
        winner_path = approval["winner_path"]
        self.assertTrue(os.path.exists(winner_path))
        self.assertTrue(os.path.exists(self.engine.manifest_path))

        with open(self.engine.manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)
        self.assertIn("winners", manifest)
        self.assertIn("8", manifest["winners"])
        self.assertEqual(manifest["winners"]["8"]["winner_path"], winner_path)
        self.assertTrue(manifest["winners"]["8"]["qc_checks"]["QC-01"])

if __name__ == "__main__":
    unittest.main()
