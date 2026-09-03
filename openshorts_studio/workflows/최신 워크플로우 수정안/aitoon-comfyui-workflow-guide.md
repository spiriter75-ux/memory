# ComfyUI 기반 AI 웹툰 및 스토리보드 제작 자동화 워크플로우 가이드

본 문서는 **미드저니 코리아 조남경 대표**가 개발한 생성형 AI 기반 웹툰 및 스토리보드 제작 자동화 솔루션인 **aitoon.skill**의 핵심 연출 및 기획 파이프라인을 현대적인 **ComfyUI 노드 기반 워크플로우**로 이식하고 응용하기 위한 종합 엔지니어링 설계 가이드입니다 [1, 140].

---

## 1. 개요 및 기획 철학: AI 워커(AI Worker) 아키텍처

### 1.1 'aitoon.skill'의 기획 의도와 혁신
기존의 생성형 AI 만화 제작은 미학적 완성도는 높으나 다루기 까다로운 이미지 모델(예: 미드저니)과, 제어는 쉬우나 화풍이 정형화된 거대 언어 모델(예: ChatGPT, 제미나이) 사이의 격차로 인해 파편화되어 있었습니다 [141, 142]. **aitoon.skill**은 **클로드(Claude)를 지능형 제어 컨트롤 타워(다리)**로 채택하여 [140], 인물의 일관성 고정, 감정선에 맞춘 구도 분할, 타이포그래피 제어, 그리고 시간의 변화를 상징하는 여백 설계까지 일련의 모든 과정을 자동 연출 파이프라인으로 엮어냈습니다 [2, 3, 143, 145].

### 1.2 AI 워커(AI Worker) 모델의 구현
본 가이드는 고용노동부가 추진하는 **'AI 워커(AI Worker)' 직업훈련 비전**에 따라, 인간이 단순 기술 습득을 넘어 **"기획(Problem/Story) ➡️ 생성(Generation) ➡️ 검증(Verification) ➡️ 보완(Refinement)"**의 전체 업무흐름(Workflow)을 지휘하고, 기술적 실행 및 조판은 AI 노드가 일괄 자동 처리하는 협업 모델을 ComfyUI 상에 구현하는 것을 목표로 합니다 [155, 156].

---

## 2. aitoon.skill 핵심 모듈별 ComfyUI 노드 매핑 및 데이터 설계

### 2.1 AI Plot & AI Preset (시나리오 분석 및 세팅)
*   **원본 기능**: 시놉시스나 키워드를 입력받아 에피소드 단위로 스토리를 분할하고 화풍과 어울리는 연출 방향을 사전 검증합니다 [1, 148].
*   **ComfyUI 노드 매핑**: **`ComfyUI-Ollama`** 또는 Claude API 연동 노드 (`ComfyUI-3Y-GPT-API`)
*   **구현 아키텍처**:
    *   사용자의 원본 텍스트 시나리오를 LLM 노드가 입력받습니다.
    *   시스템 프롬프트 지시를 통해 출력 데이터를 규격화된 **JSON 포맷(Structured Output)**으로 컴파일합니다.
    *   각 컷별 데이터는 컷 번호(Cut ID), 프롬프트(Prompt), 화면 크기/구도(Aspect Ratio/Field size - 예: Close-up, Low-angle), 캐릭터 고유 외모 프롬프트 배열로 나뉘어 다음 라우팅 노드로 자동 전송됩니다 [4, 15].

### 2.2 AI Comics & AI Vertical Director (컷 및 세로 연출)
*   **원본 기능**: 일관성 있는 캐릭터 특징과 화풍을 고정한 뒤 웹툰 전용 세로 스크롤 레이아웃을 생성하고, 여백('칸세')을 통해 시간의 흐름을 조율합니다 [1, 2, 143, 144].
*   **ComfyUI 노드 매핑**:
    *   **스타일 & 그림체 고정**: **`IP-Adapter-Plus-v2`** 및 **`ComfyUI-PuLID-Flux/SDXL`**
    *   **구도 및 포즈 고정**: **`ControlNet` (Openpose, Lineart)**
    *   **칸세(Kanse) 자동 연출**: **`ComfyUI-Layers` (LayerStyle) & `KJNodes`**
*   **구현 아키텍처**:
    *   **PuLID** 노드로 캐릭터의 고유 얼굴 ID를 완벽히 투영하여 여러 컷에서 이목구비를 유지합니다.
    *   LLM 노드가 계산한 시간의 흐름 정보(예: "며칠 뒤 매일 이런 식이었다")를 바탕으로 [2, 150], **Conditional Switch** 노드를 통과시켜 동적 높이(Height)를 지닌 빈 캔버스 이미지(칸세)를 생성하고 `Layers` 노드로 개별 컷들 사이에 동적으로 결합(Merge)합니다 [2, 8].
    *   대사 속성에 따라 뾰족한 말풍선, 침울한 손글씨 폰트 등을 **Masking** 및 텍스트 렌더링 노드를 거쳐 이미지 상에 자동으로 융합시킵니다 [3, 149, 150].

