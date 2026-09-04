# 덤프트럭 운전자 안전교육용 AI 이미지 생성 파이프라인 — ComfyUI 구축 사양서

> 목적: 한국 실정(우측통행, 좌핸들 캡오버 덤프트럭, 노란 영업용 번호판, 한글 표지판, 건설현장 안전복장)에 맞는 안전교육용 이미지를 ComfyUI에서 **재현 가능·배치 생성 가능**하게 만드는 실행 사양서.
> 방식: 일반 AI 사이트의 1회성 생성이 아니라, t2i → i2i → ControlNet → 인페인트 → 디테일러 → 업스케일의 로컬 파이프라인으로 구축한다.

---

## 1. 파이프라인 전체 흐름

```
[자산폴더] → ① t2i (기본 구도 생성, 시드 고정)
           → ② i2i (레퍼런스 차량 사진으로 디테일 보정, denoise 0.3~0.6)
           → ③ ControlNet (depth/canny/openpose) — 구도·자세 고정
           → ④ 인페인트 (한글 표지판·번호판 영역 재생성)
           → ⑤ FaceDetailer (인물 얼굴 보정)
           → ⑥ 업스케일 (2x) + 후편집 (한글 텍스트 교정)
           → ⑦ 검수 체크리스트 통과 → 시나리오 폴더에 저장
```

핵심 원칙: **"새로 뽑는" 게 아니라 "고쳐 가는" 구조.** 시드 고정 + 레퍼런스(img2img) + ControlNet으로 결과물의 일관성을 보장한다.

---

## 2. 하드웨어 / 소프트웨어 요구사항

| 구분 | 권장 사양 | 비고 |
|---|---|---|
| GPU VRAM | 12GB 이상 (SDXL), 24GB 권장 (Flux) | 8GB 이하이면 SD1.5 기반으로 축소 |
| ComfyUI | 최신 release | comfy.org / GitHub |
| 설치 방식 | ComfyUI Manager로 확장팩 관리 | 수동 git clone 대체 |
| 저장 | 시나리오별 폴더 + 프롬프트/시드 JSON | 자산 관리 섹션 참조 |

---

## 3. ComfyUI 확장팩·노드 구성표

> 아래 노드명·확장팩은 모두 공식 저장소에서 실존을 확인한 것. 설치 후 노드 목록에 없으면 ComfyUI Manager → Custom Nodes Manager에서 검색 설치.

| 확장팩 | 주요 노드 | 용도 | 공식 저장소 |
|---|---|---|---|
| ComfyUI-Advanced-ControlNet | `ControlNetLoaderAdvanced`, `Apply ControlNet (Advanced)` | ControlNet 다중 체인(강도 제어) | github.com/Kosinkadink/ComfyUI-Advanced-ControlNet |
| ComfyUI-Impact-Pack | `FaceDetailer`, `DetailerForEach (SEGS)` | 인물 얼굴·세부 보정 자동화 | github.com/ltdrdata/ComfyUI-Impact-Pack |
| ComfyUI_IPAdapter_plus | `IPAdapterUnifiedLoader`, `IPAdapter` | 레퍼런스 이미지 스타일/차량 고정 (i2i의 정밀판) | github.com/cubiq/ComfyUI_IPAdapter_plus |
| ComfyUI Manager | 설치·업데이트 관리 | 위 확장팩 설치 | github.com/ltdrdata/ComfyUI-Manager |
| Dynamic Prompts (wildcards) | 와일드카드 `__키워드__` 치환 | 배치 생성 자동화 | Comfy-Org discussions / comfyai.run 템플릿 참조 |
| (내장) ControlNet preprocessor | depth / canny / openpose | 구도·자세 제어 전처리 | docs.comfy.org tutorials |

기본 워크플로우의 골격 노드: `CheckpointLoaderSimple → CLIPTextEncode(긍정/부정) → KSampler → VAEDecode → SaveImage`. 여기에 ControlNet·IPAdapter·FaceDetailer·업스케일러를 연결한다.

---

