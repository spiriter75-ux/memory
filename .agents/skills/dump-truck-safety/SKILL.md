---
name: dump-truck-safety
description: >-
  덤프트럭 운전자 안전교육 & 교육일지 자동화 스킬. 85개 주차별·계절별 시나리오 인용, 수급사 회의자료 PPT 영상 변환,
  MiniMax H3 (576x1024 9:16 / 24fps) I2V 모션 비디오 렌더링, Edge-TTS 한국어 음성 믹싱,
  모바일 웹 배포, 기사님 터치 자필 서명 수집 및 공식 법정 「안전보건 교육일지(.xlsx)」 자동 출력을 지원합니다.
---

# 덤프트럭 운전자 안전교육 & 교육일지 자동화 시스템 (Dump Truck Safety Skill)

본 스킬은 덤프트럭 운전자를 위한 **[상황·계절별 맞춤 교육 영상 제작]**, **[모바일 웹 카카오톡 배포 & 기사님 터치 자필 서명 수집]**, 그리고 **[법정 안전보건 교육일지 엑셀 자동 완성]**을 원스톱으로 처리하는 안티그래비티 전용 도구 체계입니다.

---

## 1. 핵심 명령 및 도구 실행 가이드

### 1) 시나리오 기반 숏츠 영상 제작 (`tools/render_scenario_video.py`)
- **설명**: 85개 표준 시나리오 DB에서 번호나 키워드로 즉시 576x1024 세로형 교육 숏츠를 렌더링합니다.
- **실행 커맨드**:
  ```powershell
  python tools/render_scenario_video.py --scenario 13 --output output/videos/13주차_덤핑전도방지.mp4
  ```
- **옵션**:
  - `--scenario <번호>`: 시나리오 번호 (1~85)
  - `--keyword <키워드>`: 계절/위험 키워드 검색 (예: `rain`, `summer`, `winter`, `speed`, `blindspot`, `overload`)
  - `--duration <초>`: 영상 재생 시간 (5.0 ~ 15.0초 가변, 기본값: 10.0초)
  - `--voice <음성>`: `ko-KR-InJoonNeural`(표준남성), `ko-KR-SunHiNeural`(표준여성), `ko-KR-HyunsuNeural`(거북이톤)

### 2) 수급사 안전회의 PPTX 영상 변환 (`tools/ppt_to_safety_video.py`)
- **설명**: 현장 안전회의 PPTX 파일에서 슬라이드별 실제 사진, 사고 CCTV 영상, 속도 규정표를 추출하여 내레이션이 들어간 576x1024 모바일 교육 영상으로 자동 변환합니다.
- **실행 커맨드**:
  ```powershell
  python tools/ppt_to_safety_video.py --ppt "교통안전/`26년 08월 수급사 회의자료.pptx" --output output/videos/수급사_교통안전교육.mp4
  ```

### 3) 공식 법정 「안전보건 교육일지」 엑셀 출력 (`tools/export_safety_log.py`)
- **설명**: 스마트폰에서 기사님들이 영상 시청 후 제출한 **실제 자필 싸인 PNG 이미지를 각 행의 [서명란] 셀에 쏙 삽입**하여 원청(포스코/수급사/노동부) 제출용 공식 엑셀(`.xlsx`) 문서를 즉시 생성합니다.
- **실행 커맨드**:
  ```powershell
  python tools/export_safety_log.py --title "2026년 8월 덤프트럭 교통안전교육" --output output/reports/2026_08_안전보건교육일지.xlsx
  ```

### 4) 최신 법규 & 시나리오 DB 관리자 (`tools/manage_safety_db.py`)
- **설명**: 도로교통법, 산안법, 건설기계법 최신 개정 사항 및 신규 사고 사례를 시나리오 DB에 추가/수정/검색합니다.
- **실행 커맨드**:
  ```powershell
  python tools/manage_safety_db.py --search "빗길"
  ```

### 5) 모바일 교육 웹 갱신 (`tools/build_mobile_web.py`)
- **설명**: `mobile_web/index.html`에 최신 교육 영상을 연결하고 카카오톡 발송용 안내 문구를 자동 생성합니다.
- **실행 커맨드**:
  ```powershell
  python tools/build_mobile_web.py --video output/videos/13주차_덤핑전도방지.mp4
  ```

---

## 2. 덤프트럭 물리 법칙 및 한국 도로 고증 기준

- **브레이크 시스템**: 25톤 대형 덤프트럭은 100% **풀 에어 브레이크(Full Air Brake)**를 사용하며, 출발 전 **에어탱크 공압 최소 7bar 이상 충전**을 확인해야 합니다. (`베이퍼록` 용어 사용 금지 ➔ `브레이크 페이드` 및 `에어탱크 공압`으로 표기).
- **2026 최신 법규**:
  - **AEBS (비상자동제동장치)** & **LDWS (차로이탈경고)** 정상 작동 유지 의무.
  - **2시간 연속 운행 시 15분 이상 법정 의무 휴식**.
  - **가설도로 및 현장 내 제한속도 10~20km/h** 준수.
- **한국형 비주얼 규칙**:
  - 대한민국 25톤 캡오버(평두형) 트럭, 좌핸들(LHD), 우측통행(RHT, 황색 복선 중앙선), 주황색 건설기계 번호판.
  - 운전자 PPE: 안전모(Safety Helmet), 형광 안전조끼(Safety Vest), 안전화(Safety Boots) 필수 착용.
  - **Zero-Bubble 원칙**: AI 이미지에 말풍선(Speech Bubble) 생성을 일체 배제하고 순수 상황 일러스트로 생성하며, 한글 대사 및 수칙은 소프트웨어 자막/배너로 합성.
- **MiniMax H3 네이티브 규격**:
  - 세로형: **`576 x 1024`** (9:16), 24fps, 5~15초 가변.
  - 오디오: 등장인물 현장 대사는 H3 자체 음성, 총괄 교육 해설은 Edge-TTS 한국어 음성 믹싱.

---

## 3. 대화형 실행 예시 (Natural Language Prompts)

- *"오늘 비 오는데 빗길 감속이랑 연약지반 교육 숏츠 만들어줘"* ➔ `render_scenario_video.py` 실행하여 576x1024 MP4 렌더링.
- *"수급사 회의자료 PPT 영상으로 변환하고 모바일 웹에 연결해줘"* ➔ `ppt_to_safety_video.py` + `build_mobile_web.py` 실행.
- *"이번 달 교육 서명한 기사님들 교육일지 엑셀 뽑아줘"* ➔ `export_safety_log.py` 실행하여 자필 서명이 셀에 삽입된 `안전보건교육일지.xlsx` 생성.