### 2.3 AI Storybook & AI Localize (출판 및 다국어 지원)
*   **원본 기능**: 한 컷의 명장면 아래 텍스트를 배치하고 동화책 형식으로 편집하며, 스토리 감정 흐름에 따라 더블 풀 페이지(Double Full Page) 연출 및 맥락 기반 다국어 번역을 지원합니다 [4, 5, 148, 151].
*   **ComfyUI 노드 매핑**: **`ComfyUI-Art-Gallery`**, **`DeepL API` / `LLM Localize`**
*   **구현 아키텍처**:
    *   LLM이 스토리의 클라이막스(Climax) 레벨을 판별해 0.9 이상일 때 자동으로 캔버스 크기를 2배로 확장하고 가로 전면 컷으로 렌더링하도록 조건 분기합니다 [4].
    *   생성된 만화 이미지 속 텍스트는 OCR 노드를 통해 파싱한 뒤, 단순 직역이 아닌 해당 국가에서 실제로 사용되는 만화적 의성어·의태어(SFX) 대사 사전 매핑 노드를 경유해 번역 후 합성됩니다 [5].

### 2.4 AI Cinematic & AI Comics Video (시네마틱 및 영상 최적화)
*   **원본 기능**: 만화 속 말풍선과 나레이션 박스를 지우는 '클린 원고'를 설계하고 이를 바탕으로 숏폼용 시네마틱 애니메이션 및 감정 연계 배경음악을 연출합니다 [4, 5, 9, 148, 151].
*   **ComfyUI 노드 매핑**: **`Segment Anything (SAM 2)`**, **`AnimateDiff-Evolved`** / **`SVD (Stable Video Diffusion)`**
*   **구현 아키텍처**:
    *   **SAM 2** 노드를 통과시켜 말풍선과 이펙트선 영역을 실시간으로 감지하고 마스킹(Masking) 처리합니다 [9, 149].
    *   마스킹된 영역을 **Lama Inpaint** 노드로 깔끔하게 지워 티 없이 깨끗한 **'클린 원고(Clean Edit)'**를 배경으로 추출합니다 [9].
    *   클린 원고를 비디오 노드(SVD / AnimateDiff)의 `init_image`로 전달하고, LLM 노드에서 이미 컴파일한 최적의 비디오 프롬프트를 함께 인가하여 고품질의 숏폼 릴스용 비디오로 자동 업스케일링 연계합니다 [5, 9]. 이 과정은 비디오 생성 시 발생하는 막대한 크레딧 낭비를 방지하고 약 1.2회 내외의 최소한의 연산으로 원하는 고유 컷 움직임을 뽑아낼 수 있도록 돕습니다 [5, 152].

---

## 3. ComfyUI 통합 자동화 워크플로우 설계도 (Pipeline Topology)

```
[ 시나리오 입력 ] 
       │
       ▼
┌────────────────────────────────────────────────────────┐
│ 1. CONTROL TOWER (LLM - Claude JSON Parser)            │
│  - 분량 분할, 연출/구도 판별, 대사/효과음 분리          │
└───────────────────────┬────────────────────────────────┘
                        │ (JSON 데이터 파싱 및 멀티 채널 분기)
       ┌────────────────┼────────────────────────┐
       │ (Character ID) │ (Prompt & Framing)     │ (Dialog/SFX)
       ▼                ▼                        ▼
┌──────────────┐ ┌──────────────┐        ┌──────────────┐
│ PuLID / IP-  │ │ ControlNet   │        │ Font/SFX     │
│ Adapter-Plus │ │ Openpose     │        │ Rendering    │
│ (일관성 고정)│ │ (구도/포즈)  │        │ (말풍선/효과)│
└──────┬───────┘ └──────┬───────┘        └──────┬───────┘
       └────────────────┼───────────────────────┘
                        │ (조건부 루프 제어)
                        ▼
┌────────────────────────────────────────────────────────┐
│ 2. KSampler (SDXL / FLUX)                              │
│  - 실시간 레이턴시 제어 및 고품질 원본 이미지 컷 렌더  │
└───────────────────────┬────────────────────────────────┘
                        │
                        ▼ (출력 이미지 전달)
┌────────────────────────────────────────────────────────┐
│ 3. VLM REFINEMENT LOOP (MS Florence-2 / Joy-Caption)   │
│  - 인물 붕괴, 손가락 기형, 캐릭터 옷 정보 불일치 검출  │
└───────────────────────┬────────────────────────────────┘
                        │ 
        ┌───────────────┴───────────────┐
        ▼ (오류 검출 시)                ▼ (검증 통과 시)
┌───────────────────────┐       ┌───────────────────────┐
│ Seed 재할당 / 루프     │       │ 4. VERTICAL DIRECTING  │
│ 프롬프트 재생성       │       │ - KJNodes 칸세 병합   │
└───────────────────────┘       │ - 클린 원고 / SAM 2   │
                                └───────────┬───────────┘
                                            │
                                            ├───────────────────────┐
                                            ▼ (웹툰 원고 완료)       ▼ (멀티미디어 확장)
                                     [ 네이버/인스타 배포 ]    ┌──────────────────────┐
                                                               │ 5. VIDEO PIPELINE    │
                                                               │ - AnimateDiff / SVD  │
                                                               │ - 오디오 합성        │
                                                               └──────────┬───────────┘
                                                                          │
                                                                          ▼
                                                                   [ 시네마틱 숏폼 ]
```

