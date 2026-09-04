/**
 * OpenShorts Pro Studio V2 Master Types
 * 100% Strict TypeScript - Dynamic UNET/Diffusion & GGUF Model System
 */

export type SlotKey =
  | 'bg'
  | 'face'
  | 'face_b'
  | 'wardrobe'
  | 'pose'
  | 'prop_1'
  | 'vehicle'
  | 'prop_2'
  | 'style';

export interface SlotDefinition {
  key: SlotKey;
  index: number;
  label: string;
  description: string;
  category: 'environment' | 'character' | 'wardrobe' | 'pose' | 'prop' | 'style';
}

export const STUDIO_SLOT_DEFINITIONS: SlotDefinition[] = [
  { key: 'bg', index: 1, label: '배경 공간 참조', description: '랜드마크 및 장소 고유 배경', category: 'environment' },
  { key: 'face', index: 2, label: '메인 인물 얼굴', description: '주인공 인물 얼굴 및 외모 DNA', category: 'character' },
  { key: 'face_b', index: 3, label: '서브 인물 얼굴', description: '상대방 또는 조연 인물 얼굴', category: 'character' },
  { key: 'wardrobe', index: 4, label: '의상/착장 참조', description: '현재 씬 전용 착용 의상', category: 'wardrobe' },
  { key: 'pose', index: 5, label: '동작/포즈 참조', description: '인물 신체 자세 및 구도', category: 'pose' },
  { key: 'prop_1', index: 6, label: '핵심 소품 1', description: '서류, 총기, 스마트폰 등 주요 소품', category: 'prop' },
  { key: 'vehicle', index: 7, label: '차량/탈것 참조', description: '경찰차, 세단, 바이크 등 탑승물', category: 'prop' },
  { key: 'prop_2', index: 8, label: '보조 소품 2', description: '가방, 안경, 액세서리 등 보조 소품', category: 'prop' },
  { key: 'style', index: 9, label: '특수 스타일/무드', description: '영화적 톤앤매너 및 조명 참조', category: 'style' },
];

export type ReferenceSlots = Record<SlotKey, string | null>;

// 2. 디스크에 실재하는 UNET / Diffusion / GGUF 모델 정보
export interface InstalledUnetModel {
  id: string;
  displayName: string;
  fileName: string;
  loaderType: 'UnetLoaderGGUF' | 'UNETLoader' | 'CheckpointLoaderSimple';
  family: 'qwen' | 'krea2' | 'zimage' | 'checkpoint' | 'flux';
  recommendedSteps: number;
  recommendedSampler: string;
  recommendedScheduler: string;
  description: string;
}

export const INSTALLED_UNET_MODELS: InstalledUnetModel[] = [
  {
    id: 'z-image-turbo',
    displayName: 'Z-Image Turbo (일반 실사)',
    fileName: 'z_image_turbo_bf16.safetensors',
    loaderType: 'UNETLoader',
    family: 'zimage',
    recommendedSteps: 10,
    recommendedSampler: 'euler',
    recommendedScheduler: 'beta',
    description: '12.3GB 6B S3-DiT - 왜곡 없는 순정 실사 마스터 모델',
  },
  {
    id: 'krea-2-turbo-v2',
    displayName: 'Krea 2 Turbo Extended v2.0 (Uncensored)',
    fileName: 'krea2Turbo18For_v2.safetensors',
    loaderType: 'UNETLoader',
    family: 'krea2',
    recommendedSteps: 16,
    recommendedSampler: 'euler',
    recommendedScheduler: 'simple',
    description: '13.5GB 12B DiT - 피부 모공/질감 및 무검열 최적화',
  },
  {
    id: 'krea-2-raw-int8',
    displayName: 'Krea 2 Turbo RAW INT8 (Fast)',
    fileName: 'krea2TurboRawINT8_krea2TurboINT8.safetensors',
    loaderType: 'UNETLoader',
    family: 'krea2',
    recommendedSteps: 16,
    recommendedSampler: 'euler',
    recommendedScheduler: 'simple',
    description: '13.8GB INT8 UNET - 초고속 구도 확인 가속 모델',
  },
  {
    id: 'z-image-ultimate',
    displayName: 'Z-Image Ultimate (성인용 NSFW)',
    fileName: 'zImageUltimateNSFW_v20.safetensors',
    loaderType: 'UNETLoader',
    family: 'zimage',
    recommendedSteps: 10,
    recommendedSampler: 'euler',
    recommendedScheduler: 'beta',
    description: '12.3GB 6B S3-DiT - 무검열 성인/전라 특화 병합 모델',
  },
  {
    id: 'z-anime-distill',
    displayName: 'Z-Anime Distill (웹툰/애니용)',
    fileName: 'z-anime-distill-8step-fp8.safetensors',
    loaderType: 'UNETLoader',
    family: 'zimage',
    recommendedSteps: 10,
    recommendedSampler: 'euler',
    recommendedScheduler: 'beta',
    description: '8.5GB FP8 - 모던 웹툰/애니메이션 2단계 고해상도 정밀 정제 렌더러',
  },
  {
    id: 'qwen-rapid-aio-ckpt',
    displayName: 'Qwen Rapid AIO NSFW v2.3',
    fileName: 'Qwen-Rapid-AIO-NSFW-v23.safetensors',
    loaderType: 'CheckpointLoaderSimple',
    family: 'qwen', // changed from checkpoint to qwen for UI routing
    recommendedSteps: 8, // ClownsharKSampler_Beta can use -1 or 8
    recommendedSampler: 'linear/euler',
    recommendedScheduler: 'simple',
    description: '28.4GB 초대형 통합 멀티모달 정밀 에디터',
  },
];

