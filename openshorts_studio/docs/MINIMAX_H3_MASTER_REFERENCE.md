# 🎬 MiniMax H3 & AI 비디오 제작 마스터 레퍼런스 (2026 최신 공식 표준)

이 문서는 `C:\이미지와 각종 영상 제작 프로그램`에 정리된 **MiniMax H3 공식 프롬프트 작성 가이드(Base/Ref), 2단계 린(Lean) 렌더링 파이프라인, 9대 멀티모달 참조 슬롯, 해상도 및 VRAM 최적화 스펙**을 집대성한 공식 기술 문서입니다.

---

## 1. 📐 화면 비율 및 해상도 티어 스펙 (Resolution Matrix)

MiniMax H3 비디오 엔진은 VRAM 사용량과 렌더링 시간에 따라 **2단계(0.2MP 초안 ➔ 0.5MP 네이티브/업스케일)** 체계를 가집니다.

| 화면 비율 (Aspect Ratio) | ⚡ 0.2MP 초경량 초안 (Draft) | 🌟 0.5MP 네이티브 표준 (Master) | 주요 용도 및 특징 |
| :---: | :---: | :---: | :--- |
| **📱 9:16 (세로 쇼츠)** | **`352 × 608`** | **`544 × 960`** | 유튜브 쇼츠, 틱톡, 릴스 (VRAM 6~8GB) |
| **🖥️ 16:9 (가로 시네마)** | **`608 × 352`** | **`960 × 544`** | 유튜브 롱폼 영상, 시네마틱 (VRAM 6~8GB) |
| **⏹️ 1:1 (정사각 SNS)** | **`448 × 448`** | **`768 × 768`** | 인스타그램 피드, 캐릭터 포트레이트 |

### 💡 2단계 린(Lean) 렌더링 파이프라인의 원리:
1. **[1단계] 0.2MP 초고속 초안 렌더링 (Draft Motion Preview):**
   - VRAM OOM(메모리 부족)을 완벽하게 차단하고 **15~30초 만에 카메라 무빙, 인물 동선, 액션 모션의 뼈대를 빠르게 검증**.
   - 4~8 스텝 고속 연산 (`Turbo LoRA 4step`).
2. **[2단계] 0.5MP 고화질 업스케일러 + RIFE 60fps (Mastering):**
   - 1단계에서 확정된 초안 비디오를 **H3 네이티브 표준 0.5MP로 초해상화(Upscale)**하고, **RIFE 60fps 프레임 보간**으로 부드러운 최종 결과물을 완성.

---

## 2. 🧬 MiniMax H3 5대 비디오 모드 및 공식 프롬프트 작성 문법

### 1) 🌟 T2V (Text-to-Video: 순수 텍스트 생성)
- **특징**: 이미지 없이 순수 시네마틱 영문 지시문으로 비디오와 사운드트랙 동시 생성.
- **프롬프트 3대 핵심 구조**:
  ```text
  integrated_multimodal_description: [Shot 1] A cinematic wide shot of a futuristic metropolis at night, neon rain pouring down, smooth dolly forward camera movement...

  overall_soundscape: Ambient heavy rain, distant futuristic sirens, soft wet footsteps echoing.

  non_diegetic_music: Deep atmospheric synthwave background music, low bass drone.
  ```

---

### 2) 🎬 I2V (Image-to-Video: 단일 컷 애니메이션)
- **특징**: 1장의 시작 프레임(`<Picture 1>`)을 기준으로 시간의 흐름에 따라 앞으로 전개되는 모션 생성.
- **공식 필수 첫 줄 헤더 (Header Rule)**:
  ```text
  For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.

  integrated_multimodal_description: [Shot 1] <Picture 1> is the starting frame. The woman slowly turns her head to the left, her hair gently swaying in the breeze, she smiles warmly as the camera gently dollies in...

  overall_soundscape: Soft gentle wind rustling through trees.

  non_diegetic_music: Warm acoustic guitar melody.
  ```

