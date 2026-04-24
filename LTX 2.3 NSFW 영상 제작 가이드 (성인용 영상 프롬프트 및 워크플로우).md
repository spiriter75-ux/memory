
# 🎬 LTX 2.3 NSFW 영상 제작 가이드 (성인용 영상 프롬프트 및 워크플로우)

**작성일**: 2026. 4. 24  
**모델**: LTX 2.3 (Text & Image to Video Speed Up Version - NSFW)  
**플랫폼**: ComfyUI, 로컬 실행  
**해상도**: 4K (1920×1080 또는 1080×1920), 9:16 세로 영상 지원

---

## 1. ✅ 모델 개요 및 특징

### 📌 기본 정보
*   **모델명**: `ltx23-ti2v-text-and-image-to-video-speed-up-version-nsfw` 또는 `ltxvideo-2b-nsfw`
*   **특징**: Uncensored 특성을 살려 기존 모델보다 더 디테일한 성적인 동작이나 노출된 묘사를 포함하는 영상을 생성 가능.
*   **입력 방식**: 텍스트 또는 이미지 입력으로 고해상도 (4K) 영상과 오디오를 동시에 생성.
*   **호환성**: ComfyUI 기반 로컬 실행 및 오디오·비디오 동시 생성 지원.

### 📊 성능 및 사양
*   **해상도**: 최대 1080×1920 해상도 (9:16 세로 영상) 네이티브 지원.
*   **속도**: 텍스트 및 이미지 입력으로 4K 영상 생성 가능.
*   **GPU 요구**: NVIDIA GPU 권장 (GGUF/FP8/NVF4/BF16 포맷 지원).

---

## 2. 📝 핵심 프롬프트 구조 (LTX 2.3 NSFW 최적화)

LTX 2.3 의 영상 생성은 단순한 키워드 나열보다 **구체적인 동작과 카메라 움직임**을 명시하는 것이 핵심입니다.

### 🏗️ 기본 프롬프트 구조
```text
[Subject Description] + [Action/Motion] + [Camera Movement] + [Lighting/Atmosphere] + [Style/Medium] + [Duration]
```

### 🎯 NSFW 프롬프트 예시

#### 1. 부드러운 동작 (Slow Motion)
> `Cinematic shot of a woman with long black hair slowly turning her head, wearing a silk robe that opens slightly, soft morning light streaming through sheer curtains, 4k ultra realistic, slow smooth motion, 5 seconds duration`

#### 2. 카메라 움직임 강조 (Camera Movement)
> `Cinematic tracking shot, low angle view, woman in black lingerie walking towards the camera, water droplets on skin, glistening light, slow zoom in, 4k realistic, 8 seconds duration`

#### 3. 카메라 회전 및 움직임 (Rotation & Dynamic)
> `Cinematic rotating shot, 360 degree view, woman in a red dress spinning slowly, fabric flowing, dynamic lighting, 4k realistic, 10 seconds duration`

#### 4. 근접 샷 (Close-up Shot)
> `Extreme close-up, macro lens, detailed skin texture, soft shadows, woman breathing slowly, 4k realistic, 3 seconds duration`

#### 5. 동작 조합 (Action Combination)
> `Cinematic wide shot, woman in a flowing dress dancing, slow spinning, fabric movement, dynamic lighting, 4k realistic, 12 seconds duration`

#### 6. 카메라 줌 및 회전 (Zoom & Rotation)
> `Cinematic zoom in, slow motion, woman in a black dress, detailed skin texture, soft shadows, 4k realistic, 10 seconds duration`

#### 7. 동작 강조 (Motion Focus)
> `Cinematic tracking shot, woman in a red dress walking, slow motion, fabric movement, dynamic lighting, 4k realistic, 8 seconds duration`

#### 8. 카메라 움직임 강조 (Camera Movement)
> `Cinematic rotating shot, 360 degree view, woman in a red dress spinning slowly, fabric flowing, dynamic lighting, 4k realistic, 10 seconds duration`

#### 9. 근접 샷 (Close-up Shot)
> `Extreme close-up, macro lens, detailed skin texture, soft shadows, woman breathing slowly, 4k realistic, 3 seconds duration`

