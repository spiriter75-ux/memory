"""
덤프트럭 안전교육 시나리오 매니저 단위 테스트 (tests/test_scenario_manager.py)
"""

import os
import unittest
import yaml
from src.scenario_manager import ScenarioManager
from src.prompt_builder import SITE_PRESETS, CARGO_STATES, WEATHER_PRESETS, ROLE_PRESETS

class TestScenarioManager(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manager = ScenarioManager(
            db_path="data/dump_safety_db.json",
            settings_path="config/settings.yaml"
        )

    def test_database_loaded_successfully(self):
        """DB 로드 및 시나리오 69건 인덱싱 확인"""
        self.assertEqual(self.manager.total_count, 69, "시나리오 총 건수는 69건이어야 합니다.")
        self.assertGreater(len(self.manager.categories), 0, "카테고리가 로드되어야 합니다.")

    def test_list_scenarios_and_filtering(self):
        """시나리오 목록 및 카테고리/위험유형/계절 필터링 검증"""
        all_cases = self.manager.list_scenarios()
        self.assertEqual(len(all_cases), 69)

        # module_1 필터 (4건)
        m1_cases = self.manager.list_scenarios(category_id="module_1")
        self.assertEqual(len(m1_cases), 4)

        # risk_type 필터
        general_cases = self.manager.list_scenarios(risk_type="general")
        self.assertGreater(len(general_cases), 0)

        # season 필터 (winter)
        winter_cases = self.manager.list_scenarios(season="winter")
        self.assertGreater(len(winter_cases), 0)

    def test_get_scenario_by_num(self):
        """단일 시나리오 상세 데이터 조회 확인"""
        sc1 = self.manager.get_scenario(1)
        self.assertIsNotNone(sc1)
        self.assertEqual(sc1["num"], 1)
        self.assertEqual(sc1["category_id"], "module_1")
        self.assertIn("출발 전", sc1["category_title"])
        self.assertIn("cause", sc1)
        self.assertIn("crisis", sc1)
        self.assertIn("solution", sc1)

    def test_detect_presets(self):
        """텍스트 기반 프리셋 자동 추론 검증"""
        sc13 = self.manager.get_scenario(13) # 하역(덤핑) 연약지반
        presets13 = self.manager.detect_presets(sc13)
        self.assertEqual(presets13["site_preset"], "embankment_dump")
        self.assertEqual(presets13["cargo_state"], "dumping_lift")

        sc15 = self.manager.get_scenario(15) # 신호수 후진
        presets15 = self.manager.detect_presets(sc15)
        self.assertEqual(presets15["role_preset"], "spotter_guide")

    def test_extract_to_yaml_and_string(self):
        """시나리오 ➔ YAML 변환 및 유효성 확인"""
        yaml_str = self.manager.extract_scenario_to_yaml(8)
        self.assertIn("scenario_id: 8", yaml_str)
        self.assertIn("site_preset:", yaml_str)
        self.assertIn("motion_prompt:", yaml_str)
        self.assertIn("audio:", yaml_str)

        data = yaml.safe_load(yaml_str)
        self.assertEqual(data["scenario_id"], 8)
        self.assertIn(data["site_preset"], SITE_PRESETS)
        self.assertIn(data["cargo_state"], CARGO_STATES)
        self.assertIn(data["weather_preset"], WEATHER_PRESETS)
        self.assertIn(data["role_preset"], ROLE_PRESETS)

    def test_validate_scenario(self):
        """Scene 데이터 검증기 기능 확인 (정상, 필수필드 누락, 프리셋 오류)"""
        valid_scene = {
            "scenario_id": 99,
            "title": "테스트 씬",
            "site_preset": "urban_crossroad",
            "cargo_state": "loaded_soil",
            "weather_preset": "dry_daylight",
            "role_preset": "driver_cabin",
            "scene_block": "테스트 상황입니다."
        }
        is_valid, errs = self.manager.validate_scenario(valid_scene)
        self.assertTrue(is_valid, f"정상 씬이 검증 실패함: {errs}")
        self.assertEqual(len(errs), 0)

        # 필수 필드 누락
        invalid_scene_missing = {
            "scenario_id": 99,
            "site_preset": "urban_crossroad"
        }
        is_valid, errs = self.manager.validate_scenario(invalid_scene_missing)
        self.assertFalse(is_valid)
        self.assertGreater(len(errs), 0)

        # 잘못된 프리셋 키
        invalid_scene_preset = dict(valid_scene)
        invalid_scene_preset["site_preset"] = "invalid_mars_site"
        is_valid, errs = self.manager.validate_scenario(invalid_scene_preset)
        self.assertFalse(is_valid)
        self.assertTrue(any("invalid_mars_site" in e for e in errs))

    def test_generate_default_scenes(self):
        """4대 표준 씬(A, B, C, D) 파일 생성 및 실물 검증"""
        test_out_dir = "config/scenes"
        files = self.manager.generate_default_scenes(test_out_dir)
        self.assertEqual(len(files), 4)

        expected_names = ["A_blindspot.yaml", "B_reverse_guide.yaml", "C_unload.yaml", "D_precheck.yaml"]
        for name in expected_names:
            target_path = os.path.join(test_out_dir, name)
            self.assertTrue(os.path.exists(target_path), f"기본 씬 파일이 존재해야 합니다: {target_path}")

            # 파일 유효성 검증
            is_valid, errs = self.manager.validate_scenario(target_path)
            self.assertTrue(is_valid, f"{name} 유효성 실패: {errs}")

if __name__ == "__main__":
    unittest.main()
