# [통합 마스터 계획서] 덤프트럭 안전교육 AI 생성 및 영상화 파이프라인 시스템 (v2.2)

> **문서 버전:** v2.2 (웹 브라우저 작업대 Web Workbench UI/UX & OpenShorts 4단계 I2V 릴레이 & GitHub 안전망 통합)  
> **기준 문서:**
> 1. [덤프트럭_안전교육_ComfyUI_파이프라인_사양서.md](file:///c:/덤프트럭 운전자교육/덤프트럭_안전교육_ComfyUI_파이프라인_사양서.md)
> 2. [덤프트럭_안전교육_프로그램_코딩_설계도.md](file:///c:/덤프트럭 운전자교육/덤프트럭_안전교육_프로그램_코딩_설계도.md)
> 3. [data/AGENTS_MASTER_RULES.md](file:///c:/덤프트럭 운전자교육/data/AGENTS_MASTER_RULES.md) (물리 메커니즘·2026 개정 법규·Zero-Bubble 규칙)
> 4. [덤프트럭_안전교육_9슬롯_및_H3_매핑_사양서.md](file:///c:/덤프트럭 운전자교육/덤프트럭_안전교육_9슬롯_및_H3_매핑_사양서.md) (소설 개념 배제, 덤프트럭 현장 전용 9슬롯 & H3 I2VA 매핑)
> 5. [03_한국형_덤프트럭_및_캐릭터_비주얼_가이드.md](file:///c:/덤프트럭 운전자교육/03_한국형_덤프트럭_및_캐릭터_비주얼_가이드.md)
> 6. **백업 원격 저장소:** `https://github.com/spiriter75-ux/memory`
> 7. **웹 작업대 인터페이스:** `http://localhost:8900` (Vanilla HTML/CSS/JS + 경량 무충돌 REST API)

---

## 0. [절대 행동 수칙] AI 환각(Hallucination) 원천 차단 및 단일 파일 격리(Single-File Isolation) 프로토콜

> [!CAUTION]
> **AI 에이전트 환각 및 코드 파괴 방지를 위한 5대 철칙 (위반 시 즉각 중단)**  
> 방대한 계획서로 인해 AI 에이전트가 문맥을 잃고 엉뚱한 코드를 상상해서 짜거나 기존 코드를 덮어쓰는 환각을 100% 방지하기 위해 다음 원칙을 절대적으로 준수합니다.

1. **단일 파일 격리 (Single-File / Single-Task Scope)**:
   - 한 번에 여러 개의 파이썬 파일을 동시에 생성하거나 수정하지 않는다.
   - 각 Phase에서는 **지정된 단 1개의 파일(모듈)**만 생성/수정하며, 다른 파일은 일체 건드리지 않는다.
2. **설계도 핀포인트 참조 (Contract-Based Coding)**:
   - 300줄 전체를 상상하며 코딩하지 않고, [덤프트럭_안전교육_프로그램_코딩_설계도.md](file:///c:/덤프트럭 운전자교육/덤프트럭_안전교육_프로그램_코딩_설계도.md) 제3절의 **해당 함수 입출력 규약(20줄 내외)**만 정확히 읽고 1:1로 구현한다.
3. **기계적 실행 검증 (Machine Execution Verification)**:
   - 말로만 "완성되었습니다"라고 하는 거짓말(환각)을 일체 불허한다.
   - 작성된 파일은 터미널에서 파이썬(`python -m unittest` 또는 직접 임포트 실행)으로 실제 실행하여 **에러 0건 및 정상 동작 콘솔 로그를 눈으로 입증**해야 한다.
4. **단계별 독립 세이브 (Phase-by-Phase Commit & Push)**:
   - 실행 검증이 완료된 즉시 GitHub 원격(`spiriter75-ux/memory`)에 해당 단계 명칭(`Phase-X`)으로 커밋 및 푸시하여 영구 복구 세이브포인트를 확보한다.
5. **독단적 진행 절대 금지 (Mandatory STOP & Wait for User Approval)**:
   - AI가 자의적으로 "다음 단계까지 연속으로 진행했습니다"라고 폭주하는 것을 엄격히 금지한다.
   - **한 단계가 끝나면 즉시 멈추고(STOP), 사용자에게 [수행한 일 1줄 + 실행 검증 로그 3줄 + GitHub 저장 완료]만 간결히 보고한 뒤 사용자의 명시적 승인을 기다린다.**

---

## 1. 시스템 핵심 아키텍처: OpenShorts Pro Studio 기반 '4단계 파이프라인'

> [!IMPORTANT]
> **대원칙: "파이프라인 인프라 설계는 고정하되, 제작 산출물(이미지·영상)에는 고정치를 두지 않는다"**
> 1. **파이프라인 인프라 설계/설정 (고정 뼈대 — 견고하게 표준화)**:
>    - ComfyUI API 통신 규약 (`POST /prompt`, `WS /ws`, `GET /view`)
>    - 노드 파라미터 치환 엔진 (`_meta.title`/ID 기반 딥카피 안전 주입)
>    - 절대 불변 법규/물리 고증선 (25톤 캡오버, LHD, 우측통행, 안전모/조끼, Full Air Brake, Zero-Bubble)
>    - FFmpeg 렌더링 파이프라인 (종횡비 감지, 자막/배지 드로우, `xfade` 크로스페이드 연결)
>    - 법정 교육일지 엑셀 공문 서식 및 자필 서명 PNG 셀 중앙 삽입 메커니즘
> 2. **제작 산출물 파라미터 (완전 가변 — 파이썬 코드 내 고정치 절대 금지, 100% 외부 주입)**:
>    - **영상 길이**: 3초 단문 숏폼부터 7.5초, 15초까지 시나리오 지정값에 따라 완전 가변
>    - **릴레이 컷 수 및 총 러닝타임**: 1컷 단독(3~15초)부터 3단 컷툰, N개 컷 연결(30초, 60초, 100초+)까지 작업량에 따라 자유 가변
>    - **해상도 및 종횡비**: 9:16 세로 숏츠(`576x1024`), 16:9 가로 와이드(`1024x576`), 1:1 정사각(`1024x1024`) 필요에 따라 가변
>    - **생성 장수**: 1장이든 4장이든 10장이든 CLI `--count` 인자로 가변
>    - **현장 시나리오**: 사토장, 석산, 도심교차로, 고속도로, 지하터널, 철거지 등 현장 상황에 따라 무한 가변
>    *➔ 파이프라인 코드는 설비일 뿐이며, 제작 파라미터는 시나리오 YAML 및 CLI가 유일한 결정자(Source of Truth)가 됩니다.*

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [1단계: 에셋 바이블 & 프롬프트 조립 (Asset Bible & Prompt Assembly)]    │
│  - 차량 불변 DNA: 현대 엑시언트 25t 캡오버, LHD, 주황색 번호판, 8x4     │
│  - 인물 불변 DNA: 김기사(청년 초보), 정반장(흰색 헬멧+형광 오렌지 조끼)  │
│  - 환경 불변 DNA: 한국 아파트 공사현장, RPP 펜스, 황색 복선, 우측통행    │
│  - 물리/법규 고증: Full Air Brake(7bar, 페이드 방지), AEBS, 10~20km/h     │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  [2단계: 2D 이미지 2단 완성 파이프라인 (Krea Turbo t2i ➔ Qwen Rapid i2i) ──▶ winner.png]
│  ① 1차 기본 생성 (t2i): Krea 2 Turbo (krea2Turbo18For_v2 / 8step 초고속)
│     - 건설현장 지형(사토장/골재장/교차로 등) 및 덤프트럭 기본 구도/차량 형상 1차 렌더링
│  ② 2차 정밀 고증 편집 (i2i): Qwen-Rapid-AIO (28GB Checkpoint + 8step Lightning LoRA)
│     - OpenShorts Qwen 에디터 기법을 흡수하여 1차 이미지에 주황색 번호판, 안전모/조끼,
│       한글 표지판, 휠초크, 에어탱크 등 9대 고증 요소와 다각도 앵글을 i2i로 정밀 리터칭
│  - 사양서 §10 기준 9대 품질 검수(QC) 통과 ➔ Zero-Bubble 무말풍선 ──▶ [winner.png 확정]
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  [3단계: Ref2VA 다중 이미지 처리 & I2V 가변 릴레이 영상화 (Relay Motion)]   │
│  - 공식 채택 엔진: Minimax H3 Ref2VA + Easy Cache _ Spectrum + Sage      │
│  - Ref2VA 다중 이미지 처리: <Picture 1>=차량 구도(winner.png)             │
│                            <Picture 2>=인물 얼굴/신호수 레퍼런스          │
│  - H3 네이티브 컷당 3초~15초 가변 렌더링 지원 (Node 27 PrimitiveFloat)    │
│  - I2V 가변 릴레이 연속 모션:                                            │
│      시나리오 작업량에 따라 단일 컷(3~15초)부터 N개 컷 릴레이 결합으로    │
│      30초, 60초, 100초 이상까지 완전 가변 길이 비디오 생성               │
│  - EasyCache + SageAttentionKJ로 VRAM 절감 및 렌더링 3배 가속            │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  [4단계: 사운드/자막 마스터링 & 법정 교육일지 엑셀 발행 (Mastering)]     │
│  - Edge-TTS 고품질 한국어 신경망 나레이션 믹싱 (ko-KR-InJoonNeural)      │
│  - FFmpeg 듀얼 레이아웃: 상단 타이틀 배지 + 하단 고대비 안전 수칙 자막   │
│  - outputs/videos/{scene_id}_relay_final.mp4 완성                         │
│  - 기사님 자필 서명 PNG 연동 공식 법정 「안전보건 교육일지(.xlsx)」 출력 │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 작업 진행 안전장치: [절대 헌법] 기존 memory 591개 자산 보호 및 2중 안전 백업 체계

> [!CAUTION]
> **원격 `main` 브랜치 덮어쓰기 절대 금지 (`--force` 영구 봉인)**  
> `https://github.com/spiriter75-ux/memory`의 `main` 브랜치는 사용자님의 1인 AI 지식 기업 본체(591개 에이전트 기억 및 템플릿)가 보관된 핵심 두뇌입니다.  
> 따라서 **`main` 브랜치에 대한 강제 푸시(`--force`)는 영구히 절대 금지**하며, 덤프트럭 안전교육 작업물은 **`dumptruck` 전용 브랜치로 철저히 격리**하여 기존 자산을 100% 안전하게 보호합니다.

1. **[1중 안전망] 로컬 물리 스냅샷 백업 (`_backup/phase_X/`)**:
   - 매 Phase가 완료될 때마다, 깃허브뿐만 아니라 로컬 PC 하드디스크 `_backup/phase_0/`, `_backup/phase_1/` ... 폴더에 해당 시점의 소스코드와 설정을 **물리적 파일로 자동 복사하여 2중 세이브 슬롯을 보존**합니다.
   - 깃허브 네트워크 오류나 실수가 발생하더라도 로컬 백업 폴더에서 1초 만에 즉시 복구할 수 있습니다.
2. **[2중 안전망] 덤프트럭 전용 브랜치 독립 저장 (`dumptruck` Branch)**:
   - 모든 단계별 커밋은 `dumptruck` 브랜치에서 안전하게 진행하고 원격으로 푸시합니다 (`git push origin dumptruck`).
   - 원격 `main` 브랜치의 591개 기존 자산에는 1바이트의 영향도 주지 않으며, 안전하게 분리 보존됩니다.
3. **단계별 필수 실행 사이클 (Phase Completion Cycle)**:
   - ① 해당 단계 코드 작성 (파일 1개 원칙)
   - ② 단위 테스트(`tests/test_*.py`) 실행 ➔ **100% PASS 기계적 확인**
   - ③ **로컬 스냅샷 복사 (`_backup/phase_X/`)**
   - ④ `dumptruck` 브랜치 커밋 및 푸시 (`git commit -m "Phase X: ..." ➔ git push origin dumptruck`)
   - ⑤ **무조건 STOP 후 사용자에게 [결과 1줄 + 실행 로그 3줄 + 백업 완료] 보고 및 승인 대기**
4. **비상 롤백(복구) 프로토콜**:
   - 코딩 중 1글자라도 틀어지거나 버그가 나면 땜방 코드를 절대 얹지 않고,
   - 로컬 `_backup/phase_{X-1}/` 스냅샷 또는 `git reset --hard HEAD`로 **방금 전 성공했던 100% 정상 상태로 1초 만에 즉시 원상 복구**.
5. **대용량 파일 완전 배제**:
   - zip 파일, mp4 비디오, 대용량 이미지, 모델 가중치는 `.gitignore`로 100% 차단하고, 오직 **순수 소스코드(`src/*.py`), 설정(`config/**/*.yaml`), 웹 UI(`web/*`), 워크플로우 JSON(`workflows/*.json`), 사양서(`*.md`), 테스트 코드(`tests/*.py`)**만 안전하게 추적·보존합니다.

---

## 3. [완료됨] 이전 프로그램 영구 삭제 및 핵심 자산 추출 (Execution Done)

사용자님의 지시에 따라, **6대 핵심 자산을 신규 모듈로 안전 추출하고 단위 테스트를 통과한 후, 구버전 찌꺼기 파일 일체를 100% 영구 삭제 완료**했습니다.

### 3.1 6대 핵심 자산 추출 및 검증 완료 (Safe Extraction Done)
1. `src/excel_reporter.py` (엑셀 서명 삽입 엔진 이식 및 검증 완료)
2. `src/audio_master.py` (FFmpeg 자막/경고 배지 + Edge-TTS 음성 이식 및 검증 완료)
3. `src/prompt_builder.py` (한국 덤프 키워드 사전 + 동적 모듈형 DNA 레지스트리 구축 완료)
4. `workflows/Minimax H3 Ref2VA + Easy Cache _ Spectrum + Sage.json` (H3 워크플로우 확보 완료)
5. `data/dump_safety_db.json` (69개 현장 안전 시나리오 DB 보존 완료)
6. `tests/test_extracted_assets.py` (4개 단위 테스트 100% 통과 확인 완료)

### 3.2 영구 삭제 실행 완료 (Clean Purge Done)
아래 실패 구버전 파일 및 폴더는 영구 삭제되어 워크스페이스가 클린해졌습니다:
* `app.py`, `core/`, `tools/`, `mobile_web/`, `output/` 삭제 완료
* `safety_prompt_generator.py`, `save_prompts.py`, `make_clean_bat.py`, `수정가이드_...txt` 삭제 완료

---

## 4. 전체 디렉터리 트리 (스캐폴드 명세)

```
c:\덤프트럭 운전자교육\
├─ .gitignore                         # __pycache__, outputs/videos, models 등 대용량 제외
├─ README.md                          # 시스템 종합 매뉴얼 및 단계별 실행 가이드
├─ requirements.txt                   # requests, websocket-client, PyYAML, openpyxl, edge-tts, pillow, imageio-ffmpeg
├─ 실행.bat                           # CLI 통합 런처 (메뉴 기반 실행)
├─ config/
│  ├─ settings.yaml                   # ComfyUI 주소, H3 설정, 공통 고증 프롬프트, 네거티브
│  ├─ qc_rules.yaml                   # 사양서 §10 기준 9대 고증 검수 규칙
│  └─ scenes/                         # 시나리오 정의 (2D 고증 + H3 모션 + 나레이션)
│     ├─ A_blindspot.yaml             # 우회전 사각지대 및 일시정지 (2026 개정)
│     ├─ B_reverse_guide.yaml         # 후진 유도원 및 신호봉 수신호
│     ├─ C_unload.yaml                # 사토장 성토지 덤핑 및 전도 방지
│     └─ D_precheck.yaml              # 운행 전 에어탱크(7bar) 및 타이어 마모도 점검
├─ src/
│  ├─ server.py                       # [웹 작업대 서버] REST API 및 정적 웹 UI 제공 (http://localhost:8900)
│  ├─ main.py                         # 통합 CLI 엔트리포인트 (generate, qc, video, relay, excel, scenario, backup)
│  ├─ scenario_manager.py             # [시나리오 엔진] 69개 DB 목록 조회, YAML 자동 추출, 사용자 수정본 유효성 검증
│  ├─ prompt_builder.py               # [1단계] 2D 고증 프롬프트 + H3 Ref2VA 규격 모션 프롬프트 조립기
│  ├─ workflow_loader.py              # ComfyUI API JSON 로더 및 노드 title/ID 기반 안전 치환기
│  ├─ comfy_client.py                 # ComfyUI HTTP/WebSocket 통신 (진행률 추적 및 파일 다운로드)
│  ├─ batch_runner.py                 # [2단계] 2D 배치 루프, 시드 고정, 재시도 2회, 실패 격리
│  ├─ manifest.py                     # manifest.json 생성 이력 추적 및 100% 재현성 보장
│  ├─ qc.py                           # [2단계] 9개 항목 품질 검수 및 winner.png 승인 인터페이스
│  ├─ video_engine.py                 # [3단계] Ref2VA 다중 이미지 + MiniMax H3 가변 모션 렌더러
│  ├─ relay_engine.py                 # [3단계] N개 컷 I2V 가변 릴레이 합성기 (3초~100초+)
│  ├─ audio_master.py                 # [4단계] Edge-TTS + FFmpeg 자막/타이틀 오버레이
│  ├─ excel_reporter.py               # [4단계] 법정 「안전보건 교육일지(.xlsx)」 자필 서명 삽입 엔진
│  └─ git_backup.py                   # GitHub 원격 백업 자동화 스크립트
├─ web/                               # [웹 브라우저 작업대 프론트엔드] (Vanilla HTML/CSS/JS, 무충돌 단일페이지 SPA)
│  ├─ index.html                      # 스튜디오 작업대 메인 UI (시나리오/2D검수/H3영상/자막/엑셀 통합 패널)
│  ├─ style.css                       # 세련된 다크모드 & 산업안전 고대비 글래스모피즘 테마
│  └─ app.js                          # 비동기 REST API 통신, 실시간 진행률, 비디오 플레이어, Winner 승인 로직
├─ workflows/                         # ComfyUI 공식 검증 워크플로우 JSON
│  ├─ 2d_t2i_krea.json                # [1차 2D] Krea 2 Turbo (krea2Turbo18For_v2 / 8step 고속 구도 렌더링)
│  ├─ 2d_i2i_qwen.json                # [2차 2D] Qwen-Rapid-AIO (28GB Checkpoint + 8step Lightning LoRA 고증 에디팅)
│  └─ Minimax H3 Ref2VA + Easy Cache _ Spectrum + Sage.json  # [3차 비디오] Ref2VA 가속 I2V 릴레이 엔진
├─ assets/
│  ├─ refs/                           # 레퍼런스 실사 사진 (차량 외관, 주황색 번호판, 현장, 인물)
│  └─ fonts/                          # 나눔고딕 / 맑은고딕 폰트
├─ outputs/
│  ├─ scene_A/ ...                    # 시나리오별 생성 2D 컷들
│  ├─ winners/                        # 검수 통과 확정 키프레임 (winner.png, cut1, cut2, cut3)
│  ├─ videos/                         # 렌더링된 MP4 비디오 (H3 클립 및 릴레이 완성본)
│  ├─ post/                           # 한글 폰트 수동 교정 큐
│  ├─ logs/                           # manifest.json 및 qc_{scene_id}.json
│  └─ reports/                        # 발행된 교육일지 엑셀 (.xlsx)
├─ tests/                             # 단위 테스트 스위트
│  ├─ test_prompt_builder.py
│  ├─ test_workflow_loader.py
│  └─ test_excel_reporter.py
```

---

## 5. OpenShorts 핵심 모듈 세부 구현 명세

### 5.0 2D 이미지 2단 파이프라인 (Krea 2 Turbo t2i ➔ Qwen-Rapid-AIO i2i 에디터)
사용자 지정 공식 채택: **"Krea 2 Turbo로 1차 기본 구도를 초고속 생성하고, Qwen-Rapid-AIO(i2i)로 한국 고증 디테일을 정밀 편집"**

* **1차 t2i 기본 생성 (`workflows/2d_t2i_krea.json`)**:
  - **모델**: `krea2Turbo18For_v2.safetensors` (또는 `krea2TurboRawINT8`) + `qwen3vl_4b_fp8_scaled` CLIP
  - **역할**: 8스텝 초고속 KSampler 구동으로 지형(사토장/골재장/교차로) 및 덤프트럭 차체 형상 1차 렌더링 (`outputs/{scene_id}/raw_t2i_{seed}.png`).
* **2차 i2i 정밀 고증 편집 (`workflows/2d_i2i_qwen.json` / OpenShorts Qwen 에디터 기법)**:
  - **체크포인트**: `Qwen-Rapid-AIO-NSFW-v23.safetensors` (Node 118)
  - **LoRA 가속**: `Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors` (Node 103)
  - **1차 이미지 입력**: Node 78 (`LoadImage`) ➔ Krea가 생성한 1차 이미지 주입
  - **i2i 고증 프롬프트 (Node 119)**:
    `"Keep truck shape and composition, add yellow commercial license plate, put driver in white safety helmet and yellow reflective vest, clear background Hangul signage, realistic 8k daylight"`
  - **출력**: 9대 품질 검수(QC)를 거쳐 무말풍선(Zero-Bubble) 정지 컷 **`winner.png`로 최종 확정!**

### 5.1 Ref2VA 다중 이미지 처리 (`src/video_engine.py`)
사용자 지정 공식 채택 워크플로우: **`Minimax H3 Ref2VA + Easy Cache _ Spectrum + Sage.json`**

* **다중 이미지 참조 배선**:
  - **Node 13 (`LoadImage`)**: 1차 메인 앵커 `<Picture 1>` ➔ 확정된 차량/구도 이미지 (`winner.png`)
  - **Node 14 (`LoadImage`)**: 2차 보조 앵커 `<Picture 2>` ➔ 인물 얼굴(김기사/정반장) 또는 현장 소품
* **가속 엔진**:
  - **Node 25 (`EasyCache`)**: 어텐션 레이어 캐싱
  - **Node 26 (`PathchSageAttentionKJ`)**: SageAttention 하드웨어 가속
* **프롬프트 및 비디오 출력**:
  - **Node 15 (`PrimitiveStringMultiline`)**: H3 공식 규격 모션 프롬프트 (`[Shot 1] ... from <Picture 1> riding/moving ... from <Picture 2> ...`)
  - **Node 27 (`PrimitiveFloat`)**: 재생 시간 `5.0초`
  - **Node 18 (`SaveVideo`)**: MP4 직접 인코딩 출력

### 5.2 I2V 가변 릴레이 연속 모션 엔진 (`src/relay_engine.py`)
시나리오 작업량과 교육 목적에 따라 **단일 컷(3~15초)부터 N개 컷을 연결한 30초, 60초, 100초 이상 장편 영상까지 완전 가변**으로 생성·합성합니다:
1. **컷별 개별 가변 렌더링 (3~15초 자유 지정)**:
   - 시나리오 YAML의 `duration` 값에 따라 H3 Node 27(`PrimitiveFloat`)을 동적 제어 (단문 경고 3~5초, 복합 주행/덤핑 8~15초).
2. **N개 컷 프레임 릴레이 및 전환 합성**:
   - 단일 컷 영상(3~15초) 또는 N개 컷 릴레이(원인 ➔ 위기 ➔ 해결 등 원하는 컷 수) 렌더링.
   - FFmpeg `concat` 및 `xfade` (부드러운 크로스페이드 트랜지션) 필터를 적용하여 끊김 없는 완결형 교육 비디오로 병합.
3. **음성/자막 연속 동기화**:
   - 연결된 영상의 총 길이에 맞추어 나레이션 음성과 자막을 타임코드별로 완벽히 오버레이 합성.

---

## 6. 법정 교육일지 및 시나리오 관리 엔진

### 6.1 법정 교육일지 엑셀 엔진 (`src/excel_reporter.py`)
- `core/signature_engine.py`에서 검증된 `openpyxl` 로직을 클린하게 흡수:
  - 정부/원청(포스코, 노동부) 제출 공문 표준 양식 테이블 자동 드로잉
  - 기사님 스마트폰 자필 서명 PNG 이미지를 **셀 가로·세로 종횡비에 맞게 정밀 리사이징하여 [서명란] 셀에 자동 삽입**
  - 상단 요약(교육일시, 강사, 교육내용) + 하단 명부(차량번호, 성명, 서명) 완벽 출력

### 6.2 시나리오 관리 및 사용자 수정/추가 전담 엔진 (`src/scenario_manager.py`)
사용자 및 안전관리자가 현장 여건(사토장, 터널, 골재장 등)이나 최신 사고 사례에 맞추어 시나리오를 자유롭게 수정·추가하고, 69개 원본 DB에서 손쉽게 추출할 수 있도록 전담 엔진을 구축합니다:
* **`list_scenarios(category=None)`**:
  - `data/dump_safety_db.json`의 69개 전 시나리오 목록(번호, 카테고리, 제목, 위험유형, 계절)을 정돈된 표 형태로 반환/표시.
* **`extract_scenario_to_yaml(scenario_num, output_path=None)`**:
  - 지정한 번호(예: 8번 사각지대, 3번 타이어점검)의 [원인/위기/해결] 원본 텍스트를 읽어, 현장 프리셋(`site_preset`, `cargo_state`, `weather_preset`, `role_preset`)과 H3 모션 및 나레이션이 완비된 **즉시 편집 가능한 YAML 파일(`config/scenes/...yaml`)로 자동 변환 생성**.
* **`validate_scenario(yaml_path)`**:
  - 사용자가 수정한 YAML의 필수 필드 누락 여부, 프리셋 키 오타(`site_presets` 등에 존재하는지 검사), 한글 프롬프트 매핑 가능 여부를 사전 검증하여 **생성 실패를 사전에 100% 방지**.

---

## 7. 웹 브라우저 통합 작업대 UI/UX 명세 (Web Studio Workbench)

사용자는 복잡한 터미널 CLI 명령어 입력 없이, **웹 브라우저(`http://localhost:8900`)**에서 시나리오 편집부터 2D 이미지 생성, 9대 고증 QC 판독, Winner 선정, MiniMax H3 영상 렌더링, 릴레이 타임라인 편집, 음성/자막 마스터링, 모바일 서명 수집 및 법정 교육일지 엑셀 출력까지 **전 과정을 직관적이고 시각적으로 완벽하게 제어**할 수 있습니다.

### 7.1 서버 아키텍처 (`src/server.py`)
* **경량 무충돌 내장 아키텍처**:
  - 외부 거대 프레임워크(충돌이 잦았던 Streamlit 등)를 완전 배제하고, Python 내장 `http.server` 기반 또는 경량 REST API 라우터 구동 (기본 포트 `8900`).
  - 브라우저 프론트엔드와 ComfyUI 백엔드(8188) 간의 비동기 프록시 및 작업 큐 중계.
* **REST API 엔드포인트 명세**:
  - `GET /api/scenarios`: 69개 안전 DB 및 사용자 저장 YAML 목록 반환
  - `POST /api/scenarios/save`: 사용자 작성 YAML 저장 및 문법/프리셋 유효성 사전 검사
  - `POST /api/generate/2d`: 선택된 시나리오의 2D 4장 일괄 생성 트리거 (ComfyUI WebSocket 연동)
  - `GET /api/status`: 실시간 ComfyUI 진행률(0~100%) 및 콘솔 로그 스트리밍
  - `GET /api/qc/images`: 생성된 2D 이미지 목록 및 메타데이터 반환
  - `POST /api/qc/approve`: 선택된 컷을 `outputs/winners/winner.png`로 승인 확정
  - `POST /api/generate/video`: H3 Ref2VA 가변 비디오(3.0~15.0초) 생성 요청
  - `POST /api/generate/relay`: N개 컷(3초~100초+) 타임라인 릴레이 병합 (FFmpeg xfade)
  - `POST /api/audio/tts`: Edge-TTS 성우 음성 합성 및 미리듣기
  - `GET /api/signatures`: 모바일 서명 패드에서 전송된 실시간 서명 목록 수신
  - `POST /api/excel/export`: 법정 안전보건 교육일지(.xlsx) 발행 및 브라우저 다운로드 제공
  - `GET /sign`: 기사님 스마트폰용 모바일 터치 자필 서명 웹페이지 서빙

---

### 7.2 UI 레이아웃 및 5대 핵심 작업 패널 (`web/index.html`, `style.css`, `app.js`)

* **PC 16:9 와이드 모니터 최적화 레이아웃 (가로 100% 풀-와이드 활용)**:
  - 1920x1080 와이드 모니터에서 좌우 여백 낭비나 답답한 좁은 창이 발생하지 않도록, **[좌측 65% 비주얼 캔버스 : 우측 35% 고정 컨트롤 패널]의 2단 스플릿 레이아웃** 적용.
  - 마우스 휠 스크롤을 최소화하여 좌측에서 이미지를 비교하고 우측에서 즉시 버튼을 누르는 직관적 조작 환경 제공.
  - **제작 종횡비 토글**: `[ (●) 9:16 세로 숏폼(스마트폰 교육) ]` vs `[ ( ) 16:9 가로 와이드(현장TV/교육장/PPT) ]` 즉시 전환.

* **상단 글로벌 헤더 (Global Header)**:
  - **시스템 타이틀**: `덤프트럭 운전자 안전교육 스튜디오 Pro v2.2 (Web Workbench)`
  - **종횡비 선택 스위치**: `9:16 (576x1024 / 모바일)` ↔ `16:9 (1024x576 / 교육장 와이드)`
  - **실시간 통신 상태**: ComfyUI (🟢 127.0.0.1:8188 온라인 / 🔴 오프라인), SSD 잔여 용량
  - **퀵 액션 툴바**: [📁 산출물 폴더 열기], [🔄 새로고침], [☁️ Git 백업]

```
+---------------------------------------------------------------------------------------------------------------+
| [로고] 덤프트럭 안전교육 스튜디오 Pro v2.2    [비율: (●)9:16모바일 ( )16:9와이드]    [● ComfyUI 8188]   [📁폴더]  |
+---------------------------------------------------------------------------------------------------------------+
|  [ 1. 시나리오 기획대 ]  [ 2. 2D 이미지 & Qwen 에디터 ]  [ 3. H3 영상편집대 ]  [ 4. 음성/서명 ]  [ 5. 일지발행 ] |
+---------------------------------------------------------------------------------------------------------------+
```

#### 패널 1: [📋 시나리오 기획 및 편집대] (Scenario Studio)
1. **69개 안전보건 DB 연동 셀렉터**:
   - 카테고리 필터(사각지대, 경사지 전도, 후진 유도원, 정비·점검 등) 및 69개 시나리오 원클릭 불러오기.
2. **현장 맞춤형 동적 프리셋 조정기**:
   - 현장 환경(사토장, 쇄석장, 도심교차로, 터널, 매립지), 적재 상태(만차/공차, 덤핑 틸팅각), 날씨(맑음, 폭우, 빙판, 안개), 인물 역할 선택.
3. **컷별 나레이션 및 H3 모션 텍스트 에디터**:
   - [원인 컷] ➔ [위기 컷] ➔ [해결 컷] 텍스트 실시간 수정.
4. **[검증 및 저장] & [프롬프트 실시간 프리뷰]**:
   - YAML 문법 및 프리셋 유효성 자동 검사 통과 시 녹색 체크 뱃지 부여.
   - 우측 화면에 영문 변환된 2D 고증 프롬프트 및 H3 Ref2VA 규격 모션 프롬프트 실시간 자동 렌더링 표시.

#### 패널 2: [🖼️ 2D 이미지 스튜디오 & Qwen 고증 에디터] (Krea t2i ➔ Qwen i2i ➔ QC)
1. **STEP 2-A: 1차 Krea Turbo t2i 기본 구도 생성**:
   - `[🚀 1차 Krea 4장 고속 생성]` 버튼 클릭 시 8스텝 KSampler 구동 (진행률 바 0% ➔ 100%).
   - 4분할 썸네일 그리드 뷰 (지형 지세 및 덤프트럭 기본 차체 형상 비교).
   - 각 컷 아래 **`[👉 Qwen 편집기로 전송]`** 버튼 제공 (원클릭 로드).
2. **STEP 2-B: 2차 Qwen-Rapid-AIO i2i 고증/각도 정밀 에디터 (OpenShorts 방식)**:
   - **좌측 뷰어**: Krea 1차 원본과 Qwen 고증 보정본의 **50:50 비포/애프터(Before/After) 비교 슬라이더** (마우스로 좌우를 밀어 디테일 변화 정밀 확인).
   - **우측 컨트롤러 (원클릭 고증 주입)**:
     - `[🏷️ 주황색 번호판 장착]` `[🦺 흰색안전모+형광오렌지조끼]`
     - `[🛑 한글 안전표지판]` `[⚙️ 휠초크/에어탱크 7bar]`
     - 카메라 앵글(Multi-Angle): `(●) 우회전 사각지대`, `( ) 운전석 시야`, `( ) 후방 덤핑 각도`
     - `[✨ Qwen i2i 고증 편집 실행 (8스텝 가속)]` 버튼
3. **STEP 2-C: 9대 고증 최종 QC & Winner 확정**:
   - 영업용 번호판, 풀 에어브레이크, 안전모, 말풍선 0% 체크리스트 확인.
   - 🏆 **`[⭐ 이 컷을 최종 Winner로 승인]`** ➔ `outputs/winners/winner.png`로 저장 및 3단계 H3 탭 자동 활성화.


#### 패널 3: [🎬 MiniMax H3 비디오 & 릴레이 편집대] (H3 Video Workbench)
1. **Ref2VA 다중 참조 비주얼 앵커 뷰**:
   - `<Picture 1>`: 2단계에서 승인된 `winner.png` 자동 로드 및 표시.
   - `<Picture 2>`: 유도원/신호수 얼굴 또는 차량 안전장치(차륜륜고임목, 에어게이지) 보조 참조 이미지 선택.
2. **완전 가변 모션 길이 제어기**:
   - **재생 시간 슬라이더 (3.0초 ~ 15.0초 가변 조절)**: 고정치가 아닌 시나리오에 맞는 자유로운 컷 길이 지정.
3. **릴레이 시퀀서 (Timeline Sequencer)**:
   - 컷1(원인: 5초) ➔ 컷2(위기: 4초) ➔ 컷3(해결: 6초) 타임라인 드래그 배치 및 총 재생시간(3초~100초+) 실시간 계산.
   - 트랜지션 효과 선택 (크로스페이드 xfade, 컷 전환).
4. **[🎞️ 릴레이 비디오 합성] & 내장 플레이어**:
   - 원클릭 렌더링 및 완성된 MP4를 브라우저 내에서 즉시 재생, 일시정지, 구간 탐색, 전체화면 감상.

#### 패널 4: [🎙️ 음성·자막 마스터링 & 모바일 서명 배포대] (Audio/Sub & Signature Hub)
1. **Edge-TTS 성우 음성 및 속도 조절**:
   - 한국어 자연스러운 성우(남성 인호 / 여성 선희) 선택, 말하기 속도(-20% ~ +20%), 실시간 [미리듣기] 지원.
2. **비디오 오버레이 제어**:
   - 상단 산업안전 공식 경고 뱃지 문구 및 하단 고대비 자막 텍스트 편집 후 비디오 최종 믹싱.
3. **📱 모바일 자필 서명 QR 코드 및 실시간 수집기**:
   - 화면에 생성된 QR 코드를 현장 기사님이 스마트폰으로 스캔하면 전용 서명 웹패드로 연결.
   - 기사님이 스마트폰 화면에 터치 자필 서명을 하고 [제출]을 누르면, 웹 작업대 모니터에 **기사님 성명, 차량번호, 서명 썸네일이 실시간(WebSocket)으로 즉시 등록**.

#### 패널 5: [📗 법정 안전보건 교육일지 발행대] (Legal Excel Output)
1. **법정 공문 기본 정보 입력 폼**:
   - 교육 일시, 교육 장소, 강사/안전관리자 성명, 원청사/수급사명.
2. **참석자 명부 및 서명 자동 매핑 테이블**:
   - 수집된 기사님들의 서명 상태를 확인하고 명단 최종 검토.
3. 📗 **[원클릭 엑셀 교육일지(.xlsx) 자동 발행 및 다운로드]**:
   - 클릭 즉시 `src/excel_reporter.py`가 구동되어 서명 이미지가 셀 규격에 완벽히 리사이징 삽입된 공식 법정 교육일지 파일이 생성되고 브라우저 다운로드 팝업 실행.
   - 최근 발행된 엑셀 일지 히스토리 목록 제공.

---

### 7.3 로컬 디스크 물리 저장 아키텍처 (웹 브라우저 용량 한계 완전 극복)

> [!IMPORTANT]
> **"웹 브라우저(LocalStorage 5MB 한계)에 저장하지 않고, 100% 로컬 PC 하드디스크에 물리 파일로 직접 영구 저장합니다."**  
> 웹 브라우저는 단지 **'시각적 조작 화면(Viewer & Controller)'**일 뿐이며, 사용자가 웹에서 버튼을 누르면 모든 대용량 이미지, 고용량 MP4 영상, 엑셀 문서는 **로컬 PC 디스크(`c:\덤프트럭 운전자교육\outputs\...`)에 직접 쓰기(Write)** 됩니다.

#### 1. 물리 데이터 저장 맵 (100% 로컬 PC 파일시스템)
| 작업 대상 | 웹 브라우저 역할 | 로컬 PC 실제 물리 저장 경로 (하드디스크) | 용량 특성 |
|---|---|---|---|
| **시나리오 기획/수정** | 텍스트 편집 및 저장 버튼 클릭 | `config/scenes/{시나리오명}.yaml` | 텍스트 (수 KB) |
| **2D 고해상도 생성컷** | 썸네일 스트리밍 뷰 및 비교 | `outputs/{시나리오명}/{seed}.png` | 무손실 PNG (컷당 2~5MB) |
| **Winner 확정 키프레임** | 승인 버튼 클릭 (`winner.png`) | `outputs/winners/{시나리오명}_winner.png` | 확정 PNG 원본 보존 |
| **H3 비디오 & 릴레이** | 내장 비디오 태그 스트리밍 재생 | `outputs/videos/{시나리오명}_relay_final.mp4` | 고화질 MP4 (수십~수백 MB) |
| **모바일 터치 자필 서명** | 스마트폰 캔버스에서 전송 수신 | `outputs/logs/signatures/{차량번호}_{성명}.png` | 무손실 투명 서명 PNG |
| **공식 법정 교육일지** | 발행 버튼 및 브라우저 다운로드 | `outputs/reports/안전보건교육일지_{날짜}.xlsx` | 공식 서명 삽입 엑셀 파일 |
| **작업 세션/진행 이력** | 새로고침 시 이전 작업 자동 복원 | `outputs/logs/manifest.json` | JSON 구조화 로그 |

#### 2. 브라우저 재부팅 및 세션 영구 보존 원리 (`manifest.json`)
* 웹 브라우저를 닫거나, 컴퓨터를 껐다 켜거나, 브라우저 캐시를 모두 지우더라도 **모든 작업 산출물과 승인 상태는 PC 디스크의 `manifest.json`과 `outputs/` 폴더에 완벽하게 보존**됩니다.
* 브라우저를 다시 켜면 백엔드 서버(`src/server.py`)가 로컬 디스크의 `manifest.json`을 읽어와 직전 작업 상태(어떤 시나리오를 편집 중이었는지, 어떤 이미지를 Winner로 승인했는지, 어떤 비디오가 렌더링되었는지)를 100% 그대로 화면에 복원합니다.

#### 3. 디스크 용량 관리 및 원클릭 탐색기 연동
* **[📁 폴더 열기] 원클릭 탐색기 호출**: 웹 UI 상단 버튼 클릭 시 Windows 파일 탐색기(`explorer.exe outputs`)가 실행되어 실제 대용량 파일들을 윈도우 폴더에서 즉시 확인하고 복사/이동할 수 있습니다.
* **디스크 여유 공간 모니터링**: 웹 헤더에 로컬 드라이브의 실제 잔여 용량(예: `SSD 여유: 185 GB`)을 실시간 표시합니다.
* **임시 파일 정리(Clean) 기능**: 2D 생성 과정에서 Winner로 선택되지 않은 탈락 컷들을 원클릭으로 정리하여 디스크 공간을 안전하게 확보할 수 있습니다.

---

## 8. 단계별 개발 및 완료 판정 기준 (Phase 0 ~ Phase 7 정밀 순서)

> [!TIP]
> **모든 단계는 선행 모듈이 완비된 후 다음 모듈로 이어지는 엄격한 의존성 순서(Dependency Chain)를 준수합니다.**  
> 매 단계는 작업 완료 후 파이썬 인터프리터 실행 검증 ➔ **로컬 물리 스냅샷(`_backup/phase_X/`) 복사 ➔ `dumptruck` 전용 브랜치 커밋 & 푸시**가 완료되어야 해당 단계가 종결됩니다. (원격 `main` 591개 자산 절대 불침범)

| 단계 | 작업 내용 및 대상 파일 (단일 파일 원칙) | 웹 작업대 연동 상태 | 완료 판정 기준 (Verification & 2중 안전 백업) |
|:---:|---|---|---|
| **Phase 0** | **GitHub 안전망 가동 및 클린 베이스라인 저장**<br>• `.gitignore` 생성 (대용량 제외)<br>• 6대 자산 및 클린 상태 베이스라인 커밋 | - | `git status` 클린 확인 ➔ **로컬 `_backup/phase_0/` 저장 & `dumptruck` 브랜치 푸시** |
| **Phase 1** | **설정 및 시나리오 관리 엔진 구축**<br>• `config/settings.yaml`, `config/qc_rules.yaml`<br>• `src/scenario_manager.py` & 기본 YAML 4종 | - | 69개 DB 목록 조회 및 YAML 자동 추출/검증 통과 ➔ **로컬 `_backup/phase_1/` 저장 & `dumptruck` 푸시** |
| **Phase 2** | **ComfyUI 워크플로우 로더 엔진 구축**<br>• `src/workflow_loader.py` | - | API JSON 딥카피 로드 및 노드 title/ID 안전 치환 통과 ➔ **로컬 `_backup/phase_2/` 저장 & `dumptruck` 푸시** |
| **Phase 3** | **ComfyUI 2D 통신 & 배치 생성 엔진 구축**<br>• `src/comfy_client.py`<br>• `src/batch_runner.py` & `src/manifest.py` | - | ComfyUI WebSocket 연동, 시드 고정 2D 생성 검증 ➔ **로컬 `_backup/phase_3/` 저장 & `dumptruck` 푸시** |
| **Phase 4** | **웹 브라우저 작업대 서버 & UI 1차 활성화**<br>• `src/server.py` (경량 REST API 8900 포트)<br>• `web/index.html`, `style.css`, `app.js` | **[패널 1, 2 활성화]**<br>• 시나리오 기획/편집<br>• 2D 생성 & 9대 QC 판독<br>• Winner 승인 확정 | `http://localhost:8900` 브라우저 접속, 시나리오 수정 저장 및 2D 컷 QC 승인(`winner.png` 저장) 브라우저 동작 검증 ➔ **로컬 `_backup/phase_4/` 저장 & `dumptruck` 푸시** |
| **Phase 5** | **MiniMax H3 가변 모션 & 릴레이 엔진 구축**<br>• `src/video_engine.py` (Ref2VA 노드 13/14/15 주입)<br>• `src/relay_engine.py` (3초~100초+ FFmpeg xfade) | **[패널 3 활성화]**<br>• Winner 기반 H3 렌더링<br>• 릴레이 타임라인 합성<br>• 웹 비디오 플레이어 재생 | 단일 컷(3~15초) 및 N컷 릴레이(30~100초+) 비디오 생성 후 웹 플레이어 정상 재생 검증 ➔ **로컬 `_backup/phase_5/` 저장 & `dumptruck` 푸시** |
| **Phase 6** | **음성/자막 마스터링 & 모바일 서명 & 엑셀 일지 구축**<br>• `src/audio_master.py` (Edge-TTS + 자막/배지)<br>• `src/server.py` (`/sign` 모바일 서명 패드 서빙)<br>• `src/excel_reporter.py` (서명 삽입 교육일지) | **[패널 4, 5 활성화]**<br>• TTS 미리듣기 및 믹싱<br>• QR 모바일 서명 실시간 수신<br>• 엑셀 일지 원클릭 다운로드 | 모바일 서명 실시간 수집 및 공식 법정 교육일지(.xlsx) 브라우저 다운로드 검증 ➔ **로컬 `_backup/phase_6/` 저장 & `dumptruck` 푸시** |
| **Phase 7** | **원클릭 통합 런처 및 최종 통합 릴리스**<br>• `실행.bat` (서버 8900 기동 + 브라우저 자동 오픈)<br>• `README.md` 최종 사용자 매뉴얼 | **[전체 5대 패널 완비]**<br>원클릭 완전 자동화 | `실행.bat` 더블클릭 시 브라우저 자동 오픈 및 전체 5단계 워크플로우 엔드투엔드 최종 점검 ➔ **로컬 `_backup/phase_final/` 저장 & 최종 태그 푸시** |



---

## 9. 승인 요청

본 계획서는 사용자가 지적하신 **"단계별 작업 완료 시 GitHub 원격 체크포인트 저장 및 이전 단계 복구 체계, 웹 브라우저 작업대 UI 구조, 5대 핵심 패널 명세, REST API 구조, 시나리오 내용 수정/추가/변경의 유연성, 69개 DB 관리자(`scenario_manager.py`), 영구 삭제 완료 상태"**까지 100% 반영하여 빈틈없이 보완되었습니다.



