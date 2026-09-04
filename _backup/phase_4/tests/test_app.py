"""
웹 워크벤치 통합 API 단위 테스트 (tests/test_app.py)
"""

import os
import json
import unittest
from starlette.testclient import TestClient

from src.app import app

class TestWebApp(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_serve_index_html(self):
        """메인 워크벤치 HTML 페이지 서빙 확인"""
        resp = self.client.get("/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("덤프트럭 안전교육 AI 마스터 워크벤치", resp.text)
        self.assertIn("1차 Krea 4분할 그리드", resp.text)

    def test_api_status(self):
        """시스템 가동 상태 엔드포인트 확인"""
        resp = self.client.get("/api/status")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ONLINE")
        self.assertEqual(data["total_scenarios"], 69)
        self.assertIn("comfyui", data)

    def test_api_scenarios_and_detail(self):
        """시나리오 목록 및 상세 단일 조회 확인"""
        resp = self.client.get("/api/scenarios")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["total"], 69)

        # 씬 #8 상세 조회
        resp8 = self.client.get("/api/scenarios/8")
        self.assertEqual(resp8.status_code, 200)
        sc8 = resp8.json()
        self.assertEqual(sc8["scenario"]["num"], 8)
        self.assertIn("detected_presets", sc8)
        self.assertEqual(sc8["detected_presets"]["site_preset"], "urban_crossroad")

    def test_api_qc_rules_and_qwen_presets(self):
        """9대 QC 규칙 및 Qwen 고증 프리셋 목록 확인"""
        resp_qc = self.client.get("/api/qc/rules")
        self.assertEqual(resp_qc.status_code, 200)
        qc_rules = resp_qc.json()
        self.assertEqual(len(qc_rules), 9)

        resp_qw = self.client.get("/api/qwen/presets")
        self.assertEqual(resp_qw.status_code, 200)
        qwen_presets = resp_qw.json()
        self.assertGreaterEqual(len(qwen_presets), 8)

    def test_pipeline_flow_krea_qwen_winner_video_report(self):
        """Krea ➔ Qwen ➔ Winner 승인 ➔ H3 비디오 ➔ 엑셀 일지 파이프라인 엔드투엔드 API 검증"""
        # 1. Krea 1차 후보 생성
        resp_krea = self.client.post("/api/krea/generate", json={
            "scenario_id": 8,
            "count": 4,
            "base_seed": 1000,
            "aspect": "9:16"
        })
        self.assertEqual(resp_krea.status_code, 200)
        krea_data = resp_krea.json()
        self.assertEqual(krea_data["status"], "SUCCESS")
        self.assertEqual(len(krea_data["candidates"]), 4)
        cand1 = krea_data["candidates"][0]

        # 2. Qwen 2차 고증 리터칭
        resp_qwen = self.client.post("/api/qwen/edit", json={
            "candidate_path": cand1["path"],
            "edit_preset": "plate_and_helmet",
            "seed": 2026
        })
        self.assertEqual(resp_qwen.status_code, 200)
        qwen_data = resp_qwen.json()
        self.assertEqual(qwen_data["status"], "SUCCESS")
        self.assertIn("before_url", qwen_data)
        self.assertIn("after_url", qwen_data)

        # 3. Winner 승인
        resp_win = self.client.post("/api/winner/approve", json={
            "candidate_path": qwen_data["after_path"],
            "scene_id": 8,
            "notes": "API 통합 검증 승인본",
            "qc_checks": {f"QC-{i:02d}": True for i in range(1, 10)}
        })
        self.assertEqual(resp_win.status_code, 200)
        win_data = resp_win.json()
        self.assertEqual(win_data["status"], "SUCCESS")
        winner_path = win_data["approval"]["winner_path"]

        # 4. 3D H3 비디오 생성
        resp_vid = self.client.post("/api/video/generate", json={
            "scene_id": 8,
            "winner_path": winner_path,
            "duration_sec": 3.0,
            "aspect": "9:16"
        })
        self.assertEqual(resp_vid.status_code, 200)
        vid_data = resp_vid.json()
        self.assertEqual(vid_data["status"], "SUCCESS")
        self.assertIn("master_url", vid_data["video"])

        # 5. 법정 안전교육일지(.xlsx) 출력
        resp_rep = self.client.post("/api/report/export", json={
            "scene_id": 8,
            "driver_name": "홍길동",
            "company": "테스트건설",
            "instructor": "안전관리자"
        })
        self.assertEqual(resp_rep.status_code, 200)
        rep_data = resp_rep.json()
        self.assertEqual(rep_data["status"], "SUCCESS")
        self.assertTrue(os.path.exists(rep_data["report_file"]))
        self.assertTrue(rep_data["report_file"].endswith(".xlsx"))

        # 6. 매니페스트 확인
        resp_man = self.client.get("/api/manifest")
        self.assertEqual(resp_man.status_code, 200)
        manifest = resp_man.json()
        self.assertIn("8", manifest["winners"])
        self.assertIn("8", manifest["videos"])

if __name__ == "__main__":
    unittest.main()
