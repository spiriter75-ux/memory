# ComfyUI 기반 AI 웹툰 · 스토리보드 · 숏츠 자동화 워크플로우 (2026 개정)

본 문서는 **aitoon.skill**의 기획 철학  
*(기술적 실행은 AI, 총괄 연출은 인간 디렉터)*  
을 유지한 채, **2026년 8월 기준 ComfyUI 네이티브 스택**으로 재설계한 실무 파이프라인이다.

> **한 줄 요약**  
> 컷 = Qwen-Image-Edit-2511 + Qwen2.5-VL-7B  
> 숏츠 = MiniMax H3 + Qwen3-VL-32B NVFP4 AWQ  
> 말풍선·칸세 = 확산 밖 레이어  
> 인코더는 백본에 잠겨 있으며 서로 섞지 않는다.

---

## 1. 설계 원칙

1. **디렉터는 호흡·여백·감정선을 결정**하고, 노드는 실행만 한다.
2. **클린 플레이트 우선** — 말풍선·SFX·한글 대사는 이미지에 굽지 않는다.
3. **캐릭터 시트를 1회 확정**한 뒤, 모든 컷은 시트를 참조로 생성한다.
4. **인코더 ≠ 범용 VLM** — 각 DiT에 묶인 전용 인코더만 사용한다.
5. **거대 단일 그래프 금지** — Plot / Cut / QA / Layout / Shorts 를 단계 분리한다.

---

## 2. 전체 토폴로지

```
[ 시나리오 입력 ]
        │
        ▼
┌───────────────────────────────────────┐
│ 0. CONTROL TOWER (LLM)                │
│  - 에피소드 분할, 구도/감정/칸세 JSON │
│  - clean_plate: true 강제             │
└───────────────────┬───────────────────┘
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
┌────────────┐ ┌────────────┐ ┌────────────┐
│ 캐릭터 시트 │ │ 스타일 앵커 │ │ 컷별 JSON  │
│ (1회 생성)  │ │ (화풍 고정) │ │ 큐         │
└──────┬─────┘ └──────┬─────┘ └──────┬─────┘
       └──────────────┼──────────────┘
                      ▼
┌───────────────────────────────────────┐
│ 1. CUT LANE                           │
│  DiT: Qwen-Image-Edit-2511            │
│  TE:  qwen_2.5_vl_7b_fp8_scaled       │
│  입력: 시트 + 컷 지시 (말풍선 없음)   │
└───────────────────┬───────────────────┘
                    │
                    ▼
┌───────────────────────────────────────┐
│ 2. QA (별도 Instruct VLM)             │
│  - 얼굴/의상/손가락/구도 검증         │
│  - 탈락 시 시드·지시 미세조정 후 재생성│
└───────────────────┬───────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌───────────────────┐   ┌───────────────────────┐
│ 3. LAYOUT         │   │ 4. SHORTS (H3)        │
│  - 칸세 높이 합성 │   │  TE: nvfp4_awq 32B    │
│  - 말풍선 SVG/HTML│   │  DiT: H3 int8_convrot │
│  - 세로 스크롤    │   │  VAE: video fp16      │
└─────────┬─────────┘   │  I2V / FLF / R2V      │
          │             └───────────┬───────────┘
          ▼                         ▼
   [ 웹툰 원고 ]              [ 9:16 숏츠 + 스테레오 오디오 ]
```

---

## 3. 모델 · 인코더 고정 맵

### 3.1 컷 레인 (웹툰 원고)

| 역할 | 파일 / 모델 | 비고 |
|------|-------------|------|
| DiT | **Qwen-Image-Edit-2511** | 캐릭터 시트 일관성 본선 |
| Text Encoder | **`qwen_2.5_vl_7b_fp8_scaled.safetensors`** | Edit-2511 전용. Qwen3-VL 금지 |
| 대안 미감 | Illustrious / WAI / NoobAI (SDXL) | 선화 톤이 필요할 때만. 글자는 합성 |

**금지**

- H3용 `qwen3vl_32b_minimax_h3_*` 를 컷 인코더로 사용
- Qwen3-VL-8B/32B 를 Edit-2511에 연결
- 말풍선을 이미지에 구운 뒤 SAM으로 지우기

**권장 운용**

- 캐릭터 시트(정면·측면·표정·의상)를 1회 확정
- 각 컷: 시트 이미지를 넣고  
  `"동일 인물, Extreme Close-up, 놀란 표정, no text, no speech bubbles"`
- 한글 대사·SFX는 Layout 단계에서만 올린다

### 3.2 숏츠 레인 (MiniMax H3)

| 역할 | 파일 / 모델 | 비고 |
|------|-------------|------|
| Text / Vision Encoder | **`qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors`** | **인코더 본선** (~14.6GB). Blackwell 불필요 |
| DiT | MiniMax H3 **int8_convrot** | 품질 본선. (Blackwell+실험 시에만 DiT NVFP4) |
| Video VAE | **fp16** | int8 ConvRot VAE는 검은 화면 이슈 |
| Audio | H3 네이티브 스테레오 | 별도 BGM 노드 불필요 |

