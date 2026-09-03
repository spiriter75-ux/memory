import React, { useState, useEffect } from 'react';
import {
  ProjectMaster,
  StoryboardCut,
  ActiveLoRA,
  INSTALLED_UNET_MODELS,
  InstalledUnetModel,
} from '../../types';
import { slotAdapter } from '../../services/slotAdapter';
import { workflowRegistry } from '../../services/workflowRegistry';
import { comfyClient } from '../../services/comfyClient';
import { aiDirectorService } from '../../services/aiDirectorService';

interface Tab3Props {
  project: ProjectMaster;
  onUpdateCut: (updatedCut: StoryboardCut) => void;
  onUpdateCuts?: (updatedCuts: StoryboardCut[]) => void;
  onNextTab: () => void;
}

// 엔진별 호환 LoRA 자동 필터링 헬퍼 함수
export function filterLorasByEngine(allLoras: string[], engineId: string): string[] {
  if (!allLoras || allLoras.length === 0) return [];
  const lower = (engineId || '').toLowerCase();

  let matched: string[] = [];
  if (lower.includes('krea')) {
    matched = allLoras.filter((l) => l.toLowerCase().includes('krea'));
  } else if (lower.includes('z-image') || lower.includes('zimage')) {
    const zLoras = allLoras.filter((l) => l.toLowerCase().includes('z_image') || l.toLowerCase().includes('zimage'));
    // asianMix를 최우선 1순위로 배치하고, 터보 충돌 위험이 있는 distill_patch는 우선순위에서 배제
    matched = zLoras.sort((a, b) => (a.toLowerCase().includes('asianmix') ? -1 : b.toLowerCase().includes('asianmix') ? 1 : 0));
  } else if (lower.includes('qwen')) {
    matched = allLoras.filter((l) => l.toLowerCase().includes('qwen'));
  } else if (lower.includes('illustrious') || lower.includes('pony') || lower.includes('anime')) {
    matched = allLoras.filter(
      (l) => l.toLowerCase().includes('일러스트') || l.toLowerCase().includes('illustrious') || l.toLowerCase().includes('pony')
    );
  } else if (lower.includes('minimax') || lower.includes('h3')) {
    matched = allLoras.filter((l) => l.toLowerCase().includes('minimax') || l.toLowerCase().includes('h3'));
  }

  return matched.length > 0 ? matched : allLoras;
}

