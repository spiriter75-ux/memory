# OpenShorts Pro Studio — 9슬롯 매핑 검수

> 대상: 설계도의 9대 라벨 드롭존  
> 대조: H3 `VIDEO_PROMPT_WRITING_GUIDE` (T2VA / I2VA / FL2VA / L2VA)  
> 및 Full-Reference Mode 가이드  
> 검수일: 2026-08-29

---

## 1. 결론

**9슬롯 UI(드롭존 라벨)는 유지한다.**  
**9슬롯 → `<Picture 1>`~`<Picture 9>` 1:1 직결은 하지 않는다.**

이유는 단순하다. 스튜디오 슬롯의 “1번”과 H3 프롬프트의 `<Picture 1>`이 **다른 말**이기 때문이다.

| 층 | `<Picture N>`의 의미 |
|----|----------------------|
| 스튜디오 9슬롯 | 역할 라벨 (배경, 얼굴, 의상, 포즈…) |
| 2D 엔진 (Qwen 등) | 연결된 이미지 순서. 압축 후 재번호 가능 |
| H3 I2VA | **0.00초 첫 프레임**. 거의 항상 `winner.png` |
| H3 FL2VA | Picture 1 = 첫 프레임, Picture 2 = 끝 프레임 |
| H3 L2VA | Picture 1 = **마지막 프레임** |
| H3 Full-Ref (R2V) | 구체 프레임·콘티 앵커만 Picture. 인물·의상·배경·스타일은 **`<Subject N>`** |

설계도의 “빈 슬롯 압축 후 핀 0,1,2… 와 `<Picture 1~N>` 1:1”은 **2D Comfy 핀 배선**에만 해당한다.  
H3 프롬프트에 그대로 가져가면 첫 프레임이 배경 사진이 되거나, 얼굴 슬롯이 마지막 프레임으로 오인된다.

---

## 2. 스튜디오 9슬롯 (UI — 바꾸지 않음)

디렉터가 보는 드롭존. 의미는 고정.

| 슬롯 | 역할 | 바이블 연결 |
|------|------|-------------|
| 1 | 배경 공간 | 랜드마크 DNA + 참조 |
| 2 | 메인 인물 얼굴 | 인물 DNA |
| 3 | 서브/상대 인물 | 인물 DNA |
| 4 | 의상/착장 | 옷장 프리셋 |
| 5 | 동작/포즈 | 이번 컷 포즈 |
| 6 | 핵심 소품 1 | 소품 |
| 7 | 차량/탈것 | 소품 |
| 8 | 보조 소품 2 | 소품 |
| 9 | 특수 스타일/무드 | 스타일 |

이 번호는 **디렉터용 라벨**이다. Comfy 핀 번호도, H3 `<Picture N>`도 아니다.

---

## 3. 공식 가이드가 강제하는 Picture 규칙

### 3.1 I2VA — 주력 경로 (winner → 영상)

첫 줄 고정:

```text
For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.
```

- `<Picture 1>` = 영상 **0.00초 실제 첫 프레임**
- Shot 1에 속함
- 스타일·주체·구도·공간은 이 이미지에서 출발한 뒤 동작만 전개

→ 여기의 Picture 1은 **슬롯 1(배경)이 아니다. `winner.png`다.**

### 3.2 FL2VA

```text
How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot N) aligns with the S.SS-second mark of the target video.
```

- Picture 1 = 시작 프레임
- Picture 2 = 종료 프레임
- 본문은 두 장의 정지 묘사가 아니라 **사이 경로**

### 3.3 L2VA

```text
How the reference pictures align with the target video — <Picture 1> (from [Shot N]) aligns with the S.SS-second mark of the target video.
```

- Picture 1 = **마지막 프레임** (Shot 1이 아님)
- 앞에서 추론한 상태가 이 이미지로 수렴

### 3.4 Full-Reference (R2V) — 라벨 4종

