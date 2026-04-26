# ComfyUI Workflow 종합 가이드 및 트러블슈팅 (Civitai lonecatone23)

이 문서는 Civitai의 **lonecatone23**님이 작성한 "How to use my workflows. A Comprehensive Breakdown & Troubleshooting Guide" 내용을 바탕으로 정리된 학습용 가이드입니다.

## 1. 워크플로우 개요 (Workflow Overview)
워크플로우는 사용자가 직관적으로 이해할 수 있도록 기능별로 모듈화되어 있습니다.

- **Prompt Assist**: 사용자의 기본 입력을 보조하고 확장하는 모듈.
- **ControlNet / I2I**: 이미지의 구조를 제어하거나 기존 이미지를 변형하는 핵심 모듈.
- **Main Input**: 텍스트 프롬프트 및 기본 설정을 입력하는 중앙 제어판.
- **Post-Production (후보정)**: 업스케일링, 디테일러, 얼굴 보정 등이 포함된 최종 출력 최적화 섹션.

## 2. 설치 및 노드 관리 (Installation & Nodes)
- **누락된 노드 발생 시**: ComfyUI Manager를 통해 'Install Missing Custom Nodes'를 실행하는 것이 기본입니다.
- **수동 설치**: 매니저로 해결되지 않는 경우, 워크플로우 내의 **'Notes'** 섹션에 있는 링크를 확인하여 GitHub에서 직접 클론(GIT)하거나 `custom_nodes` 폴더에 복사해야 합니다.
- **최신 상태 유지**: 워크플로우가 업데이트됨에 따라 관련 노드들도 최신 버전으로 업데이트해야 정상 작동합니다.

## 3. 핵심 기능 설정

### 3.1 ControlNet 및 Image-to-Image (I2I)
- 이미지 기반 가이드를 사용할 때 필수적인 모듈입니다.
- **ControlNet 모듈**: 포즈, 깊이, 선 추출 등을 통해 생성 결과의 레이아웃을 고정합니다.
- **I2I (Image-to-Image)**: 원본 이미지의 질감이나 형태를 유지하며 새로운 스타일을 적용할 때 사용합니다.

### 3.2 후보정 (Post-Prod) 섹션
- **Hi-Rez Fix**: 저해상도 생성 후 고해상도로 재구축하여 디테일을 살립니다.
- **Ultimate Upscalers**: 큰 이미지 생성을 위한 고성능 업스케일러.
- **Detailers (Face/Body)**: 생성된 인물의 얼굴이나 신체 특정 부위의 디테일을 정교하게 다듬습니다.
- **Seed VR2**: 업스케일 과정에서 시드 값을 조절하여 노이즈를 제어하고 선명도를 높입니다.

## 4. 중요 트러블슈팅 (Troubleshooting)

### 4.1 GGUF 모델 사용 시 "widget to string" 에러
- **원인**: 최신 ComfyUI 업데이트로 인한 위젯 이름 충돌.
- **해결책**: 위젯의 이름이 `gguf-name`으로 되어 있는 경우, 이를 다른 고유한 이름으로 변경하면 에러가 해결됩니다. (2024년 4월 9일 업데이트 반영)

### 4.2 노드 빨간색 표시 (Missing Nodes)
- ComfyUI Manager에서 검색되지 않는 노드는 제작자가 수정한 커스텀 버전일 가능성이 높으므로, 반드시 가이드 문서의 'Notes'에 링크된 특정 GitHub 저장소를 확인해야 합니다.

## 5. 프롬프트 엔지니어링 팁
- **Prompt Assist**를 활성화한 상태에서는 메인 프롬프트에 핵심 키워드만 남기는 것이 좋습니다. 과도한 중복 입력은 의도치 않은 결과(Deep-fried image 등)를 초래할 수 있습니다.
- 이미지 생성 시 배경과 인물의 디테일을 분리하여 입력하는 것이 효과적입니다.

---
*참고 원문: [Civitai Article 24678](https://civitai.com/articles/24678)*