**인코더 대안 (우선순위)**

1. `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` ← **권장**
2. `qwen3vl_32b_minimax_h3_int8_convrot.safetensors` (더 무겁고 이득 적음)
3. GGUF (12GB대 최후 수단, 로더 타입 반드시 H3)

**H3 모드 (웹툰용)**

| 모드 | 용도 | 입력 |
|------|------|------|
| **I2V** | 한 컷 살아나기 (기본) | 클린 플레이트 1장 + motion/audio 프롬프트 |
| **FLF** | 컷↔컷 시네마틱 연결 | 컷 N 첫 프레임 + 컷 N+1 마지막 프레임 |
| **R2V** | 에피소드 예고 15초 | 시트 + 히어로 컷 2~3 + 스타일 앵커 (최대 9장) |

T2V는 캐릭터 드리프트가 커서 본선에서 제외한다.

---

## 4. JSON 스키마 (개정)

```json
{
  "project_title": "여우 신선의 역습",
  "style_template_code": "manhwa_noir_vertical",
  "characters": [
    {
      "character_id": "Hero_ID_01",
      "sheet_path": "chars/Hero_ID_01.png",
      "features": "Young Korean male, black messy hair, green school uniform"
    }
  ],
  "total_cuts": 4,
  "storyboard": [
    {
      "cut_id": 1,
      "aspect_ratio": "3:4",
      "framing": "Wide shot, Establishing",
      "visual_description": "Mystical Korean forest in deep mist. Tiny multi-tailed spirit fox near gnarled tree.",
      "characters": ["Fox_ID_01"],
      "clean_plate": true,
      "text_layer": {
        "dialogue": null,
        "sfx": { "text": "스으으윽", "style": "scary_wind", "position": "top_center" }
      },
      "kanse_height": 120,
      "video": {
        "mode": "i2v",
        "duration_sec": 6,
        "aspect": "9:16",
        "motion": "slow drift of mist, fox tails sway, subtle camera push-in",
        "audio": "low wind drone, forest rustle, soft whoosh",
        "negative": "speech bubbles, letters, extra people, identity change"
      }
    },
    {
      "cut_id": 2,
      "aspect_ratio": "3:4",
      "framing": "Extreme Close-up",
      "visual_description": "Hero face, eyes widening in shock, shadow over him.",
      "characters": ["Hero_ID_01"],
      "clean_plate": true,
      "text_layer": {
        "dialogue": "그게 대체…",
        "sfx": { "text": "쿵!", "style": "impact_red", "position": "center_right" }
      },
      "kanse_height": 800,
      "video": {
        "mode": "flf",
        "first_cut": 1,
        "last_cut": 2,
        "duration_sec": 8,
        "motion": "match cut forest → face, rapid push-in",
        "audio": "silence then 쿵, ringing, sharp inhale"
      }
    }
  ]
}
```

---

## 5. 단계별 실행 가이드

### 5.1 Control Tower (LLM)

- 출력은 위 JSON만. 자유 산문 금지.
- 모든 컷에 `clean_plate: true` 기본값.
- `kanse_height`는 픽셀 높이(여백 = 시간).
- `video.audio`에 한국어 의성어·앰비언스를 직접 적는다 (H3가 처리).

### 5.2 캐릭터 · 스타일 시트

- Edit-2511 + 7B 인코더로 시트 1회 생성·검수.
- 이후 컷은 시트를 **참조 이미지**로만 넣는다 (PuLID는 최후 수단).

### 5.3 컷 생성

```
시트 이미지 ─┬─► Qwen2.5-VL-7B fp8 ─┐
컷 지시 텍스트┘                      ├─► Edit-2511 ─► 클린 PNG
                                    │
(옵션) 웹툰 LoRA ───────────────────┘
```

- 프롬프트 끝에 항상: `no speech bubbles, no letters, no SFX text, clean illustration`
- 초안이 필요하면 FLUX.2 Klein 4B로 구도만 뽑고, 본문은 2511로 재렌더.

### 5.4 QA

- **인코더로 하지 말 것.** Qwen3-VL-8B Instruct 등 채팅 VLM 사용.
- 검사 항목: 얼굴 일치, 의상 색, 손 가락 수, 구도, 텍스트 유무.
- 탈락 시 시드 변경 또는 지시 1~2구 수정 후 재생성 (무한정 루프 금지, 최대 2~3회).

### 5.5 Layout (칸세 · 말풍선)

- ComfyUI Layers에 의존하지 말고, JSON `kanse_height` + PNG를 받는 **별도 컴포지터** 권장 (Python/PIL, HTML/CSS 세로 스크롤 등).
- 말풍선·SFX는 SVG/HTML 레이어.
- 다국어: 텍스트 레이어만 교체 (이미지 재생성 없음).
- 이미 글자가 박힌 컷이 있을 때만 Qwen-Image-Layered로 분리 시도.