---

## 4. Claude 기획 데이터(JSON) 설계 가이드 및 프로토타입 Schema

ComfyUI의 컨트롤 타워 노드가 에러 없이 연출 지시 데이터를 각 생성 엔진으로 공급할 수 있도록, 기획 단계를 조율하는 LLM 전용 데이터 출력 규격입니다.

```json
{
  "project_title": "여우 신선의 역습",
  "total_cuts": 4,
  "style_template_code": "manga_noir_90s_retro",
  "storyboard": [
    {
      "cut_id": 1,
      "aspect_ratio": "3:4",
      "framing": "Wide shot, Establishing shot",
      "visual_description": "A mystical ancient Korean forest covered in deep mist. A tiny, glowing multi-tailed spirit fox (Fox_ID_01) floating near a giant gnarled tree.",
      "characters": [
        {
          "character_id": "Fox_ID_01",
          "features": "Glowing golden fur, 5 tails, cute visual, determined expression"
        }
      ],
      "sfx": {
        "text": "스으으윽",
        "style": "scary_wind_font",
        "position": "top_center"
      },
      "kanse_height_offset": 120
    },
    {
      "cut_id": 2,
      "aspect_ratio": "3:4",
      "framing": "Extreme Close-up",
      "visual_description": "The face of the young male protagonist (Hero_ID_01), his eyes widening in pure shock and fear as a shadow looms over him.",
      "characters": [
        {
          "character_id": "Hero_ID_01",
          "features": "Young Korean male, black short messy hair, wearing a high-school green uniform, terrified eyes"
        }
      ],
      "sfx": {
        "text": "쿵!",
        "style": "shock_impact_font_red",
        "position": "center_right"
      },
      "kanse_height_offset": 800
    }
  ]
}
```

---

## 5. 실무 구현을 위한 최신 노드 핵심 파라미터 세부 가이드

### 5.1 PuLID 캐릭터 일관성 제어 노드
*   **Weight**: `0.85` (너무 낮으면 일관성이 깨지고, 너무 높으면 화풍을 침범하여 실사 사진처럼 변함).
*   **Method**: `fidelity` 우선 모드로 선택하여 웹툰 특유의 깔끔한 선화 데포르메 무너짐을 전면 방지합니다.

### 5.2 KJNodes 여백 생성(칸세) 공식
*   컷 사이의 스크롤 간격을 수학적 스케일로 연동합니다.
*   **공식**: $Kanse\_Height = kanse\_height\_offset 	imes Scale\_Factor$
*   `Empty Latent Image` 노드를 통해 백색 또는 그라데이션 이미지를 해당 높이로 자동 연산하여 실시간으로 밑으로 붙여 나갑니다 [150].

### 5.3 VLM Florence-2 Refinement Loop
*   KSampler 직후에 **`Florence-2-Lighter`** 노드를 설치합니다.
*   **Prompt**: `"Describe the main characters clothing colors and count the fingers on the hands."`
*   검출된 텍스트 데이터에서 원래 JSON 캐릭터 정보의 색상과 다르거나 `"fingers"` 수가 5개가 아닌 비정상 구조가 감지될 시, **ComfyUI Logic Gate**를 통해 재생성을 촉발하도록 설계합니다 [147].

---

## 6. 결론: 인간 디렉터와 AI의 유기적 동행

이 워크플로우는 영상콘텐츠 제작, 디지털 디자인, 편집 출판 등 현대의 변화하는 직무 트렌드가 요구하는 **AI 협업형 지능형 노동 모델**의 정수를 보여줍니다 [155, 156]. 

기술적 수고(말풍선 마스킹 지우기, 일관성 없는 캐릭터 얼굴 재생성하기, 노가다성 컷 병합하기)는 ComfyUI가 사전에 구조화된 데이터 흐름을 타고 백그라운드에서 깔끔하게 매듭지어 줍니다 [2, 9, 147]. 이를 통해 인간 크리에이터는 **스토리의 문학적 깊이, 연출의 묘미, 그리고 독자에게 전할 극적 감정선의 정밀한 가공**에만 집중할 수 있는 진정한 의미의 **'AI 디렉터'** 시대를 완성할 것입니다 [145].
