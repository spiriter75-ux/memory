import React, { useState, useEffect } from 'react';
import { ProjectMaster, StoryboardCut, STUDIO_SLOT_DEFINITIONS, SlotKey, ReferenceSlots, ActiveLoRA } from '../../types';
import { workflowRegistry } from '../../services/workflowRegistry';
import { comfyClient } from '../../services/comfyClient';
import { aiDirectorService } from '../../services/aiDirectorService';

interface Tab4Props {
  project: ProjectMaster;
  onUpdateCut: (updatedCut: StoryboardCut) => void;
  onUpdateCuts?: (updatedCuts: StoryboardCut[]) => void;
  onNextTab: () => void;
}

// H3 공식 17프레임 단위 시간 압축 프레임 계산기
export function calculateH3Frames(seconds: number): number {
  const base = Math.max(5, Math.round(seconds * 24));
  const rem = base % 17;
  const add = (5 - rem + 17) % 17;
  return base + add;
}

// H3 화면 비율 및 화질별 동적 해상도 계산기
export function getH3Resolution(
  aspectRatio: '9:16' | '16:9' | '1:1',
  tier: '0.2MP' | '0.5MP' | '1080p'
): { width: number; height: number; text: string } {
  if (tier === '1080p') {
    if (aspectRatio === '9:16') return { width: 1080, height: 1920, text: '1080×1920' };
    if (aspectRatio === '16:9') return { width: 1920, height: 1080, text: '1920×1080' };
    return { width: 1080, height: 1080, text: '1080×1080' };
  }
  if (tier === '0.5MP') {
    if (aspectRatio === '9:16') return { width: 544, height: 960, text: '544×960' };
    if (aspectRatio === '16:9') return { width: 960, height: 544, text: '960×544' };
    return { width: 768, height: 768, text: '768×768' };
  }
  // 0.2MP 초경량 고속 초안
  if (aspectRatio === '16:9') return { width: 608, height: 352, text: '608×352' };
  if (aspectRatio === '1:1') return { width: 448, height: 448, text: '448×448' };
  return { width: 352, height: 608, text: '352×608' };
}

// 비디오 URL 또는 파일에서 지정된 오프셋의 프레임을 무손실 PNG DataURL로 캡처 (블러 방지 다중 오프셋 지원)
export async function extractFrameFromVideoUrl(videoUrl: string, offsetSeconds: number = 0.05): Promise<string> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.src = videoUrl;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    let isDone = false;
    const finish = (result: string) => {
      if (!isDone) {
        isDone = true;
        resolve(result);
      }
    };

    const timer = setTimeout(() => {
      finish(videoUrl);
    }, 3000);

    video.onloadedmetadata = () => {
      const dur = video.duration || 1;
      video.currentTime = Math.max(0, dur - offsetSeconds);
    };

    video.onseeked = () => {
      try {
        clearTimeout(timer);
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 544;
        canvas.height = video.videoHeight || 960;
        const ctx = canvas.getContext('2d');
        if (!ctx) return finish(videoUrl);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/png');
        finish(dataUrl);
      } catch {
        finish(videoUrl);
      }
    };

    video.onerror = () => {
      clearTimeout(timer);
      finish(videoUrl);
    };
  });
}

