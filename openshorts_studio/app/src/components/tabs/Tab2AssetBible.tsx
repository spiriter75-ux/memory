import React, { useState, useEffect } from 'react';
import { ProjectMaster, CharacterDNA, WardrobePreset, LandmarkDNA, StoryboardCut, PropItem } from '../../types';
import { comfyClient } from '../../services/comfyClient';
import { workflowRegistry } from '../../services/workflowRegistry';

interface Tab2Props {
  project: ProjectMaster;
  initialAsset?: {
    type: 'character' | 'wardrobe' | 'landmark' | 'scene' | 'prop';
    name: string;
    koreanName?: string;
    prompt: string;
    imagePath?: string;
    cutId: string;
    visualDetails?: string;
  } | null;
  onClearInitialAsset?: () => void;
  onUpdateBible: (
    characters: CharacterDNA[],
    wardrobes: WardrobePreset[],
    landmarks: LandmarkDNA[],
    props?: PropItem[]
  ) => void;
  onNextTab: () => void;
}

/**
 * 의상 사진 상단 25% 물리적 크롭 (얼굴/목 침범 원천 차단)
 */
async function cropNeckBelow(imageSrc: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas context failure'));

      const cropTopPercent = 0.25; // 상단 25% 잘라내기
      const startY = Math.floor(img.height * cropTopPercent);
      const targetHeight = img.height - startY;

      canvas.width = img.width;
      canvas.height = targetHeight;

      ctx.drawImage(
        img,
        0, startY, img.width, targetHeight,
        0, 0, img.width, targetHeight
      );

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('이미지를 로드하지 못했습니다.'));
    img.src = imageSrc;
  });
}