### 5.6 Shorts (MiniMax H3)

**필수 파일**

```text
models/text_encoders/
  qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors

models/diffusion_models/
  minimax_h3_*_int8_convrot.safetensors

models/vae/
  minimax_h3_video_vae_fp16.safetensors
  (audio VAE)
```

**I2V 프롬프트 규칙** (인코더가 이미지를 이미 봄)

- 그림 묘사 반복 금지.
- **움직임 2~4개 + 오디오**만 기술.
- 예:
  ```
  slow push-in, hair and mist drifting, eyes widen, one blink.
  audio: low wind, sudden thud, sharp inhale.
  no text, no speech bubbles, keep identity.
  ```

**R2V 참조 순서**

1. 캐릭터 시트  
2. 히어로 컷 2~3  
3. 스타일 앵커  
- 순서가 캐릭터 슬롯이다. 섞지 말 것.

**VRAM 메모**

- 인코더 1회 인코딩 후 언로드 → DiT 로드.
- RAM+VRAM 합 48GB 이상 권장 (64GB면 여유).
- 12GB GPU도 동작 가능하나 시간 크게 증가.

---

## 6. 구 설계 대비 변경점

| 항목 | 구 (문서 원안) | 신 (본 개정) |
|------|----------------|--------------|
| 컷 백본 | SDXL + PuLID + IP-Adapter | **Edit-2511 + 시트 참조** |
| 컷 인코더 | (불명확) | **Qwen2.5-VL-7B fp8** |
| 말풍선 | 생성 후 SAM2+Lama 제거 | **처음부터 클린 + 레이어 합성** |
| 칸세 | ComfyUI Layers 중심 | **JSON 높이 + 외부 컴포지터** |
| QA | Florence-2 / Joy-Caption | **별도 Instruct VLM** |
| 영상 | AnimateDiff / SVD | **MiniMax H3** |
| 영상 인코더 | UMT5 등 | **`nvfp4_awq` Qwen3-VL-32B** |
| 오디오 | 후처리 합성 | **H3 네이티브 스테레오** |
| 그래프 | 단일 거대 워크플로 | **단계 분리 + JSON 큐** |

---

## 7. “최선”에 대한 범위 선언

본 워크플로우는 아래 조건에서의 **실무 본선**이다.

- 한국어 웹툰 / 세로 스크롤
- 캐릭터 일관성 필수
- 숏츠(9:16) + 사운드까지 로컬·오픈웨이트로
- ComfyUI 중심

다음 경우에는 레인을 바꾼다.

| 목표 | 대안 |
|------|------|
| 정통 만화 선화 최우선 | Illustrious/WAI 본문 + Edit-2511 보정 |
| 포스터·2K·생성+편집 단일 모델 | Qwen-Image-2.0 + Qwen3-VL-8B |
| 최고 화질 한 장 (실사 경향) | FLUX.2 [dev] + Mistral-3 24B |
| 12GB 이하에서 영상만 | H3 GGUF 인코더 + 낮은 해상도 / 짧은 duration |
| 상업 폰트·검수 엄격 | Layout을 디자인 툴(PSD/Affinity)로 완전 분리 |

즉 **절대 만능 최적**이 아니라,  
**“한국어 웹툰 컷 + H3 숏츠”를 한 파이프라인으로 묶을 때의 최선 구성**이다.

---

## 8. 체크리스트 (배포 전)

- [ ] 컷 인코더 = `qwen_2.5_vl_7b_fp8_scaled` 만
- [ ] 숏츠 인코더 = `qwen3vl_32b_minimax_h3_nvfp4_awq` 만
- [ ] 두 인코더를 서로 교차 연결하지 않음
- [ ] 모든 컷 `clean_plate: true`
- [ ] H3 Video VAE = fp16
- [ ] H3 DiT = int8_convrot (기본)
- [ ] 말풍선은 Layout 전용
- [ ] QA는 Instruct VLM (인코더 아님)
- [ ] R2V 참조 이미지 순서 고정
- [ ] 칸세 수치는 JSON → 컴포지터로만 전달

---

## 9. 결론

aitoon.skill이 추구한 **AI 워커형 협업**은 그대로 두고,  
2026년 기준으로 실행층만 교체한다.

- **기획·호흡·여백** → 인간 + LLM JSON  
- **얼굴·구도·클린 컷** → Edit-2511 + Qwen2.5-VL-7B  
- **세로 원고·다국어** → Layout 레이어  
- **숏츠·사운드** → MiniMax H3 + NVFP4 AWQ 32B 인코더  

이 구성이 현재(2026-08) 시점에서  
**로컬 ComfyUI 한국어 웹툰→숏츠 파이프라인의 본선**이다.