export const Tab4VideoStudio: React.FC<Tab4Props> = ({ project, onUpdateCut, onUpdateCuts, onNextTab }) => {
  // 진입 모드: 컷이 없으면 자동으로 'direct' 모드로 안전 전환하여 업로드 손실 방지
  const isDirectMode = new URLSearchParams(window.location.search).get('mode') === 'direct' || project.cuts.length === 0;
  const [entryMode, setEntryMode] = useState<'project' | 'direct'>(isDirectMode ? 'direct' : 'project');
  const [selectedCutId, setSelectedCutId] = useState<string>(project.cuts[0]?.id || '');
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [renderProgress, setRenderProgress] = useState<string>('');

  // 비디오 생성 모드: T2V (순수 텍스트) vs I2V (단일 이미지) vs FL2V (시작+종료 2장) vs REF2VA (9대 전용 라벨 멀티모달) vs LONG_RELAY (롱샷 -1프레임 무한 릴레이)
  const [videoMode, setVideoMode] = useState<'t2v' | 'i2v' | 'fl2v' | 'ref2va' | 'long_relay'>('i2v');
  const [rawKoreanPrompt, setRawKoreanPrompt] = useState<string>('');
  const [isExpandingPrompt, setIsExpandingPrompt] = useState<boolean>(false);
  const [t2vPrompt, setT2vPrompt] = useState<string>('');
  const [directI2vPrompt, setDirectI2vPrompt] = useState<string>('');
  const [directFl2vPrompt, setDirectFl2vPrompt] = useState<string>('');
  const [directRefPrompt, setDirectRefPrompt] = useState<string>('');
  const [longRelayPrompt, setLongRelayPrompt] = useState<string>('');

  // 롱샷 -1프레임 릴레이 & 만능 앵커 허브 전용 상태들
  const [relaySubMode, setRelaySubMode] = useState<'pure_i2v' | 'ref2va_anchor'>('pure_i2v');
  const [relayAnchorSource, setRelayAnchorSource] = useState<'prev_clip' | 'other_cut' | 'external_file'>('prev_clip');
  const [relaySelectedCutIdx, setRelaySelectedCutIdx] = useState<number>(0);
  const [relayExtVideoUrl, setRelayExtVideoUrl] = useState<string | null>(null);
  const [relayClips, setRelayClips] = useState<Array<{ id: string; videoUrl: string; lastFrameUrl: string; duration: number }>>([]);
  const [currentRelayBaseFrame, setCurrentRelayBaseFrame] = useState<string | null>(null);
  const [relayOffsetSeconds, setRelayOffsetSeconds] = useState<number>(0.05); // 0.05s (-1F), 0.20s (-5F), 0.40s (-10F)

  // 단독 비디오 렌더링용 상태
  const [directCustomImage, setDirectCustomImage] = useState<string | null>(null);
  const [directDraftVideo, setDirectDraftVideo] = useState<string | null>(null);
  const [directUpscaledVideo, setDirectUpscaledVideo] = useState<string | null>(null);
  const [directDuration, setDirectDuration] = useState<number>(5);

  // ★ 플레이어 즉시 실시간 반영 및 탭 전환용 활성 비디오 상태
  const [activePreviewVideo, setActivePreviewVideo] = useState<string | null>(null);
  const [activeVideoType, setActiveVideoType] = useState<'draft' | 'upscale' | 'relay'>('draft');

  // 시드(Seed) 제어 상태
  const [seed, setSeed] = useState<number>(() => Math.floor(Math.random() * 1000000000));
  const [isRandomSeed, setIsRandomSeed] = useState<boolean>(true);

  // 화면 비율 상태: 9:16 (세로 쇼츠) vs 16:9 (가로 유튜브) vs 1:1 (정방형)
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9' | '1:1'>('9:16');

  // 해상도 티어 상태: 0.2MP (초고속 초안) vs 0.5MP (표준 고화질)
  const [resolutionTier, setResolutionTier] = useState<'0.2MP' | '0.5MP'>('0.2MP');

  // FL2V용 종료 프레임 상태
  const [fl2vLastFrame, setFl2vLastFrame] = useState<string | null>(null);

  // H3 텍스트/비전 렌더링 인코더: Qwen3-VL 32B Heretic (무검열 H3 정격) 단일 고정
  const [h3ClipModel] = useState<string>('qwen3vl_32b_heretic_minimax_h3_nvfp4.safetensors');

  // H3 전용 LoRA 모델 목록 및 N개 무제한 다중 LoRA 상태 (localStorage 영속화 지원)
  const [availableLoRAs, setAvailableLoRAs] = useState<string[]>([
    'minimaxh3\\Dialectical love-I2V Minimax H3 nsfw sex lora.safetensors',
    'minimaxh3\\hmpussy_v6_epoch30.safetensors',
  ]);

  useEffect(() => {
    const loadLoRAs = async () => {
      try {
        const loras = await comfyClient.getAvailableLoRAs();
        if (loras && loras.length > 0) {
          const h3Loras = loras.filter((l) => {
            if (l === 'None') return false;
            const lower = l.toLowerCase();
            return lower.includes('minimax') || lower.includes('h3');
          });
          if (h3Loras.length > 0) {
            setAvailableLoRAs(h3Loras);
          } else {
            setAvailableLoRAs(loras.filter((l) => l !== 'None'));
          }
        }
      } catch (err) {
        console.warn('ComfyUI H3 LoRA 목록 조회 실패 (기본값 유지):', err);
      }
    };
    loadLoRAs();
  }, []);
  const [directActiveLoras, setDirectActiveLoras] = useState<ActiveLoRA[]>(() => {
    try {
      const saved = localStorage.getItem('openshorts_v2_direct_video_loras');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 9대 멀티모달 참조 슬롯 상태
  const [directSlots, setDirectSlots] = useState<ReferenceSlots>({
    bg: null,
    face: null,
    face_b: null,
    wardrobe: null,
    pose: null,
    prop_1: null,
    vehicle: null,
    prop_2: null,
    style: null,
  });

  const currentCut = (entryMode === 'project' && project.cuts.find((c) => c.id === selectedCutId)) || project.cuts[0] || {
    id: 'CUT_STANDALONE',
    cutNumber: 0,
    originalText: '단독 비디오 생성 모드',
    dialogueText: null,
    assembledPrompt: '',
    selectedUnetModelId: 'krea-2-turbo-v2',
    candidates: [],
    selectedCandidateIndex: 0,
    winnerImagePath: directCustomImage,
    videoDurationSeconds: directDuration,
    slots: directSlots,
    actingState: '',
    actionPose: '',
    cameraWeatherMod: '',
    selectedCharacterId: null,
    selectedWardrobeId: null,
    selectedLandmarkId: null,
    activeLoras: [],
    selectedLoRAName: null,
    selectedLoRAStrength: 0.8,
    draftVideoPath: directDraftVideo,
    upscaledVideoPath: directUpscaledVideo,
    videoRenderStatus: 'idle',
    errorMessage: null,
  };

  // 에셋 퀵 서랍장 (Asset Drawer) 모달 타겟 상태
  const [assetDrawerTarget, setAssetDrawerTarget] = useState<'picture1' | 'picture2' | SlotKey | 'relayBase' | null>(null);

  // 프로젝트 전체에서 사용 가능한 이미지 목록 수집 (스토리보드 확정본 + 후보군 + 캐릭터 바이블)
  const availableProjectAssets = React.useMemo(() => {
    const assets: Array<{ id: string; label: string; url: string; source: 'storyboard' | 'character' }> = [];

    // 1. 캐릭터 바이블 이미지
    project.characters?.forEach(c => {
      if (c.refImagePath) {
        assets.push({ id: `char-${c.id}`, label: `인물: ${c.name}`, url: c.refImagePath, source: 'character' });
      }
    });

    // 2. 스토리보드 컷 이미지들
    project.cuts?.forEach(cut => {
      if (cut.winnerImagePath) {
        assets.push({ id: `cut-winner-${cut.id}`, label: `${cut.id} (확정본)`, url: cut.winnerImagePath, source: 'storyboard' });
      }
      cut.candidates?.forEach((cand, idx) => {
        if (cand.imagePath && cand.imagePath !== cut.winnerImagePath) {
          assets.push({ id: `cut-cand-${cut.id}-${idx}`, label: `${cut.id} (후보 ${idx + 1})`, url: cand.imagePath, source: 'storyboard' });
        }
      });
    });

    return assets;
  }, [project]);

  // 비디오 로컬 / API URL 안전 정규화 헬퍼
  const resolveVideoUrl = (path: string | null | undefined): string | null => {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:') || path.startsWith('data:')) {
      return path;
    }
    if (path.startsWith('/')) {
      return `http://127.0.0.1:8288${path}`;
    }
    return `http://127.0.0.1:8288/view?filename=${encodeURIComponent(path)}`;
  };

  const handleSelectDrawerAsset = (imageUrl: string) => {
    if (!assetDrawerTarget) return;

    if (assetDrawerTarget === 'picture1') {
      setDirectCustomImage(imageUrl);
      if (currentCut && project.cuts.length > 0) onUpdateCut({ ...currentCut, winnerImagePath: imageUrl });
    } else if (assetDrawerTarget === 'picture2') {
      setFl2vLastFrame(imageUrl);
    } else if (assetDrawerTarget === 'relayBase') {
      setCurrentRelayBaseFrame(imageUrl);
      setDirectCustomImage(imageUrl);
    } else {
      // SlotKey (S1 ~ S9)
      const slotKey = assetDrawerTarget as SlotKey;
      setDirectSlots(prev => ({ ...prev, [slotKey]: imageUrl }));
      if (currentCut && project.cuts.length > 0) {
        onUpdateCut({
          ...currentCut,
          slots: {
            ...currentCut.slots,
            [slotKey]: imageUrl,
          }
        });
      }
    }
    setAssetDrawerTarget(null);
  };

  useEffect(() => {
    comfyClient.getAvailableLoRAs().then((loras) => {
      if (loras && loras.length > 0) {
        const videoLoras = loras.filter((l) => l.toLowerCase().includes('minimax') || l.toLowerCase().includes('h3'));
        if (videoLoras.length > 0) {
          setAvailableLoRAs(videoLoras);
        }
      }
    });
  }, []);

  // 1단계(대본) 및 컷 연출 정보 기반 비디오 한국어 연출 지문 자동 합성 헬퍼
  const getSynthesizedKoreanPrompt = (cut: StoryboardCut): string => {
    if (cut.videoKoreanPrompt && cut.videoKoreanPrompt.trim()) {
      return cut.videoKoreanPrompt;
    }
    const parts: string[] = [];
    if (cut.actionPose && cut.actionPose.trim() && cut.actionPose !== 'standing naturally, eye-level cinematic shot') {
      parts.push(`[동작] ${cut.actionPose}`);
    }
    if (cut.actingState && cut.actingState.trim() && !cut.actingState.includes('focused expression')) {
      parts.push(`[연기] ${cut.actingState}`);
    }
    if (cut.cameraWeatherMod && cut.cameraWeatherMod.trim() && cut.cameraWeatherMod !== 'cinematic lighting, clear atmosphere') {
      parts.push(`[카메라] ${cut.cameraWeatherMod}`);
    }
    if (cut.dialogueText && cut.dialogueText.trim()) {
      parts.push(`[대사] "${cut.dialogueText}"`);
    }
    if (parts.length > 0) {
      return parts.join(' | ');
    }
    return cut.originalText || '';
  };

  // 컷 선택 또는 모드 전환 시 활성 비디오 플레이어 및 프롬프트 동기화 (2D 이미지 프롬프트 침범 원천 차단)
  useEffect(() => {
    if (entryMode === 'project' && currentCut) {
      // 1. 비디오 플레이어 프리뷰 동기화
      if (currentCut.upscaledVideoPath) {
        setActivePreviewVideo(resolveVideoUrl(currentCut.upscaledVideoPath));
        setActiveVideoType('upscale');
      } else if (currentCut.draftVideoPath) {
        setActivePreviewVideo(resolveVideoUrl(currentCut.draftVideoPath));
        setActiveVideoType('draft');
      } else {
        setActivePreviewVideo(null);
      }

      // 2. 한국어 연출 지문 (1단계 데이터 기반 자동 연동)
      setRawKoreanPrompt(getSynthesizedKoreanPrompt(currentCut));

      // 3. 비디오 H3 공식 영문 프롬프트 (2D 이미지 프롬프트인 assembledPrompt는 절대 넣지 않음!)
      const vPrompt = currentCut.videoPrompt || '';
      setDirectI2vPrompt(vPrompt);
      setDirectFl2vPrompt(vPrompt);
      setDirectRefPrompt(vPrompt);
      setT2vPrompt(vPrompt);
      setLongRelayPrompt(vPrompt);

      // 4. 시작 프레임 이미지 동기화
      if (currentCut.winnerImagePath || currentCut.candidates?.[0]?.imagePath) {
        setDirectCustomImage(currentCut.winnerImagePath || currentCut.candidates?.[0]?.imagePath || null);
      }
    } else {
      if (directUpscaledVideo) {
        setActivePreviewVideo(resolveVideoUrl(directUpscaledVideo));
        setActiveVideoType('upscale');
      } else if (directDraftVideo) {
        setActivePreviewVideo(resolveVideoUrl(directDraftVideo));
        setActiveVideoType('draft');
      } else {
        setActivePreviewVideo(null);
      }
    }
  }, [selectedCutId, entryMode, directUpscaledVideo, directDraftVideo]);

  // N개 무제한 LoRA 체인 관리 함수 (영구 보존 및 프로젝트 동기화)
  const activeLorasToUse: ActiveLoRA[] = entryMode === 'project'
    ? (currentCut.activeLoras || (currentCut.selectedLoRAName ? [{ id: 'init_lora', name: currentCut.selectedLoRAName, strength: currentCut.selectedLoRAStrength ?? 1.0 }] : []))
    : directActiveLoras;

  const handleAddLoRA = () => {
    const defaultName = availableLoRAs[0] || 'minimaxh3\\Dialectical love-I2V Minimax H3 nsfw sex lora.safetensors';
    const newLoRA: ActiveLoRA = {
      id: `lora_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name: defaultName,
      strength: 0.8,
    };
    if (entryMode === 'project') {
      const updated = [...(currentCut.activeLoras || []), newLoRA];
      onUpdateCut({
        ...currentCut,
        activeLoras: updated,
        selectedLoRAName: updated[0]?.name || null,
        selectedLoRAStrength: updated[0]?.strength || 0.8,
      });
    } else {
      setDirectActiveLoras((prev) => [...prev, newLoRA]);
    }
  };

  const handleUpdateLoRA = (id: string, updates: Partial<ActiveLoRA>) => {
    if (entryMode === 'project') {
      const updated = (currentCut.activeLoras || []).map((l) => (l.id === id ? { ...l, ...updates } : l));
      onUpdateCut({
        ...currentCut,
        activeLoras: updated,
        selectedLoRAName: updated[0]?.name || null,
        selectedLoRAStrength: updated[0]?.strength || 0.8,
      });
    } else {
      setDirectActiveLoras((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)));
    }
  };

  const handleRemoveLoRA = (id: string) => {
    if (entryMode === 'project') {
      const updated = (currentCut.activeLoras || []).filter((l) => l.id !== id);
      onUpdateCut({
        ...currentCut,
        activeLoras: updated,
        selectedLoRAName: updated[0]?.name || null,
        selectedLoRAStrength: updated[0]?.strength || 0.8,
      });
    } else {
      setDirectActiveLoras((prev) => prev.filter((l) => l.id !== id));
    }
  };

  // 현재 설정된 LoRA 목록을 전체 컷에 영구 일괄 적용
  const handleApplyLoRAsToAllCuts = () => {
    if (!project.cuts || project.cuts.length === 0) {
      alert('일괄 적용할 프로젝트 컷이 없습니다.');
      return;
    }
    const currentLoras = activeLorasToUse;
    if (onUpdateCuts) {
      const updatedCuts = project.cuts.map((c) => ({
        ...c,
        activeLoras: [...currentLoras],
        selectedLoRAName: currentLoras[0]?.name || null,
        selectedLoRAStrength: currentLoras[0]?.strength || 1.0,
      }));
      onUpdateCuts(updatedCuts);
      alert(`✅ 현재 LoRA 체인(${currentLoras.length}개)이 프로젝트 전체(${project.cuts.length}개 컷)에 일괄 저장되었습니다!`);
    }
  };

  // 현재 활성화된 슬롯 객체 (소설 연계 모드 vs 단독 모드)
  const activeSlots = (entryMode === 'project' && project.cuts.length > 0) ? (currentCut?.slots || directSlots) : directSlots;
  const activeSlotsCount = Object.values(activeSlots || {}).filter(Boolean).length;

  const firstFramePath = (entryMode === 'project' && project.cuts.length > 0)
    ? (currentCut.winnerImagePath || (currentCut.candidates?.[0]?.imagePath ?? null))
    : directCustomImage;

  const handleSlotImageUpload = (e: React.ChangeEvent<HTMLInputElement>, slotKey: SlotKey) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (entryMode === 'project' && project.cuts.length > 0) {
        onUpdateCut({
          ...currentCut,
          slots: {
            ...currentCut.slots,
            [slotKey]: dataUrl,
          },
        });
      }
      setDirectSlots((prev) => ({
        ...prev,
        [slotKey]: dataUrl,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSlotImageDelete = (slotKey: SlotKey) => {
    setDirectSlots((prev) => ({
      ...prev,
      [slotKey]: null,
    }));

    if (entryMode === 'project' && project.cuts.length > 0 && currentCut) {
      onUpdateCut({
        ...currentCut,
        slots: {
          ...currentCut.slots,
          [slotKey]: null,
        },
      });
    }
  };

  const handleI2VImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (entryMode === 'project' && project.cuts.length > 0) {
        onUpdateCut({ ...currentCut, winnerImagePath: dataUrl });
      }
      setDirectCustomImage(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleI2VImageDelete = () => {
    setDirectCustomImage(null);
    if (entryMode === 'project' && project.cuts.length > 0 && currentCut) {
      onUpdateCut({ ...currentCut, winnerImagePath: null });
    }
  };

  // ★ Gemma 4 Heretic 무검열 LLM H3 프롬프트 자동 변환 핸들러
  const handleExpandPromptWithLLM = async (targetMode: 't2v' | 'i2v' | 'fl2v' | 'ref2va' | 'long_relay') => {
    const inputText = rawKoreanPrompt.trim() || currentCut.originalText || '';
    if (!inputText) {
      alert('먼저 1번에 한국어 연출 지문이나 아이디어를 입력하세요.');
      return;
    }

    setIsExpandingPrompt(true);
    try {
      const expanded = await aiDirectorService.expandH3PromptWithLLM({
        inputNovelText: inputText,
        dialogue: currentCut.dialogueText || undefined,
        modelName: 'gemma-4-12B-it-heretic-QAT-UD-Q4_K_XL.gguf',
        mode: targetMode,
        durationSeconds: currentCut.videoDurationSeconds,
      });

      if (targetMode === 't2v') {
        setT2vPrompt(expanded);
      } else if (targetMode === 'i2v') {
        setDirectI2vPrompt(expanded);
      } else if (targetMode === 'fl2v') {
        setDirectFl2vPrompt(expanded);
      } else if (targetMode === 'ref2va') {
        setDirectRefPrompt(expanded);
      } else if (targetMode === 'long_relay') {
        setLongRelayPrompt(expanded);
      }

      // ★ 3단계 2D 이미지 프롬프트(assembledPrompt)를 절대 덮어쓰지 않고 비디오 전용(videoPrompt)에 영구 저장!
      if (entryMode === 'project' && project.cuts.length > 0) {
        onUpdateCut({
          ...currentCut,
          videoPrompt: expanded,
          videoKoreanPrompt: inputText,
        });
      }
    } catch (err: unknown) {
      alert(`프롬프트 변환 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsExpandingPrompt(false);
    }
  };

  // 1단계: 0.2MP 초경량 초안 렌더링 (352x608)
  const handleRenderDraft = async () => {
    const currentDuration = entryMode === 'project' ? currentCut.videoDurationSeconds : directDuration;
    const durationFrames = calculateH3Frames(currentDuration);
    const activeSeed = isRandomSeed ? Math.floor(Math.random() * 1000000000) : seed;

    const lorasPayload = activeLorasToUse.map((l) => ({ name: l.name, strength: l.strength }));

    if (!firstFramePath && (videoMode === 'i2v' || videoMode === 'fl2v')) {
      alert('먼저 [탭 3. 스토리보드 Studio]에서 2D 컷 이미지를 확정(Winner)하거나 시작 프레임을 등록해야 합니다.');
      return;
    }

    // FL2V 유효성 검사를 setIsRendering(true) 호출 전에 실행하여 렌더링 잠금 방지
    if (videoMode === 'fl2v' && !fl2vLastFrame) {
      alert('FL2V 모드는 시작 프레임과 종료 프레임(2장)이 모두 필요합니다.');
      return;
    }

    setIsRendering(true);
    setRenderProgress(`[${videoMode.toUpperCase()} 1단계] ${resolutionTier} 렌더링 준비 중 (${currentDuration}초 / ${durationFrames}프레임 / ${aspectRatio})...`);

    try {
      await comfyClient.freeMemory();

      let payload: Record<string, unknown>;

      if (videoMode === 't2v') {
        const textToUse = (t2vPrompt || (entryMode === 'project' ? currentCut.videoPrompt : '') || '').trim()
          || currentCut.originalText
          || 'Cinematic video scene with natural movement and atmospheric lighting';

        payload = workflowRegistry.buildH3T2VVideoWorkflow({
          prompt: textToUse,
          seed: activeSeed,
          durationFrames,
          clipName: h3ClipModel,
          aspectRatio,
          resolutionTier,
          loras: lorasPayload,
        });
      } else if (videoMode === 'fl2v') {
        const lastFrameToUse = fl2vLastFrame!; // 이미 위에서 유효성 검사 완료

        setRenderProgress(`시작/종료 2장 이미지 ComfyUI 등록 중...`);
        const [uploadedFirst, uploadedLast] = await Promise.all([
          comfyClient.uploadImage(firstFramePath!),
          comfyClient.uploadImage(lastFrameToUse),
        ]);

        const textToUse = (directFl2vPrompt || (entryMode === 'project' ? currentCut.videoPrompt : '') || '').trim()
          || `How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the ${(currentCut.videoDurationSeconds || 5).toFixed(2)}-second mark of the target video.\n\nCinematic smooth interpolation between frames, natural motion.`;

        payload = workflowRegistry.buildH3FL2VVideoWorkflow({
          firstFramePath: uploadedFirst,
          lastFramePath: uploadedLast,
          prompt: textToUse,
          seed: activeSeed,
          durationFrames,
          clipName: h3ClipModel,
          aspectRatio,
          resolutionTier,
          loras: lorasPayload,
        });
      } else if (videoMode === 'ref2va') {
        const activeSlotImages: string[] = [];
        if (firstFramePath) activeSlotImages.push(firstFramePath);
        Object.entries(activeSlots).forEach(([, path]) => {
          if (path && !activeSlotImages.includes(path)) {
            activeSlotImages.push(path);
          }
        });

        if (activeSlotImages.length === 0) {
          alert('REF2VA 모드는 참조할 에셋 이미지가 최소 1장 이상 등록되어 있어야 합니다.');
          return;
        }

        setRenderProgress(`멀티모달 에셋 ${activeSlotImages.length}개 ComfyUI 등록 중...`);
        const uploadedRefs = await Promise.all(
          activeSlotImages.map((img) => comfyClient.uploadImage(img))
        );

        const textToUse = (directRefPrompt || (entryMode === 'project' ? currentCut.videoPrompt : '') || '').trim()
          || `subject_definitions:\n<Picture 1> is the starting frame anchor.\n\nsummary:\nReference-guided cinematic video generation.\n\nretention_analysis:\n<Picture 1>: fully_preserved.\n\ndetailed_description:\n[Shot 1] The scene opens on <Picture 1>. Smooth camera movement and natural character performance.\n\noverall_soundscape:\nAmbient soundscape.\n\nnon_diegetic_music:\nN/A`;

        if (uploadedRefs.length === 1) {
          // REF2VA 모드인데 등록된 참조가 1장뿐이면 I2V (단일 이미지 영상화) 모드로 자동 전환하여 에러 방지
          setRenderProgress(`REF2VA 1장 모드 감지 ➔ I2V 모드로 자동 전환하여 연산 시작...`);
          payload = workflowRegistry.buildH3DraftVideoWorkflow({
            firstFramePath: uploadedRefs[0],
            prompt: textToUse,
            seed: activeSeed,
            durationFrames,
            clipName: h3ClipModel,
            aspectRatio,
            resolutionTier,
            loras: lorasPayload,
          });
        } else {
          payload = workflowRegistry.buildH3Ref2vaVideoWorkflow({
            refImages: uploadedRefs,
            prompt: textToUse,
            seed: activeSeed,
            durationFrames,
            clipName: h3ClipModel,
            aspectRatio,
            resolutionTier,
            loras: lorasPayload,
          });
        }
      } else if (videoMode === 'long_relay') {
        const relayAnchorToUse = currentRelayBaseFrame || firstFramePath;
        if (!relayAnchorToUse) {
          alert('롱샷 릴레이를 시작하기 위한 기준 앵커 프레임이 필요합니다. [시작 프레임 등록]을 확인하세요.');
          return;
        }

        setRenderProgress(`릴레이 앵커 프레임 ComfyUI 등록 중...`);
        const uploadedAnchor = await comfyClient.uploadImage(relayAnchorToUse);
        const textToUse = (longRelayPrompt || (entryMode === 'project' ? currentCut.videoPrompt : '') || '').trim()
          || `For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.\n\nintegrated_multimodal_description: [Shot 1] Seamless continuous shot, camera smoothly tracking forward with natural pacing.\noverall_soundscape: natural room ambience.\nnon_diegetic_music: N/A`;

        if (relaySubMode === 'pure_i2v') {
          // [모드 1] 순수 I2V 릴레이 ➔ FL2VA 전용 모델 사용!
          setRenderProgress(`[순수 I2V 롱샷] FL2VA 전용 모델로 릴레이 연산 시작...`);
          payload = workflowRegistry.buildH3DraftVideoWorkflow({
            firstFramePath: uploadedAnchor,
            prompt: textToUse,
            seed: activeSeed,
            durationFrames,
            clipName: h3ClipModel,
            aspectRatio,
            resolutionTier,
            loras: lorasPayload,
          });
        } else {
          // [모드 2] 정밀 참조 릴레이 ➔ REF2VA 전용 모델 사용!
          const activeSlotImages: string[] = [uploadedAnchor];
          Object.entries(activeSlots).forEach(([, path]) => {
            if (path && !activeSlotImages.includes(path)) {
              activeSlotImages.push(path);
            }
          });

          setRenderProgress(`[정밀 다중참조 롱샷] REF2VA 전용 모델로 ${activeSlotImages.length}개 앵커 결합 연산 시작...`);
          const uploadedRefs = await Promise.all(
            activeSlotImages.map((img) => comfyClient.uploadImage(img))
          );

          payload = workflowRegistry.buildH3Ref2vaVideoWorkflow({
            refImages: uploadedRefs,
            prompt: textToUse,
            seed: activeSeed,
            durationFrames,
            clipName: h3ClipModel,
            aspectRatio,
            resolutionTier,
            loras: lorasPayload,
          });
        }
      } else {
        // I2V (단일 이미지 영상화)
        setRenderProgress(`Winner 이미지 ComfyUI 등록 중...`);
        const uploadedFirst = await comfyClient.uploadImage(firstFramePath!);

        const textToUse = (directI2vPrompt || (entryMode === 'project' ? currentCut.videoPrompt : '') || '').trim()
          || `For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.\n\nintegrated_multimodal_description: [Shot 1] Cinematic camera movement with natural character performance and subtle emotional expression.\noverall_soundscape: natural cinematic ambient sound.\nnon_diegetic_music: N/A`;

        payload = workflowRegistry.buildH3DraftVideoWorkflow({
          firstFramePath: uploadedFirst,
          prompt: textToUse,
          seed: activeSeed,
          durationFrames,
          clipName: h3ClipModel,
          aspectRatio,
          resolutionTier,
          loras: lorasPayload,
        });
      }

      setRenderProgress(`ComfyUI 포트 8288 큐 등록 중...`);
      const promptId = await comfyClient.queuePrompt(payload);

      setRenderProgress(`H3 연산 진행 중 (${currentDuration}초 / ${durationFrames}프레임)...`);
      const outputs = await comfyClient.waitForCompletion(promptId, (pct) => {
        setRenderProgress(`H3 비디오 렌더링 진행 중 (${pct}%)...`);
      });

      const rawUrl = comfyClient.extractOutputVideoUrl(outputs);
      if (!rawUrl) throw new Error('출력 비디오 파일을 가져오지 못했습니다.');
      const realVideoUrl = `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;

      // 소설 연계 모드와 단독 모드 양쪽 모두 상태를 즉시 동기화하여 플레이어가 무조건 켜지도록 보장
      setDirectDraftVideo(realVideoUrl);
      setDirectUpscaledVideo(null); // 직전 구버전 업스케일 비디오 초기화하여 앞전 영상 출력 원천 차단
      setActivePreviewVideo(realVideoUrl);
      setActiveVideoType('draft');

      if (entryMode === 'project') {
        onUpdateCut({
          ...currentCut,
          draftVideoPath: realVideoUrl,
          upscaledVideoPath: null, // 앞전 업스케일 영상 덮어쓰기 방지
          videoRenderStatus: 'draft_done',
        });
      }

      // 롱샷 모드일 때는 생성된 비디오의 끝 프레임을 다음 릴레이 앵커로 자동 준비
      if (videoMode === 'long_relay') {
        try {
          const nextLastFrame = await extractFrameFromVideoUrl(realVideoUrl, 0.05);
          setCurrentRelayBaseFrame(nextLastFrame);
          setRelayClips((prev) => [
            ...prev,
            {
              id: `relay_${Date.now()}`,
              videoUrl: realVideoUrl,
              lastFrameUrl: nextLastFrame,
              duration: currentDuration,
            },
          ]);
        } catch (_) { }
      }

      setRenderProgress('1단계 렌더링 완료!');
    } catch (err: unknown) {
      alert(`렌더링 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsRendering(false);
    }
  };

  // 2단계: 0.5MP 고화질 업스케일러 + RIFE 60fps
  const handleRenderUpscale = async () => {
    const draftPathToUse = directDraftVideo || currentCut.draftVideoPath;
    if (!draftPathToUse) {
      alert('먼저 1단계 0.2MP 초안 비디오를 렌더링해야 합니다.');
      return;
    }

    setIsRendering(true);
    setRenderProgress(`[2단계] 0.5MP (${aspectRatio}) 업스케일러 + RIFE 60fps 연산 중...`);

    try {
      await comfyClient.freeMemory();

      const payload = workflowRegistry.buildH3UpscaleVideoWorkflow({
        draftVideoPath: draftPathToUse,
        aspectRatio,
      });

      const promptId = await comfyClient.queuePrompt(payload);
      const outputs = await comfyClient.waitForCompletion(promptId, (pct) => {
        setRenderProgress(`0.5MP 업스케일링 및 60fps 모션 보간 중 (${pct}%)...`);
      });

      const rawUrl = comfyClient.extractOutputVideoUrl(outputs) || draftPathToUse;
      const realVideoUrl = `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;

      setDirectUpscaledVideo(realVideoUrl);
      setActivePreviewVideo(realVideoUrl);
      setActiveVideoType('upscale');

      if (entryMode === 'project') {
        onUpdateCut({
          ...currentCut,
          upscaledVideoPath: realVideoUrl,
          videoRenderStatus: 'done',
        });
      }

      setRenderProgress('2단계 최종 업스케일링 및 60fps 보간 완료!');
    } catch (err: unknown) {
      alert(`업스케일링 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsRendering(false);
    }
  };

  return (
    <div className="p-4 md:p-6 w-full max-w-[98vw] mx-auto space-y-4">
      {/* Top Header & Cut Navigation */}
      <div className="glass-panel px-6 py-3.5 rounded-xl border border-slate-800 space-y-3 bg-[#090D18]">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                <span>🎬 H3 비디오 자유 연출 스튜디오</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                  Director's Workbench
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                순서에 얽매이지 않고 원하는 이미지, 프롬프트, 9대 참조 에셋을 자유롭게 조합하여 렌더링하세요.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {project.cuts.length > 0 && (
              <span className="text-xs font-mono text-slate-400 bg-slate-900 px-3 py-1 rounded-lg border border-slate-800">
                연계 콘티: 총 {project.cuts.length}개 컷
              </span>
            )}
            <button
              onClick={onNextTab}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition shrink-0 shadow-md shadow-emerald-900/30 cursor-pointer flex items-center space-x-1"
            >
              <span>다음: 최종 마스터링</span>
              <span>&rarr;</span>
            </button>
          </div>
        </div>

        {/* Storyboard Cuts Fast Track (If cuts exist, allow quick 1-click loading without forcing) */}
        {project.cuts.length > 0 && (
          <div className="flex items-center space-x-2 overflow-x-auto pt-2.5 border-t border-slate-800/80">
            <span className="text-[11px] font-bold text-slate-400 uppercase font-mono shrink-0 flex items-center space-x-1">
              <span>📋 콘티 컷 연동:</span>
            </span>
            {project.cuts.map((cut) => {
              const isSel = cut.id === selectedCutId;
              return (
                <button
                  key={cut.id}
                  type="button"
                  onClick={() => {
                    setSelectedCutId(cut.id);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition shrink-0 flex items-center space-x-1.5 cursor-pointer ${isSel
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40 border border-indigo-400'
                      : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
                    }`}
                >
                  <span>{cut.id}</span>
                  {cut.winnerImagePath && (
                    <span className="text-[9px] text-emerald-300">🖼️</span>
                  )}
                  {cut.upscaledVideoPath ? (
                    <span className="w-2 h-2 rounded-full bg-indigo-400 shadow-[0_0_6px_#818CF8]" title="완성 영상 있음" />
                  ) : cut.draftVideoPath ? (
                    <span className="w-2 h-2 rounded-full bg-amber-400" title="초안 영상 있음" />
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Video Studio Grid (Consistent 50:50 Balanced Layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Controls, Mode Switcher, Prompts & Parameters (50% Width) */}
        <div className="lg:col-span-6 space-y-4 sticky top-4">
          {/* Script Content Card (소설 연계 모드이며 실제 컷이 있을 때만 표시) */}
          {project.cuts.length > 0 && currentCut?.originalText && (
            <div className="glass-panel p-4 rounded-xl border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <span className="font-bold text-slate-200 font-mono text-xs">{currentCut.id} 영상화 대본</span>
                {currentCut.dialogueText && (
                  <span className="px-2 py-0.5 bg-amber-950/60 text-amber-300 rounded border border-amber-800/40 font-mono text-[10px]">
                    대사 립싱크 포함
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

          {/* Video Engine Mode Switcher Card */}
          <div className="glass-panel p-4 rounded-xl border border-indigo-900/50 bg-[#0B101D] space-y-3.5 text-xs shadow-lg">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="font-bold text-indigo-300 flex items-center space-x-1.5">
                <span>🎬 MiniMax H3 5대 비디오 엔진</span>
              </span>

              {/* 화면 비율 및 해상도 티어 선택기 */}
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                {/* 비율 선택 */}
                <div className="flex items-center space-x-1 bg-[#070A11] p-1 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-400 font-bold px-1">📐 비율:</span>
                  <button
                    type="button"
                    onClick={() => setAspectRatio('9:16')}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${aspectRatio === '9:16'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                      }`}
                  >
                    📱 9:16
                  </button>
                  <button
                    type="button"
                    onClick={() => setAspectRatio('16:9')}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${aspectRatio === '16:9'
                      ? 'bg-cyan-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                      }`}
                  >
                    🖥️ 16:9
                  </button>
                  <button
                    type="button"
                    onClick={() => setAspectRatio('1:1')}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${aspectRatio === '1:1'
                      ? 'bg-purple-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                      }`}
                  >
                    ⏹️ 1:1
                  </button>
                </div>

                {/* 해상도 티어 선택 */}
                <div className="flex items-center space-x-1 bg-[#070A11] p-1 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-400 font-bold px-1">💎 화질:</span>
                  <button
                    type="button"
                    onClick={() => setResolutionTier('0.2MP')}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${resolutionTier === '0.2MP'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                      }`}
                    title="0.2MP 초고속 초안 (352x608 / 30초 내외 완료)"
                  >
                    ⚡ 0.2MP
                  </button>
                  <button
                    type="button"
                    onClick={() => setResolutionTier('0.5MP')}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${resolutionTier === '0.5MP'
                      ? 'bg-amber-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                      }`}
                    title="0.5MP 표준 고화질 (544x960 / 1분~2분 완료)"
                  >
                    🌟 0.5MP
                  </button>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 text-[10px] font-bold rounded border border-emerald-800/80">
                  ⚡ Qwen3-VL 32B 정격
                </span>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-1.5">
              <button
                type="button"
                onClick={() => setVideoMode('t2v')}
                className={`py-2 rounded-lg font-bold text-[11px] transition ${videoMode === 't2v'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
              >
                🌟 T2V (텍스트)
              </button>
              <button
                type="button"
                onClick={() => setVideoMode('i2v')}
                className={`py-2 rounded-lg font-bold text-[11px] transition ${videoMode === 'i2v'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
              >
                🎬 I2V (단일 컷)
              </button>
              <button
                type="button"
                onClick={() => setVideoMode('fl2v')}
                className={`py-2 rounded-lg font-bold text-[11px] transition ${videoMode === 'fl2v'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
              >
                🔄 FL2V (2장 보간)
              </button>
              <button
                type="button"
                onClick={() => setVideoMode('ref2va')}
                className={`py-2 rounded-lg font-bold text-[11px] transition ${videoMode === 'ref2va'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
              >
                👥 REF2VA (9대 참조)
              </button>
              <button
                type="button"
                onClick={() => setVideoMode('long_relay')}
                className={`py-2 rounded-lg font-bold text-[11px] transition ${videoMode === 'long_relay'
                  ? 'bg-rose-600 text-white shadow-md ring-2 ring-rose-400'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
              >
                🎥 롱샷 (-1F 릴레이)
              </button>
            </div>

            {/* Reference Inputs per Mode */}
            <div className="p-3.5 bg-[#070A11] rounded-xl border border-slate-800 space-y-4">
              {/* T2V Mode */}
              {videoMode === 't2v' && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-indigo-300">
                        1. 🇰🇷 한국어 장면 연출 / 지문 입력 (T2V 순수 텍스트)
                      </span>
                      <span className="text-[9px] text-slate-500">배경, 날씨, 이펙트, 분위기 등</span>
                    </div>
                    <textarea
                      rows={2}
                      value={rawKoreanPrompt}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRawKoreanPrompt(val);
                        if (entryMode === 'project' && project.cuts.length > 0) {
                          onUpdateCut({ ...currentCut, videoKoreanPrompt: val });
                        }
                      }}
                      placeholder="한국어로 표현하고 싶은 장면을 적으세요 (예: 폭풍우가 몰아치는 거대한 밤바다, 거대한 파도가 솟구치고 번개가 친다)"
                      className="w-full bg-[#090D14] border border-slate-700 text-slate-200 text-xs p-2.5 rounded-xl focus:border-indigo-500 font-sans leading-relaxed placeholder:text-slate-600 shadow-inner"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={isExpandingPrompt}
                    onClick={() => handleExpandPromptWithLLM('t2v')}
                    className="w-full py-2 bg-indigo-900/60 hover:bg-indigo-700 text-indigo-200 text-xs font-bold rounded-lg border border-indigo-700/60 transition flex items-center justify-center space-x-1.5 shadow cursor-pointer"
                  >
                    <span>{isExpandingPrompt ? '⏳ Gemma 4 Heretic 프롬프트 작문 중...' : '✨ Gemma 4 무검열 H3 공식 프롬프트로 변환'}</span>
                  </button>

                  <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-indigo-400">
                        2. 🎬 H3 공식 영문 시네마틱 프롬프트 (최종 렌더링에 사용)
                      </span>
                      <span className="text-[9px] text-slate-500 font-mono">자유롭게 직접 수정 가능</span>
                    </div>
                    <textarea
                      rows={4}
                      value={t2vPrompt}
                      onChange={(e) => {
                        const val = e.target.value;
                        setT2vPrompt(val);
                        if (entryMode === 'project' && project.cuts.length > 0) {
                          onUpdateCut({ ...currentCut, videoPrompt: val });
                        }
                      }}
                      placeholder="H3 공식 영문 프롬프트 (위 변환 버튼을 누르거나 직접 영문 입력)"
                      className="w-full min-h-[90px] bg-[#090D14] border border-slate-700 text-slate-200 text-xs p-3 rounded-xl focus:border-indigo-500 font-mono leading-relaxed placeholder:text-slate-600 shadow-inner"
                    />
                  </div>
                </div>
              )}

              {/* I2V Mode (단일 컷) */}
              {videoMode === 'i2v' && (
                <div className="space-y-4">
                  {/* 대형 시작 프레임 이미지 등록 & 프리뷰 카드 */}
                  <div className="p-3.5 bg-[#070A12] rounded-xl border border-indigo-900/60 space-y-2.5 shadow-md">
                    <div className="flex items-center justify-between border-b border-indigo-950 pb-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-indigo-300 flex items-center space-x-1.5">
                          <span>📷 &lt;Picture 1&gt; 시작 프레임 이미지 (0.00초 기준점)</span>
                        </span>
                        {firstFramePath ? (
                          <span className="text-[9px] font-mono text-emerald-300 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                            ✅ 이미지 장착 완료
                          </span>
                        ) : (
                          <span className="text-[9px] font-mono text-amber-400 bg-amber-950 px-2 py-0.5 rounded border border-amber-800">
                            ⚠️ 이미지 등록 필요
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 대형 와이드 프리뷰 (이미지 클릭 시 에셋 서랍장 오픈) */}
                    {firstFramePath ? (
                      <div className="relative group rounded-xl overflow-hidden border border-indigo-700/60 shadow-inner bg-[#04060A] flex items-center justify-center min-h-[220px] max-h-[360px]">
                        <img
                          src={firstFramePath}
                          alt="First Frame"
                          className="w-full h-full object-contain max-h-[350px] transition-transform duration-300 group-hover:scale-[1.01]"
                        />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2">
                          <button
                            type="button"
                            onClick={() => setAssetDrawerTarget('picture1')}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-lg transition flex items-center space-x-1 cursor-pointer"
                          >
                            <span>🗄️ 콘티/바이블에서 변경</span>
                          </button>
                          <label className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold shadow-lg transition flex items-center space-x-1 cursor-pointer">
                            <span>📁 PC 사진 업로드</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={handleI2VImageUpload}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={handleI2VImageDelete}
                            className="px-2.5 py-1.5 bg-rose-900/80 hover:bg-rose-700 text-rose-200 rounded-lg text-xs font-bold transition cursor-pointer"
                            title="이미지 제거"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAssetDrawerTarget('picture1')}
                        className="w-full py-10 border-2 border-dashed border-indigo-800/80 hover:border-indigo-400 bg-[#090D18] hover:bg-indigo-950/40 rounded-xl flex flex-col items-center justify-center cursor-pointer transition text-center p-4 space-y-2 shadow-inner group"
                      >
                        <span className="text-3xl group-hover:scale-110 transition-transform">🖼️</span>
                        <div className="text-xs font-bold text-indigo-300">
                          클릭하여 시작 프레임 이미지 등록 (PC / 콘티 / 바이블)
                        </div>
                        <div className="text-[10px] text-slate-500">
                          내 컴퓨터 사진 직접 업로드 또는 스토리보드 확정본에서 콕 집어오기
                        </div>
                      </button>
                    )}
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-indigo-300">
                        1. 🇰🇷 한국어 장면 연출 및 대사 입력 (I2V 단일 컷)
                      </span>
                      <span className="text-[9px] text-slate-500">인물 행동, 감정, 카메라 움직임</span>
                    </div>
                    <textarea
                      rows={2}
                      value={rawKoreanPrompt}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRawKoreanPrompt(val);
                        if (entryMode === 'project' && project.cuts.length > 0) {
                          onUpdateCut({ ...currentCut, videoKoreanPrompt: val });
                        }
                      }}
                      placeholder="한국어로 적으세요 (예: 주인공이 천천히 고개를 들며 카메라를 응시하고 비장하게 말한다: '끝까지 간다')"
                      className="w-full bg-[#090D14] border border-slate-700 text-slate-200 text-xs p-2.5 rounded-xl focus:border-indigo-500 font-sans leading-relaxed placeholder:text-slate-600 shadow-inner"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={isExpandingPrompt}
                    onClick={() => handleExpandPromptWithLLM('i2v')}
                    className="w-full py-2 bg-indigo-900/60 hover:bg-indigo-700 text-indigo-200 text-xs font-bold rounded-lg border border-indigo-700/60 transition flex items-center justify-center space-x-1.5 shadow cursor-pointer"
                  >
                    <span>{isExpandingPrompt ? '⏳ Gemma 4 Heretic 프롬프트 작문 중...' : '✨ Gemma 4 무검열 H3 공식 프롬프트로 변환'}</span>
                  </button>

                  <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-indigo-400">
                        2. 🎬 I2V H3 공식 영문 시네마틱 프롬프트
                      </label>
                      <span className="text-[9px] text-slate-500 font-mono">
                        (&lt;Picture 1&gt; 참조 + 3단 지시문 자동 완결)
                      </span>
                    </div>
                    <textarea
                      rows={4}
                      value={directI2vPrompt}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDirectI2vPrompt(val);
                        if (entryMode === 'project' && project.cuts.length > 0) {
                          onUpdateCut({ ...currentCut, videoPrompt: val });
                        }
                      }}
                      placeholder="H3 공식 영문 프롬프트가 여기에 생성됩니다 (직접 수정 가능)"
                      className="w-full bg-[#090D14] border border-slate-700 text-slate-200 text-xs p-2.5 rounded-xl focus:border-indigo-500 font-mono leading-relaxed placeholder:text-slate-600 shadow-inner resize-y"
                    />
                  </div>
                </div>
              )}

              {/* FL2V Mode (시작 + 종료 2장 보간) */}
              {videoMode === 'fl2v' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {/* Picture 1: Start Frame */}
                    <div className="p-3 bg-[#070A12] rounded-xl border border-indigo-900/60 space-y-2 shadow-md">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-indigo-400">&lt;Picture 1&gt; 시작 프레임</span>
                        {firstFramePath && (
                          <button
                            type="button"
                            onClick={handleI2VImageDelete}
                            className="text-[10px] text-rose-400 hover:text-rose-300 font-bold"
                          >
                            × 삭제
                          </button>
                        )}
                      </div>
                      {firstFramePath ? (
                        <div className="relative h-32 bg-black/60 rounded-lg overflow-hidden border border-indigo-500/80 group flex items-center justify-center">
                          <img src={firstFramePath} alt="Start Frame" className="w-full h-full object-contain" />
                          <button
                            type="button"
                            onClick={() => setAssetDrawerTarget('picture1')}
                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[10px] text-white font-bold cursor-pointer"
                          >
                            교체
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAssetDrawerTarget('picture1')}
                          className="w-full h-32 border-2 border-dashed border-indigo-800/80 hover:border-indigo-400 bg-[#090D18] hover:bg-indigo-950/40 rounded-lg flex flex-col items-center justify-center cursor-pointer transition text-center p-2 space-y-1"
                        >
                          <span className="text-xl">📷</span>
                          <span className="text-[10px] font-bold text-indigo-300">+ 시작 사진 등록</span>
                        </button>
                      )}
                    </div>

                    {/* Picture 2: End Frame */}
                    <div className="p-3 bg-[#070A12] rounded-xl border border-purple-900/60 space-y-2 shadow-md">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-purple-400">&lt;Picture 2&gt; 종료 프레임</span>
                        {fl2vLastFrame && (
                          <button
                            type="button"
                            onClick={() => setFl2vLastFrame(null)}
                            className="text-[10px] text-rose-400 hover:text-rose-300 font-bold cursor-pointer"
                          >
                            × 삭제
                          </button>
                        )}
                      </div>
                      {fl2vLastFrame ? (
                        <div className="relative h-32 bg-black/60 rounded-lg overflow-hidden border border-purple-500/80 group flex items-center justify-center">
                          <img src={fl2vLastFrame} alt="End Frame" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setAssetDrawerTarget('picture2')}
                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[10px] text-white font-bold cursor-pointer"
                          >
                            교체
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAssetDrawerTarget('picture2')}
                          className="w-full h-32 border-2 border-dashed border-purple-800/80 hover:border-purple-400 bg-[#090D18] hover:bg-purple-950/40 rounded-lg flex flex-col items-center justify-center cursor-pointer transition text-center p-2 space-y-1"
                        >
                          <span className="text-xl">🎯</span>
                          <span className="text-[10px] font-bold text-purple-300">+ 종료 사진 등록</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-purple-300">
                        1. 🇰🇷 한국어 모션 전환 지문 입력 (FL2V)
                      </span>
                      <span className="text-[9px] text-slate-500">시작(사진1)에서 끝(사진2)으로의 변화</span>
                    </div>
                    <textarea
                      rows={2}
                      value={rawKoreanPrompt}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRawKoreanPrompt(val);
                        if (entryMode === 'project' && project.cuts.length > 0) {
                          onUpdateCut({ ...currentCut, videoKoreanPrompt: val });
                        }
                      }}
                      placeholder="한국어로 적으세요 (예: 인물이 뒤를 돌아보며 걸어가다가 미소를 짓는 모습으로 자연스럽게 전환)"
                      className="w-full bg-[#090D14] border border-slate-700 text-slate-200 text-xs p-2.5 rounded-xl focus:border-indigo-500 font-sans leading-relaxed placeholder:text-slate-600 shadow-inner"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={isExpandingPrompt}
                    onClick={() => handleExpandPromptWithLLM('fl2v')}
                    className="w-full py-2 bg-purple-900/60 hover:bg-purple-700 text-purple-200 text-xs font-bold rounded-lg border border-purple-700/60 transition flex items-center justify-center space-x-1.5 shadow cursor-pointer"
                  >
                    <span>{isExpandingPrompt ? '⏳ Gemma 4 Heretic 프롬프트 작문 중...' : '✨ Gemma 4 무검열 H3 공식 프롬프트로 변환'}</span>
                  </button>

                  <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-purple-300">
                        2. 🎬 FL2V H3 공식 영문 시네마틱 프롬프트
                      </label>
                      <span className="text-[9px] text-slate-500 font-mono">
                        (Picture 1 및 Picture 2 정렬 지시문 자동 완결)
                      </span>
                    </div>
                    <textarea
                      rows={4}
                      value={directFl2vPrompt}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDirectFl2vPrompt(val);
                        if (entryMode === 'project' && project.cuts.length > 0) {
                          onUpdateCut({ ...currentCut, videoPrompt: val });
                        }
                      }}
                      placeholder="FL2V 영문 지시문이 생성됩니다"
                      className="w-full bg-[#090D14] border border-slate-700 text-slate-200 text-xs p-2.5 rounded-xl focus:border-indigo-500 font-mono leading-relaxed placeholder:text-slate-600 shadow-inner resize-y"
                    />
                  </div>
                </div>
              )}

              {/* REF2VA Mode (Left column: Prompts + 9-Slot Reference Grid) */}
              {videoMode === 'ref2va' && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-emerald-300">
                        1. 🇰🇷 한국어 다중 참조 연출 지문 입력 (REF2VA)
                      </span>
                      <span className="text-[9px] text-slate-500">&lt;Subject 1&gt; 배경 속 &lt;Subject 2&gt; 액션</span>
                    </div>
                    <textarea
                      rows={2}
                      value={rawKoreanPrompt}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRawKoreanPrompt(val);
                        if (entryMode === 'project' && project.cuts.length > 0) {
                          onUpdateCut({ ...currentCut, videoKoreanPrompt: val });
                        }
                      }}
                      placeholder="한국어로 적으세요 (예: <Subject 1> 배경 속에서 <Subject 2> 인물이 앞으로 걸어나오며 손을 뻗는다)"
                      className="w-full bg-[#090D14] border border-slate-700 text-slate-200 text-xs p-2.5 rounded-xl focus:border-indigo-500 font-sans leading-relaxed placeholder:text-slate-600 shadow-inner"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={isExpandingPrompt}
                    onClick={() => handleExpandPromptWithLLM('ref2va')}
                    className="w-full py-2 bg-emerald-900/60 hover:bg-emerald-700 text-emerald-200 text-xs font-bold rounded-lg border border-emerald-700/60 transition flex items-center justify-center space-x-1.5 shadow cursor-pointer"
                  >
                    <span>{isExpandingPrompt ? '⏳ Gemma 4 Heretic 프롬프트 작문 중...' : '✨ Gemma 4 무검열 H3 공식 6단 프롬프트로 변환'}</span>
                  </button>

                  <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-emerald-300">
                        2. 🎬 REF2VA H3 공식 6단 영문 시네마틱 프롬프트
                      </label>
                      <span className="text-[9px] text-slate-500 font-mono">(직접 수정 가능)</span>
                    </div>
                    <textarea
                      rows={4}
                      value={directRefPrompt}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDirectRefPrompt(val);
                        if (entryMode === 'project' && project.cuts.length > 0) {
                          onUpdateCut({ ...currentCut, videoPrompt: val });
                        }
                      }}
                      placeholder="REF2VA 6단 영문 프롬프트가 생성됩니다"
                      className="w-full bg-[#090D14] border border-slate-700 text-slate-200 text-xs p-2.5 rounded-xl focus:border-indigo-500 font-mono leading-relaxed placeholder:text-slate-600 shadow-inner resize-y"
                    />
                  </div>

                  {/* 🌟 9-Slot Multimodal Reference Box (3x3 Grid with Crisp Previews) */}
                  <div className="p-3.5 bg-[#070A12] rounded-xl border border-emerald-900/60 space-y-3 shadow-md">
                    <div className="flex items-center justify-between border-b border-emerald-950 pb-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-emerald-300 flex items-center space-x-1.5">
                          <span>👥 REF2VA 9대 멀티모달 참조 슬롯</span>
                        </span>
                        <span className={`text-[9px] font-mono px-2 py-0.5 rounded border ${activeSlotsCount > 0
                            ? 'text-emerald-300 bg-emerald-950 border-emerald-800'
                            : 'text-slate-400 bg-slate-900 border-slate-800'
                          }`}>
                          {activeSlotsCount} / 9 슬롯 등록됨
                        </span>
                      </div>
                      <span className="text-[9px] text-slate-500 font-mono">
                        &lt;Subject 1~9&gt; 영구 의상·인물·포즈·배경 앵커
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2.5">
                      {STUDIO_SLOT_DEFINITIONS.map(def => {
                        const imgPath = activeSlots[def.key];
                        const hasImg = Boolean(imgPath);
                        return (
                          <div key={def.key} className={`p-2.5 rounded-xl border transition ${hasImg
                              ? 'bg-emerald-950/40 border-emerald-500 shadow-md shadow-emerald-950/40'
                              : 'bg-[#090D18] border-slate-800 hover:border-slate-700'
                            }`}>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className={`text-[10px] font-bold truncate ${hasImg ? 'text-emerald-300' : 'text-slate-300'}`}>
                                &lt;S{def.index}&gt; {def.label}
                              </span>
                              {hasImg && (
                                <button
                                  type="button"
                                  onClick={() => handleSlotImageDelete(def.key)}
                                  className="text-[11px] text-rose-400 hover:text-rose-300 font-bold ml-1 shrink-0 cursor-pointer"
                                  title="슬롯 이미지 삭제"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                            <div className="text-[8px] text-slate-500 truncate mb-2">{def.description}</div>
                            {hasImg ? (
                              <div className="w-full h-24 rounded-lg overflow-hidden border border-emerald-500/80 relative group bg-black/60 flex items-center justify-center">
                                <img src={imgPath!} alt={def.label} className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setAssetDrawerTarget(def.key)}
                                    className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-bold rounded cursor-pointer transition"
                                  >
                                    교체
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => window.open(imgPath!, '_blank')}
                                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[9px] font-bold rounded border border-slate-700 transition cursor-pointer"
                                  >
                                    확대
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setAssetDrawerTarget(def.key)}
                                className="w-full h-24 border border-dashed border-emerald-900/80 hover:border-emerald-500/80 bg-[#090D14] hover:bg-emerald-950/40 text-[10px] text-emerald-400 font-bold rounded-lg cursor-pointer transition flex flex-col items-center justify-center p-2 space-y-1 text-center"
                              >
                                <span className="text-base">+</span>
                                <span>에셋 등록</span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* 롱샷 (-1F 릴레이 & 만능 앵커 허브) Mode */}
              {videoMode === 'long_relay' && (
                <div className="space-y-4">
                  {/* 1. 2대 정밀 서브모드 분기 스위치 */}
                  <div className="p-3 bg-[#0A0E1A] rounded-2xl border border-rose-900/60 shadow-lg space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-rose-300 flex items-center space-x-1.5">
                        <span>🎬 롱샷 파이프라인 정밀 모드 선택</span>
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800">
                        {relaySubMode === 'pure_i2v' ? 'FL2VA 전용 모델' : 'REF2VA 전용 모델'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={isRendering}
                        onClick={() => setRelaySubMode('pure_i2v')}
                        className={`p-2.5 rounded-xl border text-left transition ${relaySubMode === 'pure_i2v'
                            ? 'bg-rose-950/70 border-rose-500 text-rose-100 ring-1 ring-rose-400 shadow-md'
                            : 'bg-[#060911] border-slate-800 text-slate-400 hover:border-slate-700'
                          }`}
                      >
                        <div className="font-bold text-xs">🔘 1. 순수 연속 롱샷 (I2V)</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">단일 끝프레임으로 끊김 없는 모션 연결</div>
                      </button>

                      <button
                        type="button"
                        disabled={isRendering}
                        onClick={() => setRelaySubMode('ref2va_anchor')}
                        className={`p-2.5 rounded-xl border text-left transition ${relaySubMode === 'ref2va_anchor'
                            ? 'bg-rose-950/70 border-rose-500 text-rose-100 ring-1 ring-rose-400 shadow-md'
                            : 'bg-[#060911] border-slate-800 text-slate-400 hover:border-slate-700'
                          }`}
                      >
                        <div className="font-bold text-xs">🔘 2. 정밀 참조 롱샷 (REF2VA)</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">줌아웃 / 씬 전환 / 새 인물 결합</div>
                      </button>
                    </div>
                  </div>

                  {/* 2. 만능 앵커 프레임 로더 & 검수기 */}
                  <div className="p-3.5 bg-rose-950/20 rounded-2xl border border-rose-900/60 space-y-3 shadow-md">
                    <div className="flex items-center justify-between border-b border-rose-950 pb-2">
                      <span className="font-bold text-rose-300 text-xs flex items-center space-x-1.5">
                        <span>🎞️ 릴레이 시작 앵커 프레임 공급원</span>
                      </span>
                      <div className="flex space-x-1 text-[10px]">
                        <button
                          type="button"
                          disabled={isRendering}
                          onClick={() => setRelayAnchorSource('prev_clip')}
                          className={`px-2 py-1 rounded-lg border transition ${relayAnchorSource === 'prev_clip'
                              ? 'bg-rose-900 text-white border-rose-600'
                              : 'bg-slate-900 text-slate-400 border-slate-800'
                            }`}
                        >
                          직전 클립 -1F
                        </button>
                        <button
                          type="button"
                          disabled={isRendering}
                          onClick={() => setRelayAnchorSource('other_cut')}
                          className={`px-2 py-1 rounded-lg border transition ${relayAnchorSource === 'other_cut'
                              ? 'bg-rose-900 text-white border-rose-600'
                              : 'bg-slate-900 text-slate-400 border-slate-800'
                            }`}
                        >
                          다른 컷 비디오
                        </button>
                        <button
                          type="button"
                          disabled={isRendering}
                          onClick={() => setRelayAnchorSource('external_file')}
                          className={`px-2 py-1 rounded-lg border transition ${relayAnchorSource === 'external_file'
                              ? 'bg-rose-900 text-white border-rose-600'
                              : 'bg-slate-900 text-slate-400 border-slate-800'
                            }`}
                        >
                          외부 MP4 업로드
                        </button>
                      </div>
                    </div>

                    {/* 공급원별 제어 패널 */}
                    {relayAnchorSource === 'other_cut' && (
                      <div className="p-2.5 bg-[#090D14] rounded-xl border border-slate-800 flex items-center space-x-2 text-xs">
                        <span className="text-slate-400 shrink-0">가져올 컷 선택:</span>
                        <select
                          disabled={isRendering}
                          value={relaySelectedCutIdx}
                          onChange={async (e) => {
                            const idx = Number(e.target.value);
                            setRelaySelectedCutIdx(idx);
                            const targetCut = project.cuts[idx];
                            const videoPath = targetCut?.upscaledVideoPath || targetCut?.draftVideoPath;
                            if (videoPath) {
                              const resolved = resolveVideoUrl(videoPath);
                              if (resolved) {
                                try {
                                  const frame = await extractFrameFromVideoUrl(resolved, relayOffsetSeconds);
                                  setCurrentRelayBaseFrame(frame);
                                } catch (_) { }
                              }
                            }
                          }}
                          className="bg-slate-900 border border-slate-700 text-slate-200 text-xs px-2 py-1 rounded-lg flex-1"
                        >
                          {project.cuts.map((c, i) => (
                            <option key={c.id || i} value={i}>
                              컷 #{i + 1} ({c.id}) - {c.videoDurationSeconds || 5}초 {c.draftVideoPath ? '✅ 비디오 있음' : '⏳ 미렌더링'}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {relayAnchorSource === 'external_file' && (
                      <div className="p-2.5 bg-[#090D14] rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                        <span className="text-slate-400">외부 MP4 영상에서 프레임 추출:</span>
                        <label className="px-3 py-1.5 bg-rose-900 hover:bg-rose-700 text-rose-200 font-bold rounded-lg cursor-pointer border border-rose-700 transition">
                          📁 MP4 파일 선택
                          <input
                            type="file"
                            accept="video/mp4,video/webm"
                            disabled={isRendering}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const objUrl = URL.createObjectURL(file);
                                setRelayExtVideoUrl(objUrl);
                                try {
                                  const frame = await extractFrameFromVideoUrl(objUrl, relayOffsetSeconds);
                                  setCurrentRelayBaseFrame(frame);
                                } catch (err) {
                                  alert('외부 비디오 프레임 추출에 실패했습니다.');
                                }
                              }
                            }}
                            className="hidden"
                          />
                        </label>
                      </div>
                    )}

                    {/* 시작 프레임 (-1F) 앵커 상태 바 & 프레임 오프셋 선택기 */}
                    <div className="flex items-center space-x-3 p-3 bg-[#070A12] rounded-xl border border-slate-800">
                      <div className="w-24 h-28 bg-black/60 rounded-xl overflow-hidden shrink-0 flex items-center justify-center relative border border-rose-700 shadow-md">
                        {currentRelayBaseFrame || firstFramePath ? (
                          <img
                            src={(currentRelayBaseFrame || firstFramePath)!}
                            alt="Relay Base"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-[9px] text-slate-500 text-center p-1">시작 이미지 없음</span>
                        )}
                        <span className="absolute bottom-0 inset-x-0 bg-black/80 text-[9px] text-center text-rose-300 font-mono py-0.5">
                          장착된 앵커
                        </span>
                      </div>

                      <div className="flex-1 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-200">
                            {currentRelayBaseFrame ? '✅ 시작 앵커 프레임 장착됨' : '📸 2D 스틸이 기본 앵커로 연결됨'}
                          </span>
                          <span className="text-[10px] font-mono text-rose-400">
                            오프셋: {relayOffsetSeconds === 0.05 ? '-1F (끝)' : relayOffsetSeconds === 0.2 ? '-5F (-0.2s)' : '-10F (-0.4s)'}
                          </span>
                        </div>

                        {/* 블러/눈감음 방지 프레임 오프셋 선택 버튼 */}
                        <div className="flex items-center space-x-1.5 pt-1">
                          <span className="text-[10px] text-slate-400 font-mono">클린 프레임 선택:</span>
                          {[
                            { label: '-1F (끝)', sec: 0.05 },
                            { label: '-5F (0.2s전)', sec: 0.20 },
                            { label: '-10F (0.4s전)', sec: 0.40 },
                          ].map((opt) => (
                            <button
                              key={opt.label}
                              type="button"
                              disabled={isRendering || !activePreviewVideo}
                              onClick={async () => {
                                setRelayOffsetSeconds(opt.sec);
                                if (activePreviewVideo) {
                                  try {
                                    const frame = await extractFrameFromVideoUrl(activePreviewVideo, opt.sec);
                                    setCurrentRelayBaseFrame(frame);
                                  } catch (_) { }
                                }
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-mono border transition ${relayOffsetSeconds === opt.sec
                                  ? 'bg-rose-900 text-white border-rose-500'
                                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                                }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>

                        <div className="flex items-center space-x-2 pt-1">
                          <label className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold rounded-lg border border-slate-700 cursor-pointer transition">
                            + 이미지 파일로 직접 교체
                            <input
                              type="file"
                              accept="image/*"
                              disabled={isRendering}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) {
                                  const r = new FileReader();
                                  r.onload = (ev) => {
                                    setCurrentRelayBaseFrame(ev.target?.result as string);
                                    if (entryMode === 'direct') setDirectCustomImage(ev.target?.result as string);
                                  };
                                  r.readAsDataURL(f);
                                }
                              }}
                              className="hidden"
                            />
                          </label>
                          {currentRelayBaseFrame && (
                            <button
                              type="button"
                              disabled={isRendering}
                              onClick={() => setCurrentRelayBaseFrame(null)}
                              className="text-[10px] text-rose-400 hover:text-rose-300 font-bold underline cursor-pointer"
                            >
                              초기화
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 3. 롱샷 연출 지문 및 프롬프트 */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-rose-300">
                        1. 🇰🇷 이번 릴레이 클립 연출 지문 / 한국어 대사
                      </span>
                      <span className="text-[9px] text-slate-500">카메라 앵글 &amp; 인물 동작</span>
                    </div>
                    <textarea
                      rows={2}
                      disabled={isRendering}
                      value={rawKoreanPrompt}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRawKoreanPrompt(val);
                        if (entryMode === 'project' && project.cuts.length > 0) {
                          onUpdateCut({ ...currentCut, videoKoreanPrompt: val });
                        }
                      }}
                      placeholder="한국어로 적으세요 (예: 인물이 뒤를 돌아보며 서서히 걸어가고 카메라는 부드럽게 팔로우한다)"
                      className="w-full bg-[#090D14] border border-slate-700 text-slate-200 text-xs p-2.5 rounded-xl focus:border-indigo-500 font-sans leading-relaxed placeholder:text-slate-600 shadow-inner"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={isExpandingPrompt || isRendering}
                    onClick={() => handleExpandPromptWithLLM('long_relay')}
                    className="w-full py-2 bg-rose-900/60 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-rose-200 text-xs font-bold rounded-xl border border-rose-700/60 transition flex items-center justify-center space-x-1.5 shadow cursor-pointer"
                  >
                    <span>{isExpandingPrompt ? '⏳ Gemma 4 Heretic 프롬프트 작문 중...' : '✨ Gemma 4 무검열 H3 공식 프롬프트로 변환'}</span>
                  </button>

                  <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-rose-300">
                        2. 🎬 H3 롱샷 공식 영문 시네마틱 프롬프트
                      </label>
                      <span className="text-[9px] text-slate-500 font-mono">(직접 편집 가능)</span>
                    </div>
                    <textarea
                      rows={4}
                      disabled={isRendering}
                      value={longRelayPrompt}
                      onChange={(e) => {
                        const val = e.target.value;
                        setLongRelayPrompt(val);
                        if (entryMode === 'project' && project.cuts.length > 0) {
                          onUpdateCut({ ...currentCut, videoPrompt: val });
                        }
                      }}
                      placeholder="H3 영문 시네마틱 프롬프트가 생성됩니다"
                      className="w-full bg-[#090D14] border border-slate-700 text-slate-200 text-xs p-2.5 rounded-xl focus:border-indigo-500 font-mono leading-relaxed placeholder:text-slate-600 shadow-inner resize-y"
                    />
                  </div>

                  {/* 4. 정밀 참조 모드(REF2VA)일 때만 활성화되는 에셋 앵커 슬롯들 */}
                  {relaySubMode === 'ref2va_anchor' && (
                    <div className="p-3.5 bg-[#070A12] rounded-2xl border border-rose-900/60 space-y-3 shadow-md">
                      <div className="flex items-center justify-between border-b border-rose-950 pb-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-rose-300 flex items-center space-x-1.5">
                            <span>👥 줌아웃 / 씬전환용 에셋 참조 슬롯</span>
                          </span>
                          <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800">
                            {activeSlotsCount}개 등록됨
                          </span>
                        </div>
                        <span className="text-[9px] text-slate-500 font-mono">
                          인물 전신/새 배경/의상 앵커
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2.5">
                        {STUDIO_SLOT_DEFINITIONS.map((def) => {
                          const imgPath = activeSlots[def.key];
                          const hasImg = Boolean(imgPath);
                          return (
                            <div
                              key={def.key}
                              className={`p-2 rounded-xl border transition ${hasImg
                                  ? 'bg-rose-950/40 border-rose-500 shadow-md shadow-rose-950/40'
                                  : 'bg-[#090D18] border-slate-800 hover:border-slate-700'
                                }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className={`text-[10px] font-bold truncate ${hasImg ? 'text-rose-300' : 'text-slate-300'}`}>
                                  &lt;S{def.index}&gt; {def.label}
                                </span>
                                {hasImg && (
                                  <button
                                    type="button"
                                    disabled={isRendering}
                                    onClick={() => handleSlotImageDelete(def.key)}
                                    className="text-[11px] text-rose-400 hover:text-rose-300 font-bold ml-1 shrink-0 cursor-pointer"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                              {hasImg ? (
                                <div className="w-full h-20 rounded-lg overflow-hidden border border-rose-500/80 relative group bg-black/60 flex items-center justify-center">
                                  <img src={imgPath!} alt={def.label} className="w-full h-full object-cover" />
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isRendering}
                                  onClick={() => setAssetDrawerTarget(def.key)}
                                  className="w-full h-20 border border-dashed border-rose-900/80 hover:border-rose-500/80 bg-[#090D14] hover:bg-rose-950/40 text-[10px] text-rose-400 font-bold rounded-lg cursor-pointer transition flex flex-col items-center justify-center p-1.5 space-y-1 text-center"
                                >
                                  <span className="text-base">+</span>
                                  <span>에셋 등록</span>
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Video Duration & Parameters Card */}
          <div className="glass-panel p-4 rounded-xl border border-slate-800 space-y-3.5 text-xs shadow-lg">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-200">비디오 재생 시간 (3초 ~ 15초)</span>
              <span className="text-sm font-mono font-bold text-indigo-400">
                {entryMode === 'project' ? currentCut.videoDurationSeconds : directDuration}초
                {((entryMode === 'project' ? currentCut.videoDurationSeconds : directDuration) === 5) && (
                  <span className="text-[10px] text-indigo-300 ml-1.5">(H3 정격 표준)</span>
                )}
              </span>
            </div>
            <input
              type="range"
              min="3"
              max="15"
              step="1"
              value={entryMode === 'project' ? currentCut.videoDurationSeconds : directDuration}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (entryMode === 'project') {
                  onUpdateCut({ ...currentCut, videoDurationSeconds: val });
                } else {
                  setDirectDuration(val);
                }
              }}
              className="w-full accent-indigo-500 cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-slate-500 font-mono">
              <span>3초 (고속)</span>
              <span>5초 (정격)</span>
              <span>10초 (확장)</span>
              <span>15초 (최대)</span>
            </div>

            {/* Dynamic LoRA Stack */}
            <div className="pt-3 border-t border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-300 flex items-center space-x-1.5">
                  <span>🧬 H3 전용 비디오 LoRA 스택</span>
                  <span className="text-[10px] text-indigo-400 font-mono">
                    ({entryMode === 'project' ? (currentCut.activeLoras || []).length : directActiveLoras.length}개 장착됨)
                  </span>
                </span>
                <button
                  type="button"
                  onClick={handleAddLoRA}
                  className="px-2.5 py-1 bg-indigo-900/60 hover:bg-indigo-700 text-indigo-200 rounded text-[10px] font-bold border border-indigo-700 transition cursor-pointer"
                >
                  + LoRA 추가
                </button>
              </div>

              {((entryMode === 'project' ? (currentCut.activeLoras || []) : directActiveLoras).length > 0) && (
                <div className="space-y-2 pt-1">
                  {(entryMode === 'project' ? (currentCut.activeLoras || []) : directActiveLoras).map((loraItem, idx) => (
                    <div
                      key={loraItem.id || idx}
                      className="p-2.5 bg-[#070A11] rounded-lg border border-slate-800 space-y-1.5 text-xs shadow-inner"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-300 text-[10px] font-mono">
                          LoRA #{idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveLoRA(loraItem.id)}
                          className="text-[10px] text-rose-400 hover:text-rose-300 transition"
                        >
                          × 삭제
                        </button>
                      </div>

                      <select
                        value={loraItem.name}
                        onChange={(e) => handleUpdateLoRA(loraItem.id, { name: e.target.value })}
                        className="w-full bg-[#0E131F] border border-slate-700 text-slate-200 text-[11px] px-2 py-1.5 rounded-lg font-mono"
                      >
                        {availableLoRAs.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>

                      <div className="flex items-center space-x-3 pt-1">
                        <span className="text-[11px] text-slate-400 shrink-0">가중치:</span>
                        <input
                          type="range"
                          min="0.0"
                          max="2.0"
                          step="0.05"
                          value={loraItem.strength}
                          onChange={(e) => handleUpdateLoRA(loraItem.id, { strength: parseFloat(e.target.value) || 0 })}
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
                            handleUpdateLoRA(loraItem.id, { strength: isNaN(val) ? 0 : val });
                          }}
                          className="w-14 bg-[#0E131F] border border-slate-700 text-indigo-300 text-[10px] px-1.5 py-1 rounded-md text-right font-mono"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Seed Control Panel */}
            <div className="pt-3 border-t border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-300 flex items-center space-x-1.5">
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
          </div>
        </div>

        {/* Right Column: 2-Step Video Pipeline + Responsive Player + Grand 9-Slot Board (50% Width) */}
        <div className="lg:col-span-6 space-y-4">
          {/* 1. 2-Step Lean Video Rendering Pipeline Execution Card */}
          <div className="glass-panel p-4 rounded-xl border border-slate-800 space-y-3.5 text-xs shadow-lg">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
                <span>⚡ 2단계 린(Lean) 비디오 렌더링 파이프라인</span>
              </h3>
              <span className="text-[10px] font-mono text-indigo-400 bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-800">
                {videoMode.toUpperCase()} ({aspectRatio})
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Step 1 Button: 선택된 화질(0.2MP 초안 vs 0.5MP 표준) 및 화면 비율에 따라 실시간 동적 연동 */}
              <button
                type="button"
                disabled={isRendering}
                onClick={handleRenderDraft}
                className="py-3 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none text-white font-bold rounded-xl transition shadow-lg shadow-indigo-900/30 flex items-center justify-center space-x-2 cursor-pointer text-center"
              >
                {isRendering ? (
                  <span className="flex items-center space-x-2">
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>H3 연산 진행 중...</span>
                  </span>
                ) : (
                  <span>
                    {resolutionTier === '0.2MP'
                      ? `[1단계] 0.2MP 초고속 초안 (${getH3Resolution(aspectRatio, '0.2MP').text})`
                      : `[직접] 0.5MP 네이티브 표준 (${getH3Resolution(aspectRatio, '0.5MP').text})`}
                  </span>
                )}
              </button>

              {/* Step 2 Button: 0.2MP 초안은 0.5MP로, 0.5MP 영상은 1080p FHD로 고화질 업스케일링! */}
              <button
                type="button"
                disabled={isRendering || !(entryMode === 'project' ? currentCut.draftVideoPath : directDraftVideo)}
                onClick={handleRenderUpscale}
                className="py-3 px-4 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none text-white font-bold rounded-xl transition shadow-lg shadow-purple-900/30 flex items-center justify-center space-x-2 cursor-pointer text-center"
              >
                {isRendering ? (
                  <span>대기 중...</span>
                ) : (
                  <span>
                    {resolutionTier === '0.2MP'
                      ? `[2단계] 0.5MP 표준 업스케일러 (${getH3Resolution(aspectRatio, '0.5MP').text}) + 60fps`
                      : `[2단계] 1080p FHD 최종 업스케일러 (${getH3Resolution(aspectRatio, '1080p').text}) + 60fps`}
                  </span>
                )}
              </button>
            </div>

            {isRendering && (
              <div className="p-3.5 bg-gradient-to-r from-indigo-950 via-purple-950 to-slate-900 rounded-xl border border-indigo-500/80 text-indigo-200 font-mono text-xs flex items-center justify-center space-x-3 shadow-xl animate-pulse">
                <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0" />
                <span className="font-bold">{renderProgress || 'H3 비디오 연산 처리 중 (오조작 방지를 위해 조작이 잠금됩니다)...'}</span>
              </div>
            )}
          </div>

          {/* 2. Responsive Video Player Preview Display */}
          <div className="glass-panel p-4 rounded-xl border border-slate-800 space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  🎬 비디오 플레이어 프리뷰
                </h3>
                <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                  {aspectRatio === '16:9' ? '16:9 가로 와이드' : aspectRatio === '1:1' ? '1:1 정사각' : '9:16 세로 쇼츠'}
                </span>
              </div>

              <div className="flex items-center space-x-2">
                {(entryMode === 'project' ? currentCut.upscaledVideoPath : directUpscaledVideo) ? (
                  <span className="px-2 py-0.5 bg-purple-950 text-purple-300 text-[10px] font-bold rounded border border-purple-800 shadow">
                    ★ 60fps 마스터 완료
                  </span>
                ) : (entryMode === 'project' ? currentCut.draftVideoPath : directDraftVideo) ? (
                  <span className="px-2 py-0.5 bg-amber-950 text-amber-300 text-[10px] font-bold rounded border border-amber-800 shadow">
                    0.2MP 초안 완료
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-500">대기 중</span>
                )}

                {activePreviewVideo && (
                  <button
                    type="button"
                    onClick={() => window.open(activePreviewVideo, '_blank')}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded border border-slate-700 transition"
                  >
                    새 탭에서 열기
                  </button>
                )}
              </div>
            </div>

            {/* Responsive Aspect Ratio Video Container */}
            <div className={`relative w-full ${aspectRatio === '16:9'
              ? 'aspect-video max-h-[480px]'
              : aspectRatio === '1:1'
                ? 'aspect-square max-h-[500px]'
                : 'aspect-[9/16] max-h-[580px]'
              } bg-[#070A11] rounded-2xl border border-slate-800 flex items-center justify-center overflow-hidden mx-auto shadow-2xl transition-all duration-300`}>
              {(activePreviewVideo || (entryMode === 'project' ? (currentCut.upscaledVideoPath || currentCut.draftVideoPath) : (directUpscaledVideo || directDraftVideo))) ? (
                <video
                  key={(activePreviewVideo || (entryMode === 'project' ? (currentCut.upscaledVideoPath || currentCut.draftVideoPath) : (directUpscaledVideo || directDraftVideo)))!}
                  src={(activePreviewVideo || (entryMode === 'project' ? (currentCut.upscaledVideoPath || currentCut.draftVideoPath) : (directUpscaledVideo || directDraftVideo)))!}
                  controls
                  autoPlay
                  playsInline
                  loop
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-slate-600 text-xs text-center p-6 space-y-2">
                  <div className="text-4xl">🎬</div>
                  <div className="font-bold text-slate-400">아직 렌더링된 비디오가 없습니다.</div>
                  <div className="text-[10px] text-slate-500">[1단계 0.2MP 초안 렌더링] 버튼을 누르세요.</div>
                </div>
              )}
            </div>
          </div>

          {/* 3. Chained 롱샷 Relay Clips Timeline Strip */}
          {videoMode === 'long_relay' && relayClips.length > 0 && (
            <div className="glass-panel p-4 rounded-xl border border-rose-900/50 bg-[#070A12] space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-rose-300 flex items-center space-x-1.5">
                  <span>🎬 생성 완료된 롱샷 릴레이 타임라인 ({relayClips.length}개 클립)</span>
                </span>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] text-slate-400">클릭 시 위 플레이어에서 즉시 재생</span>
                  <button
                    type="button"
                    onClick={() => {
                      setRelayClips([]);
                      setCurrentRelayBaseFrame(null);
                    }}
                    className="px-2 py-0.5 bg-rose-950 text-rose-300 text-[10px] font-bold rounded hover:bg-rose-900 transition border border-rose-800"
                  >
                    릴레이 초기화
                  </button>
                </div>
              </div>

              <div className="flex items-center space-x-3 overflow-x-auto pb-2 scrollbar-thin">
                {relayClips.map((clip, idx) => (
                  <div
                    key={clip.id}
                    onClick={() => {
                      setActivePreviewVideo(clip.videoUrl);
                      setActiveVideoType('relay');
                    }}
                    className={`p-2 rounded-xl border cursor-pointer transition flex flex-col space-y-1.5 shrink-0 w-36 ${activePreviewVideo === clip.videoUrl
                      ? 'bg-rose-950/80 border-rose-400 shadow-md shadow-rose-950 ring-2 ring-rose-400/50'
                      : 'bg-[#090D18] border-slate-800 hover:border-slate-700'
                      }`}
                  >
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-bold text-slate-200">클립 #{idx + 1}</span>
                      <span className="font-mono text-rose-300 font-bold">{clip.duration}초</span>
                    </div>
                    <div className="aspect-[9/16] bg-black/60 rounded-lg overflow-hidden relative">
                      <img
                        src={clip.lastFrameUrl}
                        alt={`Clip #${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/10">
                        <span className="text-white text-xs">▶</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(clip.videoUrl, '_blank');
                      }}
                      className="text-[9px] text-center text-slate-400 hover:text-slate-200 underline cursor-pointer"
                    >
                      새 탭에서 열기
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* 🌟 Multi-Source Asset Drawer Modal */}
      {assetDrawerTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0D1322] border border-indigo-700/60 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-base font-bold text-indigo-300">📦 에셋 선택 & 등록 서랍장</span>
                <span className="text-xs text-slate-400 font-mono">
                  (대상: {assetDrawerTarget.toUpperCase()})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAssetDrawerTarget(null)}
                className="text-slate-400 hover:text-white text-lg font-bold px-2 py-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {/* Option 1: Direct File Upload */}
              <div className="p-4 bg-[#080B14] rounded-xl border border-dashed border-indigo-800/80 hover:border-indigo-400 transition text-center">
                <label className="cursor-pointer block space-y-1.5">
                  <span className="text-2xl block">📁</span>
                  <span className="text-xs font-bold text-indigo-300 block">내 컴퓨터에서 직접 이미지 파일 업로드</span>
                  <span className="text-[10px] text-slate-500 block">JPG, PNG, WEBP 지원</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        const r = new FileReader();
                        r.onload = (ev) => {
                          if (ev.target?.result) {
                            handleSelectDrawerAsset(ev.target.result as string);
                          }
                        };
                        r.readAsDataURL(f);
                      }
                    }}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Option 2: Project Available Assets */}
              {availableProjectAssets.length > 0 ? (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                    <span>🎨 스토리보드 & 에셋 바이블에서 콕 집어오기</span>
                    <span className="text-[10px] text-indigo-400 font-mono">({availableProjectAssets.length}개 보관중)</span>
                  </span>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 max-h-60 overflow-y-auto p-1">
                    {availableProjectAssets.map(asset => (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => handleSelectDrawerAsset(asset.url)}
                        className="p-1.5 bg-[#090D18] hover:bg-indigo-950/60 border border-slate-800 hover:border-indigo-500 rounded-lg text-left space-y-1 transition group cursor-pointer"
                      >
                        <div className="aspect-square bg-black/60 rounded overflow-hidden relative">
                          <img src={asset.url} alt={asset.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          <div className="absolute inset-0 bg-indigo-600/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="text-[10px] text-white font-bold bg-indigo-600 px-2 py-0.5 rounded shadow">선택</span>
                          </div>
                        </div>
                        <div className="text-[9px] font-bold text-slate-300 truncate">{asset.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-slate-900/50 rounded-xl text-center text-xs text-slate-500">
                  스토리보드나 에셋 바이블에 등록된 이미지가 없습니다. 위 버튼을 눌러 내 PC에서 직접 이미지를 업로드하세요.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