export const Tab2AssetBible: React.FC<Tab2Props> = ({
  project,
  initialAsset,
  onClearInitialAsset,
  onUpdateBible,
  onNextTab,
}) => {
  // 상단 4대 카테고리 네비게이션
  const [activeSection, setActiveSection] = useState<'character' | 'wardrobe' | 'prop' | 'landmark' | 'scene'>('character');
  const [leftSubTab, setLeftSubTab] = useState<'warehouse' | 'cuts_feed'>('warehouse');
  const [saveToast, setSaveToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setSaveToast(msg);
    setTimeout(() => setSaveToast(null), 3500);
  };

  // -------------------------------------------------------------
  // 1. 인물 폼 & H3 2-Stage 캐릭터 시트 스튜디오 상태
  // -------------------------------------------------------------
  const [editingCharId, setEditingCharId] = useState<string | null>(null);
  const [charName, setCharName] = useState('');
  const [charAgeGender, setCharAgeGender] = useState('');
  const [charBodyBuild, setCharBodyBuild] = useState('');
  const [charFace, setCharFace] = useState('');
  const [charHair, setCharHair] = useState('');
  const [charTraits, setCharTraits] = useState('');
  const [charLoraName, setCharLoraName] = useState('');
  const [charLoraStrength, setCharLoraStrength] = useState<number>(0.8);
  const [charImagePreview, setCharImagePreview] = useState<string | null>(null);

  // H3 1단계: 3뷰 턴어라운드 상태
  const [h3FaceImage, setH3FaceImage] = useState<string | null>(null);
  const [h3WardrobeImage, setH3WardrobeImage] = useState<string | null>(null);
  const [h3IsCropped, setH3IsCropped] = useState<boolean>(false);
  const [h3KoreanBodyPrompt, setH3KoreanBodyPrompt] = useState<string>('');
  const [h3Resolution, setH3Resolution] = useState<number>(1024);
  const [isRenderingStage1, setIsRenderingStage1] = useState<boolean>(false);
  const [stage1Progress, setStage1Progress] = useState<string>('');
  const [stage1ResultSheet, setStage1ResultSheet] = useState<string | null>(null);

  // H3 2단계: 16:9 마스터 액션 시트 상태 (선택 확장)
  const [stage2MasterSwitch, setStage2MasterSwitch] = useState<boolean>(false);
  const [stage2PoseImage, setStage2PoseImage] = useState<string | null>(null);
  const [stage2PoseOverride, setStage2PoseOverride] = useState<string>('');
  const [stage2UseProp, setStage2UseProp] = useState<boolean>(false);
  const [stage2PropImage, setStage2PropImage] = useState<string | null>(null);
  const [stage2PropMode, setStage2PropMode] = useState<'separate' | 'wield'>('wield');
  const [stage2UseBg, setStage2UseBg] = useState<boolean>(false);
  const [stage2BgImage, setStage2BgImage] = useState<string | null>(null);
  const [stage2UseExtraProp, setStage2UseExtraProp] = useState<boolean>(false);
  const [stage2ExtraPropImage, setStage2ExtraPropImage] = useState<string | null>(null);
  const [stage2PanelCount, setStage2PanelCount] = useState<number>(3);
  const [stage2ThreePanelLayout, setStage2ThreePanelLayout] = useState<'vertical' | 'horizontal'>('vertical');
  const [stage2KoreanPrompt, setStage2KoreanPrompt] = useState<string>('');
  const [isRenderingStage2, setIsRenderingStage2] = useState<boolean>(false);
  const [stage2Progress, setStage2Progress] = useState<string>('');
  const [stage2ResultSheet, setStage2ResultSheet] = useState<string | null>(null);

  // -------------------------------------------------------------
  // 2. 의상 폼 상태
  // -------------------------------------------------------------
  const [wbCharId, setWbCharId] = useState('');
  const [wbName, setWbName] = useState('');
  const [wbDesc, setWbDesc] = useState('');
  const [wbShoesProps, setWbShoesProps] = useState('');
  const [wbImagePreview, setWbImagePreview] = useState<string | null>(null);
  const [wbCroppedPreview, setWbCroppedPreview] = useState<string | null>(null);

  // -------------------------------------------------------------
  // 3. 소품/무기 폼 상태 (신설)
  // -------------------------------------------------------------
  const [editingPropId, setEditingPropId] = useState<string | null>(null);
  const [propName, setPropName] = useState('');
  const [propCategory, setPropCategory] = useState<'weapon' | 'electronics' | 'accessory' | 'vehicle' | 'misc'>('weapon');
  const [propDesc, setPropDesc] = useState('');
  const [propDisplayImg, setPropDisplayImg] = useState<string | null>(null);
  const [propWieldImg, setPropWieldImg] = useState<string | null>(null);

  // -------------------------------------------------------------
  // 4. 랜드마크/배경 폼 상태
  // -------------------------------------------------------------
  const [lmName, setLmName] = useState('');
  const [lmLocation, setLmLocation] = useState('');
  const [lmStructure, setLmStructure] = useState('');
  const [lmLighting, setLmLighting] = useState('');
  const [lmImagePreview, setLmImagePreview] = useState<string | null>(null);

  // -------------------------------------------------------------
  // 5. 에셋 공방 듀얼 모드 (내 PC 업로드 vs AI 3초 즉석 생성)
  // -------------------------------------------------------------
  const [craftingMode, setCraftingMode] = useState<'upload' | 'ai_generate'>('upload');
  const [craftingPrompt, setCraftingPrompt] = useState<string>('');
  const [isGeneratingAsset, setIsGeneratingAsset] = useState<boolean>(false);
  const [assetGenProgress, setAssetGenProgress] = useState<string>('');

  // 좌측 씬 피드 선택된 컷
  const [selectedFeedCutId, setSelectedFeedCutId] = useState<string | null>(
    project.cuts.length > 0 ? project.cuts[0].id : null
  );

  // Tab 1에서 넘어온 추천 에셋 자동 프리필
  useEffect(() => {
    if (initialAsset) {
      if (initialAsset.type === 'character') {
        setActiveSection('character');
        setCharName(initialAsset.koreanName || initialAsset.name);
        setCharTraits(initialAsset.visualDetails || '');
        setCharImagePreview(initialAsset.imagePath || null);
        setH3FaceImage(initialAsset.imagePath || null);
      } else if (initialAsset.type === 'landmark') {
        setActiveSection('landmark');
        setLmName(initialAsset.koreanName || initialAsset.name);
        setLmLighting(initialAsset.visualDetails || 'cinematic moody natural lighting');
        setLmImagePreview(initialAsset.imagePath || null);
        setLmLocation('Scenario main location');
      } else if (initialAsset.type === 'wardrobe') {
        setActiveSection('wardrobe');
        setWbName(initialAsset.koreanName || initialAsset.name);
        setWbDesc(initialAsset.visualDetails || 'detailed cinematic outfit');
        setWbImagePreview(initialAsset.imagePath || null);
      }
    }
  }, [initialAsset]);

  // 로컬 파일 업로드 헬퍼
  const handleImageFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (val: string | null) => void
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setter(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  // 의상 상단 25% 물리적 크롭 적용 헬퍼
  const handleApplyNeckCrop = async () => {
    if (!h3WardrobeImage) {
      alert('크롭할 의상 사진을 먼저 등록해 주십시오.');
      return;
    }
    try {
      const cropped = await cropNeckBelow(h3WardrobeImage);
      setH3WardrobeImage(cropped);
      setH3IsCropped(true);
      showToast('✂️ 의상 상단 25%가 물리적으로 잘려나가 얼굴 오염이 원천 차단되었습니다.');
    } catch (err) {
      alert(`크롭 처리 실패: ${err}`);
    }
  };

  // -------------------------------------------------------------
  // H3 1단계: 3뷰 턴어라운드 렌더링 실행
  // -------------------------------------------------------------
  const handleRunH3Stage1 = async () => {
    if (!h3FaceImage) {
      alert('1단계 필수 1: 얼굴/정체성 이미지를 등록해 주십시오.');
      return;
    }
    if (!h3WardrobeImage) {
      alert('1단계 필수 2: 의상 이미지를 등록해 주십시오.');
      return;
    }

    setIsRenderingStage1(true);
    setStage1Progress('이미지 ComfyUI 서버 업로드 중...');

    try {
      const faceUploadedName = await comfyClient.uploadImage(h3FaceImage, `h3_face_${Date.now()}.png`);
      const wardrobeUploadedName = await comfyClient.uploadImage(h3WardrobeImage, `h3_wardrobe_${Date.now()}.png`);

      setStage1Progress('H3 1단계 3뷰 워크플로우 큐 전송 중...');
      const workflow = workflowRegistry.buildH3CharacterSheetStage1Workflow({
        faceImagePath: faceUploadedName,
        wardrobeImagePath: wardrobeUploadedName,
        koreanBodyPrompt: h3KoreanBodyPrompt,
        resolution: h3Resolution,
      });

      const promptId = await comfyClient.queuePrompt(workflow);
      setStage1Progress('H3 T=1 턴어라운드 시트 렌더링 중 (약 15~25초)...');

      const outputs = await comfyClient.waitForCompletion(promptId, (percent) => {
        setStage1Progress(`1단계 3뷰 렌더링 중 (${percent}%)...`);
      });

      const imgUrl = comfyClient.extractOutputImageUrl(outputs as Record<string, any>);
      if (!imgUrl) throw new Error('ComfyUI에서 3뷰 이미지가 출력되지 않았습니다.');

      setStage1ResultSheet(imgUrl);
      setCharImagePreview(imgUrl);
      showToast('🎉 H3 무결점 전·측·후 3뷰 턴어라운드 시트가 완성되었습니다!');
    } catch (err: unknown) {
      alert(`[H3 1단계 렌더링 오류] ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsRenderingStage1(false);
      setStage1Progress('');
    }
  };

  // -------------------------------------------------------------
  // H3 2단계: 16:9 마스터 액션 시트 합성 렌더링 실행
  // -------------------------------------------------------------
  const handleRunH3Stage2 = async () => {
    if (!stage1ResultSheet) {
      alert('먼저 1단계 3뷰 턴어라운드 시트를 생성해 주십시오.');
      return;
    }

    setIsRenderingStage2(true);
    setStage2Progress('2단계 참조 이미지 업로드 중...');

    try {
      let poseName: string | null = null;
      let propNameStr: string | null = null;
      let bgName: string | null = null;
      let extraPropName: string | null = null;

      if (stage2PoseImage) {
        poseName = await comfyClient.uploadImage(stage2PoseImage, `h3_pose_${Date.now()}.png`);
      }
      if (stage2UseProp && stage2PropImage) {
        propNameStr = await comfyClient.uploadImage(stage2PropImage, `h3_prop_${Date.now()}.png`);
      }
      if (stage2UseBg && stage2BgImage) {
        bgName = await comfyClient.uploadImage(stage2BgImage, `h3_bg_${Date.now()}.png`);
      }
      if (stage2UseExtraProp && stage2ExtraPropImage) {
        extraPropName = await comfyClient.uploadImage(stage2ExtraPropImage, `h3_extra_${Date.now()}.png`);
      }

      setStage2Progress('H3 2단계 16:9 마스터 합성 큐 전송 중...');
      const workflow = workflowRegistry.buildH3CharacterSheetStage2Workflow({
        stage1SheetPath: stage1ResultSheet,
        poseImagePath: poseName,
        poseOverrideText: stage2PoseOverride,
        propImagePath: propNameStr,
        propMode: stage2PropMode,
        bgImagePath: bgName,
        extraPropImagePath: extraPropName,
        panelCount: stage2PanelCount,
        threePanelLayout: stage2ThreePanelLayout,
        koreanPanelPrompt: stage2KoreanPrompt,
        resolution: h3Resolution,
      });

      const promptId = await comfyClient.queuePrompt(workflow);
      setStage2Progress('16:9 마스터 캐릭터 시트 합성 렌더링 중...');

      const outputs = await comfyClient.waitForCompletion(promptId, (percent) => {
        setStage2Progress(`2단계 16:9 합성 중 (${percent}%)...`);
      });

      const imgUrl = comfyClient.extractOutputImageUrl(outputs as Record<string, any>);
      if (!imgUrl) throw new Error('ComfyUI에서 16:9 마스터 시트가 출력되지 않았습니다.');

      setStage2ResultSheet(imgUrl);
      showToast('🌟 16:9 마스터 캐릭터 설정 시트가 성공적으로 완성되었습니다!');
    } catch (err: unknown) {
      alert(`[H3 2단계 렌더링 오류] ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsRenderingStage2(false);
      setStage2Progress('');
    }
  };

  // -------------------------------------------------------------
  // AI 텍스트 즉석 에셋 생성기 실행 (의상/소품/배경)
  // -------------------------------------------------------------
  const handleQuickAssetGen = async (assetType: 'wardrobe' | 'prop' | 'location') => {
    if (!craftingPrompt.trim()) {
      alert('생성할 에셋에 대한 묘사를 입력해 주십시오.');
      return;
    }

    setIsGeneratingAsset(true);
    setAssetGenProgress(`⚡ 3초 고속 ${assetType} 에셋 렌더링 중...`);

    try {
      const workflow = workflowRegistry.buildQuickAssetGeneratorWorkflow({
        prompt: craftingPrompt,
        assetType,
      });

      const promptId = await comfyClient.queuePrompt(workflow);
      const outputs = await comfyClient.waitForCompletion(promptId, (percent) => {
        setAssetGenProgress(`에셋 렌더링 중 (${percent}%)...`);
      });

      const imgUrl = comfyClient.extractOutputImageUrl(outputs as Record<string, any>);
      if (!imgUrl) throw new Error('에셋 이미지가 출력되지 않았습니다.');

      if (assetType === 'wardrobe') {
        setWbImagePreview(imgUrl);
        setH3WardrobeImage(imgUrl);
      } else if (assetType === 'prop') {
        setPropDisplayImg(imgUrl);
      } else if (assetType === 'location') {
        setLmImagePreview(imgUrl);
      }

      showToast(`✨ [${craftingPrompt.substring(0, 15)}...] 에셋이 3초 만에 즉석 생성되었습니다!`);
    } catch (err: unknown) {
      alert(`[에셋 생성 오류] ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsGeneratingAsset(false);
      setAssetGenProgress('');
    }
  };

  // -------------------------------------------------------------
  // 저장 및 관리 핸들러 (인물, 의상, 소품, 랜드마크)
  // -------------------------------------------------------------
  const handleSaveCharacter = () => {
    if (!charName.trim()) {
      alert('인물 이름을 입력해 주십시오.');
      return;
    }

    const lockedPrompt = `${charAgeGender || 'Korean, adult'}, ${charBodyBuild || 'natural build'}, ${charFace || 'distinct facial features'}, ${charHair || 'neat hair'}${charTraits ? ', ' + charTraits : ''}`.trim();

    if (editingCharId) {
      const updatedChars = project.characters.map((c) => {
        if (c.id === editingCharId) {
          return {
            ...c,
            name: charName.trim(),
            ageGender: charAgeGender.trim() || 'Korean, adult',
            bodyBuild: charBodyBuild.trim(),
            faceFeatures: charFace.trim(),
            hairStyle: charHair.trim(),
            fixedTraits: charTraits ? charTraits.split(',').map((t) => t.trim()) : [],
            refImagePath: charImagePreview || c.refImagePath,
            turnaroundSheetPath: stage1ResultSheet || c.turnaroundSheetPath,
            masterSheetPath: stage2ResultSheet || c.masterSheetPath,
            loraName: charLoraName.trim() || undefined,
            loraStrength: charLoraName.trim() ? charLoraStrength : undefined,
            lockedPromptBlock: lockedPrompt,
          };
        }
        return c;
      });
      onUpdateBible(updatedChars, project.wardrobes, project.landmarks, project.props);
      showToast(`인물 [${charName}] 바이블 정보가 안전하게 수정 저장되었습니다.`);
      setEditingCharId(null);
    } else {
      const newChar: CharacterDNA = {
        id: `char_${Date.now()}`,
        name: charName.trim(),
        ageGender: charAgeGender.trim() || 'Korean, adult',
        bodyBuild: charBodyBuild.trim(),
        faceFeatures: charFace.trim(),
        hairStyle: charHair.trim(),
        fixedTraits: charTraits ? charTraits.split(',').map((t) => t.trim()) : [],
        refImagePath: charImagePreview || h3FaceImage || null,
        turnaroundSheetPath: stage1ResultSheet || null,
        masterSheetPath: stage2ResultSheet || null,
        loraName: charLoraName.trim() || undefined,
        loraStrength: charLoraName.trim() ? charLoraStrength : undefined,
        lockedPromptBlock: lockedPrompt,
      };
      onUpdateBible([newChar, ...project.characters], project.wardrobes, project.landmarks, project.props);
      showToast(`인물 [${charName}] 에셋 바이블이 확정 등록되었습니다.`);
    }

    setCharName('');
    setEditingCharId(null);
  };

  const handleSaveProp = () => {
    if (!propName.trim()) {
      alert('소품/무기 명칭을 입력해 주십시오.');
      return;
    }
    const currentProps = project.props || [];

    if (editingPropId) {
      const updated = currentProps.map((p) =>
        p.id === editingPropId
          ? {
              ...p,
              name: propName.trim(),
              category: propCategory,
              displayImagePath: propDisplayImg || p.displayImagePath,
              wieldImagePath: propWieldImg || p.wieldImagePath,
              description: propDesc.trim(),
            }
          : p
      );
      onUpdateBible(project.characters, project.wardrobes, project.landmarks, updated);
      showToast(`소품 [${propName}] 정보가 수정되었습니다.`);
      setEditingPropId(null);
    } else {
      const newProp: PropItem = {
        id: `prop_${Date.now()}`,
        name: propName.trim(),
        category: propCategory,
        displayImagePath: propDisplayImg || '',
        wieldImagePath: propWieldImg || undefined,
        description: propDesc.trim(),
        createdAt: new Date().toISOString(),
      };
      onUpdateBible(project.characters, project.wardrobes, project.landmarks, [newProp, ...currentProps]);
      showToast(`소품 [${propName}] 에셋이 안전하게 등록되었습니다.`);
    }

    setPropName('');
    setPropDesc('');
    setPropDisplayImg(null);
    setPropWieldImg(null);
    setEditingPropId(null);
  };

  const handleDeleteProp = (propId: string) => {
    if (window.confirm('이 소품/무기 에셋을 삭제하시겠습니까?')) {
      const updated = (project.props || []).filter((p) => p.id !== propId);
      onUpdateBible(project.characters, project.wardrobes, project.landmarks, updated);
      showToast('소품이 삭제되었습니다.');
    }
  };

  const handleAddWardrobe = () => {
    if (!wbName.trim()) {
      alert('의상 명칭을 입력해 주십시오.');
      return;
    }
    const newWb: WardrobePreset = {
      id: `wb_${Date.now()}`,
      characterId: wbCharId || (project.characters[0]?.id ?? 'char_main'),
      name: wbName.trim(),
      outfitDescription: wbDesc.trim() || 'tactical outfit',
      shoesProps: wbShoesProps.trim() || 'boots',
      refImagePath: wbImagePreview || null,
      neckCroppedImagePath: wbCroppedPreview || null,
    };
    onUpdateBible(project.characters, [newWb, ...project.wardrobes], project.landmarks, project.props);
    showToast(`의상 [${wbName}] 프리셋이 등록되었습니다.`);
    setWbName('');
    setWbDesc('');
    setWbImagePreview(null);
    setWbCroppedPreview(null);
  };

  const handleDeleteWardrobe = (id: string) => {
    if (window.confirm('이 의상 프리셋을 삭제하시겠습니까?')) {
      onUpdateBible(
        project.characters,
        project.wardrobes.filter((w) => w.id !== id),
        project.landmarks,
        project.props
      );
    }
  };

  const handleAddLandmark = () => {
    if (!lmName.trim()) {
      alert('배경 명칭을 입력해 주십시오.');
      return;
    }
    const lockedPrompt = `${lmName.trim()}, ${lmLocation.trim() || 'Seoul'}, ${lmStructure.trim() || 'concrete set'}, ${lmLighting.trim() || 'cinematic moody lighting'}`;
    const newLm: LandmarkDNA = {
      id: `lm_${Date.now()}`,
      name: lmName.trim(),
      location: lmLocation.trim() || 'Main Set',
      structureMaterials: lmStructure.trim() || 'architectural set',
      lifeTraces: '',
      lightingAura: lmLighting.trim() || 'cinematic mood',
      refImagePaths: lmImagePreview ? [lmImagePreview] : [],
      lockedPromptBlock: lockedPrompt,
    };
    onUpdateBible(project.characters, project.wardrobes, [newLm, ...project.landmarks], project.props);
    showToast(`배경 [${lmName}] 랜드마크가 등록되었습니다.`);
    setLmName('');
    setLmLocation('');
    setLmImagePreview(null);
  };

  const handleDeleteLandmark = (id: string) => {
    if (window.confirm('이 배경 랜드마크를 삭제하시겠습니까?')) {
      onUpdateBible(
        project.characters,
        project.wardrobes,
        project.landmarks.filter((l) => l.id !== id),
        project.props
      );
    }
  };

  const handleDeleteCharacter = (charId: string) => {
    if (window.confirm('이 인물 에셋을 바이블에서 삭제하시겠습니까?')) {
      onUpdateBible(
        project.characters.filter((c) => c.id !== charId),
        project.wardrobes,
        project.landmarks,
        project.props
      );
    }
  };

  // 1단계 콘티 컷의 시안을 H3 에디터 얼굴/의상에 주입
  const handleInjectCutToH3 = (cut: StoryboardCut, target: 'face' | 'wardrobe' | 'pose') => {
    const img = cut.candidates?.[0]?.imagePath || cut.winnerImagePath || null;
    if (!img) {
      alert('선택한 컷에 생성된 시안 이미지가 없습니다.');
      return;
    }
    if (target === 'face') {
      setH3FaceImage(img);
      showToast(`Cut ${cut.cutNumber} 시안이 [얼굴/정체성] 슬롯에 주입되었습니다.`);
    } else if (target === 'wardrobe') {
      setH3WardrobeImage(img);
      setH3IsCropped(false);
      showToast(`Cut ${cut.cutNumber} 시안이 [의상] 슬롯에 주입되었습니다. 꼭 크롭 툴을 적용하세요!`);
    } else if (target === 'pose') {
      setStage2PoseImage(img);
      showToast(`Cut ${cut.cutNumber} 시안이 [2단계 포즈] 슬롯에 주입되었습니다.`);
    }
  };

  return (
    <div className="w-full px-6 py-6 space-y-6 max-w-[1920px] mx-auto">
      {/* 1. Header Banner */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-[#0C111D] via-[#090D18] to-[#0D1424]">
        <div>
          <div className="flex items-center space-x-3">
            <h2 className="text-xl font-bold text-slate-100 flex items-center space-x-2">
              <span>🏛️ 프로덕션 에셋 바이블 (Production Vault)</span>
            </h2>
            <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-indigo-950/80 text-indigo-300 border border-indigo-800">
              MiniMax H3 2-Stage &amp; 4대 미술 창고
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            영화·영상에 필요한 <strong>4대 프로덕션 에셋(인물 시트, 의상, 소품/무기, 배경)</strong>을 보관하고 H3 2단계 엔진으로 무결점 캐릭터 설정집을 완성합니다.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={onNextTab}
            className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-indigo-900/30 flex items-center space-x-1.5 cursor-pointer"
          >
            <span>다음: 3단계 2D 콘티 렌더링 &rarr;</span>
          </button>
        </div>
      </div>

      {/* 2. Top 4-Category Navigation Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
        <button
          type="button"
          onClick={() => setActiveSection('character')}
          className={`px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer ${
            activeSection === 'character'
              ? 'bg-indigo-600 text-white shadow-lg ring-1 ring-indigo-400'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <span>👤 인물 &amp; H3 캐릭터 시트 ({project.characters.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('wardrobe')}
          className={`px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer ${
            activeSection === 'wardrobe'
              ? 'bg-indigo-600 text-white shadow-lg ring-1 ring-indigo-400'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <span>👗 의상실 (Wardrobe) ({project.wardrobes.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('prop')}
          className={`px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer ${
            activeSection === 'prop'
              ? 'bg-indigo-600 text-white shadow-lg ring-1 ring-indigo-400'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <span>⚔️ 소품 &amp; 무기 (Props) ({(project.props || []).length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('landmark')}
          className={`px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer ${
            activeSection === 'landmark'
              ? 'bg-indigo-600 text-white shadow-lg ring-1 ring-indigo-400'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <span>🏞️ 배경 &amp; 세트장 ({project.landmarks.length})</span>
        </button>
      </div>

      {/* Toast */}
      {saveToast && (
        <div className="p-3 bg-emerald-950/90 border border-emerald-500 text-emerald-200 text-xs font-bold rounded-xl flex items-center space-x-2 shadow-xl animate-fade-in">
          <span>✅</span>
          <span>{saveToast}</span>
        </div>
      )}

      {/* 3. Main Workspace: Left 35% (Warehouse List & Cuts Feed) + Right 65% (Studio Workbench) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* ======================================================== */}
        {/* LEFT COLUMN: 35% (Col 4)                                 */}
        {/* ======================================================== */}
        <div className="xl:col-span-4 space-y-4">
          <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-3">
            {/* Sub-tab switcher: Warehouse Library vs Cuts Feed */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={() => setLeftSubTab('warehouse')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    leftSubTab === 'warehouse'
                      ? 'bg-slate-700 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  📁 등록 창고 목록
                </button>
                <button
                  type="button"
                  onClick={() => setLeftSubTab('cuts_feed')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    leftSubTab === 'cuts_feed'
                      ? 'bg-slate-700 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  📖 1단계 컷 피드 ({project.cuts.length})
                </button>
              </div>
            </div>

            {/* Sub-tab 1: Warehouse Saved Assets List */}
            {leftSubTab === 'warehouse' && (
              <div className="space-y-3 max-h-[800px] overflow-y-auto pr-1">
                {activeSection === 'character' && (
                  <>
                    {project.characters.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-8">등록된 인물이 없습니다. 우측에서 H3 시트를 제작하세요.</p>
                    ) : (
                      project.characters.map((char) => (
                        <div
                          key={char.id}
                          className="p-3.5 rounded-xl border border-slate-800/80 bg-[#070A11] hover:border-indigo-500/80 transition space-y-2 relative group shadow-sm"
                        >
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold text-slate-200 flex items-center space-x-1.5">
                              <span>👤 {char.name}</span>
                              {char.turnaroundSheetPath && (
                                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                                  3뷰 완료
                                </span>
                              )}
                              {char.masterSheetPath && (
                                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800">
                                  16:9 마스터
                                </span>
                              )}
                            </h4>
                            <button
                              type="button"
                              onClick={() => handleDeleteCharacter(char.id)}
                              className="text-xs text-slate-500 hover:text-rose-400 cursor-pointer"
                            >
                              &times;
                            </button>
                          </div>

                          {/* Previews */}
                          <div className="grid grid-cols-2 gap-2">
                            {char.turnaroundSheetPath ? (
                              <div className="h-20 rounded bg-black/60 overflow-hidden border border-slate-800 flex items-center justify-center">
                                <img src={char.turnaroundSheetPath} alt="3-View" className="w-full h-full object-cover" />
                              </div>
                            ) : char.refImagePath ? (
                              <div className="h-20 rounded bg-black/60 overflow-hidden border border-slate-800 flex items-center justify-center">
                                <img src={char.refImagePath} alt="Face" className="w-full h-full object-cover" />
                              </div>
                            ) : null}

                            {char.masterSheetPath && (
                              <div className="h-20 rounded bg-black/60 overflow-hidden border border-purple-900/60 flex items-center justify-center">
                                <img src={char.masterSheetPath} alt="Master" className="w-full h-full object-cover" />
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </>
                )}

                {activeSection === 'wardrobe' && (
                  <>
                    {project.wardrobes.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-8">등록된 의상이 없습니다.</p>
                    ) : (
                      project.wardrobes.map((wb) => (
                        <div key={wb.id} className="p-3 rounded-xl border border-slate-800 bg-[#070A11] space-y-2 flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            {wb.refImagePath ? (
                              <img src={wb.refImagePath} alt={wb.name} className="w-12 h-14 object-cover rounded border border-slate-800" />
                            ) : (
                              <span className="text-xl">👗</span>
                            )}
                            <div>
                              <h4 className="text-xs font-bold text-slate-200">{wb.name}</h4>
                              <p className="text-[10px] text-slate-400 line-clamp-1">{wb.outfitDescription}</p>
                            </div>
                          </div>
                          <button onClick={() => handleDeleteWardrobe(wb.id)} className="text-xs text-slate-500 hover:text-rose-400 cursor-pointer">
                            &times;
                          </button>
                        </div>
                      ))
                    )}
                  </>
                )}

                {activeSection === 'prop' && (
                  <>
                    {(project.props || []).length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-8">등록된 소품/무기가 없습니다.</p>
                    ) : (
                      (project.props || []).map((p) => (
                        <div key={p.id} className="p-3 rounded-xl border border-slate-800 bg-[#070A11] space-y-2 flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            {p.displayImagePath ? (
                              <img src={p.displayImagePath} alt={p.name} className="w-12 h-14 object-contain rounded bg-black/40 border border-slate-800" />
                            ) : (
                              <span className="text-xl">⚔️</span>
                            )}
                            <div>
                              <h4 className="text-xs font-bold text-slate-200">{p.name}</h4>
                              <p className="text-[10px] text-indigo-400 font-mono">[{p.category}]</p>
                              <p className="text-[10px] text-slate-400 line-clamp-1">{p.description}</p>
                            </div>
                          </div>
                          <button onClick={() => handleDeleteProp(p.id)} className="text-xs text-slate-500 hover:text-rose-400 cursor-pointer">
                            &times;
                          </button>
                        </div>
                      ))
                    )}
                  </>
                )}

                {activeSection === 'landmark' && (
                  <>
                    {project.landmarks.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-8">등록된 배경/로케이션이 없습니다.</p>
                    ) : (
                      project.landmarks.map((lm) => (
                        <div key={lm.id} className="p-3 rounded-xl border border-slate-800 bg-[#070A11] space-y-2 flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            {lm.refImagePaths && lm.refImagePaths.length > 0 ? (
                              <img src={lm.refImagePaths[0]} alt={lm.name} className="w-12 h-14 object-cover rounded border border-slate-800" />
                            ) : (
                              <span className="text-xl">🏛️</span>
                            )}
                            <div>
                              <h4 className="text-xs font-bold text-slate-200">{lm.name}</h4>
                              <p className="text-[10px] text-slate-400 line-clamp-1">{lm.location}</p>
                            </div>
                          </div>
                          <button onClick={() => handleDeleteLandmark(lm.id)} className="text-xs text-slate-500 hover:text-rose-400 cursor-pointer">
                            &times;
                          </button>
                        </div>
                      ))
                    )}
                  </>
                )}
              </div>
            )}

            {/* Sub-tab 2: Storyboard Cuts Feed (1클릭 주입 연계) */}
            {leftSubTab === 'cuts_feed' && (
              <div className="space-y-3 max-h-[800px] overflow-y-auto pr-1">
                <p className="text-[11px] text-slate-400">
                  콘티 시안 이미지를 우측 H3 작업대의 얼굴/의상 슬롯에 바로 주입할 수 있습니다.
                </p>
                {project.cuts.map((cut) => {
                  const draftImg = cut.candidates?.[0]?.imagePath || cut.winnerImagePath;
                  return (
                    <div key={cut.id} className="p-3 rounded-xl border border-slate-800 bg-[#070A11] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold font-mono text-indigo-400">Cut {cut.cutNumber}</span>
                        <span className="text-[10px] text-slate-500">{cut.cameraWeatherMod}</span>
                      </div>
                      {draftImg && (
                        <div className="w-full h-28 rounded bg-black/50 overflow-hidden border border-slate-800">
                          <img src={draftImg} alt={cut.id} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <p className="text-xs text-slate-300 line-clamp-2">{cut.originalText}</p>
                      <div className="flex items-center space-x-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => handleInjectCutToH3(cut, 'face')}
                          className="px-2 py-1 rounded bg-indigo-950 text-indigo-300 text-[10px] font-bold border border-indigo-800 hover:bg-indigo-900 cursor-pointer"
                        >
                          + 얼굴 주입
                        </button>
                        <button
                          type="button"
                          onClick={() => handleInjectCutToH3(cut, 'wardrobe')}
                          className="px-2 py-1 rounded bg-purple-950 text-purple-300 text-[10px] font-bold border border-purple-800 hover:bg-purple-900 cursor-pointer"
                        >
                          + 의상 주입
                        </button>
                        <button
                          type="button"
                          onClick={() => handleInjectCutToH3(cut, 'pose')}
                          className="px-2 py-1 rounded bg-rose-950 text-rose-300 text-[10px] font-bold border border-rose-800 hover:bg-rose-900 cursor-pointer"
                        >
                          + 포즈 주입
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ======================================================== */}
        {/* RIGHT COLUMN: 65% (Col 8) - Studio Workstation           */}
        {/* ======================================================== */}
        <div className="xl:col-span-8 space-y-6">
          {/* SECTION 1: CHARACTER & H3 2-STAGE SHEET STUDIO */}
          {activeSection === 'character' && (
            <div className="space-y-6">
              {/* STAGE 1: TURNAROUND 3-VIEW WORKBENCH */}
              <div className="glass-panel p-5 rounded-2xl border border-indigo-900/60 bg-[#070B14] space-y-5 shadow-md">
                <div className="flex items-center justify-between border-b border-indigo-950 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-indigo-300 flex items-center space-x-2">
                      <span>🎬 H3 1단계: 무결점 전·측·후 3뷰 턴어라운드 제작</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      얼굴 1장 + 의상 1장을 융합하여 인물 왜곡 없는 턴어라운드 시트를 원샷 렌더링합니다.
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] font-mono text-slate-400">해상도:</span>
                    <select
                      value={h3Resolution}
                      onChange={(e) => setH3Resolution(Number(e.target.value))}
                      className="bg-[#090D18] border border-indigo-800 text-indigo-200 text-xs px-2.5 py-1 rounded-lg font-mono"
                    >
                      <option value={1024}>1024×1024 (표준 1:1)</option>
                      <option value={1344}>1344×1344 (초고화질 1:1)</option>
                    </select>
                  </div>
                </div>

                {/* Slots: Face & Wardrobe */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Slot 1: Face */}
                  <div className="p-3.5 bg-[#05080E] rounded-xl border border-indigo-900/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-indigo-300">📷 1. 얼굴/정체성 앵커</span>
                      {h3FaceImage && (
                        <button
                          type="button"
                          onClick={() => setH3FaceImage(null)}
                          className="text-[10px] text-rose-400 hover:underline cursor-pointer"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                    {h3FaceImage ? (
                      <div className="h-44 rounded-lg bg-black/60 overflow-hidden border border-indigo-500/80 flex items-center justify-center">
                        <img src={h3FaceImage} alt="Face" className="w-full h-full object-contain" />
                      </div>
                    ) : (
                      <label className="h-44 border-2 border-dashed border-indigo-800/80 hover:border-indigo-400 bg-[#080D1A] rounded-lg flex flex-col items-center justify-center cursor-pointer p-3 text-center space-y-1 transition">
                        <span className="text-2xl">👤</span>
                        <span className="text-xs font-bold text-indigo-300">얼굴 사진 등록</span>
                        <span className="text-[10px] text-slate-500">PC 업로드 또는 좌측 컷 피드에서 주입</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleImageFileUpload(e, setH3FaceImage)}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>

                  {/* Slot 2: Wardrobe (+ Physical Canvas Crop Tool) */}
                  <div className="p-3.5 bg-[#05080E] rounded-xl border border-purple-900/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-purple-300">👗 2. 의상 착장 (얼굴 없는 사진)</span>
                      <div className="flex items-center space-x-2">
                        {h3WardrobeImage && (
                          <button
                            type="button"
                            onClick={handleApplyNeckCrop}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded transition cursor-pointer ${
                              h3IsCropped
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : 'bg-purple-900 hover:bg-purple-800 text-purple-200 border border-purple-700'
                            }`}
                          >
                            {h3IsCropped ? '✅ 상단 25% 크롭 완료' : '✂️ 목 아래 크롭 적용'}
                          </button>
                        )}
                        {h3WardrobeImage && (
                          <button
                            type="button"
                            onClick={() => {
                              setH3WardrobeImage(null);
                              setH3IsCropped(false);
                            }}
                            className="text-[10px] text-rose-400 hover:underline cursor-pointer"
                          >
                            삭제
                          </button>
                        )}
                      </div>
                    </div>
                    {h3WardrobeImage ? (
                      <div className="h-44 rounded-lg bg-black/60 overflow-hidden border border-purple-500/80 flex items-center justify-center relative group">
                        <img src={h3WardrobeImage} alt="Wardrobe" className="w-full h-full object-contain" />
                        {h3IsCropped && (
                          <span className="absolute top-2 right-2 text-[9px] font-mono px-2 py-0.5 bg-emerald-950 text-emerald-300 rounded border border-emerald-800">
                            얼굴 침범 방지 마스킹됨
                          </span>
                        )}
                      </div>
                    ) : (
                      <label className="h-44 border-2 border-dashed border-purple-800/80 hover:border-purple-400 bg-[#080D1A] rounded-lg flex flex-col items-center justify-center cursor-pointer p-3 text-center space-y-1 transition">
                        <span className="text-2xl">👗</span>
                        <span className="text-xs font-bold text-purple-300">의상 사진 등록</span>
                        <span className="text-[10px] text-slate-500">마네킹 또는 옷 사진 (등록 후 크롭 권장)</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            handleImageFileUpload(e, setH3WardrobeImage);
                            setH3IsCropped(false);
                          }}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* Korean Body Direction */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-300">체형 및 외형 묘사 (한국어 가능)</label>
                  <input
                    type="text"
                    value={h3KoreanBodyPrompt}
                    onChange={(e) => setH3KoreanBodyPrompt(e.target.value)}
                    placeholder="예: 슬림하고 키가 큰 20대 여성 체형, 좁은 어깨, 단정한 흑색 단발"
                    className="w-full bg-[#090D18] border border-slate-700 text-slate-200 text-xs py-2 px-3 rounded-xl focus:border-indigo-500 font-sans"
                  />
                </div>

                {/* Stage 1 Render Action */}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-indigo-400 font-mono">
                    {stage1Progress && `⏳ ${stage1Progress}`}
                  </span>
                  <button
                    type="button"
                    disabled={isRenderingStage1}
                    onClick={handleRunH3Stage1}
                    className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-indigo-900/40 cursor-pointer flex items-center space-x-2"
                  >
                    <span>{isRenderingStage1 ? '렌더링 중...' : '🚀 1단계 3뷰 턴어라운드 렌더링'}</span>
                  </button>
                </div>

                {/* Stage 1 Output Preview */}
                {stage1ResultSheet && (
                  <div className="p-4 bg-[#05080E] rounded-xl border border-emerald-900/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-300">✅ 1단계 3뷰 턴어라운드 완성본</span>
                      <a
                        href={stage1ResultSheet}
                        download="h3_turnaround_sheet.png"
                        className="text-[10px] text-emerald-400 underline font-mono"
                      >
                        다운로드
                      </a>
                    </div>
                    <div className="w-full h-56 rounded-lg bg-black overflow-hidden border border-emerald-700 flex items-center justify-center">
                      <img src={stage1ResultSheet} alt="Stage 1 Result" className="w-full h-full object-contain" />
                    </div>
                  </div>
                )}
              </div>

              {/* STAGE 2: 16:9 MASTER SHEET ACCORDION (OPTIONAL EXTENSION) */}
              <div className="glass-panel p-5 rounded-2xl border border-purple-900/60 bg-[#070B14] space-y-4 shadow-md">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-purple-300 flex items-center space-x-2">
                      <span>🌟 H3 2단계: 16:9 마스터 캐릭터 시트 확장 (선택)</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      1단계 정면 얼굴을 앵커로 삼고, 동적 포즈 + 무기/소품 + 배경을 합성하여 16:9 마스터 시트를 만듭니다.
                    </p>
                  </div>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <span className="text-xs font-bold text-slate-300">2단계 활성화</span>
                    <input
                      type="checkbox"
                      checked={stage2MasterSwitch}
                      onChange={(e) => setStage2MasterSwitch(e.target.checked)}
                      className="w-5 h-5 accent-purple-500"
                    />
                  </label>
                </div>

                {stage2MasterSwitch && (
                  <div className="space-y-4 pt-3 border-t border-purple-950 animate-fade-in">
                    {/* Fixed Anchor Badge */}
                    <div className="p-2.5 bg-purple-950/40 rounded-xl border border-purple-800/80 flex items-center space-x-2 text-xs text-purple-200 font-mono">
                      <span>🔒</span>
                      <span>기준 정체성 앵커: 1단계 3뷰의 정면 얼굴이 자동으로 2단계에 결합됩니다.</span>
                    </div>

                    {/* Pose Slot */}
                    <div className="p-3 bg-[#05080E] rounded-xl border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-200">🏃 포즈 분석 원본 사진 (선택)</span>
                        {stage2PoseImage && (
                          <button onClick={() => setStage2PoseImage(null)} className="text-[10px] text-rose-400 hover:underline">
                            삭제
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                        {stage2PoseImage ? (
                          <div className="h-28 rounded bg-black/60 overflow-hidden border border-slate-700 flex items-center justify-center">
                            <img src={stage2PoseImage} alt="Pose" className="w-full h-full object-contain" />
                          </div>
                        ) : (
                          <label className="h-28 border border-dashed border-slate-700 hover:border-slate-500 bg-[#080D1A] rounded flex flex-col items-center justify-center cursor-pointer p-2 text-center space-y-1">
                            <span className="text-xl">🤸</span>
                            <span className="text-[11px] text-slate-400">포즈 사진 업로드</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleImageFileUpload(e, setStage2PoseImage)}
                              className="hidden"
                            />
                          </label>
                        )}
                        <input
                          type="text"
                          value={stage2PoseOverride}
                          onChange={(e) => setStage2PoseOverride(e.target.value)}
                          placeholder="포즈 직접 텍스트 보정 (예: dynamic combat lunging pose)"
                          className="w-full bg-[#090D18] border border-slate-700 text-slate-200 text-xs py-2 px-3 rounded-xl"
                        />
                      </div>
                    </div>

                    {/* Reference Checkboxes: Prop, Background, Extra */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* Prop Checkbox */}
                      <div className={`p-3 rounded-xl border transition space-y-2 ${stage2UseProp ? 'border-purple-600 bg-purple-950/20' : 'border-slate-800 bg-[#05080E]'}`}>
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={stage2UseProp}
                            onChange={(e) => setStage2UseProp(e.target.checked)}
                            className="w-4 h-4 accent-purple-500"
                          />
                          <span className="text-xs font-bold text-purple-200">⚔️ 소품/무기 장착</span>
                        </label>
                        {stage2UseProp && (
                          <div className="space-y-1.5 pt-1">
                            <label className="block h-20 border border-dashed border-purple-800 rounded flex flex-col items-center justify-center cursor-pointer bg-black/40 overflow-hidden">
                              {stage2PropImage ? (
                                <img src={stage2PropImage} alt="Prop" className="w-full h-full object-contain" />
                              ) : (
                                <span className="text-[10px] text-purple-300">소품 이미지 등록</span>
                              )}
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleImageFileUpload(e, setStage2PropImage)}
                                className="hidden"
                              />
                            </label>
                            <div className="flex items-center space-x-2 text-[10px] text-slate-300">
                              <label className="flex items-center space-x-1 cursor-pointer">
                                <input
                                  type="radio"
                                  name="propMode"
                                  checked={stage2PropMode === 'wield'}
                                  onChange={() => setStage2PropMode('wield')}
                                  className="accent-purple-500"
                                />
                                <span>캐릭터가 쥐기</span>
                              </label>
                              <label className="flex items-center space-x-1 cursor-pointer">
                                <input
                                  type="radio"
                                  name="propMode"
                                  checked={stage2PropMode === 'separate'}
                                  onChange={() => setStage2PropMode('separate')}
                                  className="accent-purple-500"
                                />
                                <span>단독 누끼 컷</span>
                              </label>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Background Checkbox */}
                      <div className={`p-3 rounded-xl border transition space-y-2 ${stage2UseBg ? 'border-purple-600 bg-purple-950/20' : 'border-slate-800 bg-[#05080E]'}`}>
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={stage2UseBg}
                            onChange={(e) => setStage2UseBg(e.target.checked)}
                            className="w-4 h-4 accent-purple-500"
                          />
                          <span className="text-xs font-bold text-purple-200">🏞️ 배경/환경 장착</span>
                        </label>
                        {stage2UseBg && (
                          <label className="block h-20 border border-dashed border-purple-800 rounded flex flex-col items-center justify-center cursor-pointer bg-black/40 overflow-hidden">
                            {stage2BgImage ? (
                              <img src={stage2BgImage} alt="Bg" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-[10px] text-purple-300">배경 이미지 등록</span>
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleImageFileUpload(e, setStage2BgImage)}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>

                      {/* Extra Prop Checkbox */}
                      <div className={`p-3 rounded-xl border transition space-y-2 ${stage2UseExtraProp ? 'border-purple-600 bg-purple-950/20' : 'border-slate-800 bg-[#05080E]'}`}>
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={stage2UseExtraProp}
                            onChange={(e) => setStage2UseExtraProp(e.target.checked)}
                            className="w-4 h-4 accent-purple-500"
                          />
                          <span className="text-xs font-bold text-purple-200">💍 추가 악세서리</span>
                        </label>
                        {stage2UseExtraProp && (
                          <label className="block h-20 border border-dashed border-purple-800 rounded flex flex-col items-center justify-center cursor-pointer bg-black/40 overflow-hidden">
                            {stage2ExtraPropImage ? (
                              <img src={stage2ExtraPropImage} alt="Extra" className="w-full h-full object-contain" />
                            ) : (
                              <span className="text-[10px] text-purple-300">악세서리 등록</span>
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleImageFileUpload(e, setStage2ExtraPropImage)}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>
                    </div>

                    {/* Layout Controls: Panel Count & 3-Panel Layout */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center pt-2">
                      <div className="flex items-center space-x-3 text-xs text-slate-300">
                        <span className="font-bold">패널 수:</span>
                        {[1, 2, 3, 4].map((count) => (
                          <label key={count} className="flex items-center space-x-1 cursor-pointer font-mono">
                            <input
                              type="radio"
                              name="panelCount"
                              checked={stage2PanelCount === count}
                              onChange={() => setStage2PanelCount(count)}
                              className="accent-purple-500"
                            />
                            <span>{count}장</span>
                          </label>
                        ))}
                      </div>

                      {stage2PanelCount === 3 && (
                        <div className="flex items-center space-x-3 text-xs text-slate-300 font-mono">
                          <span className="font-bold">3패널 배치:</span>
                          <label className="flex items-center space-x-1 cursor-pointer">
                            <input
                              type="radio"
                              name="threeLayout"
                              checked={stage2ThreePanelLayout === 'vertical'}
                              onChange={() => setStage2ThreePanelLayout('vertical')}
                              className="accent-purple-500"
                            />
                            <span>좌측1열 + 우측2칸</span>
                          </label>
                          <label className="flex items-center space-x-1 cursor-pointer">
                            <input
                              type="radio"
                              name="threeLayout"
                              checked={stage2ThreePanelLayout === 'horizontal'}
                              onChange={() => setStage2ThreePanelLayout('horizontal')}
                              className="accent-purple-500"
                            />
                            <span>상단1행 + 하단2칸</span>
                          </label>
                        </div>
                      )}
                    </div>

                    {/* Korean Panel Instructions + Chips */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-purple-300">패널별 한국어 상세 지문</label>
                        <div className="flex items-center space-x-1.5">
                          <button
                            type="button"
                            onClick={() => setStage2KoreanPrompt((prev) => prev + '패널1: 정면 전신 전투 태세 포즈, 날카로운 눈빛\n')}
                            className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 hover:bg-purple-900 cursor-pointer"
                          >
                            + 패널1 전투태세
                          </button>
                          <button
                            type="button"
                            onClick={() => setStage2KoreanPrompt((prev) => prev + '패널2: 당황하며 식은땀을 흘리는 표정, 상반신 클로즈업\n')}
                            className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 hover:bg-purple-900 cursor-pointer"
                          >
                            + 패널2 표정클로즈업
                          </button>
                          <button
                            type="button"
                            onClick={() => setStage2KoreanPrompt((prev) => prev + '패널3: 무기를 두 손으로 쥐고 겨누고 있는 액션 샷\n')}
                            className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 hover:bg-purple-900 cursor-pointer"
                          >
                            + 패널3 무기액션
                          </button>
                        </div>
                      </div>
                      <textarea
                        rows={3}
                        value={stage2KoreanPrompt}
                        onChange={(e) => setStage2KoreanPrompt(e.target.value)}
                        placeholder="예: 패널3: 당황한 표정, 입을 벌리고 땀을 흘리고 있는 클로즈업 상반신"
                        className="w-full bg-[#090D18] border border-slate-700 text-slate-200 text-xs p-2.5 rounded-xl font-sans"
                      />
                    </div>

                    {/* Stage 2 Action */}
                    <div className="flex items-center justify-between pt-2">
                      <span className="text-xs text-purple-400 font-mono">
                        {stage2Progress && `⏳ ${stage2Progress}`}
                      </span>
                      <button
                        type="button"
                        disabled={isRenderingStage2}
                        onClick={handleRunH3Stage2}
                        className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-purple-900/40 cursor-pointer"
                      >
                        <span>{isRenderingStage2 ? '합성 렌더링 중...' : '🚀 2단계 16:9 마스터 시트 합성'}</span>
                      </button>
                    </div>

                    {/* Stage 2 Output Preview */}
                    {stage2ResultSheet && (
                      <div className="p-4 bg-[#05080E] rounded-xl border border-purple-900/80 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-purple-300">🌟 2단계 16:9 마스터 캐릭터 시트 완성본</span>
                          <a
                            href={stage2ResultSheet}
                            download="h3_master_16x9_sheet.png"
                            className="text-[10px] text-purple-400 underline font-mono"
                          >
                            다운로드
                          </a>
                        </div>
                        <div className="w-full h-72 rounded-lg bg-black overflow-hidden border border-purple-700 flex items-center justify-center">
                          <img src={stage2ResultSheet} alt="Stage 2 Result" className="w-full h-full object-contain" />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Character Details & Save to Vault */}
              <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-[#070B14] space-y-4">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                  {editingCharId ? '✏️ 인물 바이블 정보 수정 및 시트 확정' : '+ 새 인물 바이블 등록 및 시트 확정'}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-mono text-slate-400 block mb-1">인물 이름</label>
                    <input
                      type="text"
                      value={charName}
                      onChange={(e) => setCharName(e.target.value)}
                      placeholder="예: 지훈, 서연, 카터 함장"
                      className="w-full bg-[#090D18] border border-slate-700 text-slate-200 text-xs py-2 px-3 rounded-xl focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-mono text-slate-400 block mb-1">연령/성별 영문 묘사</label>
                    <input
                      type="text"
                      value={charAgeGender}
                      onChange={(e) => setCharAgeGender(e.target.value)}
                      placeholder="Korean male in mid-20s, office worker"
                      className="w-full bg-[#090D18] border border-slate-700 text-slate-200 text-xs py-2 px-3 rounded-xl focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={handleSaveCharacter}
                    className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition shadow-md shadow-emerald-900/30 cursor-pointer"
                  >
                    💾 이 인물과 시트를 바이블에 확정 저장
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 2: WARDROBE (의상실) */}
          {activeSection === 'wardrobe' && (
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-[#070B14] space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-slate-200 font-mono">👗 의상실 (Wardrobe Atelier)</h3>
                <div className="flex items-center space-x-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setCraftingMode('upload')}
                    className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${craftingMode === 'upload' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
                  >
                    📁 사진 직접 업로드
                  </button>
                  <button
                    type="button"
                    onClick={() => setCraftingMode('ai_generate')}
                    className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${craftingMode === 'ai_generate' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
                  >
                    ✨ AI 3초 즉석 생성
                  </button>
                </div>
              </div>

              {craftingMode === 'ai_generate' && (
                <div className="p-4 rounded-xl border border-indigo-800/80 bg-indigo-950/20 space-y-3">
                  <span className="text-xs font-bold text-indigo-300">✨ AI 의상 플랫레이 3초 생성기</span>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={craftingPrompt}
                      onChange={(e) => setCraftingPrompt(e.target.value)}
                      placeholder="원하는 의상 묘사 (예: tactical navy flight suit with patches, studio flatlay)"
                      className="flex-1 bg-[#090D18] border border-indigo-700 text-slate-200 text-xs py-2 px-3 rounded-xl"
                    />
                    <button
                      type="button"
                      disabled={isGeneratingAsset}
                      onClick={() => handleQuickAssetGen('wardrobe')}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      {isGeneratingAsset ? '생성 중...' : '⚡ 즉석 생성'}
                    </button>
                  </div>
                  {assetGenProgress && <p className="text-xs text-indigo-400 font-mono">{assetGenProgress}</p>}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">의상 명칭</label>
                  <input
                    type="text"
                    value={wbName}
                    onChange={(e) => setWbName(e.target.value)}
                    placeholder="예: 파일럿 점프슈트, 겨울 코트"
                    className="w-full bg-[#090D18] border border-slate-700 text-slate-200 text-xs py-2 px-3 rounded-xl"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">상의/하의 영문 묘사</label>
                  <input
                    type="text"
                    value={wbDesc}
                    onChange={(e) => setWbDesc(e.target.value)}
                    placeholder="dark navy tactical suit, black cargo pants"
                    className="w-full bg-[#090D18] border border-slate-700 text-slate-200 text-xs py-2 px-3 rounded-xl"
                  />
                </div>
              </div>

              {/* Upload Dropzone */}
              {craftingMode === 'upload' && (
                <div className="border-2 border-dashed border-slate-700 p-6 rounded-xl text-center bg-[#05080E]">
                  {wbImagePreview ? (
                    <div className="space-y-2">
                      <img src={wbImagePreview} alt="Wb" className="max-h-40 mx-auto rounded object-contain" />
                      <button onClick={() => setWbImagePreview(null)} className="text-xs text-rose-400 underline cursor-pointer">
                        이미지 제거
                      </button>
                    </div>
                  ) : (
                    <label className="cursor-pointer space-y-1 block">
                      <span className="text-2xl block">👗</span>
                      <span className="text-xs text-slate-300 font-bold block">의상 레퍼런스 사진 등록</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageFileUpload(e, setWbImagePreview)}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleAddWardrobe}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  💾 의상실에 저장
                </button>
              </div>
            </div>
          )}

          {/* SECTION 3: PROPS & WEAPONS (소품/무기) */}
          {activeSection === 'prop' && (
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-[#070B14] space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-slate-200 font-mono">⚔️ 소품 &amp; 무기 공방 (Props Atelier)</h3>
                <div className="flex items-center space-x-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setCraftingMode('upload')}
                    className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${craftingMode === 'upload' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
                  >
                    📁 사진 직접 업로드
                  </button>
                  <button
                    type="button"
                    onClick={() => setCraftingMode('ai_generate')}
                    className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${craftingMode === 'ai_generate' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
                  >
                    ✨ AI 3초 즉석 생성
                  </button>
                </div>
              </div>

              {craftingMode === 'ai_generate' && (
                <div className="p-4 rounded-xl border border-indigo-800/80 bg-indigo-950/20 space-y-3">
                  <span className="text-xs font-bold text-indigo-300">✨ AI 소품/무기 단독 누끼 3초 생성기</span>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={craftingPrompt}
                      onChange={(e) => setCraftingPrompt(e.target.value)}
                      placeholder="원하는 소품 묘사 (예: tactical combat knife, glowing cyberpunk katana on white bg)"
                      className="flex-1 bg-[#090D18] border border-indigo-700 text-slate-200 text-xs py-2 px-3 rounded-xl"
                    />
                    <button
                      type="button"
                      disabled={isGeneratingAsset}
                      onClick={() => handleQuickAssetGen('prop')}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      {isGeneratingAsset ? '생성 중...' : '⚡ 즉석 생성'}
                    </button>
                  </div>
                  {assetGenProgress && <p className="text-xs text-indigo-400 font-mono">{assetGenProgress}</p>}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">소품/무기 명칭</label>
                  <input
                    type="text"
                    value={propName}
                    onChange={(e) => setPropName(e.target.value)}
                    placeholder="예: K2 소총, 권총, 스마트폰, 보석함"
                    className="w-full bg-[#090D18] border border-slate-700 text-slate-200 text-xs py-2 px-3 rounded-xl"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">카테고리</label>
                  <select
                    value={propCategory}
                    onChange={(e) => setPropCategory(e.target.value as any)}
                    className="w-full bg-[#090D18] border border-slate-700 text-slate-200 text-xs py-2 px-3 rounded-xl font-mono"
                  >
                    <option value="weapon">⚔️ 무기 (Weapon)</option>
                    <option value="electronics">📱 전자기기 (Electronics)</option>
                    <option value="accessory">💍 악세서리 (Accessory)</option>
                    <option value="vehicle">🚗 탈것/비히클 (Vehicle)</option>
                    <option value="misc">📦 기타 소품 (Misc)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Display Image (단독 누끼) */}
                <div className="border border-dashed border-slate-700 p-4 rounded-xl text-center bg-[#05080E] space-y-2">
                  <span className="text-xs font-bold text-slate-300 block">1. 단독 누끼 컷 (제품 전시용)</span>
                  {propDisplayImg ? (
                    <div>
                      <img src={propDisplayImg} alt="Display" className="h-32 mx-auto object-contain" />
                      <button onClick={() => setPropDisplayImg(null)} className="text-[10px] text-rose-400 underline mt-1 cursor-pointer">
                        제거
                      </button>
                    </div>
                  ) : (
                    <label className="cursor-pointer block py-4">
                      <span className="text-xl block">📦</span>
                      <span className="text-[11px] text-slate-400">단독 사진 등록</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageFileUpload(e, setPropDisplayImg)}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                {/* Wield Image (파지/착용) */}
                <div className="border border-dashed border-slate-700 p-4 rounded-xl text-center bg-[#05080E] space-y-2">
                  <span className="text-xs font-bold text-slate-300 block">2. 파지/착용 컷 (스케일감 레퍼런스)</span>
                  {propWieldImg ? (
                    <div>
                      <img src={propWieldImg} alt="Wield" className="h-32 mx-auto object-contain" />
                      <button onClick={() => setPropWieldImg(null)} className="text-[10px] text-rose-400 underline mt-1 cursor-pointer">
                        제거
                      </button>
                    </div>
                  ) : (
                    <label className="cursor-pointer block py-4">
                      <span className="text-xl block">✋</span>
                      <span className="text-[11px] text-slate-400">파지 컷 등록</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageFileUpload(e, setPropWieldImg)}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleSaveProp}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  💾 소품 보관함에 저장
                </button>
              </div>
            </div>
          )}

          {/* SECTION 4: LANDMARKS & SETS (로케이션/세트장) */}
          {activeSection === 'landmark' && (
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-[#070B14] space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-slate-200 font-mono">🏞️ 로케이션 &amp; 세트장 (Environments)</h3>
                <div className="flex items-center space-x-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setCraftingMode('upload')}
                    className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${craftingMode === 'upload' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
                  >
                    📁 사진 직접 업로드
                  </button>
                  <button
                    type="button"
                    onClick={() => setCraftingMode('ai_generate')}
                    className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${craftingMode === 'ai_generate' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
                  >
                    ✨ AI 3초 즉석 생성
                  </button>
                </div>
              </div>

              {craftingMode === 'ai_generate' && (
                <div className="p-4 rounded-xl border border-indigo-800/80 bg-indigo-950/20 space-y-3">
                  <span className="text-xs font-bold text-indigo-300">✨ AI 클린 플레이트 배경 3초 생성기</span>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={craftingPrompt}
                      onChange={(e) => setCraftingPrompt(e.target.value)}
                      placeholder="원하는 배경 묘사 (예: cyberpunk dark rainy alley with neon signs, empty street)"
                      className="flex-1 bg-[#090D18] border border-indigo-700 text-slate-200 text-xs py-2 px-3 rounded-xl"
                    />
                    <button
                      type="button"
                      disabled={isGeneratingAsset}
                      onClick={() => handleQuickAssetGen('location')}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      {isGeneratingAsset ? '생성 중...' : '⚡ 즉석 생성'}
                    </button>
                  </div>
                  {assetGenProgress && <p className="text-xs text-indigo-400 font-mono">{assetGenProgress}</p>}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">배경 명칭</label>
                  <input
                    type="text"
                    value={lmName}
                    onChange={(e) => setLmName(e.target.value)}
                    placeholder="예: 취조실 세트, 심해 잠수정 브릿지"
                    className="w-full bg-[#090D18] border border-slate-700 text-slate-200 text-xs py-2 px-3 rounded-xl"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">위치/대기 조명</label>
                  <input
                    type="text"
                    value={lmLocation}
                    onChange={(e) => setLmLocation(e.target.value)}
                    placeholder="cinematic dark moody lighting, haze"
                    className="w-full bg-[#090D18] border border-slate-700 text-slate-200 text-xs py-2 px-3 rounded-xl"
                  />
                </div>
              </div>

              {/* Upload Dropzone */}
              {craftingMode === 'upload' && (
                <div className="border-2 border-dashed border-slate-700 p-6 rounded-xl text-center bg-[#05080E]">
                  {lmImagePreview ? (
                    <div className="space-y-2">
                      <img src={lmImagePreview} alt="Lm" className="max-h-40 mx-auto rounded object-cover" />
                      <button onClick={() => setLmImagePreview(null)} className="text-xs text-rose-400 underline cursor-pointer">
                        이미지 제거
                      </button>
                    </div>
                  ) : (
                    <label className="cursor-pointer space-y-1 block">
                      <span className="text-2xl block">🏛️</span>
                      <span className="text-xs text-slate-300 font-bold block">배경 클린 플레이트 사진 등록</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageFileUpload(e, setLmImagePreview)}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleAddLandmark}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  💾 세트장 보관함에 저장
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
