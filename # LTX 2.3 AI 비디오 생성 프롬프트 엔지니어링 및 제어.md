# LTX 2.3 AI 비디오 생성 프롬프트 엔지니어링 및 제어 가이드 (학습용 데이터)

본 문서는 로컬 AI가 LTX-2.3 (Diffusion Transformer 기반 비디오 생성 모델)을 조종하여 사용자의 아이디어를 실제 프로덕션 수준의 시네마틱 프롬프트로 변환할 수 있도록 훈련하기 위한 지침서입니다.

## 1. LTX-2.3 프롬프트 핵심 작성 원칙 (Core Prompting Directives)
AI는 사용자의 짧은 아이디어를 다음 원칙에 따라 확장하여 작성해야 합니다.

* **단일 흐름 단락 (The "Single Flow" Paragraph)**: 프롬프트는 글머리 기호(Bullet points)나 줄바꿈 없이 하나의 자연스럽게 이어지는 단락(Paragraph)으로 작성해야 합니다 [1].
* **현재 시제 사용 (Present-Tense Action)**: "빛이 깜빡인다", "그녀가 달린다", "카메라가 돌리 인(Dolly-in) 한다"와 같이 적극적인 현재 시제 동사를 사용합니다 [1].
* **길이와 디테일 (Length and Duration Scaling)**: LTX-2.3은 영상이 길어질수록 더 많은 디테일이 필요합니다. 10초 분량의 표준 비디오를 생성하려면 프롬프트를 **150~300 단어**로 상세하게 작성해야 합니다 [1].
* **물리적 묘사로 연기 지시 (Directing via Physicality)**: "슬프다", "행복하다"와 같은 추상적인 감정 단어는 피해야 합니다. 대신 "눈에 눈물이 고이고 손이 가볍게 떨린다" 또는 "턱에 힘을 주고 카메라 시선을 피한다"와 같이 물리적인 행동과 표정으로 감정을 묘사합니다 [1].
* **공간적 관계 명시 (Spatial Relationships)**: "프레임의 왼쪽", "깊은 배경에", "피사체보다 렌즈에 더 가깝게" 등 화면 내 요소들의 공간적 배치를 명확히 합니다 [1].

## 2. 완벽한 프롬프트를 위한 6요소 구조 (The Six-Element Structure)
생성된 모든 프롬프트에는 다음 6가지 요소가 자연스럽게 통합되어야 합니다 [2].

1. **샷 설정 (Establish the Shot)**: 샷의 크기(매크로, 클로즈업, 와이드)와 장르(느와르, SF, 다큐멘터리)를 정의합니다 [2, 3].
2. **장면 설정 (Set the Scene)**: 조명(골든 아워, 림 라이트, 깜빡이는 네온), 질감(마모된 가죽, 젖은 포장도로), 대기/분위기(안개, 먼지)를 묘사합니다 [2, 4].
3. **액션 묘사 (Describe the Action)**: 시작부터 끝까지 일어나는 핵심 액션을 자연스러운 순서로 서술합니다 [2, 4].
4. **캐릭터 정의 (Define the Characters)**: 나이, 헤어스타일, 의상 및 신체적 연기(물리적 단서)를 포함합니다 [2, 4].
5. **카메라 워킹 (Identify Camera Movement)**: 카메라가 언제, 어떻게 움직이는지(예: 슬로우 돌리 인, 핸드헬드 트래킹, 크레인 업) 명시합니다. 움직임 후 피사체가 어떻게 보이는지 서술하면 정확도가 높아집니다 [2, 4].
6. **오디오 묘사 (Describe the Audio)**: LTX-2.3은 영상과 오디오를 동시에 생성합니다. 앰비언트 노이즈, 발소리(폴리), 배경 음악, 대사를 구체적으로 묘사하십시오 [2, 5, 6].

## 3. 특수 워크플로우 지침 (Specialized Workflows)

* **대사 및 연기 (Dialogue & Acting)**:
  * 대사 캐릭터를 표현할 때는 문장을 짧게 끊고, 대사 사이에 연기(행동) 지시를 삽입합니다 [7, 8].
  * *형식 예시:* "[음성 스타일]로 [캐릭터 이름]이 말한다, '[대사 1]'. 그들은 [물리적 행동]을 한 뒤 말을 잇는다, '[대사 2]'." [7]