---

## 3. ⚙️ ComfyUI 워크플로우 및 설정 팁

### 🖥️ ComfyUI 워크플로우 구성 (SVI 12-Segment)
LTX 2.3 모델은 **SVI (Spatial Video Interpolation)** 기반의 12-segment 연속 생성 워크플로우를 지원합니다.

#### 1. Node 연결
*   `LTXV Video Generation`: 텍스트/이미지를 입력받아 12 프레임의 영상을 생성합니다.
*   `LTXV Image to Video`: 이미지가 있는 경우 이를 입력합니다.
*   `LTXV Audio Generation`: 오디오와 동기를 맞추기 위해 별도의 노드를 사용합니다.

#### 2. 해상도 설정
*   **기본**: 1080×1920 (9:16 세로 영상) 또는 1920×1080 (가로 영상).
*   **4K**: `1920x1080` 또는 `1080x1920` 으로 설정 후 업스케일링을 적용합니다.

#### 3. 오디오 동기
*   `LTXV Audio Generation` 노드를 통해 오디오와 동기를 맞춥니다.
*   **Tip**: 오디오를 먼저 생성하고, 그 후 영상 생성 시 오디오의 타이밍을 참고합니다.

### 🔧 세부 설정 팁
*   **Motion Scale**: 0.5 ~ 1.5 사이에서 조정합니다.
    *   낮은 값: 부드러운 동작 (예: 0.5)
    *   높은 값: 역동적인 동작 (예: 1.5)
*   **Duration**: 3 ~ 10 초 사이에서 조정합니다.
    *   짧은 시간: 부드러운 동작 (예: 3 초)
    *   긴 시간: 복잡한 동작 (예: 10 초)

---

## 4. 💡 추가 팁 및 주의사항

### 🎨 프롬프트 최적화
*   **구체적 묘사**: `slow motion`, `soft lighting`, `cinematic shot` 등의 키워드를 추가하여 부드러운 동작과 분위기를 연출합니다.
*   **카메라 움직임**: `tracking shot`, `rotating shot`, `zoom in` 등을 명시하여 동적인 영상을 생성합니다.

### 🔄 워크플로우 최적화
*   **SVI 12-Segment**: 12 프레임의 영상을 생성한 후, 이를 연결하여 연속적인 영상을 만듭니다.
*   **오디오 동기**: `LTXV Audio Generation` 노드를 통해 오디오와 동기를 맞춥니다.

### 🧪 테스트 및 검증
*   **Motion Scale**: 0.5 ~ 1.5 사이에서 조정하여 원하는 동작의 강도를 찾습니다.
*   **Duration**: 3 ~ 10 초 사이에서 조정하여 복잡한 동작을 수행합니다.

---

## 5. 📚 참고 자료 및 출처

*   LTX 2.3 NSFW 모델 개요: `civitai.com/models/2490060/ltx23-ti2v-text-and-image-to-video-speed-up-version-nsfw`
*   LTX 2.3 기본 모델 소개: `ltx.io/model/ltx-2-3`
*   ComfyUI 워크플로우 (SVI 12-Segment): `ComfyUI Wan 2.2 I2V SVI 12-Segment.md`
*   LTX 2.3 세로 영상 가이드: `wavespeed.ai/blog/ko/posts/ltx-2-3-portrait-video-9-16-workflow-2026/`
*   LTX 2.3 영상모델 출시: `arca.live/b/aiart/164020977`
*   LTX-2 프롬프트 가이드 (한글 번역본): `shiba-ai-news.beehiiv.com/p/ltx-2-prompt-guide-summary-korean`
*   LTX-2.3 Video+Audio (GGUF/FP8/NVF4/BF16): `stablediffusiontutorials.com/2026/03/ltx-2-3-video-audio-gen.html`
*   Muinez/ltxvideo-2b-nsfw: `huggingface.co/Muinez/ltxvideo-2b-nsfw`

---

**💡 작성자**: Connect AI  
**🔗 업데이트**: 2026. 4. 24 오전 3:50