## 4. 베이스 모델·LoRA 선택 기준

**베이스 체크포인트 (SDXL 기반 사진 리얼 계열)**
- 선택 기준: ★ 사진(photoreal) 태그 + 다운로드 수 상위 + 샘플 이미지가 실사 스타일
- 예시 후보: RealVisXL 류, Juggernaut 류 (Civitai에서 최신 인기 모델을 검색해 **버전·라이선스 확인 후** 선택)
- 고해상도·텍스트 품질이 필요하면 Flux 계열 검토 (VRAM 24GB 권장)
- ⚠️ 본 문서 작성 시점에 Civitai에서 "국산 덤프트럭 전용 LoRA"는 검색으로 확정되지 않음. 아래에서 처리.

**덤프트럭 LoRA 전략 (3택1)**
1. **기존 LoRA 검색**: Civitai에서 `dump truck`, `truck korea`, `construction vehicle` 태그 검색 → 샘플이 한국 캡오버형인지 확인 후 사용
2. **자체 LoRA 학습 (권장)**: 국내 덤프트럭 실사 20~40장 (엑시언트·프리마 계열, 정면/측면/3분각, 노란 번호판 보이는 컷 포함) → LoRA 학습 (예: kohya-ss) → 트리거워드로 `xkorean dumptruck` 지정 → 안정적으로 한국 차량 재현
3. **img2img 대체**: LoRA 없이도 레퍼런스 사진 + denoise 0.4 수준으로 차량 형상 유지 가능 (Next 단계)

---

## 5. 한국 고증 프롬프트 템플릿 (영문 고정)

> 프롬프트는 **영문으로 작성**하는 것이 모델 인식률이 높다. 구조: `[장면] + [차량 상세] + [인물·복장] + [환경·배경] + [조명·카메라] + [스타일]`.
> 차량 상세·복장·배경 블록은 모든 시나리오에 공통으로 붙이고 **장면 블록만 교체**한다.

### 공통 블록

```
[차량] Korean cab-over heavy-duty dump truck, Hyundai Xcient-style 25.5-ton,
flat front cab, left-hand drive, yellow commercial license plate, dump body loaded with soil
[복장] driver wearing white safety helmet and yellow reflective safety vest
[배경] Korean construction site, apartment complex under construction, Hangul signage,
orange safety barriers, right-hand traffic road with white lane markings
[스타일] photorealistic safety-training manual photography, 4K, bright daylight
```

### 시나리오별 장면 블록

| 시나리오 | 장면 블록 (영문) |
|---|---|
| A. 우회전 사각지대 | `dump truck making a RIGHT turn at a downtown intersection, RIGHT-side blind spot zone outlined with red-yellow warning overlay, worker in safety vest waiting at curb` |
| B. 후진 유도자 | `dump truck reversing slowly at an earth-loading area, signal man in yellow reflective vest holding orange signal wand standing at rear corner directing driver` |
| C. 적재·토사 하차 | `dump truck raising dump body to unload soil at embankment, guided by ground worker, orange safety barriers around work radius` |
| D. 출발 전 점검 | `driver doing pre-departure walk-around inspection, checking tires and cargo cover, truck parked at construction site entrance` |

### 공통 네거티브 (Negative)

```
conventional-nose American truck, right-hand drive, European blue license plate,
English signage, foreign lettering, left-hand traffic, foreign cityscape,
worker without safety helmet, baseball cap, blurred text, deformed dump body,
extra wheels, mirror error, extra fingers
```

> 시리즈 일관성: 모든 컷에 같은 스타일 앵커(`safety-training manual photography, 4K`)를 붙이고, 같은 시드를 유지한 채 장면 블록만 바꾼다.

---

## 6. i2i / 인페인트 가이드 (denoise 범위)

