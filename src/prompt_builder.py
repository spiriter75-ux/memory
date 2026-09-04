"""
덤프트럭 안전교육 프롬프트 빌더 (src/prompt_builder.py)
- 광범위 건설현장 대응 동적 모듈형 DNA 레지스트리 (Dynamic Field Registry)
- 한국어 안전 키워드 ➔ 고증 영문 자동 변환 사전
- 2D 고증 프롬프트 및 MiniMax H3 I2VA 모션 프롬프트 생성
"""

import os
import re
import yaml

# 1. 절대 불변 원칙 (Absolute Invariants)
INVARIANT_CORE_TRUCK = (
    "Korean cab-over heavy-duty 25-ton dump truck, Hyundai Xcient-style, "
    "flat front cabin, Left-Hand Drive (LHD), orange commercial construction equipment license plate on front bumper, "
    "four axles with 8 wheels (8x4 axle configuration)"
)

STYLE_ZERO_BUBBLE = (
    "photorealistic industrial safety training manual photography, 4K, bright daylight, "
    "no speech bubble, no text, no watermark"
)

DEFAULT_NEGATIVE = (
    "conventional-nose American truck, long bonnet, right-hand drive, blue European license plate, "
    "English road signs, foreign signage, left-hand traffic, speech bubble, cartoon dialog, "
    "worker without safety helmet, bare head without PPE, missing reflective vest, "
    "deformed dump body, extra wheels, broken axle, distorted fingers, blurry text"
)

# 2. 동적 가변 매트릭스 (Dynamic Presets Registry)
SITE_PRESETS = {
    "embankment_dump": "reclamation embankment dump site, soft muddy ground slope, earth unloading area, orange safety barricades, RPP temporary fences",
    "aggregate_quarry": "aggregate stone quarry site, crushed gravel road, large excavator loading heavy rocks, dust suppression water sprayers",
    "urban_crossroad": "downtown city intersection crossroad, pedestrian crosswalk with stop line, traffic lights, sidewalk curbs, Korean street buildings",
    "highway_haul": "South Korean highway asphalt road, green guardrails, 100m safe distance road markers, right-hand traffic flow",
    "tunnel_underground": "underground tunnel excavation site, dark low-light environment with industrial sodium lamps, ventilation air ducts, narrow rock cavern road",
    "demolition_site": "urban building demolition redevelopment site, broken concrete rubble, scrap rebar hazard on ground, temporary dust screen fences"
}

CARGO_STATES = {
    "loaded_soil": "dump body fully loaded with heavy brown construction soil piled up",
    "loaded_rocks": "dump body loaded with sharp quarry gravel rocks and large stones",
    "empty_bed": "empty steel dump body completely lowered flat, clean bed",
    "dumping_lift": "dump body raised high to 45-degree angle by hydraulic cylinder, discharging cargo soil onto ground",
    "cab_inspection": "parked safely with heavy plastic yellow wedge wheel chocks under rear tires, cabin doors closed"
}

WEATHER_PRESETS = {
    "dry_daylight": "bright sunny daylight, clear view, dry dust cloud at wheels",
    "heavy_rain_mud": "heavy pouring rain, wet muddy slurry road, deep puddle splashes, windshield wipers on",
    "winter_black_ice": "freezing winter morning, snowy icy asphalt road, black ice hazard, snow chains on heavy tires",
    "night_fog_dim": "dark night with dense fog, bright LED truck headlights beam cutting through fog, flashing hazard lights"
}

ROLE_PRESETS = {
    "driver_cabin": "Korean male driver in 30s sitting in left driver seat, wearing seatbelt, focused on around-view safety monitor",
    "driver_precheck": "Korean male driver wearing white safety helmet and yellow reflective vest, doing walk-around pre-trip inspection of tire tread and air pressure",
    "spotter_guide": "dedicated safety spotter wearing white helmet and hi-vis fluorescent orange vest with reflective stripes, holding illuminated red light baton directing traffic",
    "supervisor_inspect": "authoritative construction site supervisor in 50s wearing white helmet and orange safety vest, holding safety checklist clipboard"
}

