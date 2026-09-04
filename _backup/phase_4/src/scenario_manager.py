"""
덤프트럭 안전교육 시나리오 관리자 (src/scenario_manager.py)
- dump_safety_db.json (69개 시나리오) 파싱, 검색 및 필터링
- 시나리오 ➔ 실행용 YAML 자동 변환 및 프리셋 추론
- 시나리오 데이터 유효성 검증 (Validation)
- 4대 표준 교육 씬(A, B, C, D) YAML 생성
"""

import os
import json
import re
from typing import Dict, List, Optional, Tuple, Any, Union
import yaml

# prompt_builder의 사전 레지스트리와 100% 동기화
from src.prompt_builder import (
    SITE_PRESETS,
    CARGO_STATES,
    WEATHER_PRESETS,
    ROLE_PRESETS,
    PromptBuilder
)

class ScenarioManager:
    """덤프트럭 안전교육 시나리오 데이터베이스 및 씬 설정 관리 엔진"""

    def __init__(
        self,
        db_path: str = "data/dump_safety_db.json",
        settings_path: str = "config/settings.yaml"
    ):
        self.db_path = db_path
        self.settings_path = settings_path
        self.prompt_builder = PromptBuilder(settings_path)
        self.db_data: Dict[str, Any] = {}
        self.scenarios_by_num: Dict[int, Dict[str, Any]] = {}
        self.categories: List[Dict[str, Any]] = []
        self._load_database()

    def _load_database(self) -> None:
        """JSON 데이터베이스 로드 및 인덱싱"""
        if not os.path.exists(self.db_path):
            raise FileNotFoundError(f"시나리오 DB 파일을 찾을 수 없습니다: {self.db_path}")

        with open(self.db_path, "r", encoding="utf-8") as f:
            self.db_data = json.load(f)

        self.categories = self.db_data.get("categories", [])
        self.scenarios_by_num.clear()

        for cat in self.categories:
            cat_id = cat.get("id", "")
            cat_title = cat.get("title", "")
            cat_legal = cat.get("legal_basis", "")

            for case in cat.get("cases", []):
                num = case.get("num")
                if num is not None:
                    # 카테고리 메타데이터 주입
                    enriched_case = dict(case)
                    enriched_case["category_id"] = cat_id
                    enriched_case["category_title"] = cat_title
                    enriched_case["legal_basis"] = cat_legal
                    self.scenarios_by_num[int(num)] = enriched_case

    @property
    def total_count(self) -> int:
        """전체 시나리오 건수"""
        return len(self.scenarios_by_num)

    def list_scenarios(
        self,
        category_id: Optional[str] = None,
        risk_type: Optional[str] = None,
        season: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        시나리오 목록 검색 및 필터링
        """
        results = []
        for num in sorted(self.scenarios_by_num.keys()):
            case = self.scenarios_by_num[num]
            if category_id and case.get("category_id") != category_id:
                continue
            if risk_type and case.get("risk_type") != risk_type:
                continue
            if season and case.get("season") != season and case.get("season") != "all":
                continue

            results.append({
                "num": case["num"],
                "title": case.get("title", ""),
                "category_id": case.get("category_id", ""),
                "category_title": case.get("category_title", ""),
                "risk_type": case.get("risk_type", ""),
                "season": case.get("season", "all"),
                "legal_basis": case.get("legal_basis", "")
            })
        return results

    def get_scenario(self, num: int) -> Optional[Dict[str, Any]]:
        """시나리오 번호로 단일 시나리오 조회"""
        return self.scenarios_by_num.get(int(num))

    def detect_presets(self, scenario: Dict[str, Any]) -> Dict[str, str]:
        """
        시나리오 텍스트(원인, 위기, 대책, 제목)를 분석하여 최적 4대 프리셋 자동 추론
        """
        full_text = " ".join([
            str(scenario.get("title", "")),
            str(scenario.get("cause", "")),
            str(scenario.get("crisis", "")),
            str(scenario.get("solution", "")),
            str(scenario.get("risk_type", ""))
        ])

        # 1. Site Preset 추론
        if any(k in full_text for k in ["성토", "덤핑", "연약지반", "경사", "하역"]):
            site = "embankment_dump"
        elif any(k in full_text for k in ["골재", "채석", "석산", "쇄석", "자갈", "쇄석로"]):
            site = "aggregate_quarry"
        elif any(k in full_text for k in ["터널", "지하공사", "지하구간", "지하차도", "지하터널", "암반", "발파", "막장"]):
            site = "tunnel_underground"
        elif any(k in full_text for k in ["철거", "해체", "폐기물", "잔재", "재개발"]):
            site = "demolition_site"
        elif any(k in full_text for k in ["고속도로", "간선", "전용도로", "안전거리 100m"]):
            site = "highway_haul"
        else:
            site = "urban_crossroad"

        # 2. Cargo State 추론
        if any(k in full_text for k in ["덤핑", "하역", "실린더", "상승", "기울어"]):
            cargo = "dumping_lift"
        elif any(k in full_text for k in ["빈 적재함", "공차", "하역 후", "뒷문 잠금"]):
            cargo = "empty_bed"
        elif any(k in full_text for k in ["고임목", "점검", "주차", "정차", "공기압", "타이어"]):
            cargo = "cab_inspection"
        elif any(k in full_text for k in ["암석", "골재", "바위", "대석"]):
            cargo = "loaded_rocks"
        else:
            cargo = "loaded_soil"

        # 3. Weather Preset 추론
        season = scenario.get("season", "all")
        if season == "winter" or any(k in full_text for k in ["눈길", "빙판", "결빙", "블랙아이스", "설천"]):
            weather = "winter_black_ice"
        elif any(k in full_text for k in ["폭우", "빗길", "장마", "우천", "수막"]):
            weather = "heavy_rain_mud"
        elif any(k in full_text for k in ["야간", "안개", "심야", "어두운", "시야 미확보"]):
            weather = "night_fog_dim"
        else:
            weather = "dry_daylight"

        # 4. Role Preset 추론
        if any(k in full_text for k in ["신호수", "유도원", "신호봉", "유도자"]):
            role = "spotter_guide"
        elif any(k in full_text for k in ["점검", "출발 전", "타이어", "체크리스트", "고임목"]):
            role = "driver_precheck"
        elif any(k in full_text for k in ["안전관리자", "소장", "감독", "작업지휘자"]):
            role = "supervisor_inspect"
        else:
            role = "driver_cabin"

        return {
            "site_preset": site,
            "cargo_state": cargo,
            "weather_preset": weather,
            "role_preset": role
        }

    def build_motion_prompt(self, scenario: Dict[str, Any], presets: Dict[str, str]) -> str:
        """H3용 영문 모션 프롬프트 생성"""
        site = presets.get("site_preset", "urban_crossroad")
        cargo = presets.get("cargo_state", "loaded_soil")
        
        if presets.get("role_preset") == "spotter_guide":
            motion_detail = (
                "A dedicated safety spotter in hi-vis orange vest and white helmet waves a glowing red light baton, "
                "guiding the 25-ton Korean cabover dump truck as it reverses slowly with audible caution."
            )
        elif cargo == "dumping_lift":
            motion_detail = (
                "The heavy Korean cabover dump truck remains stationary on flat ground while its hydraulic cylinder "
                "smoothly raises the steel dump bed to 45 degrees, safely discharging soil."
            )
        elif cargo == "cab_inspection":
            motion_detail = (
                "The driver conducts a walk-around inspection, verifying yellow wedge wheel chocks firmly placed "
                "under the rear tandem tires."
            )
        else:
            motion_detail = (
                "The heavy 25-ton Korean cabover dump truck negotiates the road cautiously at slow speed under 20km/h, "
                "yielding safely to pedestrians and scanning blind spots."
            )

        return (
            f"For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.\n"
            f"[Shot 1] On the {site} terrain, {motion_detail}\n"
            f"overall_soundscape: heavy diesel engine idle, backup warning chime, construction site ambience."
        )

    def extract_scenario_to_yaml(
        self,
        scenario_num: int,
        output_path: Optional[str] = None,
        overrides: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        시나리오 번호를 기반으로 실행용 Scene YAML 생성 및 파일 저장
        """
        scenario = self.get_scenario(scenario_num)
        if not scenario:
            raise ValueError(f"시나리오 #{scenario_num} 번호가 존재하지 않습니다.")

        presets = self.detect_presets(scenario)
        if overrides:
            presets.update({k: v for k, v in overrides.items() if k in presets})

        clean_cause = re.sub(r'^\*\*\s*', '', str(scenario.get("cause", ""))).strip()
        clean_crisis = re.sub(r'^\*\*\s*', '', str(scenario.get("crisis", ""))).strip()
        clean_solution = re.sub(r'^\*\*\s*', '', str(scenario.get("solution", ""))).strip()
        clean_dialogue = str(scenario.get("dialogue", "안전수칙을 철저히 준수합시다!")).strip()

        scene_block = f"{clean_cause} {clean_crisis}".strip()
        motion_prompt = self.build_motion_prompt(scenario, presets)

        scene_dict = {
            "scenario_id": int(scenario["num"]),
            "title": str(scenario.get("title", "")),
            "category": str(scenario.get("category_title", "")),
            "legal_basis": str(scenario.get("legal_basis", "")),
            "site_preset": presets["site_preset"],
            "cargo_state": presets["cargo_state"],
            "weather_preset": presets["weather_preset"],
            "role_preset": presets["role_preset"],
            "scene_block": scene_block,
            "solution": clean_solution,
            "rules": scenario.get("rules", []),
            "motion_prompt": motion_prompt,
            "audio": {
                "narration": f"{clean_dialogue} {clean_solution}".strip(),
                "voice": "ko-KR-SunHiNeural",
                "soundscape": "heavy diesel truck engine, reverse beeper, construction ambience"
            }
        }

        if overrides:
            for k, v in overrides.items():
                if k not in presets:
                    scene_dict[k] = v

        yaml_str = yaml.dump(
            scene_dict,
            sort_keys=False,
            allow_unicode=True,
            default_flow_style=False
        )

        if output_path:
            out_dir = os.path.dirname(output_path)
            if out_dir:
                os.makedirs(out_dir, exist_ok=True)
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(yaml_str)

        return yaml_str

    def validate_scenario(
        self,
        scene_input: Union[Dict[str, Any], str]
    ) -> Tuple[bool, List[str]]:
        """
        Scene 데이터 또는 YAML 파일의 유효성 검증
        """
        errors = []
        scene_data: Dict[str, Any] = {}

        if isinstance(scene_input, str):
            if os.path.exists(scene_input):
                try:
                    with open(scene_input, "r", encoding="utf-8") as f:
                        scene_data = yaml.safe_load(f) or {}
                except Exception as e:
                    return False, [f"YAML 파싱 오류 ({scene_input}): {str(e)}"]
            else:
                try:
                    scene_data = yaml.safe_load(scene_input) or {}
                except Exception as e:
                    return False, [f"YAML 문자열 파싱 오류: {str(e)}"]
        elif isinstance(scene_input, dict):
            scene_data = scene_input
        else:
            return False, ["입력 형식 오류: dict 또는 YAML 파일 경로/문자열이어야 합니다."]

        # 1. 필수 필드 검증
        required_fields = [
            "scenario_id",
            "title",
            "site_preset",
            "cargo_state",
            "weather_preset",
            "role_preset",
            "scene_block"
        ]
        for field in required_fields:
            if field not in scene_data or scene_data[field] is None:
                errors.append(f"필수 필드 누락: '{field}'")

        # 2. 프리셋 키 유효성 검증
        site = scene_data.get("site_preset")
        if site and site not in SITE_PRESETS:
            errors.append(f"유효하지 않은 site_preset: '{site}' (허용: {list(SITE_PRESETS.keys())})")

        cargo = scene_data.get("cargo_state")
        if cargo and cargo not in CARGO_STATES:
            errors.append(f"유효하지 않은 cargo_state: '{cargo}' (허용: {list(CARGO_STATES.keys())})")

        weather = scene_data.get("weather_preset")
        if weather and weather not in WEATHER_PRESETS:
            errors.append(f"유효하지 않은 weather_preset: '{weather}' (허용: {list(WEATHER_PRESETS.keys())})")

        role = scene_data.get("role_preset")
        if role and role not in ROLE_PRESETS:
            errors.append(f"유효하지 않은 role_preset: '{role}' (허용: {list(ROLE_PRESETS.keys())})")

        return len(errors) == 0, errors

    def generate_default_scenes(self, output_dir: str = "config/scenes") -> List[str]:
        """
        4대 표준 교육 씬 생성 및 파일 저장
        A: 교차로 우회전 사각지대 (Scenario #8 / #49)
        B: 후진 시 신호수 미배치 (Scenario #15)
        C: 성토지 덤핑 연약지반 전도 (Scenario #13)
        D: 출발 전 일일 안전점검 및 고임목 (Scenario #1)
        """
        os.makedirs(output_dir, exist_ok=True)
        created_files = []

        # A_blindspot.yaml
        path_a = os.path.join(output_dir, "A_blindspot.yaml")
        self.extract_scenario_to_yaml(
            scenario_num=8,
            output_path=path_a,
            overrides={
                "site_preset": "urban_crossroad",
                "cargo_state": "loaded_soil",
                "weather_preset": "dry_daylight",
                "role_preset": "driver_cabin"
            }
        )
        created_files.append(path_a)

        # B_reverse_guide.yaml
        path_b = os.path.join(output_dir, "B_reverse_guide.yaml")
        self.extract_scenario_to_yaml(
            scenario_num=15,
            output_path=path_b,
            overrides={
                "site_preset": "aggregate_quarry",
                "cargo_state": "loaded_soil",
                "weather_preset": "dry_daylight",
                "role_preset": "spotter_guide"
            }
        )
        created_files.append(path_b)

        # C_unload.yaml
        path_c = os.path.join(output_dir, "C_unload.yaml")
        self.extract_scenario_to_yaml(
            scenario_num=13,
            output_path=path_c,
            overrides={
                "site_preset": "embankment_dump",
                "cargo_state": "dumping_lift",
                "weather_preset": "dry_daylight",
                "role_preset": "supervisor_inspect"
            }
        )
        created_files.append(path_c)

        # D_precheck.yaml
        path_d = os.path.join(output_dir, "D_precheck.yaml")
        self.extract_scenario_to_yaml(
            scenario_num=1,
            output_path=path_d,
            overrides={
                "site_preset": "urban_crossroad",
                "cargo_state": "cab_inspection",
                "weather_preset": "dry_daylight",
                "role_preset": "driver_precheck"
            }
        )
        created_files.append(path_d)

        # 4종 검증
        for p in created_files:
            valid, errs = self.validate_scenario(p)
            if not valid:
                raise ValueError(f"기본 생성 파일 검증 실패 ({p}): {errs}")

        return created_files