| 작업 | 방법 | denoise | 비고 |
|---|---|---|---|
| 차량 디테일 보정 | 레퍼런스 실사 → img2img | 0.30 ~ 0.45 | 차량 형상 유지, 배경 변경 |
| 구도 변경 | 기존 생성물 → img2img | 0.45 ~ 0.60 | 카메라 각도 변경 시 |
| 스타일 변환 | 사진 → 일러스트 | 0.70 이상 | 교육 일러스트 용도 |
| 인페인트 (표지판·번호판) | 마스크 영역 재생성 | 0.8 ~ 1.0 (마스크 내부) | 한글 텍스트는 후편집 전제 |

인페인트 대상: 노란 번호판 자리, 한글 간판·표지판, 차량 범퍼 문구. 마스크를 살짝 크게 잡아 경계 이음새를 줄인다.

---

## 7. ControlNet 체인 사양 (구도 고정)

| 용도 | preprocessor | 모델 계열 | 강도(strength) | 대상 |
|---|---|---|---|---|
| 구도 고정 | depth | controlnet depth | 0.5 ~ 0.7 | 차량·현장 배치 유지 |
| 윤곽 고정 | canny | controlnet canny | 0.4 ~ 0.6 | 차량 실루엣 유지 |
| 인물 자세 | openpose | controlnet pose | 0.6 ~ 0.8 | 유도자·운전자 자세 고정 |

- 체인 방법: `Apply ControlNet (Advanced)` 노드를 **직렬로 연결**하고 각 강도를 위 값으로 설정. 총 강도 합이 1.2를 넘지 않게 조정.
- 레퍼런스: docs.comfy.org의 ControlNet 튜토리얼 및 Pose(2-pass) 튜토리얼 참조.
- 다중 ControlNet을 쓸 땐 강도를 낮추고(각 0.4~0.5) KSampler steps를 30~40으로 늘린다.

---

## 8. 배치 생성 자동화 (와일드카드)

Dynamic Prompts 방식으로 시나리오·배경·조명을 조합해 한 번에 여러 컷을 뽑는다.

`__scene__.txt` 예시:

```
__scene_start__, Korean cab-over heavy-duty dump truck ..., __weather__, __camera_angle__
```

`__weather__`: `bright daylight / overcast construction site / dusk with headlights on`
`__camera_angle__`: `eye-level wide shot / elevated wide-angle view / close-up of rear axle`

조합 수 = 각 와일드카드 카드의 곱이므로, **중복 컷은 시드 고정으로 제거**하고 결과물마다 사용 프롬프트·시드를 JSON으로 기록한다 (아래 폴더 구조 참조).

---

## 9. Python API 배치 스크립트 (ComfyUI → /prompt)

ComfyUI를 `--listen 127.0.0.1:8188`으로 실행하고, GUI에서 워크플로우를 **API format으로 Export**한 JSON을 `workflow_api.json`으로 저장해 둔다. 아래 스크립트로 시나리오별 프롬프트를 치환해 배치 제출한다.

```python
import json, requests, time, urllib.request, uuid

SERVER = "http://127.0.0.1:8188"

def load_workflow(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def submit(workflow, client_id):
    data = {"prompt": workflow, "client_id": client_id}
    r = requests.post(f"{SERVER}/prompt", json=data)
    r.raise_for_status()
    return r.json()["prompt_id"]

def wait_and_fetch(prompt_id, client_id, out_dir):
    ws = websocket.create_connection(f"ws://127.0.0.1:8188/ws?clientId={client_id}")
    while True:
        msg = json.loads(ws.recv())
        if msg.get("type") == "executing" and msg["data"].get("node") is None:
            break
    hist = requests.get(f"{SERVER}/history/{prompt_id}").json()
    for node_id, out in hist[prompt_id]["outputs"].items():
        for img in out.get("images", []):
            fn = img["filename"]; sub = img.get("subfolder", ""); typ = img.get("type", "output")
            url = f"{SERVER}/view?filename={fn}&subfolder={sub}&type={typ}"
            urllib.request.urlretrieve(url, f"{out_dir}/{fn}")

client_id = str(uuid.uuid4())
base = load_workflow("workflow_api.json")
scenes = {  # 시나리오별 프롬프트 (공통 블록 + 장면 블록 결합본)
    "A_blindspot": "dump truck making a RIGHT turn ... safety-training manual photography, 4K",
    "B_reverse_guide": "dump truck reversing ... signal man ... safety-training manual photography, 4K",
}
os.makedirs("outputs", exist_ok=True)
for key, prompt_text in scenes.items():
    wf = json.loads(json.dumps(base))  # deep copy
    # 워크플로우에서 CLIPTextEncode(긍정) 노드의 text를 prompt_text로 치환
    for node in wf.values():
        if node["class_type"] == "CLIPTextEncode" and node["_meta"]["title"] == "positive":
            node["inputs"]["text"] = prompt_text
    pid = submit(wf, client_id)
    print(f"[{key}] submitted: {pid}")
```

