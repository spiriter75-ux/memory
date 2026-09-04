"""
덤프트럭 운전자 안전교육 웹 워크벤치 서버 (src/app.py)
- FastAPI 기반 비동기 REST API 및 정적 웹 애플리케이션 서비스
- 16:9 2-Column 인터랙티브 워크벤치 UI 지원
- 2D (Krea T2I / Qwen I2I) ➔ 9대 QC ➔ Winner 승인 ➔ 3D (H3 Ref2VA) ➔ 엑셀 교육일지 원스톱 파이프라인
"""

import os
import sys
import json
import time
from typing import Dict, List, Optional, Any
import yaml

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src.scenario_manager import ScenarioManager
from src.krea_qwen_engine import KreaQwenEngine, QWEN_COMPLIANCE_PRESETS
from src.h3_video_engine import H3VideoEngine
from src.excel_reporter import ExcelReporter

# 앱 초기화
app = FastAPI(
    title="덤프트럭 운전자 안전교육 AI 워크벤치",
    version="2026.2.0",
    description="2D 고증 듀얼 파이프라인 + 3D MiniMax H3 비디오 + 법정 교육일지 자동화 시스템"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 기본 경로 및 엔진 초기화
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SETTINGS_PATH = os.path.join(BASE_DIR, "config", "settings.yaml")
QC_RULES_PATH = os.path.join(BASE_DIR, "config", "qc_rules.yaml")
DB_PATH = os.path.join(BASE_DIR, "data", "dump_safety_db.json")
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
OUTPUTS_DIR = os.path.join(BASE_DIR, "outputs")

os.makedirs(STATIC_DIR, exist_ok=True)
os.makedirs(OUTPUTS_DIR, exist_ok=True)

scenario_mgr = ScenarioManager(db_path=DB_PATH, settings_path=SETTINGS_PATH)
krea_qwen_engine = KreaQwenEngine(settings_path=SETTINGS_PATH, mock_mode=False)
h3_video_engine = H3VideoEngine(settings_path=SETTINGS_PATH, mock_mode=False)
excel_reporter = ExcelReporter(output_dir=os.path.join(OUTPUTS_DIR, "reports"))

# 정적 파일 마운트
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/outputs", StaticFiles(directory=OUTPUTS_DIR), name="outputs")

# ---------- Request Models ----------

class KreaGenerateRequest(BaseModel):
    scenario_id: int = 8
    count: int = 4
    base_seed: int = 1000
    aspect: str = "9:16"  # "9:16" 또는 "16:9"

class QwenEditRequest(BaseModel):
    candidate_path: str
    edit_preset: str = "plate_and_helmet"
    custom_instruction: Optional[str] = None
    seed: int = 2026

class WinnerApproveRequest(BaseModel):
    candidate_path: str
    scene_id: int = 8
    notes: Optional[str] = None
    qc_checks: Optional[Dict[str, bool]] = None

class VideoGenerateRequest(BaseModel):
    scene_id: int = 8
    winner_path: str
    duration_sec: float = 6.0
    aspect: str = "9:16"

class ReportExportRequest(BaseModel):
    scene_id: int = 8
    driver_name: str = "김기사"
    company: str = "한라건설"
    instructor: str = "박안전"
    notes: Optional[str] = None

# ---------- API Endpoints ----------

@app.get("/", response_class=HTMLResponse)
def serve_index():
    """16:9 2-Column 웹 워크벤치 메인 UI 서빙"""
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_file):
        with open(index_file, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse("<h2>덤프트럭 안전교육 워크벤치 준비 중...</h2>")

@app.get("/api/status")
def get_system_status():
    """ComfyUI 서버 및 로컬 엔진 가동 상태 조회"""
    comfy_online = krea_qwen_engine.is_server_online(timeout=0.5)
    return {
        "status": "ONLINE",
        "version": "2026.2.0",
        "comfyui": {
            "online": comfy_online,
            "host": krea_qwen_engine.host,
            "port": krea_qwen_engine.port,
            "mode": "Live ComfyUI" if comfy_online else "Offline Mock Engine"
        },
        "ffmpeg": os.path.basename(h3_video_engine.ffmpeg_bin),
        "total_scenarios": scenario_mgr.total_count
    }

@app.get("/api/scenarios")
def list_scenarios(category_id: Optional[str] = None, risk_type: Optional[str] = None):
    """69개 안전교육 시나리오 목록 반환"""
    cases = scenario_mgr.list_scenarios(category_id=category_id, risk_type=risk_type)
    return {
        "total": len(cases),
        "categories": scenario_mgr.categories,
        "scenarios": cases
    }

@app.get("/api/scenarios/{scenario_id}")
def get_scenario_detail(scenario_id: int):
    """단일 시나리오 상세 및 자동 추론 프리셋 반환"""
    sc = scenario_mgr.get_scenario(scenario_id)
    if not sc:
        raise HTTPException(status_code=404, detail="시나리오를 찾을 수 없습니다.")

    presets = scenario_mgr.detect_presets(sc)
    motion_prompt = scenario_mgr.build_motion_prompt(sc, presets)

    return {
        "scenario": sc,
        "detected_presets": presets,
        "motion_prompt": motion_prompt
    }

@app.get("/api/qc/rules")
def get_qc_rules():
    """9대 QC 체크리스트 규칙 조회"""
    if os.path.exists(QC_RULES_PATH):
        with open(QC_RULES_PATH, "r", encoding="utf-8") as f:
            rules_data = yaml.safe_load(f) or {}
            return rules_data.get("qc_rules", [])
    return []

@app.get("/api/qwen/presets")
def get_qwen_presets():
    """Qwen 8대 고증 및 다각도 프리셋 반환"""
    return [
        {"key": k, "instruction": v} for k, v in QWEN_COMPLIANCE_PRESETS.items()
    ]

@app.post("/api/krea/generate")
def generate_krea_candidates(req: KreaGenerateRequest):
    """Krea 1차 4분할 후보 이미지 생성"""
    sc = scenario_mgr.get_scenario(req.scenario_id)
    if not sc:
        raise HTTPException(status_code=404, detail="시나리오가 존재하지 않습니다.")

    presets = scenario_mgr.detect_presets(sc)
    scene_data = {
        "scenario_id": req.scenario_id,
        "title": sc.get("title", ""),
        "site_preset": presets["site_preset"],
        "cargo_state": presets["cargo_state"],
        "weather_preset": presets["weather_preset"],
        "role_preset": presets["role_preset"],
        "scene_block": f"{sc.get('cause', '')} {sc.get('crisis', '')}"
    }

    width = 576 if req.aspect == "9:16" else 1024
    height = 1024 if req.aspect == "9:16" else 576

    candidates = krea_qwen_engine.generate_krea_candidates(
        scene_data=scene_data,
        count=req.count,
        base_seed=req.base_seed,
        width=width,
        height=height
    )

    # URL 경로 변환
    for c in candidates:
        rel_path = os.path.relpath(c["path"], BASE_DIR).replace("\\", "/")
        c["url"] = f"/{rel_path}"

    return {
        "status": "SUCCESS",
        "scenario_id": req.scenario_id,
        "count": len(candidates),
        "candidates": candidates
    }

@app.post("/api/qwen/edit")
def apply_qwen_edit(req: QwenEditRequest):
    """Qwen 2차 고증 및 다각도 정밀 리터칭 (Before/After 50:50)"""
    cand_path = req.candidate_path
    if not os.path.isabs(cand_path):
        cand_path = os.path.join(BASE_DIR, cand_path.lstrip("/\\"))

    if not os.path.exists(cand_path):
        raise HTTPException(status_code=404, detail=f"후보 이미지를 찾을 수 없습니다: {cand_path}")

    result = krea_qwen_engine.apply_qwen_compliance_edit(
        candidate_path=cand_path,
        edit_preset_or_custom=req.edit_preset,
        custom_instruction=req.custom_instruction,
        seed=req.seed
    )

    before_rel = os.path.relpath(result["before_path"], BASE_DIR).replace("\\", "/")
    after_rel = os.path.relpath(result["after_path"], BASE_DIR).replace("\\", "/")

    return {
        "status": "SUCCESS",
        "before_url": f"/{before_rel}",
        "after_url": f"/{after_rel}",
        "before_path": result["before_path"],
        "after_path": result["after_path"],
        "edit_preset": req.edit_preset,
        "instruction": result["instruction"]
    }

@app.post("/api/winner/approve")
def approve_winner(req: WinnerApproveRequest):
    """Winner 승인 및 manifest.json 등록"""
    target_path = req.candidate_path
    if not os.path.isabs(target_path):
        target_path = os.path.join(BASE_DIR, target_path.lstrip("/\\"))

    if not os.path.exists(target_path):
        raise HTTPException(status_code=404, detail="승인 대상 이미지가 존재하지 않습니다.")

    approval = krea_qwen_engine.approve_winner(
        candidate_path=target_path,
        scene_id=req.scene_id,
        notes=req.notes,
        qc_checks=req.qc_checks
    )

    winner_rel = os.path.relpath(approval["winner_path"], BASE_DIR).replace("\\", "/")
    approval["winner_url"] = f"/{winner_rel}"

    return {
        "status": "SUCCESS",
        "approval": approval
    }

@app.post("/api/video/generate")
def generate_master_video(req: VideoGenerateRequest):
    """MiniMax H3 3D 비디오 생성 및 xfade 마스터링"""
    winner_path = req.winner_path
    if not os.path.isabs(winner_path):
        winner_path = os.path.join(BASE_DIR, winner_path.lstrip("/\\"))

    if not os.path.exists(winner_path):
        raise HTTPException(status_code=404, detail="Winner 이미지가 존재하지 않습니다.")

    sc = scenario_mgr.get_scenario(req.scene_id) or {"num": req.scene_id, "title": f"씬 #{req.scene_id}"}
    presets = scenario_mgr.detect_presets(sc)
    motion_prompt = scenario_mgr.build_motion_prompt(sc, presets)

    scene_data = {
        "scenario_id": req.scene_id,
        "title": sc.get("title", ""),
        "scene_block": f"{sc.get('cause', '')} {sc.get('crisis', '')}",
        "motion_prompt": motion_prompt,
        "audio": {
            "narration": f"{sc.get('title', '')}. {sc.get('solution', '')}",
            "voice": "ko-KR-SunHiNeural"
        }
    }

    record = h3_video_engine.build_master_video(
        scene_data=scene_data,
        winner_image_path=winner_path,
        duration_sec=req.duration_sec
    )

    master_rel = os.path.relpath(record["master_path"], BASE_DIR).replace("\\", "/")
    record["master_url"] = f"/{master_rel}"

    return {
        "status": "SUCCESS",
        "video": record
    }

@app.post("/api/report/export")
def export_excel_report(req: ReportExportRequest):
    """법정 안전보건 교육일지(.xlsx) 자동 생성 및 다운로드 경로 반환"""
    sc = scenario_mgr.get_scenario(req.scene_id) or {"num": req.scene_id, "title": f"씬 #{req.scene_id}"}

    manifest = krea_qwen_engine._load_manifest()
    winner_info = manifest.get("winners", {}).get(str(req.scene_id), {})
    video_info = manifest.get("videos", {}).get(str(req.scene_id), {})

    photo_path = winner_info.get("winner_path")

    out_file = excel_reporter.generate_report(
        scene_id=req.scene_id,
        scene_title=sc.get("title", "덤프트럭 안전교육"),
        instructor=req.instructor,
        trainees=[req.driver_name],
        education_date=time.strftime("%Y-%m-%d"),
        photo_path=photo_path
    )

    rel_report = os.path.relpath(out_file, BASE_DIR).replace("\\", "/")
    return {
        "status": "SUCCESS",
        "report_file": out_file,
        "download_url": f"/{rel_report}"
    }

@app.get("/api/manifest")
def get_manifest():
    """outputs/manifest.json 전체 기록 반환"""
    return krea_qwen_engine._load_manifest()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.app:app", host="127.0.0.1", port=8000, reload=True)
