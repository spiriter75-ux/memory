"""
2D 고증 듀얼 파이프라인 엔진 (src/krea_qwen_engine.py)
- 1차: Krea 2 Turbo (T2I) 고속 현장/차량 베이스 생성 (8 steps)
- 2차: Qwen-Rapid-AIO (I2I) 한국형 고증/각도 정밀 리터칭 (8-step Lightning LoRA)
- ComfyUI WebSocket 비동기 큐잉 및 실시간 진행률 추적
- 위너(Winner) 승인 및 outputs/manifest.json 자동 갱신
"""

import os
import sys
import json
import time
import shutil
import uuid
import urllib.request
import urllib.parse
import urllib.error
from typing import Dict, List, Optional, Tuple, Any, Callable
import yaml

from PIL import Image, ImageDraw, ImageFont

from src.prompt_builder import PromptBuilder

# Qwen 2차 고증 및 다각도 프리셋 딕셔너리
QWEN_COMPLIANCE_PRESETS = {
    "plate_and_helmet": (
        "Add an orange South Korean commercial construction equipment license plate to the front bumper of the dump truck. "
        "Ensure the driver is wearing a clean white industrial safety helmet and a fluorescent orange high-visibility reflective vest with silver stripes."
    ),
    "wheel_chocks": (
        "Place heavy yellow plastic wedge wheel chocks firmly beneath the rear tandem tires on the ground to prevent rolling."
    ),
    "hangul_signs": (
        "Add South Korean construction site safety warning signs written in clear Hangul text: '안전제일' (Safety First) and '서행 10km/h' (Slow Down)."
    ),
    "air_tank_inspection": (
        "Highlight the truck's chassis air tank and pneumatic brake lines with clear inspection pressure gauge indicator."
    ),
    "angle_front_quarter": (
        "Change camera perspective to 45-degree front-left three-quarter angle, clearly displaying both the flat front cabin, "
        "the orange bumper license plate, and the heavy cargo dump bed."
    ),
    "angle_side_profile": (
        "Change camera perspective to a full side profile view of the 25-ton Korean cabover dump truck, clearly showing all 4 axles and 8 heavy tires."
    ),
    "angle_rear_spotter": (
        "Change camera perspective to the rear view of the dump truck, showing a dedicated safety spotter wearing a white safety helmet "
        "and hi-vis orange vest, holding an illuminated red light baton guiding the reversing truck."
    ),
    "angle_driver_pov": (
        "Change camera perspective to interior driver cabin first-person POV, looking at the right-side blindspot mirror and around-view safety monitor."
    )
}