| 라벨 | 쓰는 때 | 쓰지 않는 때 |
|------|---------|--------------|
| `<Subject N>` | 인물, 배경, 의상, 소품, 포즈, 스타일 등 **재사용 가능한 가시 내용** | 파일 자체 |
| `<Picture N>` | 첫 프레임, 키프레임, 마지막 프레임, 콘티 앵커 | 인물/의상/배경/스타일 **정의만** 할 때 |
| `<Video N>` | 원본 영상 편집·이어찍기·컷 구조 | 영상에서 꺼낸 인물(그건 Subject) |
| `<Audio N>` | 음성 복사·음색 참조·BGM 참조 | 파일에 소리가 있다고 자동 생성 |

가이드 원문 요지:

> 이미지가 인물·장면·의상·스타일 **정의용**이면 독립 `<Picture N>`을 만들지 말고, 해당 `<Subject N>` 정의 안에서 출처로만 인용한다.

예시:

```text
<Subject 1> is the young woman in <Picture 1>, with long dark hair, a blue cardigan, and a thin silver necklace.
```

여기서 Picture는 **출처 파일**이고, 타임라인 첫 프레임이 아닐 수 있다.  
I2VA의 “Picture 1 = 0.00초 프레임”과 역할이 겹치지 않게 모드를 분리해야 한다.

---

## 4. 올바른 어댑터 (슬롯은 하나, 출력은 모드별)

```text
        [스튜디오 9슬롯 + winner.png]
                    │
     ┌──────────────┼──────────────┐
     ▼              ▼              ▼
  2D 엔진        H3 I2VA/FL/L    H3 Full-Ref
  (압축+재번호)   (프레임 앵커)    (Subject + 선택적 Picture)
```

### 4.1 2D 이미지 엔진

빈 슬롯 압축은 여기서만 한다.

예: 슬롯 1 배경, 2 얼굴, 4 의상만 채워짐 (3, 5–9 빈칸)

| 슬롯 라벨 | 압축 후 핀 | 2D 프롬프트 태그 |
|-----------|------------|------------------|
| 1 배경 | 0 | `<Picture 1>` |
| 2 얼굴 | 1 | `<Picture 2>` |
| 4 의상 | 2 | `<Picture 3>` |

**불변식:** 핀 순서와 프롬프트 태그를 **같이** 재번호한다.  
핀만 압축하고 프롬프트가 “Picture 4 = 의상”으로 남아 있으면 엇갈린다.

Z-Image / Krea는 9장을 네이티브로 안 먹을 수 있다.  
실제로 물리는 슬롯만 어댑터가 고른다 (대개 얼굴, 의상, 배경).

### 4.2 H3 I2VA (이미지 확정 후 주력)

| 입력 | H3 태그 |
|------|---------|
| `winner.png` | **`<Picture 1>`** = 0.00초 첫 프레임 |
| 슬롯 1~9 | I2VA 본문에서 Picture로 **넣지 않음**. 이미 winner에 구워진 상태 |

바이블 DNA(인물·장소)는 텍스트로 Shot 1에 유지 지시만 한다.  
“Picture 1의 외양·의상·좌석·공간 배치를 유지한 채 동작을 전개.”

3초 샘플 / 5초 기본 모두 동일. `S.SS`만 실제 길이.

### 4.3 H3 FL2VA

| 입력 | H3 태그 |
|------|---------|
| 시작 프레임 (이번 winner 또는 이전 컷 last) | Picture 1 @ 0.00s |
| 종료 프레임 | Picture 2 @ S.SS |

9슬롯을 Picture 3~9로 끼워 넣지 않는다.  
가이드: 단일 샷 보간을 선호. 본문은 중간 경로.

### 4.4 H3 Full-Ref (R2V) — 슬롯이 Subject가 되는 곳

슬롯에 들어 있는 **역할 이미지**는 Picture가 아니라 Subject다.

| 슬롯 | Full-Ref 출력 |
|------|----------------|
| 2 메인 얼굴 | `<Subject 1>` … from (슬롯2 파일) |
| 3 상대 얼굴 | `<Subject 2>` … |
| 4 의상 | 메인 Subject에 포함하거나 별도 Subject (의상만 바꿀 때) |
| 1 배경 | `<Subject 3>` 환경 |
| 5 포즈 | 해당 인물 Subject의 동작 출처로 인용 |
| 6~8 소품·차량 | `<Subject N>` |
| 9 스타일 | Subject(스타일) 또는 summary의 스타일 문장 |
| `winner.png`가 첫 프레임일 때 | 그때만 독립 `<Picture 1>` (keyframe completion) |