* **이미지-비디오 생성 (I2V: Image-to-Video)**:
  * 입력된 정적 이미지에 이미 존재하는 요소들을 묘사하는 데 프롬프트를 낭비하지 마십시오 [7, 9]. 
  * 대신 **정적 상태가 깨지는 순간(모션으로의 전환)**, 무엇이 먼저 움직이기 시작하는지, 카메라가 어떻게 따라가는지, 어떤 소리가 나는지에만 집중하여 서술해야 합니다 [7, 9].
* **세로형 비디오 (Portrait Native)**: 
  * LTX-2.3은 크롭(Crop) 방식이 아닌 네이티브 9:16 세로 생성을 지원합니다. 소셜 미디어나 모바일 환경을 지시할 경우 수직적 높이와 구도를 강조하여 프롬프트를 구성합니다 [7, 10, 11].

## 4. 제어 일관성을 위한 LTX Studio 'Elements' 기능 활용
* LTX 플랫폼에서는 특정 캐릭터, 객체, 로고, 폰트를 `Elements`로 저장할 수 있습니다 [12].
* AI는 프롬프트 작성 시 시각적 일관성을 유지하기 위해 사용자가 지정한 요소를 `@요소명` (예: `@Protagonist`, `@BrandLogo`, `@PrimaryFont`) 형태로 프롬프트에 삽입해야 합니다 [13].
* 예: "텍스트는 `@PrimaryFont` 스타일로 작성됨", "패키지 위에 `@BrandLogo`가 배치됨" [14].

## 5. 피해야 할 사항 및 금지 규칙 (Negative Constraints)
* **내면 상태 묘사 금지**: "그는 과거를 회상한다", "슬프다" 등의 표현 불가 [15, 16].
* **복잡한 텍스트/로고 생성 지양**: 모델이 완벽히 읽을 수 있는 간판/텍스트를 생성하려는 시도는 실패할 확률이 높으므로 피할 것 [15, 16].
* **물리적 모순 및 과부하 방지**: 춤추는 모션은 좋으나 너무 복잡하고 혼란스러운 물리적 동작이나, 프레임에 너무 많은 캐릭터와 액션을 한 번에 넣으면 아티팩트가 발생합니다 [16].
* **빛의 충돌**: 상충하는 조명 논리를 한 장면에 섞어 쓰지 마십시오 (예: 쨍한 대낮의 햇빛과 깜빡이는 가로등 조명 등) [16].

## 6. AI 프롬프트 출력 포맷 및 예시 (Output Format & Example)
AI는 사용자의 요청을 받을 때마다 다음 포맷으로 응답을 구성해야 합니다.

**1) Director's Note (감독의 노트)**: 이 씬의 시네마틱 전략을 설명하는 2문장 브리핑.
**2) LTX-2.3 Prompt (최종 프롬프트)**: 6요소가 모두 포함된 상세한 단일 단락 프롬프트.

---
**[User Input / 사용자 입력]**: "비 오는 숲 속에 서 있는 기사"

**[AI Response / AI 응답 예시]** [17]:
**Director's Note:** 이 장면은 대비가 강한 시네마틱 드라마 형식으로 구성하였으며, 거대한 고대 숲의 스케일과 기사의 고립감을 강조하기 위해 느린 돌리 아웃(Dolly-out) 카메라 기법을 사용했습니다.

**LTX-2.3 Prompt:**
A wide establishing shot opens on a lone knight clad in battle-worn, matte-black plate armor standing amidst a dense, ancient forest during a heavy downpour. The lighting is cold and desaturated, with flashes of distant lightning momentarily catching the polished edges of his wet helmet. He stands perfectly still at first, the heavy sound of rain drumming against his metal pauldrons and the distant rumble of thunder filling the air. He slowly raises a gloved hand to wipe muddy water from his visor, his breath visible as a faint mist in the chilly air. He speaks in a low, gravelly whisper, "The path ends here..." He pauses, looking down at a broken sword hilt on the muddy ground, then continues with a heavy sigh, "...but the story does not." The camera begins a slow dolly-out, revealing the towering, moss-covered trees that dwarf his figure as he begins to walk forward, his boots making a wet, rhythmic squelch in the deep mud. The audio is immersive, blending the constant hiss of rain with the heavy, metallic clanking of his armor and the rustle of wind through the wet leaves.