---

### 3) 🔄 FL2V (First & Last Frame: 2장 시작-종료 보간)
- **특징**: 시작 사진(`<Picture 1>`)과 종료 사진(`<Picture 2>`) 사이를 자연스러운 물리 액션으로 연결.
- **공식 필수 첫 줄 헤더 (Header Rule)**:
  ```text
  How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the 5.00-second mark of the target video.

  integrated_multimodal_description: [Shot 1] Picture 1 is the opening frame showing the warrior standing with sword sheathed. He rapidly dashes forward across the battlefield, unsheathes his glowing blade in a wide arc, and ends in the striking dynamic pose of Picture 2 at 5.00 seconds.

  overall_soundscape: Fast wind swoosh, metal blade unsheathing sound, dynamic impact thud.

  non_diegetic_music: Intense orchestral action drums.
  ```

---

### 4) 👥 REF2VA (Full-Reference Multi-Modal: 9대 전용 라벨 참조)
- **특징**: 인물, 의상, 배경, 소품, 화풍을 독립된 에셋으로 분리하여 비디오 전체에서 영구 불변(Identity Anchor) 보존.
- **4대 공식 참조 라벨 (Reference Labels)**:
  - `<Subject 1~9>`: 재사용 및 변형 가능한 시각 에셋 (인물, 의상, 소품, 환경)
  - `<Picture 1~N>`: 타깃 프레임 및 구도 앵커 사진
  - `<Video 1~N>`: 편집 소스 및 템포 참조 비디오
  - `<Audio 1~N>`: 음향/음성 참조 오디오
- **9대 전용 슬롯 매핑 표준**:
  - `<S1>`: **배경 / 환경 앵커** (실내, 거리, 사이버펑크 룸 등)
  - `<S2>`: **주연 인물 얼굴 & 전신** (360° 턴어라운드 시트 연결)
  - `<S3>`: **조연 인물 / 상대역**
  - `<S4>`: **인물 관계 / 포즈 베이스**
  - `<S5>`: **메인 의상 & 복식**
  - `<S6>`: **보조 의상 & 무기/액세서리**
  - `<S7>`: **차량 / 이동 수단 / 대형 오브젝트**
  - `<S8>`: **소품 & 핸드헬드 오브젝트**
  - `<S9>`: **조명 / 무드 / 스타일 앵커**

---

### 5) 🎥 LONG_RELAY (무한 롱샷 -1프레임 릴레이)
- **특징**: 3~15초 단위로 생성된 비디오의 마지막 끝 프레임(-1 Frame)을 무손실 PNG로 자동 캡처하여, 다음 클립의 시작점으로 연속 바톤 터치하는 **무한 롱테이크 비디오 파이프라인**.
- **의상/얼굴 영구 보존**: 카메라 줌인/줌아웃 및 화면 전환 시에도 Slot 2(의상 앵커)를 유지하여 인물 디테일이 뭉개지지 않음.

---

## 3. ⚙️ ComfyUI 포트 8288 모델 및 파라미터 매핑

- **UNET**: `MiniMax_H3_FL2VA_pruned_int8_convrot.safetensors`
- **Text CLIP**: `qwen3vl_32b_heretic_minimax_h3_nvfp4.safetensors`
- **Video VAE**: `minimax_h3_video_vae_fp16.safetensors`
- **Audio VAE**: `minimax_h3_audio_vae_fp32.safetensors`
- **Turbo LoRA**: `minimaxh3\minimax_h3_turbo_v4_step600_ema.safetensors` (가중치 `1.0`)
- **가속 패치**: `MiniMaxH3MemoryEfficientSageAttentionPatch` (SageAttention 2.2)
- **스텝 수**: 4~8 스텝 (초안) ➔ 12 스텝 (마스터)
- **시간 압축 프레임 계산**: `calculateH3Frames(seconds)` = 17프레임 단위 정렬 (`Math.max(5, Math.round(sec * 24))`)