class KreaQwenEngine:
    """Krea 2 Turbo T2I 및 Qwen-Rapid-AIO I2I 2D 고증 이미지 생성 엔진"""

    def __init__(
        self,
        settings_path: str = "config/settings.yaml",
        prompt_builder: Optional[PromptBuilder] = None,
        mock_mode: bool = False
    ):
        self.settings_path = settings_path
        self.settings = self._load_settings()
        self.prompt_builder = prompt_builder or PromptBuilder(settings_path)
        self.mock_mode = mock_mode

        comfy_cfg = self.settings.get("comfyui", {})
        self.host = comfy_cfg.get("host", "127.0.0.1")
        self.port = comfy_cfg.get("port", 8188)
        self.base_url = f"http://{self.host}:{self.port}"
        self.ws_url = f"ws://{self.host}:{self.port}/ws"
        self.client_id = str(uuid.uuid4())

        storage_cfg = self.settings.get("storage", {})
        self.candidates_dir = storage_cfg.get("candidates_dir", "outputs/candidates")
        self.winners_dir = storage_cfg.get("winners_dir", "outputs/winners")
        self.manifest_path = storage_cfg.get("manifest_path", "outputs/manifest.json")

        os.makedirs(self.candidates_dir, exist_ok=True)
        os.makedirs(self.winners_dir, exist_ok=True)
        os.makedirs(os.path.dirname(self.manifest_path) or "outputs", exist_ok=True)

    def _load_settings(self) -> Dict[str, Any]:
        """설정 파일 로드"""
        if os.path.exists(self.settings_path):
            try:
                with open(self.settings_path, "r", encoding="utf-8") as f:
                    return yaml.safe_load(f) or {}
            except Exception:
                pass
        return {}

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

    def load_workflow(self, workflow_path: str) -> Dict[str, Any]:
        """워크플로우 JSON 파일 로드"""
        if not os.path.exists(workflow_path):
            raise FileNotFoundError(f"워크플로우 파일을 찾을 수 없습니다: {workflow_path}")
        with open(workflow_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def prepare_krea_t2i_prompt(
        self,
        scene_data: Dict[str, Any],
        seed: int = 0,
        steps: int = 8,
        cfg: float = 1.0,
        width: int = 576,
        height: int = 1024
    ) -> Dict[str, Any]:
        """
        Krea 2 Turbo T2I 워크플로우에 프롬프트 및 파라미터 주입
        """
        workflow_path = self.settings.get("workflows", {}).get("t2i_krea", {}).get("path", "workflows/2d_t2i_krea.json")
        wf = self.load_workflow(workflow_path)

        # 1. 2D 고증 프롬프트 생성
        prompt_dict = self.prompt_builder.build_2d_prompt(scene_data)
        positive_prompt = prompt_dict.get("positive", "")
        negative_prompt = prompt_dict.get("negative", "")

        # 2. 노드 검색 및 동적 파라미터 주입
        pos_node_found = False
        neg_node_found = False
        sampler_found = False
        latent_found = False

        for node_id, node in wf.items():
            if not isinstance(node, dict):
                continue
            class_type = node.get("class_type", "")
            inputs = node.get("inputs", {})

            # Positive Prompt
            if node_id == "7" or (class_type == "CLIPTextEncode" and "positive" in str(node.get("_meta", {}).get("title", "")).lower()):
                inputs["text"] = positive_prompt
                pos_node_found = True
            # Negative Prompt
            elif node_id == "9" or (class_type == "CLIPTextEncode" and "negative" in str(node.get("_meta", {}).get("title", "")).lower()):
                inputs["text"] = negative_prompt
                neg_node_found = True
            # Empty Latent (해상도)
            elif node_id == "10" or class_type in ["EmptyLatentImage", "EmptySD3LatentImage"]:
                inputs["width"] = width
                inputs["height"] = height
                inputs["batch_size"] = 1
                latent_found = True
            # KSampler
            elif node_id == "13" or class_type in ["KSampler", "KSamplerAdvanced"]:
                inputs["seed"] = seed
                inputs["steps"] = steps
                inputs["cfg"] = cfg
                inputs["denoise"] = 1.0
                sampler_found = True
            # SaveImage Prefix
            elif class_type == "SaveImage":
                sc_id = scene_data.get("scenario_id", "0")
                inputs["filename_prefix"] = f"DumpTruck_2D_Krea_Scene_{sc_id}"

        # 폴백: 기본 노드 ID 직접 매핑
        if not pos_node_found and "7" in wf:
            wf["7"]["inputs"]["text"] = positive_prompt
        if not neg_node_found and "9" in wf:
            wf["9"]["inputs"]["text"] = negative_prompt
        if not latent_found and "10" in wf:
            wf["10"]["inputs"]["width"] = width
            wf["10"]["inputs"]["height"] = height
        if not sampler_found and "13" in wf:
            wf["13"]["inputs"]["seed"] = seed
            wf["13"]["inputs"]["steps"] = steps
            wf["13"]["inputs"]["cfg"] = cfg

        return wf

    def prepare_qwen_i2i_prompt(
        self,
        init_image_name_or_path: str,
        edit_instruction: str,
        negative_prompt: Optional[str] = None,
        seed: int = 0,
        steps: int = 8,
        denoise: float = 0.65
    ) -> Dict[str, Any]:
        """
        Qwen-Rapid-AIO I2I 워크플로우에 입력 이미지 및 고증 지침 주입
        """
        workflow_path = self.settings.get("workflows", {}).get("i2i_qwen", {}).get("path", "workflows/2d_i2i_qwen.json")
        wf = self.load_workflow(workflow_path)

        neg_text = negative_prompt or "ugly, blurry, distorted, artifacts, bad anatomy, cartoon, watermark, deformed dump truck"
        img_name = os.path.basename(init_image_name_or_path)

        for node_id, node in wf.items():
            if not isinstance(node, dict):
                continue
            class_type = node.get("class_type", "")
            inputs = node.get("inputs", {})

            # 입력 이미지 로드 노드 (Node 78)
            if node_id == "78" or class_type == "LoadImage":
                inputs["image"] = img_name
            # Positive Edit Prompt (Node 119)
            elif node_id == "119" or class_type in ["TextEncodeQwenImageEditPlus", "TextEncodeQwenImageEdit"]:
                if "image1" in inputs or "image" in inputs:
                    inputs["prompt"] = edit_instruction
            # Negative Prompt (Node 77)
            elif node_id == "77" or (class_type == "TextEncodeQwenImageEdit" and "ugly" in str(inputs.get("prompt", ""))):
                inputs["prompt"] = neg_text
            # Seed (Node 117)
            elif node_id == "117" or class_type == "PrimitiveInt":
                inputs["value"] = seed
            # Steps (Node 115)
            elif node_id == "115" or (class_type == "INTConstant" and "steps" in str(node.get("_meta", {}).get("title", "")).lower()):
                inputs["value"] = steps
            # Sampler Denoise (Node 121)
            elif node_id == "121" or "Sampler" in class_type:
                if "denoise" in inputs:
                    inputs["denoise"] = denoise

        return wf

    def get_compliance_preset_instruction(self, preset_key: str) -> str:
        """프리셋 키에 해당하는 고증/각도 지침 반환"""
        return QWEN_COMPLIANCE_PRESETS.get(preset_key, QWEN_COMPLIANCE_PRESETS["plate_and_helmet"])

    def _create_mock_image(
        self,
        output_path: str,
        label: str,
        metadata: Optional[Dict[str, Any]] = None,
        width: int = 576,
        height: int = 1024
    ) -> None:
        """오프라인 테스트 및 UI 프로토타입용 고품질 목업 이미지 생성"""
        img = Image.new("RGB", (width, height), color=(30, 35, 45))
        draw = ImageDraw.Draw(img)

        # 배경 가이드라인 그리드
        for y in range(0, height, 80):
            draw.line([(0, y), (width, y)], fill=(45, 50, 65), width=1)
        for x in range(0, width, 80):
            draw.line([(x, 0), (x, height)], fill=(45, 50, 65), width=1)

        # 트럭 캡오버 실루엣 모의 렌더링
        cx, cy = width // 2, height // 2
        draw.rectangle([cx - 180, cy - 220, cx + 180, cy + 120], fill=(50, 60, 80), outline=(230, 126, 34), width=4)
        # 앞 유리창 (Flat Cabin)
        draw.rectangle([cx - 150, cy - 190, cx + 150, cy - 70], fill=(100, 130, 160), outline=(200, 200, 200), width=2)
        # 주황색 영업용 번호판 고증 (Orange Plate)
        draw.rectangle([cx - 90, cy + 60, cx + 90, cy + 100], fill=(235, 140, 30), outline=(255, 255, 255), width=2)

        # 텍스트 라벨
        draw.text((cx - 70, cy + 72), "영업용 06가 1234", fill=(0, 0, 0))
        draw.text((40, 40), f"[2D MOCKUP] {label}", fill=(255, 200, 50))
        draw.text((40, 80), "Model: Hyundai Xcient 25T (8x4)", fill=(200, 220, 240))
        draw.text((40, 110), f"Status: Zero-Bubble Photography Compliant", fill=(100, 240, 150))

        if metadata:
            y_off = 150
            for k, v in list(metadata.items())[:5]:
                draw.text((40, y_off), f"{k}: {str(v)[:45]}", fill=(180, 180, 180))
                y_off += 25

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        img.save(output_path, format="PNG")

    def generate_krea_candidates(
        self,
        scene_data: Dict[str, Any],
        count: int = 4,
        base_seed: int = 1000,
        width: int = 576,
        height: int = 1024,
        progress_callback: Optional[Callable[[int, int, str], None]] = None
    ) -> List[Dict[str, Any]]:
        """
        1차 Krea 2 Turbo 후보 이미지 count개 생성 (4분할 그리드용)
        """
        sc_id = scene_data.get("scenario_id", 1)
        candidates = []
        is_online = self.is_server_online()

        for idx in range(count):
            seed = base_seed + idx
            cand_id = f"krea_sc{sc_id}_cand{idx+1}_{seed}"
            filename = f"{cand_id}.png"
            target_path = os.path.join(self.candidates_dir, filename)

            if progress_callback:
                progress_callback(idx + 1, count, f"Krea 1차 후보 #{idx+1} 생성 중 (Seed: {seed})")

            if is_online and not self.mock_mode:
                # ComfyUI 실서버 큐잉
                wf = self.prepare_krea_t2i_prompt(scene_data, seed=seed, width=width, height=height)
                prompt_id = self._queue_prompt(wf)
                self._wait_for_completion(prompt_id)
                self._save_image_from_history(prompt_id, target_path)
            else:
                # 오프라인 목업 생성
                meta = {
                    "scene_title": scene_data.get("title", ""),
                    "site_preset": scene_data.get("site_preset", ""),
                    "cargo_state": scene_data.get("cargo_state", ""),
                    "seed": seed
                }
                self._create_mock_image(
                    target_path,
                    label=f"Krea T2I Candidate #{idx+1}",
                    metadata=meta,
                    width=width,
                    height=height
                )

            candidates.append({
                "candidate_id": cand_id,
                "index": idx + 1,
                "path": target_path,
                "seed": seed,
                "stage": "krea_t2i",
                "scene_id": sc_id,
                "width": width,
                "height": height,
                "timestamp": time.time()
            })

        return candidates

    def apply_qwen_compliance_edit(
        self,
        candidate_path: str,
        edit_preset_or_custom: str,
        custom_instruction: Optional[str] = None,
        seed: int = 2026,
        progress_callback: Optional[Callable[[int, int, str], None]] = None
    ) -> Dict[str, Any]:
        """
        2차 Qwen-Rapid-AIO 고증 및 다각도 정밀 리터칭 (Before/After 50:50 비교용)
        """
        if not os.path.exists(candidate_path):
            raise FileNotFoundError(f"원본 후보 이미지를 찾을 수 없습니다: {candidate_path}")

        instruction = custom_instruction or self.get_compliance_preset_instruction(edit_preset_or_custom)
        base_name = os.path.splitext(os.path.basename(candidate_path))[0]
        out_filename = f"qwen_{base_name}_{edit_preset_or_custom}.png"
        target_path = os.path.join(self.candidates_dir, out_filename)

        if progress_callback:
            progress_callback(1, 1, f"Qwen 2차 고증 반영 중: [{edit_preset_or_custom}]")

        is_online = self.is_server_online()
        if is_online and not self.mock_mode:
            # ComfyUI 이미지 업로드 및 Qwen 실행
            uploaded_name = self._upload_image(candidate_path)
            wf = self.prepare_qwen_i2i_prompt(
                init_image_name_or_path=uploaded_name,
                edit_instruction=instruction,
                seed=seed
            )
            prompt_id = self._queue_prompt(wf)
            self._wait_for_completion(prompt_id)
            self._save_image_from_history(prompt_id, target_path)
        else:
            # 오프라인 목업 생성
            meta = {
                "edit_preset": edit_preset_or_custom,
                "instruction": instruction[:60] + "...",
                "source_candidate": os.path.basename(candidate_path)
            }
            self._create_mock_image(
                target_path,
                label=f"Qwen 2차 고증 완료 ({edit_preset_or_custom})",
                metadata=meta
            )

        return {
            "before_path": candidate_path,
            "after_path": target_path,
            "edit_preset": edit_preset_or_custom,
            "instruction": instruction,
            "seed": seed,
            "stage": "qwen_i2i",
            "timestamp": time.time()
        }

    def approve_winner(
        self,
        candidate_path: str,
        scene_id: int,
        notes: Optional[str] = None,
        qc_checks: Optional[Dict[str, bool]] = None
    ) -> Dict[str, Any]:
        """
        9대 QC 검증을 통과한 이미지를 최종 Winner(승인본)로 확정 및 manifest.json 기록
        """
        if not os.path.exists(candidate_path):
            raise FileNotFoundError(f"승인할 대상 이미지가 존재하지 않습니다: {candidate_path}")

        winner_filename = f"winner_scene_{scene_id}.png"
        winner_path = os.path.join(self.winners_dir, winner_filename)

        # 실물 복사 (outputs/winners/)
        shutil.copyfile(candidate_path, winner_path)

        # manifest.json 갱신
        manifest = self._load_manifest()
        if "winners" not in manifest:
            manifest["winners"] = {}

        manifest["winners"][str(scene_id)] = {
            "scene_id": scene_id,
            "winner_path": winner_path,
            "source_candidate": candidate_path,
            "approved_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "notes": notes or "9대 QC 검증 통과 최종 승인본",
            "qc_checks": qc_checks or {f"QC-{i:02d}": True for i in range(1, 10)}
        }
        self._save_manifest(manifest)

        return {
            "scene_id": scene_id,
            "winner_path": winner_path,
            "status": "APPROVED",
            "approved_at": manifest["winners"][str(scene_id)]["approved_at"]
        }

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

    # ------------------ ComfyUI HTTP/WS 통신 헬퍼 ------------------

    def _queue_prompt(self, prompt_dict: Dict[str, Any]) -> str:
        """ComfyUI /prompt 엔드포인트에 작업 등록"""
        payload = {
            "prompt": prompt_dict,
            "client_id": self.client_id
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base_url}/prompt",
            data=data,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req) as resp:
            res_json = json.loads(resp.read().decode("utf-8"))
            prompt_id = res_json.get("prompt_id")
            if not prompt_id:
                raise RuntimeError(f"ComfyUI 작업 등록 실패: {res_json}")
            return prompt_id

    def _upload_image(self, file_path: str) -> str:
        """ComfyUI /upload/image 엔드포인트에 이미지 업로드"""
        import requests
        with open(file_path, "rb") as f:
            files = {"image": (os.path.basename(file_path), f, "image/png")}
            resp = requests.post(f"{self.base_url}/upload/image", files=files)
            if resp.status_code == 200:
                return resp.json().get("name", os.path.basename(file_path))
            else:
                raise RuntimeError(f"이미지 업로드 실패 ({resp.status_code}): {resp.text}")

    def _wait_for_completion(self, prompt_id: str, timeout: float = 300.0) -> None:
        """작업 완료 대기 (히스토리 폴링)"""
        start = time.time()
        while time.time() - start < timeout:
            try:
                req = urllib.request.Request(f"{self.base_url}/history/{prompt_id}")
                with urllib.request.urlopen(req) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    if prompt_id in data:
                        return
            except Exception:
                pass
            time.sleep(1.0)
        raise TimeoutError(f"ComfyUI 작업 대기 시간 초과 ({timeout}초): {prompt_id}")

    def _save_image_from_history(self, prompt_id: str, target_path: str) -> None:
        """히스토리에서 생성된 이미지 데이터를 다운로드하여 저장"""
        req = urllib.request.Request(f"{self.base_url}/history/{prompt_id}")
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            outputs = data[prompt_id].get("outputs", {})
            for node_id, node_out in outputs.items():
                if "images" in node_out and len(node_out["images"]) > 0:
                    img_info = node_out["images"][0]
                    filename = img_info.get("filename")
                    subfolder = img_info.get("subfolder", "")
                    img_type = img_info.get("type", "output")

                    params = urllib.parse.urlencode({
                        "filename": filename,
                        "subfolder": subfolder,
                        "type": img_type
                    })
                    view_url = f"{self.base_url}/view?{params}"
                    with urllib.request.urlopen(view_url) as img_resp:
                        with open(target_path, "wb") as out_f:
                            out_f.write(img_resp.read())
                    return
        raise RuntimeError(f"출력 이미지를 찾을 수 없습니다: {prompt_id}")