export type TwoDEngineType = 'z-image-turbo' | 'krea-2-turbo' | 'qwen-image-2512';
export type TwoDMode = 't2i' | 'i2i';

export interface CharacterDNA {
  id: string;
  name: string;
  sourceNovel?: string;
  ageGender: string;
  bodyBuild: string;
  faceFeatures: string;
  hairStyle: string;
  fixedTraits: string[];
  avoidTraits?: string[];
  refImagePath: string | null;
  turnaroundImagePaths?: string[];
  loraName?: string;
  loraStrength?: number;
  lockedPromptBlock: string;
}

export interface WardrobePreset {
  id: string;
  characterId: string;
  name: string;
  outfitDescription: string;
  shoesProps: string;
  condition?: string;
  refImagePath: string | null;
}

export interface LandmarkDNA {
  id: string;
  name: string;
  location: string;
  structureMaterials: string;
  lifeTraces: string;
  lightingAura: string;
  refImagePaths: string[];
  lockedPromptBlock: string;
}

// 5. 스토리보드 컷 데이터 모델
export interface ImageCandidate {
  id: string;
  engine: string;
  modelFileName: string;
  imagePath: string;
  prompt: string;
  seed: number;
  createdAt: string;
}

export interface ActiveLoRA {
  id: string;
  name: string;
  strength: number;
}

export interface StoryboardCut {
  id: string;
  cutNumber: number;
  originalText: string;
  dialogueText: string | null;
  actingState: string;
  actionPose: string;
  cameraWeatherMod: string;
  selectedCharacterId: string | null;
  selectedWardrobeId: string | null;
  selectedLandmarkId: string | null;
  slots: ReferenceSlots;
  
  // UNET / Diffusion 모델 직접 선택 상태 & 동적 무제한 LoRA 체인 ([+ 로라 추가] 방식)
  selectedUnetModelId: string; // INSTALLED_UNET_MODELS ID
  activeLoras?: ActiveLoRA[];
  selectedLoRAName?: string | null;
  selectedLoRAStrength?: number;
  selectedLoRA2Name?: string | null;
  selectedLoRA2Strength?: number;
  
  assembledPrompt: string;
  candidates: ImageCandidate[];
  selectedCandidateIndex: number;
  winnerImagePath: string | null;
  
  videoDurationSeconds: number;
  draftVideoPath: string | null;
  upscaledVideoPath: string | null;
  videoRenderStatus: 'idle' | 'draft_rendering' | 'draft_done' | 'upscaling' | 'done' | 'error';
  errorMessage: string | null;
}

// 6. 프로젝트 및 마스터 시트 데이터 모델
export interface ProjectMaster {
  id: string;
  title: string;
  chapter: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  cuts: StoryboardCut[];
  characters: CharacterDNA[];
  wardrobes: WardrobePreset[];
  landmarks: LandmarkDNA[];
  defaultUnetModelId: string;
  defaultVideoDuration: number;
  upscaleTargetMP: number;
}

// 7. 프로젝트 요약 정보 (작업 선택 및 시작 모달용)
export interface ProjectSummary {
  id: string;
  title: string;
  chapter: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  cutCount: number;
  winnerCount: number;
  videoCount: number;
  previewThumbnail?: string | null;
}