export const Tab3StoryboardStudio: React.FC<Tab3Props> = ({ project, onUpdateCut, onUpdateCuts, onNextTab }) => {
  // 진입 모드: 'project' (소설 연계 컷 모드) vs 'direct' (단독 독립 이미지 생성 모드)
  const isDirectMode = new URLSearchParams(window.location.search).get('mode') === 'direct' || project.cuts.length === 0;
  const [entryMode, setEntryMode] = useState<'project' | 'direct'>(isDirectMode ? 'direct' : 'project');
  const [selectedCutId, setSelectedCutId] = useState<string>(project.cuts[0]?.id || '');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationProgress, setGenerationProgress] = useState<string>('');

  // 사용 가능한 LoRA 목록 (기본 추천 LoRA로 즉시 초기화)
  const [availableLoRAs, setAvailableLoRAs] = useState<string[]>([
    'KREA_2_turbo/KREA2turboNSFW.safetensors',
    'z_image_turbo/hina_ZImageTurbo_asianMix_v5.0-TQD-Lora.safetensors',
    'z_image_turbo/TurboPussyZ_v2.safetensors',
    'Qwen/Qwen-image-edit-2511-multiple-angles-lora.safetensors',
    'Qwen/Qwen-Image-2512-Lightning-8steps-V1.0-bf16.safetensors',
    'Qwen/cocoamixQIedit.safetensors',
  ]);

  // 독립 이미지 생성용 독립 상태 (하드코딩 제거: 기본 빈값 및 placeholder 적용)
  const [directPrompt, setDirectPrompt] = useState<string>('');
  const [directCandidates, setDirectCandidates] = useState<{ id: string; engine: string; imagePath: string; seed: number; createdAt: string }[]>([]);
  const [directCandIdx, setDirectCandIdx] = useState<number>(0);
  const [directWinner, setDirectWinner] = useState<string | null>(null);

  // T2I vs I2I 모드 제어
  const [genMode, setGenMode] = useState<'t2i' | 'i2i'>('t2i');
  const [i2iCustomImage, setI2iCustomImage] = useState<string | null>(null);
  const [qwenSwapCharImage, setQwenSwapCharImage] = useState<string | null>(null); // Image 2: 교체할 인물 레퍼런스
  const [qwenMode, setQwenMode] = useState<'char_swap' | 'h3_turnaround' | 'multi_angles' | 'single_edit' | 'undress_only' | 'wardrobe'>('char_swap'); // Qwen 전용 모드
  const [selectedAngleTag, setSelectedAngleTag] = useState<string>('<sks> front view eye-level shot medium shot');
  const [i2iDenoise, setI2iDenoise] = useState<number>(0.65);
  const [singleEditPrompt, setSingleEditPrompt] = useState<string>(''); // Qwen-VL 부위 수정 지시문
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [isExpandingT2IPrompt, setIsExpandingT2IPrompt] = useState<boolean>(false); // 27B T2I 프롬프트 확장 진행 상태

  // 화면 비율 제어: 9:16 (세로 쇼츠), 16:9 (가로형 영상/시네마틱), 1:1 (정사각)
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9' | '1:1'>('9:16');

  // 선택된 독립 엔진 (기본: z-image-turbo 일반 실사)
  const [selectedEngineId, setSelectedEngineId] = useState<'krea-2-turbo-v2' | 'z-image-turbo' | 'z-image-ultimate' | 'z-anime-distill' | 'qwen-2512-gguf'>('z-image-turbo');

  // FLUX (Krea 2) 전용 워크플로우 파라미터 제어
  const [fluxSteps, setFluxSteps] = useState<number>(12);
  const [fluxShift, setFluxShift] = useState<number>(3.0);

  // Z-Image 전용 워크플로우 파라미터 제어
  const [zImageNsfwTier, setZImageNsfwTier] = useState<'low' | 'high'>('low');
  const [zImageSteps, setZImageSteps] = useState<number>(10);
  const [zImageShift, setZImageShift] = useState<number>(3.5); // 3.5 Z-Anime/Z-Image 정격 황금값
  const [enableHiresFix, setEnableHiresFix] = useState<boolean>(true); // 1.5배 Hires-Fix 정제 토글

  // 선택된 LoRA 상태 (동적 무제한 LoRA 스택 및 localStorage 영속화 지원)
  const [directLoras, setDirectLoras] = useState<ActiveLoRA[]>(() => {
    try {
      const saved = localStorage.getItem('openshorts_v2_direct_storyboard_loras');
      if (saved) {
        const parsed: ActiveLoRA[] = JSON.parse(saved);
        // 터보 모델과 충돌하는 distill_patch 잔여물 자동 정제
        return parsed.filter((l) => !l.name.toLowerCase().includes('distill_patch'));
      }
      return [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('openshorts_v2_direct_storyboard_loras', JSON.stringify(directLoras));
    } catch (e) {
      console.warn('Tab3 LoRA 로컬 저장 실패:', e);
    }
  }, [directLoras]);

  // 시드(Seed) 제어 상태
  const [seed, setSeed] = useState<number>(() => Math.floor(Math.random() * 1000000000));
  const [isRandomSeed, setIsRandomSeed] = useState<boolean>(true);

  useEffect(() => {
    const loadLoRAs = async () => {
      try {
        const loras = await comfyClient.getAvailableLoRAs();
        if (loras && loras.length > 0) {
          setAvailableLoRAs(loras.filter((l) => l !== 'None'));
        }
      } catch (err) {
        console.warn('ComfyUI LoRA 목록 조회 실패 (기본값 유지):', err);
      }
    };
    loadLoRAs();
  }, []);

  // 현재 선택된 2D 엔진에 정확히 호환되는 LoRA 목록만 필터링
  const filteredLoRAs = React.useMemo(() => {
    return filterLorasByEngine(availableLoRAs, selectedEngineId);
  }, [availableLoRAs, selectedEngineId]);

  // 프로젝트 컷 모드인 경우 현재 컷
  const currentCut = project.cuts.find((c) => c.id === selectedCutId) || project.cuts[0] || {
    id: 'CUT_STANDALONE',
    cutNumber: 1,
    originalText: '',
    dialogueText: null,
    assembledPrompt: directPrompt,
    selectedUnetModelId: 'krea-2-turbo-v2',
    activeLoras: directLoras,
    candidates: [],
    selectedCandidateIndex: 0,
    winnerImagePath: null,
    videoDurationSeconds: 5,
    slots: { bg: null, face: null, face_b: null, wardrobe: null, pose: null, prop_1: null, vehicle: null, prop_2: null, style: null },
    actingState: '',
    actionPose: '',
    cameraWeatherMod: '',
    selectedCharacterId: null,
    selectedWardrobeId: null,
    selectedLandmarkId: null,
    selectedLoRAName: null,
    selectedLoRAStrength: 0.8,
    draftVideoPath: null,
    upscaledVideoPath: null,
    videoRenderStatus: 'idle',
  };

  // 현재 선택된 UNET 모델 정보
  const selectedUnetId = currentCut.selectedUnetModelId || INSTALLED_UNET_MODELS[0].id;
  const currentUnetMeta: InstalledUnetModel =
    INSTALLED_UNET_MODELS.find((m) => m.id === selectedUnetId) || INSTALLED_UNET_MODELS[0];

  // 바이블 연결 에셋 조회
  const selectedChar = project.characters.find((c) => c.id === currentCut.selectedCharacterId);
  const selectedWardrobe = project.wardrobes.find((w) => w.id === currentCut.selectedWardrobeId);
  const selectedLandmark = project.landmarks.find((l) => l.id === currentCut.selectedLandmarkId);

  // 7단 프롬프트 실시간 조립 (100% 클린 영문 전용)
  const assembledPrompt = slotAdapter.assemble7StagePrompt({
    character: selectedChar,
    wardrobe: selectedWardrobe,
    actingState: currentCut.actingState,
    actionPose: currentCut.actionPose,
    landmark: selectedLandmark,
    cameraWeatherMod: currentCut.cameraWeatherMod,
    baseAssembledPrompt: currentCut.assembledPrompt,
  });

  // 현재 활성화된 LoRA 목록 (프로젝트 컷 vs 단독 모드 양방향 실시간 보장)
  const currentLoras = entryMode === 'project' && project.cuts.length > 0 ? (currentCut.activeLoras || directLoras) : directLoras;

  // 엔진 전환 시 해당 엔진에 딱 맞는 대표 LoRA 및 가중치로 100% 자동 동기화 전환!
  const handleSwitchEngine = (engineId: 'krea-2-turbo-v2' | 'z-image-turbo' | 'z-image-ultimate' | 'z-anime-distill' | 'qwen-2512-gguf') => {
    setSelectedEngineId(engineId);

    const newCompatibleLoras = filterLorasByEngine(availableLoRAs, engineId);
    const defaultLoraName = newCompatibleLoras[0] || '';
    const isLightning = defaultLoraName.toLowerCase().includes('lightning') || engineId === 'qwen-2512-gguf';
    const defaultStrength = isLightning ? 1.0 : 0.8;

    const defaultNewStack: ActiveLoRA[] = defaultLoraName
      ? [
          {
            id: `lora_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            name: defaultLoraName,
            strength: defaultStrength,
          },
        ]
      : [];

    setDirectLoras(defaultNewStack);
    if (entryMode === 'project' && project.cuts.length > 0 && currentCut) {
      onUpdateCut({
        ...currentCut,
        selectedUnetModelId: engineId,
        activeLoras: defaultNewStack,
        selectedLoRAName: defaultNewStack[0]?.name || null,
        selectedLoRAStrength: defaultNewStack[0]?.strength || defaultStrength,
      });
    }
  };

  // Qwen 세부 모드(얼굴교체, 4면시트, 8방향앵글, 나체화, 의상교체 등) 클릭 시 전용 LoRA로 즉각 자동 장착!
  const handleSelectQwenSubMode = (
    mode: 'char_swap' | 'h3_turnaround' | 'multi_angles' | 'single_edit' | 'undress_only' | 'wardrobe'
  ) => {
    setQwenMode(mode);

    if (mode === 'single_edit') {
      // 부위 보정: Qwen 기본 모델 자체의 Instruct-Pix2Pix 능력 활용 (특수 LoRA 불필요, 0.50 디노이즈)
      setDirectLoras([]);
      setI2iDenoise(0.50);
      if (entryMode === 'project' && project.cuts.length > 0 && currentCut) {
        onUpdateCut({
          ...currentCut,
          activeLoras: [],
          selectedLoRAName: '',
          selectedLoRAStrength: 0,
        });
      }
      return;
    }

    let targetLoraName = 'Qwen\\Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors';
    let targetStrength = 1.0;

    if (mode === 'multi_angles' || mode === 'h3_turnaround') {
      targetLoraName = 'Qwen\\Qwen-image-edit-2511-multiple-angles-lora.safetensors';
      targetStrength = 1.0;
    } else if (mode === 'undress_only' || mode === 'wardrobe') {
      targetLoraName = 'Qwen\\qwen_image_edit_remove-clothing_v1.0.safetensors';
      targetStrength = 1.0;
    } else if (mode === 'char_swap') {
      targetLoraName = 'Qwen\\Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors';
      targetStrength = 1.0;
    }

    const newStack: ActiveLoRA[] = [
      {
        id: `lora_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: targetLoraName,
        strength: targetStrength,
      },
    ];

    setDirectLoras(newStack);
    if (entryMode === 'project' && project.cuts.length > 0 && currentCut) {
      onUpdateCut({
        ...currentCut,
        activeLoras: newStack,
        selectedLoRAName: targetLoraName,
        selectedLoRAStrength: targetStrength,
      });
    }
  };

  // 한글 수정 지시문 ➔ Qwen-VL 최적 영문 프롬프트 자동 변환
  const handleTranslateInstruction = async () => {
    if (!singleEditPrompt.trim()) {
      alert('변환할 한글 지시어를 입력해 주세요.');
      return;
    }
    setIsTranslating(true);
    try {
      const eng = await aiDirectorService.translateToEnglishVisualPrompt(singleEditPrompt);
      if (eng) {
        setSingleEditPrompt(eng);
      }
    } catch (e: any) {
      alert(`번역 실패: ${e.message}`);
    } finally {
      setIsTranslating(false);
    }
  };

  // 27B 기반 한글 ➔ 시네마틱 2D 영문 프롬프트 자동 확장 작성 (VRAM 자동 언로드로 OOM 0% 보장)
  const handleExpandT2IPrompt = async () => {
    const activeText = entryMode === 'project' && project.cuts.length > 0 
      ? (currentCut.assembledPrompt ?? assembledPrompt) 
      : directPrompt;

    if (!activeText || !activeText.trim()) {
      alert('변환할 한글 또는 키워드 내용을 먼저 프롬프트 창에 입력해주세요.');
      return;
    }

    setIsExpandingT2IPrompt(true);
    try {
      const expanded = await aiDirectorService.expandToCinematicT2IPrompt(activeText);
      if (expanded) {
        if (entryMode === 'project' && project.cuts.length > 0) {
          onUpdateCut({
            ...currentCut,
            assembledPrompt: expanded,
          });
        } else {
          setDirectPrompt(expanded);
        }
      }
    } catch (err: unknown) {
      alert(`프롬프트 확장 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsExpandingT2IPrompt(false);
    }
  };

  const handleAddLora = () => {
    const defaultName = filteredLoRAs[0] || availableLoRAs[0] || 'KREA_2_turbo\\KREA2turboNSFW.safetensors';
    const isLightning = defaultName.toLowerCase().includes('lightning') || selectedEngineId === 'qwen-2512-gguf';
    const initialStrength = isLightning ? 1.0 : 0.8;
    const newLora: ActiveLoRA = {
      id: `lora_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: defaultName,
      strength: initialStrength,
    };
    if (entryMode === 'project' && project.cuts.length > 0) {
      const cur = currentCut.activeLoras || [];
      const updated = [...cur, newLora];
      onUpdateCut({
        ...currentCut,
        activeLoras: updated,
        selectedLoRAName: updated[0]?.name || null,
        selectedLoRAStrength: updated[0]?.strength || initialStrength,
      });
    } else {
      setDirectLoras((prev) => [...prev, newLora]);
    }
  };

  const handleAddQuickLora = (loraName: string, defaultStrength: number = 0.8) => {
    const cur = entryMode === 'project' && project.cuts.length > 0 ? (currentCut.activeLoras || []) : directLoras;
    if (cur.some((l) => l.name === loraName || l.name.endsWith(loraName))) return;

    const newLora: ActiveLoRA = {
      id: `lora_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: loraName,
      strength: defaultStrength,
    };

    if (entryMode === 'project' && project.cuts.length > 0) {
      const updated = [...cur, newLora];
      onUpdateCut({
        ...currentCut,
        activeLoras: updated,
      });
    } else {
      setDirectLoras((prev) => [...prev, newLora]);
    }
  };

  const handleRemoveLora = (id: string) => {
    if (entryMode === 'project' && project.cuts.length > 0) {
      const cur = (currentCut.activeLoras || []).filter((item) => item.id !== id);
      onUpdateCut({
        ...currentCut,
        activeLoras: cur,
        selectedLoRAName: cur[0]?.name || null,
        selectedLoRAStrength: cur[0]?.strength || 0.8,
      });
    } else {
      setDirectLoras((prev) => prev.filter((item) => item.id !== id));
    }
  };

  const handleUpdateLoraName = (id: string, name: string) => {
    if (entryMode === 'project' && project.cuts.length > 0) {
      const cur = (currentCut.activeLoras || []).map((item) =>
        item.id === id ? { ...item, name } : item
      );
      onUpdateCut({
        ...currentCut,
        activeLoras: cur,
        selectedLoRAName: cur[0]?.name || null,
        selectedLoRAStrength: cur[0]?.strength || 0.8,
      });
    } else {
      setDirectLoras((prev) => prev.map((item) => (item.id === id ? { ...item, name } : item)));
    }
  };

  const handleUpdateLoraStrength = (id: string, strength: number) => {
    if (entryMode === 'project' && project.cuts.length > 0) {
      const cur = (currentCut.activeLoras || []).map((item) =>
        item.id === id ? { ...item, strength } : item
      );
      onUpdateCut({
        ...currentCut,
        activeLoras: cur,
        selectedLoRAName: cur[0]?.name || null,
        selectedLoRAStrength: cur[0]?.strength || 0.8,
      });
    } else {
      setDirectLoras((prev) => prev.map((item) => (item.id === id ? { ...item, strength } : item)));
    }
  };

  // 현재 설정된 2D LoRA 목록을 프로젝트 전체 컷에 영구 일괄 적용
  const handleApplyLoRAsToAllCuts = () => {
    if (!project.cuts || project.cuts.length === 0) {
      alert('일괄 적용할 프로젝트 컷이 없습니다.');
      return;
    }
    const lorasToApply = currentLoras;
    if (onUpdateCuts) {
      const updatedCuts = project.cuts.map((c) => ({
        ...c,
        activeLoras: [...lorasToApply],
        selectedLoRAName: lorasToApply[0]?.name || null,
        selectedLoRAStrength: lorasToApply[0]?.strength || 0.8,
      }));
      onUpdateCuts(updatedCuts);
      alert(`✅ 현재 2D LoRA 체인(${lorasToApply.length}개)이 프로젝트 전체(${project.cuts.length}개 컷)에 일괄 저장되었습니다!`);
    }
  };

  // T2I 단독 1장 생성
  const handleGenerateT2I = async (unetModelId: string) => {
    setIsGenerating(true);
    const targetMeta = INSTALLED_UNET_MODELS.find((m) => m.id === unetModelId) || currentUnetMeta;
    const activeSeed = isRandomSeed ? Math.floor(Math.random() * 1000000000) : seed;
    setGenerationProgress(`[${targetMeta.displayName}] (${targetMeta.loaderType}) T2I 렌더링 중 (Seed: ${activeSeed})...`);

    const activePrompt = entryMode === 'project' && project.cuts.length > 0 ? (currentCut.assembledPrompt || assembledPrompt) : directPrompt;
    const activeLoras = (entryMode === 'project' && project.cuts.length > 0 ? currentCut.activeLoras : directLoras) || [];

    try {
      await comfyClient.freeMemory();

      const genWidth = aspectRatio === '16:9' ? 1344 : aspectRatio === '1:1' ? 1024 : 768;
      const genHeight = aspectRatio === '16:9' ? 768 : aspectRatio === '1:1' ? 1024 : 1344;

      const { payload, modelMeta } = workflowRegistry.buildDynamic2DWorkflow({
        unetModelId: targetMeta.id,
        prompt: activePrompt,
        seed: activeSeed,
        width: genWidth,
        height: genHeight,
        loras: activeLoras,
        steps: targetMeta.family === 'krea2' ? fluxSteps : targetMeta.family === 'zimage' ? zImageSteps : undefined,
        shift: targetMeta.family === 'krea2' ? fluxShift : targetMeta.family === 'zimage' ? zImageShift : undefined,
        nsfwTier: targetMeta.family === 'zimage' ? zImageNsfwTier : undefined,
        enableHiresFix: targetMeta.family === 'zimage' ? enableHiresFix : undefined,
      });

      setGenerationProgress(`ComfyUI 큐 등록 중 (${modelMeta.loaderType})...`);
      const promptId = await comfyClient.queuePrompt(payload);

      const outputs = await comfyClient.waitForCompletion(promptId, (pct) => {
        setGenerationProgress(`T2I 생성 진행 중 (${pct}%)...`);
      });

      const realImageUrl = comfyClient.extractOutputImageUrl(outputs);
      if (!realImageUrl) throw new Error('출력 이미지를 가져오지 못했습니다.');

      const newCandidate = {
        id: `cand_${Date.now()}`,
        engine: targetMeta.displayName,
        modelFileName: targetMeta.fileName,
        imagePath: realImageUrl,
        prompt: activePrompt,
        seed: activeSeed,
        createdAt: new Date().toISOString(),
      };

      if (entryMode === 'project' && project.cuts.length > 0) {
        const updatedCandidates = [...currentCut.candidates, newCandidate];
        onUpdateCut({
          ...currentCut,
          selectedUnetModelId: targetMeta.id,
          assembledPrompt: activePrompt,
          candidates: updatedCandidates,
          selectedCandidateIndex: updatedCandidates.length - 1,
          winnerImagePath: currentCut.winnerImagePath || realImageUrl,
        });
      } else {
        const updated = [...directCandidates, newCandidate];
        setDirectCandidates(updated);
        setDirectCandIdx(updated.length - 1);
        if (!directWinner) setDirectWinner(realImageUrl);
      }

      setGenerationProgress('T2I 생성 완료!');
    } catch (err: unknown) {
      alert(`T2I 생성 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // I2I 부위 수정 / 참조 이미지 보정 생성
  const handleGenerateI2I = async (unetModelId: string) => {
    const baseImg = i2iCustomImage || (entryMode === 'project' && project.cuts.length > 0 ? currentCut.winnerImagePath : directWinner);
    if (!baseImg) {
      alert('I2I 보정을 진행할 기준 이미지(Winner 또는 업로드 이미지)가 필요합니다.');
      return;
    }

    const activeSeed = isRandomSeed ? Math.floor(Math.random() * 1000000000) : seed;

    // Qwen Edit 2장 인물 얼굴 교체 모드인 경우
    if (unetModelId === 'qwen-2512-gguf' && qwenMode === 'char_swap') {
      if (!qwenSwapCharImage) {
        alert('얼굴을 교체할 [Image 2: 캐릭터 레퍼런스 사진]을 등록해야 합니다.');
        return;
      }

      setIsGenerating(true);
      setGenerationProgress(`[Qwen Edit] 2장 참조 인물 얼굴/외형 정밀 교체 렌더링 중 (Seed: ${activeSeed})...`);

      try {
        await comfyClient.freeMemory();
        setGenerationProgress(`이미지 2장 ComfyUI 등록 중...`);
        const [uploadedTarget, uploadedChar] = await Promise.all([
          comfyClient.uploadImage(baseImg),
          comfyClient.uploadImage(qwenSwapCharImage),
        ]);

        const activePrompt = entryMode === 'project' && project.cuts.length > 0 ? (currentCut.assembledPrompt || assembledPrompt) : directPrompt;
        const activeLoras = (entryMode === 'project' && project.cuts.length > 0 ? currentCut.activeLoras : directLoras) || [];
        const primaryLora = activeLoras.find((l) => l.name && l.name.toLowerCase().includes('qwen')) || null;

        const payload = workflowRegistry.buildQwenCharacterSwapWorkflow({
          targetImagePath: uploadedTarget,
          characterImagePath: uploadedChar,
          prompt: activePrompt,
          seed: activeSeed,
          loraName: primaryLora?.name ? primaryLora.name.replace(/\//g, '\\') : null,
          loraStrength: primaryLora?.strength ?? 1.0,
        });

        const promptId = await comfyClient.queuePrompt(payload);
        const outputs = await comfyClient.waitForCompletion(promptId, (pct) => {
          setGenerationProgress(`Qwen 얼굴/외형 교체 연산 중 (${pct}%)...`);
        });

        const realImageUrl = comfyClient.extractOutputImageUrl(outputs);
        if (!realImageUrl) throw new Error('Qwen 얼굴 교체 출력 이미지를 가져오지 못했습니다.');

        const newCandidate = {
          id: `cand_swap_${Date.now()}`,
          engine: 'Qwen Edit (얼굴 교체)',
          modelFileName: 'Qwen-Rapid-AIO-NSFW-v23.safetensors',
          imagePath: realImageUrl,
          prompt: activePrompt,
          seed: activeSeed,
          createdAt: new Date().toISOString(),
        };

        // 결과 후보군 즉시 등록 (0컷 프로젝트 / 단독 모드 모두 즉각 화면 출력 보장)
        const updatedDirect = [...directCandidates, newCandidate];
        setDirectCandidates(updatedDirect);
        setDirectCandIdx(updatedDirect.length - 1);
        setDirectWinner(realImageUrl);

        if (entryMode === 'project' && project.cuts.length > 0) {
          const updatedCandidates = [...(currentCut.candidates || []), newCandidate];
          onUpdateCut({
            ...currentCut,
            candidates: updatedCandidates,
            selectedCandidateIndex: updatedCandidates.length - 1,
            winnerImagePath: realImageUrl,
          });
        }

        setGenerationProgress('Qwen 얼굴 교체 완료!');
      } catch (err: unknown) {
        alert(`Qwen 얼굴 교체 실패: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    // [Task 2] Qwen 단독 나체화 클린업 (포즈 변경용 베이스)
    if (unetModelId === 'qwen-2512-gguf' && qwenMode === 'undress_only') {
      setIsGenerating(true);
      setGenerationProgress(`[Qwen 2511] 완벽한 나체화 클린업 렌더링 중...`);

      try {
        await comfyClient.freeMemory();
        setGenerationProgress(`기준 사진 ComfyUI 등록 중...`);
        const uploadedSource = await comfyClient.uploadImage(baseImg);
        const undressPrompt = "Take off all her clothes, make her completely naked. Clean realistic skin texture, realistic anatomy.";

        const payload = workflowRegistry.buildQwenCharacterSwapWorkflow({
          targetImagePath: uploadedSource,
          prompt: undressPrompt,
          seed: activeSeed,
        });

        const promptId = await comfyClient.queuePrompt(payload);
        const outputs = await comfyClient.waitForCompletion(promptId, (pct) => {
          setGenerationProgress(`나체화 렌더링 연산 중 (${pct}%)...`);
        });

        const realImageUrl = comfyClient.extractOutputImageUrl(outputs);
        if (!realImageUrl) throw new Error('나체화 출력 이미지를 가져오지 못했습니다.');

        const newCandidate = {
          id: `cand_undress_${Date.now()}`,
          engine: 'Qwen 2511 (나체화 Base)',
          modelFileName: 'Qwen-Rapid-AIO-NSFW-v23.safetensors',
          imagePath: realImageUrl,
          prompt: undressPrompt,
          seed: activeSeed,
          createdAt: new Date().toISOString(),
        };

        if (entryMode === 'project' && project.cuts.length > 0) {
          const updatedCandidates = [...currentCut.candidates, newCandidate];
          onUpdateCut({ ...currentCut, candidates: updatedCandidates, selectedCandidateIndex: updatedCandidates.length - 1, winnerImagePath: realImageUrl });
        } else {
          const updated = [...directCandidates, newCandidate];
          setDirectCandidates(updated);
          setDirectCandIdx(updated.length - 1);
          setDirectWinner(realImageUrl);
        }
        setGenerationProgress('나체화 클린업 생성 완료!');
      } catch (err: unknown) {
        alert(`나체화 생성 실패: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    // [Task 2] 의상 완벽 교체 2-Step 체이닝 (의상 제거 후 적용)
    if (unetModelId === 'qwen-2512-gguf' && qwenMode === 'wardrobe') {
      const activePrompt = entryMode === 'project' ? assembledPrompt : directPrompt;
      if (!activePrompt) {
        alert("새로 입힐 의상을 포함한 프롬프트를 작성해주세요.");
        return;
      }
      setIsGenerating(true);

      try {
        await comfyClient.freeMemory();
        setGenerationProgress(`[Step 1/2] 완벽한 나체화 클린업 진행 중...`);
        const uploadedSource = await comfyClient.uploadImage(baseImg);
        const undressPrompt = "Take off all her clothes, make her completely naked. Clean realistic skin texture, realistic anatomy.";

        const step1Payload = workflowRegistry.buildQwenCharacterSwapWorkflow({
          targetImagePath: uploadedSource,
          prompt: undressPrompt,
          seed: activeSeed,
        });

        const promptId1 = await comfyClient.queuePrompt(step1Payload);
        const outputs1 = await comfyClient.waitForCompletion(promptId1, (pct) => {
          setGenerationProgress(`[Step 1] 나체화 베이스 렌더링 (${pct}%)...`);
        });

        const nakedImageUrl = comfyClient.extractOutputImageUrl(outputs1);
        if (!nakedImageUrl) throw new Error('Step 1 나체화 베이스 이미지를 가져오지 못했습니다.');

        // Step 2
        setGenerationProgress(`[Step 2/2] 나체 베이스에 새 의상(프롬프트) 적용 중...`);
        const res = await fetch(nakedImageUrl);
        const blob = await res.blob();
        const file = new File([blob], 'naked_temp.png', { type: 'image/png' });
        const uploadedNaked = await comfyClient.uploadImage(file);

        const step2Payload = workflowRegistry.buildQwenCharacterSwapWorkflow({
          targetImagePath: uploadedNaked,
          prompt: activePrompt,
          seed: activeSeed + 1,
        });

        const promptId2 = await comfyClient.queuePrompt(step2Payload);
        const outputs2 = await comfyClient.waitForCompletion(promptId2, (pct) => {
          setGenerationProgress(`[Step 2] 새 의상 렌더링 (${pct}%)...`);
        });

        const finalImageUrl = comfyClient.extractOutputImageUrl(outputs2);
        if (!finalImageUrl) throw new Error('Step 2 최종 이미지를 가져오지 못했습니다.');

        const newCandidate = {
          id: `cand_wardrobe_${Date.now()}`,
          engine: 'Qwen 2511 (2-Step 의상)',
          modelFileName: 'Qwen-Rapid-AIO-NSFW-v23.safetensors',
          imagePath: finalImageUrl,
          prompt: activePrompt,
          seed: activeSeed,
          createdAt: new Date().toISOString(),
        };

        if (entryMode === 'project' && project.cuts.length > 0) {
          const updatedCandidates = [...currentCut.candidates, newCandidate];
          onUpdateCut({ ...currentCut, candidates: updatedCandidates, selectedCandidateIndex: updatedCandidates.length - 1, winnerImagePath: finalImageUrl });
        } else {
          const updated = [...directCandidates, newCandidate];
          setDirectCandidates(updated);
          setDirectCandIdx(updated.length - 1);
          setDirectWinner(finalImageUrl);
        }
        setGenerationProgress('2-Step 의상 완벽 교체 완료!');
      } catch (err: unknown) {
        alert(`의상 교체 실패: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    // Qwen 2511 다각도 턴어라운드 뷰 모드인 경우
    if (unetModelId === 'qwen-2512-gguf' && qwenMode === 'multi_angles') {
      setIsGenerating(true);
      setGenerationProgress(`[Qwen 2511] 다각도 턴어라운드 뷰 렌더링 중 (${selectedAngleTag})...`);

      try {
        await comfyClient.freeMemory();
        setGenerationProgress(`기준 인물 사진 ComfyUI 등록 중...`);
        const uploadedSource = await comfyClient.uploadImage(baseImg);

        const activePrompt = entryMode === 'project' ? assembledPrompt : directPrompt;

        const payload = workflowRegistry.buildQwenMultipleAnglesWorkflow({
          sourceImagePath: uploadedSource,
          prompt: activePrompt || '1girl, solo, realistic, high quality, clean portrait',
          angleTag: selectedAngleTag,
          seed: activeSeed,
          width: 1024,
          height: 1536,
        });

        const promptId = await comfyClient.queuePrompt(payload);
        const outputs = await comfyClient.waitForCompletion(promptId, (pct) => {
          setGenerationProgress(`Qwen 다각도 뷰 연산 중 (${pct}%)...`);
        });

        const realImageUrl = comfyClient.extractOutputImageUrl(outputs);
        if (!realImageUrl) throw new Error('Qwen 다각도 출력 이미지를 가져오지 못했습니다.');

        const newCandidate = {
          id: `cand_angle_${Date.now()}`,
          engine: 'Qwen 2511 (다각도 뷰)',
          modelFileName: 'Qwen-Rapid-AIO-NSFW-v23.safetensors',
          imagePath: realImageUrl,
          prompt: `${activePrompt || ''}, ${selectedAngleTag}`,
          seed: activeSeed,
          createdAt: new Date().toISOString(),
        };

        if (entryMode === 'project' && project.cuts.length > 0) {
          const updatedCandidates = [...currentCut.candidates, newCandidate];
          onUpdateCut({
            ...currentCut,
            candidates: updatedCandidates,
            selectedCandidateIndex: updatedCandidates.length - 1,
            winnerImagePath: realImageUrl,
          });
        } else {
          const updated = [...directCandidates, newCandidate];
          setDirectCandidates(updated);
          setDirectCandIdx(updated.length - 1);
          setDirectWinner(realImageUrl);
        }

        setGenerationProgress('Qwen 다각도 턴어라운드 완료!');
      } catch (err: unknown) {
        alert(`Qwen 다각도 렌더링 실패: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    // Qwen H3 다중참조용 4면 전신 턴어라운드 시트 모드인 경우
    if (unetModelId === 'qwen-2512-gguf' && qwenMode === 'h3_turnaround') {
      setIsGenerating(true);
      setGenerationProgress(`[Qwen 2511] H3 다중참조용 4면 전신 턴어라운드 시트(Front/Left/Right/Back) 렌더링 중...`);

      try {
        await comfyClient.freeMemory();
        setGenerationProgress(`기준 인물 사진 ComfyUI 등록 중...`);
        const uploadedSource = await comfyClient.uploadImage(baseImg);

        const activePrompt = entryMode === 'project' ? assembledPrompt : directPrompt;

        const payload = workflowRegistry.buildQwenH3TurnaroundSheetWorkflow({
          sourceImagePath: uploadedSource,
          prompt: activePrompt || 'clean photography, highly detailed, realistic skin texture, identical clothing, full body view',
          seed: activeSeed,
        });

        const promptId = await comfyClient.queuePrompt(payload);
        const outputs = await comfyClient.waitForCompletion(promptId, (pct) => {
          setGenerationProgress(`Qwen 4면 전신 시트 연산 중 (${pct}%)...`);
        });

        const realImageUrl = comfyClient.extractOutputImageUrl(outputs);
        if (!realImageUrl) throw new Error('Qwen 턴어라운드 시트 출력 이미지를 가져오지 못했습니다.');

        const newCandidate = {
          id: `cand_turnaround_${Date.now()}`,
          engine: 'Qwen 2511 (H3 4면 전신 시트)',
          modelFileName: 'Qwen-Rapid-AIO-NSFW-v23.safetensors',
          imagePath: realImageUrl,
          prompt: `${activePrompt || ''}, full body turnaround 4 views`,
          seed: activeSeed,
          createdAt: new Date().toISOString(),
        };

        if (entryMode === 'project' && project.cuts.length > 0) {
          const updatedCandidates = [...currentCut.candidates, newCandidate];
          onUpdateCut({
            ...currentCut,
            candidates: updatedCandidates,
            selectedCandidateIndex: updatedCandidates.length - 1,
            winnerImagePath: realImageUrl,
          });
        } else {
          const updated = [...directCandidates, newCandidate];
          setDirectCandidates(updated);
          setDirectCandIdx(updated.length - 1);
          setDirectWinner(realImageUrl);
        }

        setGenerationProgress('Qwen H3 다중참조용 4면 전신 시트 생성 완료!');
      } catch (err: unknown) {
        alert(`Qwen 턴어라운드 시트 렌더링 실패: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    setIsGenerating(true);
    const targetMeta = INSTALLED_UNET_MODELS.find((m) => m.id === unetModelId) || currentUnetMeta;
    setGenerationProgress(`[${targetMeta.displayName}] I2I 보정 렌더링 중 (디노이즈: ${i2iDenoise})...`);

    const activePrompt = entryMode === 'project' ? assembledPrompt : directPrompt;
    const activeLoras = (entryMode === 'project' ? currentCut.activeLoras : directLoras) || [];

    try {
      await comfyClient.freeMemory();
      setGenerationProgress(`기준 이미지 등록 중...`);
      const uploadedBase = await comfyClient.uploadImage(baseImg);

      const seed = Math.floor(Math.random() * 1000000000);

      let payload: Record<string, unknown>;
      if (targetMeta.family === 'qwen') {
        if (qwenMode === 'single_edit') {
          const editPrompt = singleEditPrompt.trim() || activePrompt || 'Clean and refine this image, masterpiece, highly detailed, realistic texture.';
          payload = workflowRegistry.buildQwenRapidEditWorkflow({
            targetImagePath: uploadedBase,
            prompt: editPrompt,
            seed,
            denoise: i2iDenoise,
          });
        } else if (qwenMode === 'multi_angles') {
          payload = workflowRegistry.buildQwenMultiAngleWorkflow({
            targetImagePath: uploadedBase,
            anglePrompt: activePrompt,
            seed,
          });
        } else if (qwenMode === 'h3_turnaround') {
          payload = workflowRegistry.buildQwenTurnaroundWorkflow({
            targetImagePath: uploadedBase,
            viewPresetText: activePrompt,
            seed,
          });
        } else {
          payload = workflowRegistry.buildQwenRapidEditWorkflow({
            targetImagePath: uploadedBase,
            prompt: activePrompt,
            seed,
            denoise: i2iDenoise,
          });
        }
      } else {
        payload = workflowRegistry.buildDynamic2DI2IWorkflow({
          initImagePath: uploadedBase,
          denoise: i2iDenoise,
          unetModelId: targetMeta.id,
          prompt: activePrompt,
          seed,
          width: 768,
          height: 1344,
          loras: activeLoras,
        });
      }

      const promptId = await comfyClient.queuePrompt(payload);
      const outputs = await comfyClient.waitForCompletion(promptId, (pct) => {
        setGenerationProgress(`I2I 보정 연산 중 (${pct}%)...`);
      });

      const realImageUrl = comfyClient.extractOutputImageUrl(outputs);
      if (!realImageUrl) throw new Error('I2I 보정 출력 이미지를 가져오지 못했습니다.');

      const newCandidate = {
        id: `cand_i2i_${Date.now()}`,
        engine: `${targetMeta.displayName} (I2I)`,
        modelFileName: targetMeta.fileName,
        imagePath: realImageUrl,
        prompt: activePrompt,
        seed,
        createdAt: new Date().toISOString(),
      };

      // 결과 후보군 즉시 등록 (0컷 프로젝트 / 단독 모드 모두 즉각 화면 출력 보장)
      const updatedDirect = [...directCandidates, newCandidate];
      setDirectCandidates(updatedDirect);
      setDirectCandIdx(updatedDirect.length - 1);
      setDirectWinner(realImageUrl);

      if (entryMode === 'project' && project.cuts.length > 0) {
        const updatedCandidates = [...(currentCut.candidates || []), newCandidate];
        onUpdateCut({
          ...currentCut,
          selectedUnetModelId: targetMeta.id,
          assembledPrompt: activePrompt,
          candidates: updatedCandidates,
          selectedCandidateIndex: updatedCandidates.length - 1,
          winnerImagePath: realImageUrl,
        });
      }

      setGenerationProgress('I2I 보정 완료!');
    } catch (err: unknown) {
      alert(`I2I 보정 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // 주요 3사 UNET 비교 생성
  const handleGenerateCompareAll = async () => {
    setIsGenerating(true);
    const compareModelIds = ['qwen-2512-gguf', 'krea-2-turbo-v2', 'z-image-ultimate'];
    let updatedCandidates = [...currentCut.candidates];

    for (let i = 0; i < compareModelIds.length; i++) {
      const modelId = compareModelIds[i];
      const meta = INSTALLED_UNET_MODELS.find((m) => m.id === modelId)!;
      setGenerationProgress(`[${i + 1}/3] ${meta.displayName} (${meta.loaderType}) 렌더링 중...`);

      try {
        await comfyClient.freeMemory();
        const seed = Math.floor(Math.random() * 1000000000);

        const { payload } = workflowRegistry.buildDynamic2DWorkflow({
          unetModelId: meta.id,
          prompt: assembledPrompt,
          seed,
          width: 768,
          height: 1344,
          loras: currentLoras,
        });

        const promptId = await comfyClient.queuePrompt(payload);
        const outputs = await comfyClient.waitForCompletion(promptId);
        const realImageUrl = comfyClient.extractOutputImageUrl(outputs);

        if (realImageUrl) {
          updatedCandidates.push({
            id: `cand_${Date.now()}_${meta.id}`,
            engine: meta.displayName,
            modelFileName: meta.fileName,
            imagePath: realImageUrl,
            prompt: assembledPrompt,
            seed,
            createdAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error(`${meta.displayName} 렌더 실패:`, err);
      }
    }

    onUpdateCut({
      ...currentCut,
      candidates: updatedCandidates,
      selectedCandidateIndex: updatedCandidates.length - 1,
      winnerImagePath: currentCut.winnerImagePath || updatedCandidates[updatedCandidates.length - 1]?.imagePath || null,
    });

    setIsGenerating(false);
    setGenerationProgress('3대 UNET 모델 순차 비교 렌더링 완료!');
  };

  return (
    <div className="p-4 md:p-6 w-full max-w-[98vw] mx-auto space-y-4">
      {/* Top Studio Bar: 통합 컷 선택 및 네비게이션 */}
      <div className="glass-panel px-6 py-3.5 rounded-2xl border border-white/10 shadow-xl bg-black/40 backdrop-blur-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono flex items-center space-x-1.5">
              <span>🎨 2D 스토리보드 원화 스튜디오</span>
            </span>

            <div className="flex items-center space-x-1.5 pl-3 border-l border-white/10">
              <button
                type="button"
                onClick={() => setEntryMode('direct')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                  entryMode === 'direct'
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-900/50'
                    : 'bg-white/5 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>✨ 자유 독립 작업 (단독 테스트)</span>
              </button>
              <button
                type="button"
                onClick={() => setEntryMode('project')}
                disabled={project.cuts.length === 0}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                  entryMode === 'project'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/50'
                    : 'bg-white/5 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed'
                }`}
              >
                <span>📖 대본 컷 ({project.cuts.length}개)</span>
              </button>
            </div>
          </div>

          <button
            onClick={onNextTab}
            className="px-5 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white text-xs font-extrabold rounded-xl transition-all shrink-0 shadow-lg shadow-emerald-900/40 hover:scale-105"
          >
            다음: H3 비디오 Studio &rarr;
          </button>
        </div>

        {/* 대본 컷이 있을 때 가로 컷 선택 바 */}
        {entryMode === 'project' && project.cuts && project.cuts.length > 0 && (
          <div className="flex items-center space-x-2 overflow-x-auto pt-2 border-t border-white/5 pb-1">
            <span className="text-[11px] font-bold text-slate-400 shrink-0">작업할 컷:</span>
            {project.cuts.map((cut, idx) => {
              if (!cut) return null;
              const isSel = cut.id === currentCut.id;
              return (
                <button
                  key={cut.id || idx}
                  onClick={() => setSelectedCutId(cut.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition shrink-0 flex items-center space-x-2 ${
                    isSel
                      ? 'bg-indigo-500/30 text-indigo-200 border border-indigo-500/60 shadow-inner'
                      : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  <span>컷 #{idx + 1} ({cut.id})</span>
                  {cut.winnerImagePath && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" title="2D 확정본 완료" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Studio Balanced Side-by-Side Widescreen Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start h-full">
        {/* Left Column: Direct Controls & Prompt (Dynamic: 50% for T2I, 25% for Qwen Edit) */}
        <div className={`${selectedEngineId === 'qwen-2512-gguf' ? 'lg:col-span-3' : 'lg:col-span-6'} space-y-4 sticky top-4 transition-all duration-300`}>
          {/* 1. Project Script Box (대본 컷이 있고 연계 모드일 때만 표시) */}
          {entryMode === 'project' && project.cuts.length > 0 && (
            <div className="glass-panel p-4 rounded-xl border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <span className="font-bold text-slate-200 font-mono text-xs">{currentCut.id} 원문 지문 & 대본</span>
                {currentCut.dialogueText && (
                  <span className="px-2 py-0.5 bg-amber-950/60 text-amber-300 rounded border border-amber-800/40 font-mono text-[10px]">
                    대사 포함
                  </span>
                )}
              </div>
              <p className="text-slate-200 leading-relaxed font-medium">{currentCut.originalText}</p>
              {currentCut.dialogueText && (
                <div className="p-2.5 bg-[#0D131F] rounded-lg border border-amber-900/30 text-amber-200 font-mono text-[11px]">
                  &lt;d&gt;[Korean] "{currentCut.dialogueText}"&lt;/d&gt;
                </div>
              )}
            </div>
          )}

          {/* 2. Auto-Expanding Prompt Editor (텍스트 길이에 따라 높이가 자연스럽게 늘어남) */}
          <div className="glass-panel p-4 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <label className="text-xs font-bold text-slate-100 uppercase tracking-wider block">
                  {entryMode === 'project' ? '조립된 2D 실사 프롬프트' : '🎨 단독 2D 영문 프롬프트'}
                </label>
                <span className="text-[10px] text-slate-500 font-mono">
                  (내용 입력 시 창 높이 자동 확장)
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  disabled={isExpandingT2IPrompt}
                  onClick={handleExpandT2IPrompt}
                  className="px-2.5 py-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-[10px] font-bold rounded-lg transition shadow-md flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                  title="한글로 적고 누르면 27B 모델이 시네마틱 영문 프롬프트로 변환하며, 작성 직후 VRAM을 즉시 비웁니다."
                >
                  {isExpandingT2IPrompt ? (
                    <>
                      <span className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>27B 작성 중...</span>
                    </>
                  ) : (
                    <>
                      <span>🌐 27B 시네마틱 작성</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const text = entryMode === 'project' ? assembledPrompt : directPrompt;
                    if (text) {
                      navigator.clipboard.writeText(text);
                      alert('프롬프트가 클립보드에 복사되었습니다.');
                    }
                  }}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 font-mono font-bold"
                >
                  [프롬프트 복사]
                </button>
              </div>
            </div>
            <textarea
              ref={(el) => {
                if (el) {
                  el.style.height = 'auto';
                  el.style.height = `${Math.max(140, el.scrollHeight)}px`;
                }
              }}
              value={entryMode === 'project' && project.cuts.length > 0 ? (currentCut.assembledPrompt ?? assembledPrompt) : directPrompt}
              placeholder={
                entryMode === 'project' && project.cuts.length > 0
                  ? '소설 지문 및 에셋 바이블에서 조립된 클린 영문 프롬프트가 표시됩니다.'
                  : '원하는 2D 실사 프롬프트를 자유롭게 입력하세요 (예: photorealistic 8k, modern studio portrait, highly detailed...)'
              }
              onChange={(e) => {
                const newVal = e.target.value;
                if (entryMode === 'project' && project.cuts.length > 0) {
                  onUpdateCut({
                    ...currentCut,
                    assembledPrompt: newVal,
                  });
                } else {
                  setDirectPrompt(newVal);
                }
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.max(140, e.target.scrollHeight)}px`;
              }}
              className="w-full min-h-[140px] bg-[#0D131F] text-slate-200 text-xs p-3 rounded-xl border border-slate-700/80 focus:border-indigo-500 font-mono leading-relaxed resize-none overflow-hidden placeholder:text-slate-600 shadow-inner focus:outline-none"
            />
          </div>

          {/* 3. 3 Standalone Engines Selection & Aspect Ratio Card */}
          <div className="glass-panel p-4 rounded-xl border border-slate-800 space-y-3 text-xs shadow-lg">
            {/* 화면 비율 선택기 (Aspect Ratio: 9:16 | 16:9 | 1:1) */}
            <div className="flex items-center justify-between p-2 bg-[#090D14] rounded-xl border border-slate-700/60 shadow-inner">
              <span className="text-[11px] font-bold text-slate-300 flex items-center space-x-1 font-mono">
                <span>📐 화면 비율 (Aspect)</span>
              </span>
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => setAspectRatio('9:16')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                    aspectRatio === '9:16'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  📱 9:16 세로 쇼츠
                </button>
                <button
                  type="button"
                  onClick={() => setAspectRatio('16:9')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                    aspectRatio === '16:9'
                      ? 'bg-cyan-600 text-white shadow-md shadow-cyan-900/40'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  🖥️ 16:9 가로 영상
                </button>
                <button
                  type="button"
                  onClick={() => setAspectRatio('1:1')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                    aspectRatio === '1:1'
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  ⏹️ 1:1 정사각
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-200 uppercase tracking-wider text-xs flex items-center space-x-2">
                <span>⚙️ 3대 독립 렌더링 엔진</span>
                <span className="text-[10px] font-mono px-2 py-0.5 bg-indigo-950/80 text-indigo-300 rounded border border-indigo-800">
                  1:1 Standalone
                </span>
              </h3>
            </div>

            <div className="flex p-1 bg-[#090D14] rounded-xl border border-slate-700/60 shadow-inner gap-1">
              {/* Engine 1: Krea 2 Turbo */}
              <button
                type="button"
                onClick={() => handleSwitchEngine('krea-2-turbo-v2')}
                className={`flex-1 flex items-center justify-center space-x-1 py-2 rounded-lg text-xs font-bold transition-all ${
                  selectedEngineId === 'krea-2-turbo-v2'
                    ? 'bg-gradient-to-br from-indigo-600 to-indigo-800 text-white shadow-md shadow-indigo-900/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <span>🚀 Krea 2</span>
              </button>

              {/* Engine 2: Z-Image Turbo (일반 실사) */}
              <button
                type="button"
                onClick={() => handleSwitchEngine('z-image-turbo')}
                className={`flex-1 flex items-center justify-center space-x-1 py-2 rounded-lg text-xs font-bold transition-all ${
                  selectedEngineId === 'z-image-turbo'
                    ? 'bg-gradient-to-br from-emerald-600 to-emerald-800 text-white shadow-md shadow-emerald-900/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <span>🟢 Z-실사</span>
              </button>

              {/* Engine 3: Z-Image Ultimate (성인용 NSFW) */}
              <button
                type="button"
                onClick={() => handleSwitchEngine('z-image-ultimate')}
                className={`flex-1 flex items-center justify-center space-x-1 py-2 rounded-lg text-xs font-bold transition-all ${
                  selectedEngineId === 'z-image-ultimate'
                    ? 'bg-gradient-to-br from-rose-600 to-rose-800 text-white shadow-md shadow-rose-900/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <span>🔴 Z-성인</span>
              </button>

              {/* Engine 4: Z-Anime Distill (웹툰/애니) */}
              <button
                type="button"
                onClick={() => handleSwitchEngine('z-anime-distill')}
                className={`flex-1 flex items-center justify-center space-x-1 py-2 rounded-lg text-xs font-bold transition-all ${
                  selectedEngineId === 'z-anime-distill'
                    ? 'bg-gradient-to-br from-cyan-600 to-cyan-800 text-white shadow-md shadow-cyan-900/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <span>🟣 Z-웹툰</span>
              </button>

              {/* Engine 5: Qwen Edit */}
              <button
                type="button"
                onClick={() => handleSwitchEngine('qwen-2512-gguf')}
                className={`flex-1 flex items-center justify-center space-x-1 py-2 rounded-lg text-xs font-bold transition-all ${
                  selectedEngineId === 'qwen-2512-gguf'
                    ? 'bg-gradient-to-br from-purple-600 to-purple-800 text-white shadow-md shadow-purple-900/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <span>✂️ Qwen</span>
              </button>
            </div>

            {/* 🚀 1. FLUX (Krea 2 Turbo) 전용 워크플로우 제어 패널 */}
            {selectedEngineId === 'krea-2-turbo-v2' && (
              <div className="p-4 bg-[#070A12] rounded-2xl border border-indigo-800/60 shadow-xl shadow-indigo-950/20 space-y-3.5">
                <div className="flex items-center justify-between border-b border-indigo-900/40 pb-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-indigo-300">🚀 FLUX (Krea 2 Turbo) 샘플링 &amp; 전용 LoRA 제어</span>
                    <span className="text-[9px] font-mono text-indigo-400 bg-indigo-950 px-2 py-0.5 rounded border border-indigo-800">
                      DualCLIP (clip_l + t5xxl)
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">18.5GB 12B DiT</span>
                </div>

                {/* Steps & Shift Sliders */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2.5 bg-[#090D18] rounded-xl border border-slate-800 space-y-1.5">
                    <div className="flex justify-between text-[11px] text-indigo-300 font-bold">
                      <span>스텝 수 (Steps)</span>
                      <span className="font-mono text-white">{fluxSteps}</span>
                    </div>
                    <input
                      type="range"
                      min="4"
                      max="30"
                      step="2"
                      value={fluxSteps}
                      onChange={(e) => setFluxSteps(parseInt(e.target.value))}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                      <span>4 (초고속)</span>
                      <span>12 (표준)</span>
                      <span>30 (초정밀)</span>
                    </div>
                  </div>

                  <div className="p-2.5 bg-[#090D18] rounded-xl border border-slate-800 space-y-1.5">
                    <div className="flex justify-between text-[11px] text-indigo-300 font-bold">
                      <span>AuraFlow Shift</span>
                      <span className="font-mono text-white">{fluxShift.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min="1.0"
                      max="5.0"
                      step="0.5"
                      value={fluxShift}
                      onChange={(e) => setFluxShift(parseFloat(e.target.value))}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                      <span>1.0 (연함)</span>
                      <span>3.0 (정격)</span>
                      <span>5.0 (강함)</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ⚡ 2. Z-Image 3대 특화 워크플로우 제어 패널 */}
            {(selectedEngineId === 'z-image-turbo' || selectedEngineId === 'z-image-ultimate' || selectedEngineId === 'z-anime-distill') && (
              <div className={`p-4 bg-[#070A12] rounded-2xl border shadow-xl space-y-3.5 ${
                selectedEngineId === 'z-image-turbo'
                  ? 'border-emerald-800/60 shadow-emerald-950/20'
                  : selectedEngineId === 'z-image-ultimate'
                    ? 'border-rose-800/60 shadow-rose-950/20'
                    : 'border-cyan-800/60 shadow-cyan-950/20'
              }`}>
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center space-x-2">
                    <span className={`text-xs font-bold ${
                      selectedEngineId === 'z-image-turbo'
                        ? 'text-emerald-300'
                        : selectedEngineId === 'z-image-ultimate'
                          ? 'text-rose-300'
                          : 'text-cyan-300'
                    }`}>
                      {selectedEngineId === 'z-image-turbo'
                        ? '🟢 Z-Image Turbo (순정 일반 실사)'
                        : selectedEngineId === 'z-image-ultimate'
                          ? '🔴 Z-Image Ultimate (성인용 NSFW)'
                          : '🟣 Z-Anime Distill (웹툰/애니 전용)'}
                    </span>
                    <span className="text-[9px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                      {selectedEngineId === 'z-image-turbo'
                        ? 'z_image_turbo_bf16'
                        : selectedEngineId === 'z-image-ultimate'
                          ? 'zImageUltimateNSFW_v20'
                          : 'z-anime-distill-8step'}
                    </span>
                  </div>
                  <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                    ✓ ZeroOut 네거티브 탑재 (뭉개짐 방지)
                  </span>
                </div>

                {/* Steps & Shift Sliders */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2.5 bg-[#090D18] rounded-xl border border-slate-800 space-y-1.5">
                    <div className="flex justify-between text-[11px] text-cyan-300 font-bold">
                      <span>스텝 수 (Steps)</span>
                      <span className="font-mono text-white">{zImageSteps}</span>
                    </div>
                    <input
                      type="range"
                      min="6"
                      max="16"
                      step="2"
                      value={zImageSteps}
                      onChange={(e) => setZImageSteps(parseInt(e.target.value))}
                      className="w-full accent-cyan-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                      <span>6 (터보)</span>
                      <span>10 (정격)</span>
                      <span>16 (초정밀)</span>
                    </div>
                  </div>

                  <div className="p-2.5 bg-[#090D18] rounded-xl border border-slate-800 space-y-1.5">
                    <div className="flex justify-between text-[11px] text-cyan-300 font-bold">
                      <span>AuraFlow Shift</span>
                      <span className="font-mono text-white">{zImageShift.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min="1.0"
                      max="7.0"
                      step="0.5"
                      value={zImageShift}
                      onChange={(e) => setZImageShift(parseFloat(e.target.value))}
                      className="w-full accent-cyan-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                      <span>1.0 (부드러움)</span>
                      <span>3.5 (정격)</span>
                      <span>5.0 (초극세사)</span>
                    </div>
                  </div>
                </div>

                {/* 1.5배 Hires-Fix 정제 옵션 토글 */}
                <div className="flex items-center justify-between p-2.5 bg-[#090D18] rounded-xl border border-slate-800/80">
                  <label className="flex items-center space-x-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableHiresFix}
                      onChange={(e) => setEnableHiresFix(e.target.checked)}
                      className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
                    />
                    <span className="text-xs font-bold text-slate-200">
                      ✨ 2단계 1.5배 Hires-Fix 정밀 정제 활성화
                    </span>
                  </label>
                  <span className="text-[10px] font-mono text-slate-400">
                    {enableHiresFix ? '1.5배 확대 + Denoise 0.4 극세사' : '1단계 초고속 직행 (1초 완성)'}
                  </span>
                </div>
              </div>
            )}

            {/* Engine Specific Options (Qwen Edit 전용 요약 안내) */}
            {selectedEngineId === 'qwen-2512-gguf' && (
              <div className="p-3.5 bg-[#070A12] rounded-xl border border-purple-800/60 space-y-2.5 text-xs shadow-lg">
                <div className="flex items-center justify-between border-b border-purple-900/40 pb-2">
                  <span className="font-bold text-purple-300 flex items-center space-x-1.5">
                    <span>✂️</span>
                    <span>Qwen-Image-Edit 스튜디오</span>
                  </span>
                  <span className="text-[10px] font-mono text-purple-400 bg-purple-950 px-2 py-0.5 rounded border border-purple-800/50">
                    Lightning 8step
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  우측 <strong>대형 비주얼 작업대</strong>에서 7대 편집 모드를 선택하고, 원본과 참조 이미지를 대형 화면으로 나란히 보며 정밀하게 편집할 수 있습니다.
                </p>
              </div>
            )}

            {/* LoRA Multi-Stack & Weight Control Panel */}
            <div className="p-3 bg-[#070A11] rounded-xl border border-slate-800 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-slate-200 flex items-center space-x-1.5">
                    <span>🎨 2D LoRA 멀티 체인 & 가중치 제어</span>
                  </span>
                  <span className="text-[10px] bg-indigo-950/80 border border-indigo-700/50 text-indigo-300 px-1.5 py-0.5 rounded font-mono">
                    {currentLoras.length}개 활성
                  </span>
                </div>
                <div className="flex items-center space-x-1.5">
                  {entryMode === 'project' && project.cuts.length > 1 && (
                    <button
                      type="button"
                      onClick={handleApplyLoRAsToAllCuts}
                      className="px-2 py-1 bg-purple-900/50 hover:bg-purple-800 border border-purple-600/60 text-purple-200 text-[10px] font-bold rounded-lg transition flex items-center space-x-1"
                      title="현재 설정된 2D LoRA 체인을 전체 컷에 즉시 일괄 복사 적용합니다."
                    >
                      <span>⚡ 전체 컷 일괄 적용</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleAddLora}
                    className="px-2.5 py-1 bg-indigo-600/30 hover:bg-indigo-600 border border-indigo-500/50 text-indigo-200 text-[11px] font-bold rounded-lg transition flex items-center space-x-1"
                  >
                    <span>+ 로라 추가</span>
                  </button>
                </div>
              </div>

              {currentLoras.length === 0 ? (
                <div className="text-center py-2.5 border border-dashed border-slate-800 rounded-lg text-slate-500 text-[11px]">
                  적용된 추가 LoRA가 없습니다. 상단의 <strong className="text-indigo-400">[+ 로라 추가]</strong> 버튼을 눌러 스타일/인물 LoRA를 추가하고 가중치를 조절하세요.
                </div>
              ) : (
                <div className="space-y-2">
                  {currentLoras.map((loraItem, idx) => (
                    <div
                      key={loraItem.id}
                      className="p-2.5 bg-[#090D14] border border-slate-700/70 rounded-xl space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-indigo-300">
                          LoRA #{idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveLora(loraItem.id)}
                          className="text-rose-400 hover:text-rose-300 text-xs px-1.5 py-0.5 rounded hover:bg-rose-950/40 transition"
                          title="이 로라 삭제"
                        >
                          ✕ 삭제
                        </button>
                      </div>

                      <select
                        value={loraItem.name}
                        onChange={(e) => handleUpdateLoraName(loraItem.id, e.target.value)}
                        className="w-full bg-[#0E131F] border border-slate-700 text-slate-200 text-xs px-2.5 py-1.5 rounded-lg focus:border-indigo-500 font-mono"
                      >
                        {filteredLoRAs.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>

                      {/* 가중치 슬라이더 + 직접 숫자 입력창 */}
                      <div className="flex items-center space-x-3 pt-1">
                        <span className="text-[11px] text-slate-400 shrink-0">가중치:</span>
                        <input
                          type="range"
                          min="0.0"
                          max="2.0"
                          step="0.05"
                          value={loraItem.strength}
                          onChange={(e) =>
                            handleUpdateLoraStrength(loraItem.id, parseFloat(e.target.value) || 0)
                          }
                          className="flex-1 accent-indigo-500 cursor-pointer"
                        />
                        <input
                          type="number"
                          min="0.0"
                          max="2.0"
                          step="0.05"
                          value={loraItem.strength}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            handleUpdateLoraStrength(loraItem.id, isNaN(val) ? 0 : val);
                          }}
                          className="w-16 bg-[#0E131F] border border-slate-700 text-indigo-300 text-xs px-2 py-1 rounded-md text-right font-mono focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Seed Control Panel */}
            <div className="p-3 bg-[#070A11] rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-300 flex items-center space-x-1.5 text-xs">
                  <span>🎲 시드(Seed) 난수 제어</span>
                </span>
                <label className="flex items-center space-x-1.5 cursor-pointer text-[11px] text-indigo-300">
                  <input
                    type="checkbox"
                    checked={isRandomSeed}
                    onChange={(e) => setIsRandomSeed(e.target.checked)}
                    className="accent-indigo-500 rounded"
                  />
                  <span>랜덤 난수 생성 (매번 새로움)</span>
                </label>
              </div>

              {!isRandomSeed && (
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    value={seed}
                    onChange={(e) => setSeed(parseInt(e.target.value) || 0)}
                    placeholder="고정 시드 번호 입력"
                    className="flex-1 bg-[#090D14] border border-slate-700 text-slate-200 text-xs px-3 py-1.5 rounded-lg focus:border-indigo-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setSeed(Math.floor(Math.random() * 1000000000))}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-lg transition border border-slate-700 shrink-0"
                    title="새로운 랜덤 시드 번호 생성"
                  >
                    🎲 시드 굴리기
                  </button>
                </div>
              )}
            </div>

            {/* Execute Render Button */}
            <div className="pt-1">
              <button
                disabled={isGenerating}
                onClick={() => {
                  if (selectedEngineId === 'qwen-2512-gguf') {
                    handleGenerateI2I('qwen-2512-gguf');
                  } else {
                    handleGenerateT2I(selectedEngineId);
                  }
                }}
                className={`w-full py-3 text-white font-bold rounded-xl transition shadow-lg text-xs flex items-center justify-center space-x-2 disabled:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none cursor-pointer ${
                  selectedEngineId === 'krea-2-turbo-v2'
                    ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/40'
                    : selectedEngineId === 'z-image-turbo'
                      ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/40'
                      : selectedEngineId === 'z-image-ultimate'
                        ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-900/40'
                        : selectedEngineId === 'z-anime-distill'
                          ? 'bg-cyan-600 hover:bg-cyan-500 shadow-cyan-900/40'
                          : qwenMode === 'h3_turnaround'
                            ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/40'
                            : 'bg-purple-600 hover:bg-purple-500 shadow-purple-900/40'
                }`}
              >
                {isGenerating ? (
                  <span className="flex items-center space-x-2">
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>이미지 연산 진행 중 (오조작 방지 잠금)...</span>
                  </span>
                ) : (
                  <span>
                    {selectedEngineId === 'krea-2-turbo-v2'
                      ? '🚀 [FLUX Krea 2] 2D 실사 T2I 렌더링 실행'
                      : selectedEngineId === 'z-image-turbo'
                        ? '🟢 [Z-실사 순정] 2D 실사 마스터 T2I 렌더링 실행'
                        : selectedEngineId === 'z-image-ultimate'
                          ? '🔴 [Z-성인 NSFW] 2D 무검열 성인 T2I 렌더링 실행'
                          : selectedEngineId === 'z-anime-distill'
                            ? '🟣 [Z-웹툰 애니] 2D 웹툰/카툰 T2I 렌더링 실행'
                            : qwenMode === 'char_swap'
                              ? '👥 [Qwen Edit] 2장 얼굴 교체 렌더링 실행'
                              : qwenMode === 'h3_turnaround'
                                ? '🥋 [Qwen 2511] H3 다중참조용 4면 전신 시트 생성 실행 (REF2VA 자동 바인딩)'
                                : qwenMode === 'multi_angles'
                                  ? '🔄 [Qwen 2511] 8방향 앵글 변환 렌더링 실행'
                                  : '🎨 [Qwen Edit] 1장 부위 보정 렌더링 실행'}
                  </span>
                )}
              </button>
            </div>

            {isGenerating && (
              <div className="p-3 bg-gradient-to-r from-indigo-950 via-purple-950 to-slate-900 rounded-xl border border-indigo-500/80 text-indigo-200 font-mono text-center text-xs flex items-center justify-center space-x-2 shadow-xl animate-pulse">
                <div className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0" />
                <span className="font-bold">{generationProgress || '2D 이미지 연산 중...'}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Candidate Gallery (50% for T2I) & Qwen Grand Studio Workbench (75% for Qwen Edit) */}
        <div className={`${selectedEngineId === 'qwen-2512-gguf' ? 'lg:col-span-9' : 'lg:col-span-6'} space-y-4 transition-all duration-300`}>
          {selectedEngineId === 'qwen-2512-gguf' ? (
            /* ========================================================================= */
            /* ✂️ QWEN IMAGE-EDIT GRAND VISUAL WORKBENCH (대형 와이드 비주얼 편집 작업대) */
            /* ========================================================================= */
            <div className="glass-panel p-5 rounded-2xl border border-purple-800/60 shadow-2xl shadow-purple-950/20 space-y-5">
              {/* 1. Mode Switcher Tabs Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-purple-900/40 pb-4">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-bold text-purple-200 flex items-center space-x-1.5 font-mono">
                    <span>✂️ QWEN STUDIO</span>
                  </span>
                  <span className="text-[10px] font-mono text-purple-300 bg-purple-950/80 px-2 py-0.5 rounded border border-purple-800/60">
                    Lightning 8-Step + Multi-Angle LoRA
                  </span>
                </div>

                {/* 7대 전용 모드 전환 탭 */}
                <div className="flex flex-wrap gap-1.5 bg-[#090D18] p-1.5 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => handleSelectQwenSubMode('char_swap')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${qwenMode === 'char_swap'
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-900/50'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                      }`}
                  >
                    <span>👥 얼굴/외형 교체</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectQwenSubMode('h3_turnaround')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 border ${qwenMode === 'h3_turnaround'
                      ? 'bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-900/50'
                      : 'border-emerald-900/40 text-emerald-300 hover:text-emerald-100 hover:bg-emerald-950/40'
                      }`}
                  >
                    <span>🥋 4면 전신 시트 (턴어라운드)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectQwenSubMode('wardrobe')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${qwenMode === 'wardrobe'
                      ? 'bg-amber-600 text-white shadow-md shadow-amber-900/50'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                      }`}
                  >
                    <span>✨ 2-Step 의상교체</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectQwenSubMode('undress_only')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 border ${qwenMode === 'undress_only'
                      ? 'bg-pink-600/80 text-white border-pink-400 shadow-md shadow-pink-900/50'
                      : 'border-pink-900/40 text-pink-300 hover:text-pink-100 hover:bg-pink-950/40'
                      }`}
                  >
                    <span>🧼 나체화 베이스</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectQwenSubMode('multi_angles')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${qwenMode === 'multi_angles'
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-900/50'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                      }`}
                  >
                    <span>🔄 8방향 앵글</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectQwenSubMode('single_edit')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${qwenMode === 'single_edit'
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-900/50'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                      }`}
                  >
                    <span>🎨 부위 보정</span>
                  </button>
                </div>
              </div>

              {/* 2. Visual Stage Canvas (모드별 대형 2단/3단 나란히 비교 작업대) */}
              {/* [모드 1: 👥 얼굴/외형 교체 (3단 비교 작업대)] */}
              {qwenMode === 'char_swap' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Stage 1: 타깃 씬 이미지 */}
                    <div className="p-4 bg-[#0A0F1D] rounded-2xl border border-indigo-900/60 shadow-lg flex flex-col space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-indigo-300">① 타깃 씬 (배경/포즈)</span>
                        <span className="text-[10px] bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded border border-indigo-800">구도 유지</span>
                      </div>
                      <div className="flex-1 min-h-[360px] bg-black/60 rounded-xl overflow-hidden border border-indigo-900/40 flex items-center justify-center relative group">
                        {i2iCustomImage || (entryMode === 'project' ? currentCut.winnerImagePath : directWinner) ? (
                          <img
                            src={(i2iCustomImage || (entryMode === 'project' ? currentCut.winnerImagePath : directWinner))!}
                            alt="Target Scene"
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="text-center p-4 space-y-2 text-slate-500">
                            <div className="text-3xl">🖼️</div>
                            <div className="text-xs font-bold text-slate-400">기준 씬 사진 필요</div>
                            <div className="text-[10px]">포즈와 배경이 유지될 원본 씬을 등록하세요.</div>
                          </div>
                        )}
                      </div>
                      <div className="flex space-x-2">
                        <label className="flex-1 text-center py-2 bg-indigo-950/80 hover:bg-indigo-900 text-indigo-200 text-xs font-bold rounded-xl cursor-pointer transition border border-indigo-800 shadow-md">
                          + 씬 사진 등록/변경
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) {
                                const r = new FileReader();
                                r.onload = (ev) => setI2iCustomImage(ev.target?.result as string);
                                r.readAsDataURL(f);
                              }
                            }}
                            className="hidden"
                          />
                        </label>
                        {i2iCustomImage && (
                          <button
                            type="button"
                            onClick={() => setI2iCustomImage(null)}
                            className="px-3 py-2 bg-rose-950/60 hover:bg-rose-900 text-rose-300 text-xs font-bold rounded-xl border border-rose-800"
                            title="초기화"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Stage 2: 교체할 인물 얼굴 이미지 */}
                    <div className="p-4 bg-[#0A0F1D] rounded-2xl border border-purple-900/60 shadow-lg flex flex-col space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-purple-300">② 교체할 캐릭터 (얼굴/외형)</span>
                        <span className="text-[10px] bg-purple-950 text-purple-300 px-2 py-0.5 rounded border border-purple-800">이목구비 치환</span>
                      </div>
                      <div className="flex-1 min-h-[360px] bg-black/60 rounded-xl overflow-hidden border border-purple-900/40 flex items-center justify-center relative group">
                        {qwenSwapCharImage ? (
                          <img
                            src={qwenSwapCharImage}
                            alt="Character Face"
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="text-center p-4 space-y-2 text-slate-500">
                            <div className="text-3xl">👤</div>
                            <div className="text-xs font-bold text-purple-300">인물 얼굴 사진 필요</div>
                            <div className="text-[10px]">치환할 주인공/캐릭터의 얼굴 사진을 등록하세요.</div>
                          </div>
                        )}
                      </div>
                      <div className="flex space-x-2">
                        <label className="flex-1 text-center py-2 bg-purple-950/80 hover:bg-purple-900 text-purple-200 text-xs font-bold rounded-xl cursor-pointer transition border border-purple-800 shadow-md">
                          + 캐릭터 얼굴 등록/변경
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) {
                                const r = new FileReader();
                                r.onload = (ev) => setQwenSwapCharImage(ev.target?.result as string);
                                r.readAsDataURL(f);
                              }
                            }}
                            className="hidden"
                          />
                        </label>
                        {qwenSwapCharImage && (
                          <button
                            type="button"
                            onClick={() => setQwenSwapCharImage(null)}
                            className="px-3 py-2 bg-rose-950/60 hover:bg-rose-900 text-rose-300 text-xs font-bold rounded-xl border border-rose-800"
                            title="초기화"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Stage 3: 최종 합성 결과물 */}
                    <div className="p-4 bg-[#0A0F1D] rounded-2xl border border-emerald-900/60 shadow-lg flex flex-col space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-300">③ 합성 결과 (Result)</span>
                        <span className="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800">최종 출력</span>
                      </div>
                      <div className="flex-1 min-h-[360px] bg-black/60 rounded-xl overflow-hidden border border-emerald-900/40 flex items-center justify-center relative group">
                        {(() => {
                          const candList = (entryMode === 'project' && project.cuts.length > 0) ? currentCut.candidates : directCandidates;
                          const candIdx = (entryMode === 'project' && project.cuts.length > 0) ? currentCut.selectedCandidateIndex : directCandIdx;
                          const candActive = candList[candIdx];
                          return candActive && candActive.imagePath ? (
                            <img
                              src={candActive.imagePath}
                              alt="Result"
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <div className="text-center p-4 space-y-2 text-slate-600">
                              <div className="text-3xl">⚡</div>
                              <div className="text-xs font-bold text-slate-400">아직 생성된 결과가 없습니다.</div>
                              <div className="text-[10px] text-slate-500">좌측 [얼굴 교체 렌더링 실행] 버튼을 누르세요.</div>
                            </div>
                          );
                        })()}
                      </div>
                      <button
                        disabled={isGenerating}
                        onClick={() => handleGenerateI2I('qwen-2512-gguf')}
                        className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-purple-900/40 cursor-pointer disabled:opacity-50"
                      >
                        ⚡ ①+② 얼굴 교체 합성 실행
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* [모드 2: 🥋 H3 4면 전신 시트 (REF2VA)] */}
              {qwenMode === 'h3_turnaround' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  {/* 기준 인물 사진 */}
                  <div className="lg:col-span-4 p-4 bg-[#0A0F1D] rounded-2xl border border-emerald-900/60 shadow-lg flex flex-col space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-300">기준 원본 인물 이미지</span>
                      <span className="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800">1장 참조</span>
                    </div>
                    <div className="flex-1 min-h-[380px] bg-black/60 rounded-xl overflow-hidden border border-emerald-900/40 flex items-center justify-center">
                      {i2iCustomImage || (entryMode === 'project' ? currentCut.winnerImagePath : directWinner) ? (
                        <img
                          src={(i2iCustomImage || (entryMode === 'project' ? currentCut.winnerImagePath : directWinner))!}
                          alt="Base Character"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="text-center p-4 space-y-2 text-slate-500">
                          <div className="text-3xl">👤</div>
                          <div className="text-xs font-bold text-emerald-300">기준 인물 사진 등록 필요</div>
                          <div className="text-[10px]">얼굴과 전신 의상이 선명한 사진 1장을 등록하세요.</div>
                        </div>
                      )}
                    </div>
                    <label className="text-center py-2.5 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 text-xs font-bold rounded-xl cursor-pointer transition border border-emerald-700 shadow-md">
                      + 기준 인물 사진 등록/변경
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            const r = new FileReader();
                            r.onload = (ev) => setI2iCustomImage(ev.target?.result as string);
                            r.readAsDataURL(f);
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {/* 16:9 와이드 4면 전신 시트 결과 영역 */}
                  <div className="lg:col-span-8 p-4 bg-[#0A0F1D] rounded-2xl border border-emerald-900/60 shadow-lg flex flex-col space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-emerald-300">🥋 H3 다중참조용 4면 전신 턴어라운드 시트 (16:9)</span>
                        <span className="text-[10px] bg-emerald-900 text-emerald-200 px-2 py-0.5 rounded font-bold">
                          [정면 | 좌측 | 우측 | 후면]
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-400">1장의 16:9 와이드 시트</span>
                    </div>

                    <div className="flex-1 min-h-[380px] bg-black/60 rounded-xl overflow-hidden border border-emerald-900/40 flex items-center justify-center relative">
                      {(() => {
                        const candList = (entryMode === 'project' && project.cuts.length > 0) ? currentCut.candidates : directCandidates;
                        const candIdx = (entryMode === 'project' && project.cuts.length > 0) ? currentCut.selectedCandidateIndex : directCandIdx;
                        const candActive = candList[candIdx];
                        return candActive && candActive.imagePath ? (
                          <img
                            src={candActive.imagePath}
                            alt="H3 Turnaround Sheet"
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="text-center p-6 space-y-2 text-slate-600">
                            <div className="text-4xl">🥋</div>
                            <div className="text-xs font-bold text-emerald-300">생성된 4면 전신 시트가 없습니다.</div>
                            <div className="text-[10px] text-slate-500">우측 하단 [4면 전신 시트 생성 실행]을 누르면 즉시 1장의 16:9 와이드 시트가 렌더링됩니다.</div>
                          </div>
                        );
                      })()}
                    </div>

                    <button
                      disabled={isGenerating}
                      onClick={() => handleGenerateI2I('qwen-2512-gguf')}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-emerald-900/40 cursor-pointer disabled:opacity-50"
                    >
                      🥋 H3 4면 전신 시트 생성 실행
                    </button>
                  </div>
                </div>
              )}

              {/* [모드 3: ✨ 2-Step 의상 교체 (3단 체이닝 작업대)] */}
              {qwenMode === 'wardrobe' && (
                <div className="space-y-3">
                  <div className="p-3 bg-amber-950/30 border border-amber-800/50 rounded-xl text-xs text-amber-200 flex items-center justify-between">
                    <span>💡 <strong>2-Step 완벽 의상 교체 파이프라인</strong>: 기존 의상을 완벽한 나체 상태로 1차 클린업한 뒤, 프롬프트의 새 의상을 입혀 색상/텍스처 번짐을 100% 차단합니다.</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Stage 1: 기준 인물 */}
                    <div className="p-4 bg-[#0A0F1D] rounded-2xl border border-amber-900/60 shadow-lg flex flex-col space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-300">① 원본 인물 (의상 교체 대상)</span>
                        <span className="text-[10px] bg-amber-950 text-amber-300 px-2 py-0.5 rounded border border-amber-800">기준 인물</span>
                      </div>
                      <div className="flex-1 min-h-[360px] bg-black/60 rounded-xl overflow-hidden border border-amber-900/40 flex items-center justify-center">
                        {i2iCustomImage || (entryMode === 'project' ? currentCut.winnerImagePath : directWinner) ? (
                          <img
                            src={(i2iCustomImage || (entryMode === 'project' ? currentCut.winnerImagePath : directWinner))!}
                            alt="Original Character"
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="text-center p-4 space-y-2 text-slate-500">
                            <div className="text-3xl">👗</div>
                            <div className="text-xs font-bold text-amber-300">기준 사진 필요</div>
                            <div className="text-[10px]">의상을 교체할 인물 사진을 등록하세요.</div>
                          </div>
                        )}
                      </div>
                      <label className="text-center py-2 bg-amber-950/80 hover:bg-amber-900 text-amber-200 text-xs font-bold rounded-xl cursor-pointer transition border border-amber-700 shadow-md">
                        + 기준 사진 등록/변경
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              const r = new FileReader();
                              r.onload = (ev) => setI2iCustomImage(ev.target?.result as string);
                              r.readAsDataURL(f);
                            }
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {/* Stage 2: 1단계 나체화 베이스 안내 */}
                    <div className="p-4 bg-[#0A0F1D] rounded-2xl border border-pink-900/60 shadow-lg flex flex-col space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-pink-300">② Step 1: 나체화 클린업</span>
                        <span className="text-[10px] bg-pink-950 text-pink-300 px-2 py-0.5 rounded border border-pink-800">번짐 차단</span>
                      </div>
                      <div className="flex-1 min-h-[360px] bg-black/60 rounded-xl overflow-hidden border border-pink-900/40 flex flex-col items-center justify-center p-6 text-center space-y-3">
                        <div className="text-4xl">🧼</div>
                        <div className="text-xs font-bold text-pink-200">자동 나체화 클린업 처리</div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          기존 옷의 색상과 질감이 새 옷에 번지는 것을 원천 차단하기 위해, 백그라운드에서 완벽한 나체 상태로 1차 클린업이 자동 실행됩니다.
                        </p>
                      </div>
                      <div className="py-2 text-center text-[10px] font-mono text-pink-400 bg-pink-950/30 rounded-xl border border-pink-900/40">
                        ✓ 체이닝 자동 수행
                      </div>
                    </div>

                    {/* Stage 3: 새 의상 적용 최종 완성본 */}
                    <div className="p-4 bg-[#0A0F1D] rounded-2xl border border-emerald-900/60 shadow-lg flex flex-col space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-300">③ Step 2: 새 의상 완성본</span>
                        <span className="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800">최종 출력</span>
                      </div>
                      <div className="flex-1 min-h-[360px] bg-black/60 rounded-xl overflow-hidden border border-emerald-900/40 flex items-center justify-center">
                        {(() => {
                          const candList = (entryMode === 'project' && project.cuts.length > 0) ? currentCut.candidates : directCandidates;
                          const candIdx = (entryMode === 'project' && project.cuts.length > 0) ? currentCut.selectedCandidateIndex : directCandIdx;
                          const candActive = candList[candIdx];
                          return candActive && candActive.imagePath ? (
                            <img
                              src={candActive.imagePath}
                              alt="New Wardrobe Result"
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <div className="text-center p-4 space-y-2 text-slate-600">
                              <div className="text-3xl">✨</div>
                              <div className="text-xs font-bold text-slate-400">교체된 의상 이미지가 없습니다.</div>
                              <div className="text-[10px] text-slate-500">좌측에 새 의상 프롬프트를 적고 실행을 누르세요.</div>
                            </div>
                          );
                        })()}
                      </div>
                      <button
                        disabled={isGenerating}
                        onClick={() => handleGenerateI2I('qwen-2512-gguf')}
                        className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-amber-900/40 cursor-pointer disabled:opacity-50"
                      >
                        ✨ 2-Step 의상 완벽 교체 실행
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* [모드 5: 🧼 나체화 베이스 (포즈 변경용 베이스 추출)] */}
              {qwenMode === 'undress_only' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  <div className="lg:col-span-6 p-4 bg-[#0A0F1D] rounded-2xl border border-pink-900/60 shadow-lg flex flex-col space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-pink-300">① 원본 인물 이미지 (의상 제거 대상)</span>
                      <span className="text-[10px] bg-pink-950 text-pink-300 px-2 py-0.5 rounded border border-pink-800">1장 참조</span>
                    </div>
                    <div className="flex-1 min-h-[380px] bg-black/60 rounded-xl overflow-hidden border border-pink-900/40 flex items-center justify-center">
                      {i2iCustomImage || (entryMode === 'project' ? currentCut.winnerImagePath : directWinner) ? (
                        <img
                          src={(i2iCustomImage || (entryMode === 'project' ? currentCut.winnerImagePath : directWinner))!}
                          alt="Base"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="text-center p-4 space-y-2 text-slate-500">
                          <div className="text-3xl">👤</div>
                          <div className="text-xs font-bold text-pink-300">인물 사진 필요</div>
                          <div className="text-[10px]">나체화할 원본 인물 사진을 등록하세요.</div>
                        </div>
                      )}
                    </div>
                    <label className="text-center py-2.5 bg-pink-950/80 hover:bg-pink-900 text-pink-200 text-xs font-bold rounded-xl cursor-pointer transition border border-pink-700 shadow-md">
                      + 기준 사진 등록/변경
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            const r = new FileReader();
                            r.onload = (ev) => setI2iCustomImage(ev.target?.result as string);
                            r.readAsDataURL(f);
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div className="lg:col-span-6 p-4 bg-[#0A0F1D] rounded-2xl border border-pink-900/60 shadow-lg flex flex-col space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-pink-300">② 추출된 완벽한 나체 상태 (ControlNet 포즈용 베이스)</span>
                      <span className="text-[10px] bg-pink-900 text-pink-200 px-2 py-0.5 rounded font-bold">포즈 베이스</span>
                    </div>
                    <div className="flex-1 min-h-[380px] bg-black/60 rounded-xl overflow-hidden border border-pink-900/40 flex items-center justify-center">
                      {(() => {
                        const candList = (entryMode === 'project' && project.cuts.length > 0) ? currentCut.candidates : directCandidates;
                        const candIdx = (entryMode === 'project' && project.cuts.length > 0) ? currentCut.selectedCandidateIndex : directCandIdx;
                        const candActive = candList[candIdx];
                        return candActive && candActive.imagePath ? (
                          <img
                            src={candActive.imagePath}
                            alt="Undress Result"
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="text-center p-6 space-y-2 text-slate-600">
                            <div className="text-4xl">🧼</div>
                            <div className="text-xs font-bold text-pink-300">추출된 나체 베이스가 없습니다.</div>
                            <div className="text-[10px] text-slate-500">나체 이미지를 먼저 확보한 후 포즈를 변경하면 옷의 왜곡이 사라집니다.</div>
                          </div>
                        );
                      })()}
                    </div>
                    <button
                      disabled={isGenerating}
                      onClick={() => handleGenerateI2I('qwen-2512-gguf')}
                      className="w-full py-2.5 bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-pink-900/40 cursor-pointer disabled:opacity-50"
                    >
                      🧼 나체화 베이스 이미지 추출 실행
                    </button>
                  </div>
                </div>
              )}

              {/* [모드 6: 🔄 8방향 앵글 변환] */}
              {qwenMode === 'multi_angles' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  <div className="lg:col-span-5 p-4 bg-[#0A0F1D] rounded-2xl border border-purple-900/60 shadow-lg flex flex-col space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-purple-300">① 기준 인물 및 원하는 각도 선택</span>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-purple-300">카메라 앵글 및 시선 구도:</label>
                      <select
                        value={selectedAngleTag}
                        onChange={(e) => setSelectedAngleTag(e.target.value)}
                        className="w-full bg-[#0D131F] border border-purple-700/80 text-slate-200 p-2.5 rounded-lg text-xs font-mono focus:border-purple-500 shadow-inner"
                      >
                        <option value="<sks> front view eye-level shot medium shot">정면 아이레벨 미디엄 샷</option>
                        <option value="<sks> front view eye-level shot close-up">정면 아이레벨 클로즈업</option>
                        <option value="<sks> front-right quarter view elevated shot close-up">우측 45도 얼짱각도 클로즈업</option>
                        <option value="<sks> front-left quarter view elevated shot close-up">좌측 45도 얼짱각도 클로즈업</option>
                        <option value="<sks> front view elevated shot medium shot">약간 높은 앵글 미디엄 샷</option>
                        <option value="<sks> front view high-angle shot close-up">하이앵글 탑뷰 클로즈업</option>
                        <option value="<sks> profile side view eye-level shot medium shot">완전 측면 90도 프로필 샷</option>
                        <option value="<sks> back view eye-level shot medium shot">후면 뒷모습 샷</option>
                      </select>
                    </div>
                    <div className="flex-1 min-h-[320px] bg-black/60 rounded-xl overflow-hidden border border-purple-900/40 flex items-center justify-center">
                      {i2iCustomImage || (entryMode === 'project' ? currentCut.winnerImagePath : directWinner) ? (
                        <img
                          src={(i2iCustomImage || (entryMode === 'project' ? currentCut.winnerImagePath : directWinner))!}
                          alt="Angle Source"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="text-center p-4 space-y-2 text-slate-500">
                          <div className="text-3xl">🔄</div>
                          <div className="text-xs font-bold text-purple-300">기준 사진 등록 필요</div>
                        </div>
                      )}
                    </div>
                    <label className="text-center py-2 bg-purple-950/80 hover:bg-purple-900 text-purple-200 text-xs font-bold rounded-xl cursor-pointer transition border border-purple-700 shadow-md">
                      + 기준 사진 등록/변경
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            const r = new FileReader();
                            r.onload = (ev) => setI2iCustomImage(ev.target?.result as string);
                            r.readAsDataURL(f);
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div className="lg:col-span-7 p-4 bg-[#0A0F1D] rounded-2xl border border-purple-900/60 shadow-lg flex flex-col space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-purple-300">② 선택 앵글 변환 렌더링 결과</span>
                      <span className="text-[10px] bg-purple-900 text-purple-200 px-2 py-0.5 rounded font-mono">Angles LoRA</span>
                    </div>
                    <div className="flex-1 min-h-[380px] bg-black/60 rounded-xl overflow-hidden border border-purple-900/40 flex items-center justify-center">
                      {(() => {
                        const candList = (entryMode === 'project' && project.cuts.length > 0) ? currentCut.candidates : directCandidates;
                        const candIdx = (entryMode === 'project' && project.cuts.length > 0) ? currentCut.selectedCandidateIndex : directCandIdx;
                        const candActive = candList[candIdx];
                        return candActive && candActive.imagePath ? (
                          <img
                            src={candActive.imagePath}
                            alt="Angle Result"
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="text-center p-6 space-y-2 text-slate-600">
                            <div className="text-4xl">🔄</div>
                            <div className="text-xs font-bold text-purple-300">변환된 앵글 이미지가 없습니다.</div>
                          </div>
                        );
                      })()}
                    </div>
                    <button
                      disabled={isGenerating}
                      onClick={() => handleGenerateI2I('qwen-2512-gguf')}
                      className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-purple-900/40 cursor-pointer disabled:opacity-50"
                    >
                      🔄 선택된 카메라 앵글로 변환 렌더링 실행
                    </button>
                  </div>
                </div>
              )}

              {/* [모드 7: 🎨 단일 부위 보정 (Denoise Edit)] */}
              {qwenMode === 'single_edit' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  <div className="lg:col-span-5 p-4 bg-[#0A0F1D] rounded-2xl border border-slate-800 shadow-lg flex flex-col space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-300">① 원본 사진 & 변형 강도</span>
                      <span className="font-mono text-xs text-amber-200">Denoise: {i2iDenoise.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="0.95"
                      step="0.05"
                      value={i2iDenoise}
                      onChange={(e) => setI2iDenoise(parseFloat(e.target.value))}
                      className="w-full accent-purple-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                      <span>0.1 (미세 보정)</span>
                      <span>0.5 (중간 변형)</span>
                      <span>0.95 (완전 재창작)</span>
                    </div>

                    {/* Qwen-VL 부위 수정 지시문 입력창 */}
                    <div className="p-3 bg-[#080C14] rounded-xl border border-purple-900/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-purple-300 flex items-center space-x-1">
                          <span>✏️ Qwen-VL 수정 지시문</span>
                        </span>
                        <button
                          type="button"
                          disabled={isTranslating}
                          onClick={handleTranslateInstruction}
                          className="px-2.5 py-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-[10px] font-bold rounded-lg shadow-md transition flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                        >
                          <span>{isTranslating ? '⏳ 변환 중...' : '🌐 한글 ➔ 영문 자동 변환'}</span>
                        </button>
                      </div>
                      <input
                        type="text"
                        value={singleEditPrompt}
                        onChange={(e) => setSingleEditPrompt(e.target.value)}
                        placeholder="한글로 편하게 적으세요 (예: 웃는 표정으로 바꾸고, 선글라스 씌워줘)"
                        className="w-full bg-[#0D131F] border border-purple-700/80 text-slate-200 p-2.5 rounded-lg text-xs font-mono focus:border-purple-500 shadow-inner focus:outline-none placeholder:text-slate-500"
                      />
                      <div className="flex flex-wrap gap-1 pt-1">
                        <button
                          type="button"
                          onClick={() => setSingleEditPrompt('make her smile happily, joyful expression, keep everything else unchanged')}
                          className="px-2 py-0.5 bg-purple-950/70 hover:bg-purple-900 text-purple-300 text-[10px] rounded border border-purple-800/60 transition"
                        >
                          + 😊 미소 표정
                        </button>
                        <button
                          type="button"
                          onClick={() => setSingleEditPrompt('add stylish sunglasses on her face, keep everything else unchanged')}
                          className="px-2 py-0.5 bg-purple-950/70 hover:bg-purple-900 text-purple-300 text-[10px] rounded border border-purple-800/60 transition"
                        >
                          + 🕶️ 선글라스
                        </button>
                        <button
                          type="button"
                          onClick={() => setSingleEditPrompt('change hair color to natural brown, keep everything else unchanged')}
                          className="px-2 py-0.5 bg-purple-950/70 hover:bg-purple-900 text-purple-300 text-[10px] rounded border border-purple-800/60 transition"
                        >
                          + 💇 갈색 머리
                        </button>
                        <button
                          type="button"
                          onClick={() => setSingleEditPrompt('change background to modern luxury cafe interior, keep person and clothing unchanged')}
                          className="px-2 py-0.5 bg-purple-950/70 hover:bg-purple-900 text-purple-300 text-[10px] rounded border border-purple-800/60 transition"
                        >
                          + ☕ 카페 배경
                        </button>
                        <button
                          type="button"
                          onClick={() => setSingleEditPrompt('masterpiece, ultra-detailed skin texture, realistic lighting, keep everything else unchanged')}
                          className="px-2 py-0.5 bg-purple-950/70 hover:bg-purple-900 text-purple-300 text-[10px] rounded border border-purple-800/60 transition"
                        >
                          + ✨ 피부결 보정
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 min-h-[320px] bg-black/60 rounded-xl overflow-hidden border border-slate-700 flex items-center justify-center">
                      {i2iCustomImage || (entryMode === 'project' ? currentCut.winnerImagePath : directWinner) ? (
                        <img
                          src={(i2iCustomImage || (entryMode === 'project' ? currentCut.winnerImagePath : directWinner))!}
                          alt="I2I Base"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="text-center p-4 space-y-2 text-slate-500">
                          <div className="text-3xl">🎨</div>
                          <div className="text-xs font-bold text-purple-300">기준 사진 등록 필요</div>
                        </div>
                      )}
                    </div>
                    <label className="text-center py-2 bg-slate-800 hover:bg-slate-700 text-purple-300 text-xs font-bold rounded-xl cursor-pointer transition shadow-md">
                      + 기준 사진 불러오기
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            const r = new FileReader();
                            r.onload = (ev) => setI2iCustomImage(ev.target?.result as string);
                            r.readAsDataURL(f);
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div className="lg:col-span-7 p-4 bg-[#0A0F1D] rounded-2xl border border-slate-800 shadow-lg flex flex-col space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-purple-300">② 부위 보정 렌더링 결과</span>
                      <span className="text-[10px] bg-purple-950 text-purple-300 px-2 py-0.5 rounded border border-purple-800">Denoise Edit</span>
                    </div>
                    <div className="flex-1 min-h-[380px] bg-black/60 rounded-xl overflow-hidden border border-slate-700 flex items-center justify-center">
                      {(() => {
                        const candList = (entryMode === 'project' && project.cuts.length > 0) ? currentCut.candidates : directCandidates;
                        const candIdx = (entryMode === 'project' && project.cuts.length > 0) ? currentCut.selectedCandidateIndex : directCandIdx;
                        const candActive = candList[candIdx];
                        return candActive && candActive.imagePath ? (
                          <img
                            src={candActive.imagePath}
                            alt="Denoise Result"
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="text-center p-6 space-y-2 text-slate-600">
                            <div className="text-4xl">🎨</div>
                            <div className="text-xs font-bold text-purple-300">보정 결과물이 없습니다.</div>
                          </div>
                        );
                      })()}
                    </div>
                    <button
                      disabled={isGenerating}
                      onClick={() => handleGenerateI2I('qwen-2512-gguf')}
                      className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-purple-900/40 cursor-pointer disabled:opacity-50"
                    >
                      🎨 부위 보정 렌더링 실행
                    </button>
                  </div>
                </div>
              )}

              {/* 3. Candidate History & Winner Bar (하단 썸네일 스트립) */}
              {(() => {
                const candList = (entryMode === 'project' && project.cuts.length > 0) ? (currentCut.candidates || []) : (directCandidates || []);
                const candIdx = (entryMode === 'project' && project.cuts.length > 0) ? (currentCut.selectedCandidateIndex ?? 0) : (directCandIdx ?? 0);
                const candActive = candList[candIdx] || null;
                const isWinner = (entryMode === 'project' && project.cuts.length > 0)
                  ? currentCut.winnerImagePath === candActive?.imagePath
                  : directWinner === candActive?.imagePath;

                return candList.length > 0 ? (
                  <div className="pt-3 border-t border-purple-900/40 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-slate-300 font-mono">
                        생성 후보 이력 ({candIdx + 1} / {candList.length})
                      </span>
                      <div className="flex space-x-1.5">
                        {candList.map((c, idx) => (
                          <button
                            key={c.id || idx}
                            onClick={() => {
                              if (entryMode === 'project') {
                                onUpdateCut({ ...currentCut, selectedCandidateIndex: idx });
                              } else {
                                setDirectCandIdx(idx);
                              }
                            }}
                            className={`w-9 h-12 rounded-lg overflow-hidden border-2 transition ${idx === candIdx ? 'border-purple-500 scale-105 shadow-md' : 'border-slate-800 opacity-60 hover:opacity-100'
                              }`}
                          >
                            <img src={c.imagePath} alt="" className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        if (candActive) {
                          if (entryMode === 'project') {
                            onUpdateCut({ ...currentCut, winnerImagePath: candActive.imagePath });
                          } else {
                            setDirectWinner(candActive.imagePath);
                            alert('최종 확정본(Winner)으로 지정되었습니다.');
                          }
                        }
                      }}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-md ${isWinner ? 'bg-emerald-600 text-white' : 'bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white'
                        }`}
                    >
                      {isWinner ? '★ 최종 확정본 (winner.png)' : '✓ 현재 결과를 최종본으로 채택'}
                    </button>
                  </div>
                ) : null;
              })()}
            </div>
          ) : (
            /* ========================================================================= */
            /* 🚀 STANDARD CANDIDATE GALLERY CANVAS (FLUX / Z-IMAGE TURBO용 갤러리)     */
            /* ========================================================================= */
            <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-4 sticky top-4">
              {(() => {
                const candList = (entryMode === 'project' && project.cuts.length > 0) ? (currentCut.candidates || []) : (directCandidates || []);
                const candIdx = (entryMode === 'project' && project.cuts.length > 0) ? (currentCut.selectedCandidateIndex ?? 0) : (directCandIdx ?? 0);
                const candActive = candList[candIdx] || null;
                const isWinner = (entryMode === 'project' && project.cuts.length > 0)
                  ? currentCut.winnerImagePath === candActive?.imagePath
                  : directWinner === candActive?.imagePath;

                return (
                  <>
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                        생성 후보 갤러리 ({candList.length > 0 ? `${candIdx + 1} / ${candList.length}` : '0 / 0'})
                      </h3>
                      {candList.length > 1 && (
                        <button
                          onClick={() => {
                            if (entryMode === 'project') {
                              const winner = currentCut.candidates[currentCut.selectedCandidateIndex];
                              onUpdateCut({
                                ...currentCut,
                                candidates: winner ? [winner] : [],
                                selectedCandidateIndex: 0,
                              });
                            } else {
                              const winner = directCandidates[directCandIdx];
                              setDirectCandidates(winner ? [winner] : []);
                              setDirectCandIdx(0);
                            }
                          }}
                          className="text-[11px] text-rose-400 hover:text-rose-300 transition font-medium"
                        >
                          탈락 후보 일괄 정리
                        </button>
                      )}
                    </div>

                    {/* Responsive Aspect Ratio Preview Canvas */}
                    <div className={`relative w-full ${
                      aspectRatio === '16:9'
                        ? 'aspect-video max-h-[500px]'
                        : aspectRatio === '1:1'
                          ? 'aspect-square max-h-[560px]'
                          : 'aspect-[9/16] max-h-[640px]'
                    } bg-[#070A11] rounded-2xl border border-slate-800 flex items-center justify-center overflow-hidden mx-auto shadow-2xl transition-all duration-300`}>
                      {candActive && candActive.imagePath ? (
                        <div className="w-full h-full relative group">
                          <img
                            src={candActive.imagePath}
                            alt={candActive.engine}
                            className="w-full h-full object-contain"
                          />
                          <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none">
                            <span className="px-2.5 py-1 bg-black/80 text-indigo-300 font-mono text-[10px] font-bold rounded-md backdrop-blur-sm border border-indigo-900/50">
                              {candActive.engine} (Seed: {candActive.seed})
                            </span>
                            {isWinner && (
                              <span className="px-2.5 py-1 bg-emerald-600 text-white font-bold text-[10px] rounded-md shadow-lg">
                                ★ 최종 확정본 (winner.png)
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="text-slate-600 text-xs text-center p-6 space-y-2">
                          <div className="text-4xl">🖼️</div>
                          <div className="font-bold text-slate-400">아직 생성된 이미지가 없습니다.</div>
                          <div className="text-[10px] text-slate-500">[2D 실사 이미지 렌더링 실행] 버튼을 누르세요.</div>
                        </div>
                      )}
                    </div>

                    {/* Candidate Navigation & Winner Confirmation Controls */}
                    {candList.length > 0 && (
                      <div className="flex items-center justify-between pt-1">
                        <div className="flex space-x-2">
                          <button
                            disabled={candIdx === 0}
                            onClick={() => {
                              if (entryMode === 'project') {
                                onUpdateCut({
                                  ...currentCut,
                                  selectedCandidateIndex: currentCut.selectedCandidateIndex - 1,
                                });
                              } else {
                                setDirectCandIdx(directCandIdx - 1);
                              }
                            }}
                            className="px-3 py-1.5 bg-slate-800 disabled:opacity-30 text-slate-200 rounded-lg text-xs font-bold transition"
                          >
                            &larr; 이전
                          </button>
                          <button
                            disabled={candIdx === candList.length - 1}
                            onClick={() => {
                              if (entryMode === 'project') {
                                onUpdateCut({
                                  ...currentCut,
                                  selectedCandidateIndex: currentCut.selectedCandidateIndex + 1,
                                });
                              } else {
                                setDirectCandIdx(directCandIdx + 1);
                              }
                            }}
                            className="px-3 py-1.5 bg-slate-800 disabled:opacity-30 text-slate-200 rounded-lg text-xs font-bold transition"
                          >
                            다음 &rarr;
                          </button>
                        </div>

                        <button
                          onClick={() => {
                            const cand = candList[candIdx];
                            if (cand) {
                              if (entryMode === 'project') {
                                onUpdateCut({ ...currentCut, winnerImagePath: cand.imagePath });
                              } else {
                                setDirectWinner(cand.imagePath);
                                alert('단독 확정 이미지(Winner)로 채택되었습니다.');
                              }
                            }
                          }}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition shadow-md shadow-emerald-900/30"
                        >
                          ✓ 이 이미지를 최종 확정본 (winner.png)으로 채택
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Sequence Filmstrip Contact Sheet (영상화 전 필수 연속성 검수) */}
      <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
              🎬 전체 시퀀스 필름스트립 (Sequence Contact Sheet)
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
              확정 완료: {(project.cuts || []).filter((c) => c && c.winnerImagePath).length} / {(project.cuts || []).length} 컷
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            컷 간 조명/인물 연속성 점검 ➔ 클릭 시 해당 컷으로 즉시 이동
          </span>
        </div>

        <div className="flex space-x-3 overflow-x-auto py-2 pr-2">
          {(project.cuts || []).map((cut, idx) => {
            if (!cut) return null;
            const isCurrent = cut.id === currentCut.id;
            return (
              <div
                key={cut.id}
                onClick={() => setSelectedCutId(cut.id)}
                className={`w-28 shrink-0 rounded-xl border cursor-pointer transition overflow-hidden bg-[#070A11] flex flex-col justify-between ${isCurrent
                  ? 'border-indigo-500 ring-2 ring-indigo-500/50 shadow-lg'
                  : 'border-slate-800 hover:border-slate-700'
                  }`}
              >
                <div className="p-1.5 flex items-center justify-between bg-[#0B101D] border-b border-slate-800/80">
                  <span className="text-[10px] font-mono font-bold text-slate-300">
                    #{idx + 1} {cut.id}
                  </span>
                  {cut.winnerImagePath ? (
                    <span className="text-[9px] text-emerald-400 font-bold">✓ 확정</span>
                  ) : (
                    <span className="text-[9px] text-slate-500">미완료</span>
                  )}
                </div>

                <div className="w-full aspect-[9/16] bg-[#05080E] flex items-center justify-center overflow-hidden">
                  {cut.winnerImagePath ? (
                    <img src={cut.winnerImagePath} alt={cut.id} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-slate-600 text-xs">미생성</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