KO_KEYWORD_MAPPINGS = [
    ("사각지대", "right-side blind spot area highlighted with warning zone, pedestrian safety check"),
    ("우회전", "turning right very slowly at 10km/h at intersection crosswalk, yielding to pedestrians"),
    ("후진", "reversing slowly with beeping backup alarm, guided by safety spotter with baton"),
    ("덤핑", "raising dump body with hydraulic cylinder, unloading soil on firm flat ground"),
    ("과적", "overloaded heavy soil, steep downhill descent requiring retarder brake"),
    ("내리막", "steep downhill mountain slope road, low gear engine braking"),
    ("빗길", "rainy wet slippery asphalt road, wide safe following distance"),
    ("눈길", "snowy icy road, black ice hazard, heavy tire snow chains"),
    ("정지선", "stopping completely behind white stop line before crosswalk"),
    ("안전거리", "keeping 100m safe following distance behind preceding vehicle"),
    ("고임목", "yellow wedge wheel chocks placed firmly under rear tires to prevent rolling"),
    ("공기압", "inspecting full air brake system, air tank pressure charged above 7 bar"),
    ("브레이크", "100% full air brake system inspection, preventing brake fade lining overheat"),
    ("신호수", "safety worker directing traffic with red glowing signal wand"),
    ("스쿨존", "school zone 30km/h speed limit circular sign, cautious slow driving")
]

class PromptBuilder:
    def __init__(self, settings_path: str = None):
        self.settings = {}
        if settings_path and os.path.exists(settings_path):
            try:
                with open(settings_path, "r", encoding="utf-8") as f:
                    self.settings = yaml.safe_load(f) or {}
            except Exception:
                pass

    def translate_korean_keywords(self, text: str) -> str:
        """한글 키워드가 포함된 경우 고증 영문 표현으로 자동 치환"""
        if not text or not re.search(r'[가-힣]', text):
            return text or ""
            
        translated = []
        for ko_k, en_v in KO_KEYWORD_MAPPINGS:
            if ko_k in text:
                translated.append(en_v)
                
        return ", ".join(translated) if translated else text

    def build_2d_prompt(self, scene: dict, wildcards: dict = None) -> dict:
        """
        2D 고증 키프레임 생성용 프롬프트 조립
        [절대불변] + [현장] + [적재] + [기상] + [인물] + [동작] + [Zero-Bubble 스타일]
        """
        site_key = scene.get("site_preset", "urban_crossroad")
        cargo_key = scene.get("cargo_state", "loaded_soil")
        weather_key = scene.get("weather_preset", "dry_daylight")
        role_key = scene.get("role_preset", "driver_cabin")

        site_part = SITE_PRESETS.get(site_key, SITE_PRESETS["urban_crossroad"])
        cargo_part = CARGO_STATES.get(cargo_key, CARGO_STATES["loaded_soil"])
        weather_part = WEATHER_PRESETS.get(weather_key, WEATHER_PRESETS["dry_daylight"])
        role_part = ROLE_PRESETS.get(role_key, ROLE_PRESETS["driver_cabin"])

        scene_block = scene.get("scene_block", "")
        if re.search(r'[가-힣]', scene_block):
            translated_scene = self.translate_korean_keywords(scene_block)
            scene_block = f"{scene_block} ({translated_scene})"

        prompt_parts = [
            INVARIANT_CORE_TRUCK,
            site_part,
            cargo_part,
            weather_part,
            role_part,
            scene_block,
            STYLE_ZERO_BUBBLE
        ]

        positive = ", ".join([p for p in prompt_parts if p.strip()])
        negative = DEFAULT_NEGATIVE
        if scene.get("negative_extra"):
            negative = f"{negative}, {scene['negative_extra']}"

        return {
            "positive": positive,
            "negative": negative
        }

    def build_h3_motion_prompt(self, scene: dict) -> str:
        """
        MiniMax H3 Ref2VA 규격 모션 프롬프트 조립
        첫 줄: For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.
        [Shot 1] ...
        """
        motion_desc = scene.get("motion_prompt", "The heavy truck moves steadily forward at slow speed 10km/h.")
        site_key = scene.get("site_preset", "construction site")
        
        prompt = (
            f"For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.\n"
            f"[Shot 1] The heavy Korean cabover dump truck from <Picture 1> operates on the {site_key} road. "
            f"{motion_desc}\n"
            f"overall_soundscape: heavy diesel truck engine sound, reverse warning beeps, construction site ambience."
        )
        return prompt
