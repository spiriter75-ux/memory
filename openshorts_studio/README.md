# OpenShorts Pro Studio V2.0 (Clean Master Snapshot)
> **최종 검증 백업 시점:** 2026-09-04 04:30 KST  
> **기능 상태:** 탭 1~5 독립 워크벤치 무결점 가동, 하드코딩 찌꺼기 0건, 컴파일 빌드 통과

---

## 📌 시스템 개요
- **목적:** 0원 로컬 고속 AI 쇼츠/웹소설 비디오 제작 스튜디오 (RTX 5060 Ti 16GB / ComfyUI :8288)
- **핵심 아키텍처:** 5대 독립 모듈형 워크벤치 (강제 연동 스파게티 결합 금지)
  - **Tab 1: Script Director** (소설 대본 분할 및 AI 지문 추출)
  - **Tab 2: Asset Bible** (캐릭터 DNA, 의상, 랜드마크 마스터)
  - **Tab 3: Storyboard Studio** (Z-Image / Krea2 / Qwen 2D 컷 생성)
  - **Tab 4: H3 Video Studio** (MiniMax-H3 curve Q5_1 GGUF 5대 영상화 파이프라인: T2V, I2V, FL2V, REF2VA, 롱샷 릴레이)
  - **Tab 5: Mastering Studio** (타임라인 클립 조립 및 60fps 마스터링)

---

## 🛠️ 복구 및 실행 방법

만약 작업 중 에이전트의 오작동 등으로 코드가 손상되거나 화면이 깨지면, 이 폴더의 내용을 복원하여 10초 만에 완벽 복구할 수 있습니다:

1. **소스 복사:**
   이 `openshorts_studio/app` 내용을 작업 경로(`c:\OpenShorts_Studio\app`)에 그대로 덮어씁니다.
2. **패키지 설치 및 실행:**
   ```bash
   cd c:\OpenShorts_Studio\app
   npm install
   npm run dev
   ```
3. **ComfyUI 패치 확인:**
   `custom_nodes_patches/comfyui-minimax-h3-turbo/__init__.py` 파일이 `C:\ComfyUI\custom_nodes\comfyui-minimax-h3-turbo\__init__.py`에 적용되어 있는지 확인합니다. (Civitai LoRA 접두사 이중 버그 방어 패치)