정의 예시:

```text
subject_definitions:
<Subject 1> is the main character whose face comes from the identity still (slot 2) and whose wardrobe comes from the costume still (slot 4).
<Subject 2> is the landmark environment from the location still (slot 1), with the locked architectural DNA retained.
<Picture 1> is the first frame of [Shot 1], the approved winner still.
<Audio 1> is the voice-timbre / dialogue performance reference for <Subject 1> (S1).
```

슬롯 3·5가 비면 Subject를 만들지 않는다.  
**빈칸을 앞으로 당겨 Picture 번호를 채우지 않는다.**  
비어 있는 역할은 라벨이 없는 것이다.

### 4.5 오디오

H3 가이드의 `<Audio N>`은 9슬롯 밖이다.

- 대사 100% 보존 → 로컬 TTS를 `<Audio 1>`로 조건 (복사 또는 음색 참조)
- 현장음은 `overall_soundscape`
- BGM은 `non_diegetic_music` (마스터링 후처리면 영상 단계 `N/A`)

---

## 5. 한 컷에서 실제로 나가는 것

이미지 단계 (슬롯 1,2,4만 채워진 예):

```text
2D:  [배경, 얼굴, 의상] → 압축 3장 → Picture 1/2/3 + 재번호된 프롬프트
     → 후보 → winner.png
```

영상 단계 I2VA:

```text
For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.

integrated_multimodal_description: [Shot 1] Live-action, cinematic, ...
  the character shown in <Picture 1> remains ..., preserving appearance, clothing, and spatial layout.
  (S1) says: <d>[Korean] (대본 원문 그대로)</d>

overall_soundscape: ...
non_diegetic_music: N/A
```

영상 단계 Full-Ref가 필요할 때 (얼굴·장소를 winner만으로 못 잠글 때):

```text
subject_definitions: Subject = 슬롯 역할들, Picture 1 = winner (첫 프레임일 때만)
summary: [keyframe completion + reference generation]
retention_analysis: fully_preserved / partially_preserved ...
detailed_description: ...
```

---

## 6. 하지 말 것

1. 슬롯 번호 = `<Picture N>` 이라고 가정하기  
2. 빈 슬롯 압축 결과를 H3 I2VA 첫 줄에 넣기  
3. 얼굴·의상·배경 정의 이미지를 FL2VA의 Picture 1/2로 쓰기 (그건 시작/끝 **프레임**)  
4. Full-Ref에서 역할 이미지마다 독립 Picture 라인을 만들기  
5. 2D 압축 재번호를 H3 Subject 번호에 그대로 복사하기  
6. 대사 원문을 `<d>` 밖에서 번역·의역하기

---

## 7. 구현 시 데이터 한 줄

슬롯은 항상 **라벨 키**로 저장한다. 태그 번호는 어댑터가 모드별로 붙인다.

```text
slots:
  bg:       path | null    # 1
  face:     path | null    # 2
  face_b:   path | null    # 3
  wardrobe: path | null    # 4
  pose:     path | null    # 5
  prop_1:   path | null    # 6
  vehicle:  path | null    # 7
  prop_2:   path | null    # 8
  style:    path | null    # 9
winner: path | null
```

- 2D 어댑터: null 제외 후 순서대로 Picture 1…K + 프롬프트 재번호  
- I2VA 어댑터: winner → Picture 1. 슬롯은 텍스트 유지 지시에만 사용  
- Full-Ref 어댑터: null 아닌 슬롯 → Subject. winner가 프레임 앵커일 때만 Picture

---

## 8. 한 줄

> 9슬롯은 **디렉터 라벨**이다.  
> 2D는 압축·재번호된 Picture.  
> H3에서 Picture는 **시간축 프레임**이고, 슬롯 역할은 **Subject**다.
