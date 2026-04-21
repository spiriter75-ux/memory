ComfyUI Wan 2.2 I2V SVI 12-Segment 연속 생성 워크플로우 분석 및 운영 가이드

1. 워크플로우 개요

본 워크플로우는 Wan 2.2 14B (Image-to-Video) 모델을 기반으로, 단일 입력 이미지에서 시작하여 총 12개의 세그먼트(장면)가 연속적으로 이어지는 롱폼 비디오를 생성하는 고도의 SVI(Structural Video Interpolation) 파이프라인입니다.

2. 하드웨어 최적화 가이드 (RTX 3070 8GB VRAM 기준)

이 워크플로우는 14B 파라미터의 초거대 모델과 다중 LoRA를 사용하므로 8GB VRAM 환경에서 Out of Memory(OOM)가 발생하기 쉽습니다. 이를 방지하기 위한 필수 세팅입니다.

FP8 모델 사용 필수: wanVideo22_i2vHighNoise14BFp8Sd.safetensors 및 Low Noise 모델 모두 fp8_e4m3fn 포맷으로 로드하여 VRAM 점유를 최소화합니다.

Clean VRAM 노드 배치: easy cleanGpuUsed 노드(ID: 1774:1715)를 파이프라인 후반부에 배치하여 세그먼트 전환 및 프레임 보간(RIFE) 시 찌꺼기 메모리를 강제 회수해야 합니다.

Sage Attention 활성화: Patch Sage Attention KJ 노드를 통해 어텐션 연산을 최적화하여 속도와 메모리 효율을 극대화합니다.

3. 글로벌 파라미터 세팅 (Global Settings)

기본 해상도 (Resolution): 720 (Width) x 1072 (Height) - 세로형 숏폼 규격

기본 프레임 레이트 (Frame Rate): 16 FPS

총 샘플링 스텝 (Total Steps): 7 스텝 (High/Low 분할 샘플링 적용)

노이즈 분기점 (Split Steps): 3 스텝 (0~3스텝은 High Noise 모델, 3~7스텝은 Low Noise 모델이 담당)

4. 파이프라인 아키텍처 흐름 (Pipeline Architecture)

단계 1: 이미지 로드 및 리사이즈

LoadImage로 초기 이미지를 로드한 뒤, ImageResizeKJv2를 통해 720x1072 (Crop: Center)로 강제 규격화합니다.

단계 2: High / Low Noise 듀얼 샘플링 구조

디테일과 구조적 안정성을 동시에 잡기 위해 두 개의 UNET과 KSampler를 병렬/직렬로 혼합 사용합니다.

High Noise KSampler: 초기 구조와 강한 움직임을 잡습니다. (Step 0 ~ 3)

Low Noise KSampler: 디테일을 묘사하고 노이즈를 제거합니다. (Step 3 ~ 999)

각 샘플러는 WanAdvancedI2V (Ultimate) 노드와 결합되어 SVI(롱 비디오 모드)를 활성화하며, Repulsion_Boost 값은 1.0으로 설정되어 있습니다.

단계 3: 12-Segment 시퀀스 연결 (SVI 체인)

총 12개의 구간이 꼬리를 물고 이어지며, 각 구간은 MathExpression을 통해 생성 프레임 수(초 단위 * 16fps + 1)를 계산합니다.

이전 구간의 생성 결과(Latent 및 Image)가 다음 구간의 prev_latent 및 start_image로 전달(ImageBatchExtendWithOverlap 활용, Overlap: 5프레임)되어 끊김 없는 영상이 만들어집니다.

시간 할당: 1~4구간(각 3초), 5~7구간(각 2.5초), 8~11구간(각 2초), 12구간(3초).

단계 4: 동적 LoRA 및 프롬프트 전환

각 세그먼트마다 Power Lora Loader와 CLIPTextEncode가 독립적으로 배치되어 장면의 흐름을 강제로 전환합니다.

구간별 프롬프트 상세 흐름 (1~12구간):
점진적인 액션 속도의 증가와 테마의 극적인 전환을 유도하기 위해 프롬프트가 정밀하게 구성되어 있습니다.

공통 네거티브 프롬프트: watermark, text, subtitles, letterbox, frame, border, split screen, noise, artifacts, blur... 정지 화면(静态), 나쁜 해부학(丑陋的, 残缺的, 多余的手指) 등을 강력하게 억제.

1구간 (초기 도입): ...sensually starts performing a deepthroat blowjob. She is bobbing her head back and forth slowly... (천천히 시작하는 관능적인 움직임)

2구간 (혀 움직임 강조): sensualBJ. She is licking the shaft... with long, deliberate strokes of her tongue... (의도적이고 긴 혀의 움직임 묘사)

3구간 (핸드잡 결합): A woman is giving a man a blowjob and a handjob... while stroking the shaft... She smiles at camera. (두 동작의 동시 수행 및 카메라 응시)

4구간 (속도 1차 증가): ...engages in an intense... bobbing her head back and forth rapidly... (움직임 속도를 rapidly로 가속)

5구간 (속도 2차 증가): ...licking the shaft... with long very rapidly, deliberate strokes... (혀 움직임의 속도를 very rapidly로 최고조 가속)

6구간 (핸드잡 가속): ...stroking the shaft of his penis with one hand very rapidly. (핸드잡 동작의 속도 극대화)

7구간 (격렬한 움직임): ...engages in an intense, strenuous deepthroat blowjob... bobbing her head back and forth very rapidly... (가장 격렬하고 강도 높은 움직임)

8~9구간 (시선 처리 강조): 7구간의 격렬함을 유지하면서, 매혹적인 시선(She stares at the man with a seductive stare)을 프롬프트에 추가하여 인물의 표정 묘사 집중.

10구간 (테마 전환 - 페이스 스플래시 도입): after the man very hastily pulled his penis out of her mouth, f4c3spl4sh... She starts recieving a cumshot on her face... (급격한 체위 분리 및 얼굴 사정 시작)

11구간 (페이스 스플래시 유지): f4c3spl4sh... Cum splattered on her face. The man ejaculates multiple times... (얼굴에 튀는 효과와 다중 사정 묘사 지속)

12구간 (최종 마무리 클로즈업): ...countless thick slimy cum shots erupt. every cum shot sticks slimily to her face... She smiles at the camera. (얼굴 클로즈업 상태에서의 묘사 및 카메라를 향한 미소로 마무리)

단계 5: 후처리 프레임 보간 (RIFE VFI)

생성된 16fps 영상을 부드럽게 만들기 위해 RIFE VFI 노드를 사용합니다.

Multiplier (배수): 4배수 적용. 최종 영상은 64FPS (16 * 4)로 출력되어 매우 부드러운 슬로우 모션 및 자연스러운 움직임을 보장합니다.

최종 저장: H264-MP4 포맷, CRF 18로 렌더링.