> 상세: docs.comfy.org의 *API Examples*, *Server Routes(HTTP/WebSocket)* 문서 참조. 엔드포인트는 `POST /prompt` → `WS /ws`(완료 대기) → `GET /history/{id}` → `GET /view` 순서.

---

## 10. 품질 검수 체크리스트 (생성물 1장당)

- [ ] 캡오버(보닛 없는 평평한 앞면) 국산 대형 덤프인가
- [ ] 좌핸들(운전석 왼쪽)인가
- [ ] 노란 영업용 번호판(7자리)이 제대로 보이는가 (오타·괴문자면 인페인트 후편집)
- [ ] 표지판·간판이 한글인가 (영문이면 후편집 대상)
- [ ] 우측통행 차량 배치(차선·차량 방향)인가
- [ ] 안전모 + 노란 반사조끼 착용인가
- [ ] 배경이 한국 정서(아파트 공사장, 한글 상호, 국산 승용차)인가
- [ ] 덤프 적재함·휠·미러 형상이 정상인가 (AI 변형 검사)
- [ ] 인물 얼굴·손가락이 정상인가 (이상 시 FaceDetailer 재실행)

---

## 11. 폴더 구조 (자산 관리)

```
dump_truck_safety_assets/
├─ refs/                 # 레퍼런스 실사 (차량/번호판/현장) — img2img 입력
├─ prompts/
│  ├─ scene_A_blindspot.yaml  # 시나리오별 프롬프트·시드·denoise 기록
│  └─ wildcards/              # __weather__ 등 와일드카드 텍스트
├─ workflows/
│  ├─ t2i_base.json          # API export 형식
│  ├─ i2i_refine.json
│  └─ controlnet_chain.json
├─ outputs/
│  ├─ scene_A/ ...           # 검수 통과 컷만 최종 이동
│  └─ logs/manifest.json     # (프롬프트, 시드, 모델, 날짜) 이력
└─ post/                     # 후편집(한글 교정) 완료본 — 교육자료 최종 사용
```

`manifest.json`에 (시나리오, 프롬프트, 시드, 체크포인트, LoRA, 날짜)를 기록하면 **교육자료 개정 시 동일 조건으로 재생산**이 가능하다.

---

## 12. 한글 텍스트 후편집 (필수 공정)

AI는 한글을 문자로 이해하지 못하고 형태로 흉내 낸다. 표지판·번호판 문구는 생성 후 포토샵/PPT에서 **동일 폰트로 덮어쓰는 것이 정석**. 생성 단계에서 한글을 요구하되, 검수 단계에서 괴문자 발견 시 즉시 후편집 대상으로 분류한다.

---

## 13. 참고 자료

- ComfyUI 공식 API: https://docs.comfy.org/development/comfyui-server/api-examples
- ControlNet 가이드: https://docs.comfy.org/tutorials/controlnet/controlnet
- Advanced ControlNet: https://github.com/Kosinkadink/ComfyUI-Advanced-ControlNet
- Impact Pack: https://github.com/ltdrdata/ComfyUI-Impact-Pack
- IPAdapter Plus: https://github.com/cubiq/ComfyUI_IPAdapter_plus

*작성 기준일: 2026-09-04. 노드·모델 버전은 설치 시점에 재확인할 것.*
