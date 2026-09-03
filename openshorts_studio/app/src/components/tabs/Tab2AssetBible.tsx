import React, { useState, useEffect } from 'react';
import { ProjectMaster, CharacterDNA, WardrobePreset, LandmarkDNA, StoryboardCut } from '../../types';


interface Tab2Props {
  project: ProjectMaster;
  initialAsset?: {
    type: 'character' | 'wardrobe' | 'landmark' | 'scene';
    name: string;
    koreanName?: string;
    prompt: string;
    imagePath?: string;
    cutId: string;
    visualDetails?: string;
  } | null;
  onClearInitialAsset?: () => void;
  onUpdateBible: (characters: CharacterDNA[], wardrobes: WardrobePreset[], landmarks: LandmarkDNA[]) => void;
  onNextTab: () => void;
}

export const Tab2AssetBible: React.FC<Tab2Props> = ({
  project,
  initialAsset,
  onClearInitialAsset,
  onUpdateBible,
  onNextTab,
}) => {
  const [activeSection, setActiveSection] = useState<'character' | 'wardrobe' | 'landmark' | 'scene'>('character');

  // Character Form State
  const [editingCharId, setEditingCharId] = useState<string | null>(null);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [charName, setCharName] = useState('');
  const [charAgeGender, setCharAgeGender] = useState('');
  const [charBodyBuild, setCharBodyBuild] = useState('');
  const [charFace, setCharFace] = useState('');
  const [charHair, setCharHair] = useState('');
  const [charTraits, setCharTraits] = useState('');
  const [charLoraName, setCharLoraName] = useState('');
  const [charLoraStrength, setCharLoraStrength] = useState<number>(0.8);
  const [charImagePreview, setCharImagePreview] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setSaveToast(msg);
    setTimeout(() => setSaveToast(null), 3500);
  };

  // Wardrobe Form State
  const [wbCharId, setWbCharId] = useState('');
  const [wbName, setWbName] = useState('');
  const [wbDesc, setWbDesc] = useState('');
  const [wbShoesProps, setWbShoesProps] = useState('');
  const [wbImagePreview, setWbImagePreview] = useState<string | null>(null);

  // Landmark Form State
  const [lmName, setLmName] = useState('');
  const [lmLocation, setLmLocation] = useState('');
  const [lmStructure, setLmStructure] = useState('');
  const [lmTraces, setLmTraces] = useState('');
  const [lmLighting, setLmLighting] = useState('');
  const [lmImagePreview, setLmImagePreview] = useState<string | null>(null);

  // 좌측 씬 피드에서 선택된 컷
  const [selectedFeedCutId, setSelectedFeedCutId] = useState<string | null>(
    project.cuts.length > 0 ? project.cuts[0].id : null
  );

  // Tab 1에서 넘어온 추천 에셋 자동 프리필
  useEffect(() => {
    if (initialAsset) {
      setActiveSection(initialAsset.type);
      if (initialAsset.type === 'character') {
        setCharName(initialAsset.koreanName || initialAsset.name);
        setCharTraits(initialAsset.visualDetails || '');
        setCharImagePreview(initialAsset.imagePath || null);
        setCharAgeGender('Korean male/female, 30s');
        setCharBodyBuild('detailed build, broad shoulders');
        setCharFace(initialAsset.prompt.substring(0, 100));
        setCharHair('short neat black hair');
      } else if (initialAsset.type === 'landmark') {
        setLmName(initialAsset.koreanName || initialAsset.name);
        setLmLighting(initialAsset.visualDetails || 'cinematic moody natural lighting');
        setLmImagePreview(initialAsset.imagePath || null);
        setLmStructure(initialAsset.prompt.substring(0, 120));
        setLmLocation('Scenario main location');
      } else if (initialAsset.type === 'wardrobe') {
        setWbName(initialAsset.koreanName || initialAsset.name);
        setWbDesc(initialAsset.visualDetails || 'detailed cinematic outfit');
        setWbImagePreview(initialAsset.imagePath || null);
      }
    }
  }, [initialAsset]);

  // 좌측 컷 카드를 우측 폼에 즉시 주입하는 헬퍼
  const handleFeedCutToForm = (cut: StoryboardCut, type: 'character' | 'landmark' | 'wardrobe') => {
    setActiveSection(type);
    const draftImg = cut.candidates?.[0]?.imagePath || cut.winnerImagePath || null;

    if (type === 'character') {
      setCharName(cut.originalText.substring(0, 15).trim());
      setCharTraits(cut.actingState || '');
      setCharImagePreview(draftImg);
      setCharAgeGender('Korean, cinematic portrait');
      setCharFace(cut.assembledPrompt?.substring(0, 120) || '');
    } else if (type === 'landmark') {
      setLmName(`Cut ${cut.cutNumber} 씬 장소`);
      setLmLighting(cut.cameraWeatherMod || 'cinematic lighting');
      setLmImagePreview(draftImg);
      setLmStructure(cut.assembledPrompt?.substring(0, 140) || '');
      setLmLocation('Scenario main set');
    } else if (type === 'wardrobe') {
      setWbName(`Cut ${cut.cutNumber} 착장`);
      setWbDesc('tactical dark outfit');
      setWbImagePreview(draftImg);
    }
  };

  // Local File Upload to Base64/DataURL
  const handleImageFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (val: string | null) => void
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setter(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // 1. Add or Update Character Asset
  const handleSaveCharacter = () => {
    if (!charName.trim()) {
      alert('인물 이름을 입력해 주십시오.');
      return;
    }
    const lockedPrompt = `${charAgeGender || 'Korean male, 30s'}, ${charBodyBuild || 'athletic build'}, ${charFace || 'sharp jawline'}, ${charHair || 'short neat black hair'}${charTraits ? ', ' + charTraits : ''}`.trim();

    if (editingCharId) {
      const updatedChars = project.characters.map((c) => {
        if (c.id === editingCharId) {
          return {
            ...c,
            name: charName.trim(),
            ageGender: charAgeGender.trim() || 'Korean male, 30s',
            bodyBuild: charBodyBuild.trim() || 'athletic build',
            faceFeatures: charFace.trim() || 'sharp jawline, intense gaze',
            hairStyle: charHair.trim() || 'short neat black hair',
            fixedTraits: charTraits ? charTraits.split(',').map((t) => t.trim()) : [],
            refImagePath: charImagePreview !== null ? charImagePreview : c.refImagePath,
            loraName: charLoraName.trim() || undefined,
            loraStrength: charLoraName.trim() ? charLoraStrength : undefined,
            lockedPromptBlock: lockedPrompt,
          };
        }
        return c;
      });
      onUpdateBible(updatedChars, project.wardrobes, project.landmarks);
      showToast(`인물 [${charName}] 정보가 성공적으로 수정 및 영구 저장되었습니다.`);
      setEditingCharId(null);
    } else {
      const newChar: CharacterDNA = {
        id: `char_${Date.now()}`,
        name: charName.trim(),
        ageGender: charAgeGender.trim() || 'Korean male, 30s',
        bodyBuild: charBodyBuild.trim() || 'athletic build',
        faceFeatures: charFace.trim() || 'sharp jawline, intense gaze',
        hairStyle: charHair.trim() || 'short neat black hair',
        fixedTraits: charTraits ? charTraits.split(',').map((t) => t.trim()) : [],
        refImagePath: charImagePreview || null,
        loraName: charLoraName.trim() || undefined,
        loraStrength: charLoraName.trim() ? charLoraStrength : undefined,
        lockedPromptBlock: lockedPrompt,
      };
      onUpdateBible([newChar, ...project.characters], project.wardrobes, project.landmarks);
      showToast(`인물 [${charName}] 에셋이 안전하게 등록 및 영구 저장되었습니다.`);
    }

    setCharName('');
    setCharAgeGender('');
    setCharBodyBuild('');
    setCharFace('');
    setCharHair('');
    setCharTraits('');
    setCharLoraName('');
    setCharImagePreview(null);
    if (onClearInitialAsset) onClearInitialAsset();
  };

  const handleStartEditCharacter = (char: CharacterDNA) => {
    setEditingCharId(char.id);
    setCharName(char.name);
    setCharAgeGender(char.ageGender || '');
    setCharBodyBuild(char.bodyBuild || '');
    setCharFace(char.faceFeatures || '');
    setCharHair(char.hairStyle || '');
    setCharTraits((char.fixedTraits || []).join(', '));
    setCharLoraName(char.loraName || '');
    setCharLoraStrength(char.loraStrength ?? 0.8);
    setCharImagePreview(char.refImagePath || null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingCharId(null);
    setCharName('');
    setCharAgeGender('');
    setCharBodyBuild('');
    setCharFace('');
    setCharHair('');
    setCharTraits('');
    setCharLoraName('');
    setCharImagePreview(null);
  };

  // 2. Add Wardrobe Asset
  const handleAddWardrobe = () => {
    if (!wbName.trim()) {
      alert('의상 명칭을 입력해 주십시오.');
      return;
    }
    const newWb: WardrobePreset = {
      id: `wb_${Date.now()}`,
      characterId: wbCharId || (project.characters[0]?.id ?? 'char_main'),
      name: wbName.trim(),
      outfitDescription: wbDesc.trim() || 'tactical jacket, dark pants',
      shoesProps: wbShoesProps.trim() || 'black boots',
      refImagePath: wbImagePreview || null,
    };

    onUpdateBible(project.characters, [newWb, ...project.wardrobes], project.landmarks);
    showToast(`의상 [${wbName}] 프리셋이 안전하게 등록 및 영구 저장되었습니다.`);
    setWbName('');
    setWbDesc('');
    setWbShoesProps('');
    setWbImagePreview(null);
    if (onClearInitialAsset) onClearInitialAsset();
  };

  // 3. Add Landmark Asset
  const handleAddLandmark = () => {
    if (!lmName.trim()) {
      alert('장소/배경 명칭을 입력해 주십시오.');
      return;
    }
    const lockedPrompt = `${lmName.trim()}, ${lmLocation.trim() || 'Seoul, South Korea'}, ${lmStructure.trim() || 'concrete modern architecture'}, ${lmLighting.trim() || 'cinematic moody natural lighting'}`.trim();
    const newLm: LandmarkDNA = {
      id: `lm_${Date.now()}`,
      name: lmName.trim(),
      location: lmLocation.trim() || 'Seoul, South Korea',
      structureMaterials: lmStructure.trim() || 'concrete modern architecture',
      lifeTraces: lmTraces.trim() || 'clean street, modern infrastructure',
      lightingAura: lmLighting.trim() || 'cinematic moody natural lighting',
      refImagePaths: lmImagePreview ? [lmImagePreview] : [],
      lockedPromptBlock: lockedPrompt,
    };

    onUpdateBible(project.characters, project.wardrobes, [newLm, ...project.landmarks]);
    showToast(`장소/배경 [${lmName}] 에셋이 안전하게 등록 및 영구 저장되었습니다.`);
    setLmName('');
    setLmLocation('');
    setLmStructure('');
    setLmTraces('');
    setLmLighting('');
    setLmImagePreview(null);
    if (onClearInitialAsset) onClearInitialAsset();
  };

  // Delete Handlers
  const handleDeleteCharacter = (id: string) => {
    onUpdateBible(
      project.characters.filter((c) => c.id !== id),
      project.wardrobes.filter((w) => w.characterId !== id),
      project.landmarks
    );
  };

  const handleDeleteWardrobe = (id: string) => {
    onUpdateBible(
      project.characters,
      project.wardrobes.filter((w) => w.id !== id),
      project.landmarks
    );
  };

  const handleDeleteLandmark = (id: string) => {
    onUpdateBible(
      project.characters,
      project.wardrobes,
      project.landmarks.filter((l) => l.id !== id)
    );
  };

  // Export / Import Bible JSON
  const handleExportBibleJSON = () => {
    const bibleData = {
      exportedAt: new Date().toISOString(),
      characters: project.characters,
      wardrobes: project.wardrobes,
      landmarks: project.landmarks,
    };
    const jsonStr = JSON.stringify(bibleData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `asset_bible_${project.title || 'master'}.json`;
    a.click();
  };

  const handleImportBibleJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string);
          if (parsed.characters && parsed.landmarks) {
            onUpdateBible(parsed.characters || [], parsed.wardrobes || [], parsed.landmarks || []);
            alert('에셋 사전 (bible.json)을 성공적으로 불러왔습니다.');
          } else {
            alert('유효하지 않은 bible.json 형식입니다.');
          }
        } catch (err) {
          alert(`파일 파싱 오류: ${err}`);
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="w-full px-6 py-6 space-y-6 max-w-[1920px] mx-auto">
      {/* Header Banner */}
      <div className="glass-panel p-5 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <h2 className="text-lg font-bold text-slate-100">세계관 및 에셋 사전 (Asset Bible)</h2>
            <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-800">
              📖 콘티 연동 와이드 워크스페이스
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            좌측의 <strong>1화 콘티 씬과 시안 이미지</strong>를 실시간으로 확인하면서, 우측에서 <strong>인물 DNA / 배경 랜드마크 / 의상</strong>을 손쉽게 등록 및 관리합니다.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {(project.characters.length > 0 || project.landmarks.length > 0) && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('바이블의 모든 인물, 의상, 랜드마크를 비우시겠습니까?')) {
                  onUpdateBible([], [], []);
                }
              }}
              className="px-3 py-2 bg-rose-950/60 hover:bg-rose-900 text-rose-300 rounded-lg text-xs font-semibold border border-rose-800 transition cursor-pointer"
              title="하드코딩 잔여물 및 기존 에셋 전체 비우기"
            >
              🗑️ 에셋 전체 비우기
            </button>
          )}
          <label className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 cursor-pointer transition">
            📂 사전 불러오기 (.json)
            <input type="file" accept=".json" onChange={handleImportBibleJSON} className="hidden" />
          </label>
          <button
            type="button"
            onClick={handleExportBibleJSON}
            className="px-3 py-2 bg-indigo-900/60 hover:bg-indigo-800 text-indigo-200 rounded-lg text-xs font-semibold border border-indigo-700 transition"
          >
            💾 사전 백업 (.json)
          </button>
          <button
            type="button"
            onClick={onNextTab}
            className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-bold transition shadow-md shadow-emerald-900/30 flex items-center space-x-2"
          >
            <span>다음: 2D 스토리보드 &rarr;</span>
          </button>
        </div>
      </div>

      {/* Main Wide Layout: Left 35% (Cuts Feed) + Right 65% (Asset Bible Studio) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* ======================================================== */}
        {/* LEFT 35% (Col 4): Novel Cuts & Draft Visual Reference    */}
        {/* ======================================================== */}
        <div className="xl:col-span-4 space-y-4">
          <div className="glass-panel p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold font-mono text-slate-200 flex items-center space-x-1.5">
                <span>📖 1화 콘티 씬 &amp; 시안 레퍼런스</span>
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                총 {project.cuts.length}개 컷
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              콘티 내용을 보면서 <strong>[채우기]</strong> 버튼을 누르면 우측 등록 폼에 내용과 이미지가 자동 주입됩니다.
            </p>

            <div className="space-y-3 max-h-[820px] overflow-y-auto pr-1">
              {project.cuts.map((cut) => {
                const isSelected = cut.id === selectedFeedCutId;
                const draftImg = cut.candidates?.[0]?.imagePath || cut.winnerImagePath;

                return (
                  <div
                    key={cut.id}
                    onClick={() => setSelectedFeedCutId(cut.id)}
                    className={`p-3.5 rounded-xl border transition space-y-2.5 ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-950/20 shadow-md'
                        : 'border-slate-800/80 bg-[#0C101A]/70 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">
                        {cut.id}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {cut.cameraWeatherMod}
                      </span>
                    </div>

                    {/* Image Preview if exists */}
                    {draftImg && (
                      <div className="w-full h-32 rounded-lg bg-[#070A10] border border-slate-800 overflow-hidden">
                        <img src={draftImg} alt={cut.id} className="w-full h-full object-cover" />
                      </div>
                    )}

                    <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                      {cut.originalText}
                    </p>

                    {/* Fast Inject Buttons */}
                    <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-slate-800/60">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFeedCutToForm(cut, 'character');
                        }}
                        className="py-1 px-1.5 rounded bg-indigo-950/60 hover:bg-indigo-900 text-indigo-300 text-[10px] font-mono border border-indigo-800/60 text-center transition"
                      >
                        + 인물 채우기
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFeedCutToForm(cut, 'landmark');
                        }}
                        className="py-1 px-1.5 rounded bg-teal-950/60 hover:bg-teal-900 text-teal-300 text-[10px] font-mono border border-teal-800/60 text-center transition"
                      >
                        + 배경 채우기
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFeedCutToForm(cut, 'wardrobe');
                        }}
                        className="py-1 px-1.5 rounded bg-purple-950/60 hover:bg-purple-900 text-purple-300 text-[10px] font-mono border border-purple-800/60 text-center transition"
                      >
                        + 의상 채우기
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* RIGHT 65% (Col 8): Asset Bible Workbench & Lists        */}
        {/* ======================================================== */}
        <div className="xl:col-span-8 space-y-6">
          {/* Pending Import Banner from Tab 1 */}
          {initialAsset && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-950/80 to-purple-950/80 border border-indigo-600/70 flex items-center justify-between shadow-lg">
              <div className="flex items-center space-x-3">
                <span className="text-2xl">✨</span>
                <div>
                  <h4 className="text-xs font-bold text-indigo-200 font-mono">
                    Tab 1에서 가져온 추천 에셋: [{initialAsset.koreanName || initialAsset.name}]
                  </h4>
                  <p className="text-[11px] text-slate-300">
                    아래 폼에 내용과 이미지가 자동 채워졌습니다. 확인 후 <strong>[등록 완료]</strong>를 누르세요.
                  </p>
                </div>
              </div>
              {onClearInitialAsset && (
                <button
                  type="button"
                  onClick={onClearInitialAsset}
                  className="text-xs text-slate-400 hover:text-slate-200 underline font-mono"
                >
                  초기화
                </button>
              )}
            </div>
          )}

          {/* Category Navigation Tabs */}
          <div className="flex space-x-2 border-b border-slate-800 pb-3">
            <button
              type="button"
              onClick={() => setActiveSection('character')}
              className={`px-5 py-2 rounded-lg text-xs font-bold transition flex items-center space-x-2 ${
                activeSection === 'character'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <span>👤 인물 DNA 사전 ({project.characters.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('wardrobe')}
              className={`px-5 py-2 rounded-lg text-xs font-bold transition flex items-center space-x-2 ${
                activeSection === 'wardrobe'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <span>👗 의상 및 착장 사전 ({project.wardrobes.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('landmark')}
              className={`px-5 py-2 rounded-lg text-xs font-bold transition flex items-center space-x-2 ${
                activeSection === 'landmark'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <span>🏛️ 배경 및 장소 사전 ({project.landmarks.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('scene')}
              className={`px-5 py-2 rounded-lg text-xs font-bold transition flex items-center space-x-2 ${
                activeSection === 'scene'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <span>🎬 마스터 씬 장면 보관소 ({project.cuts.filter((c) => c.winnerImagePath || (c.candidates && c.candidates.length > 0)).length})</span>
            </button>
          </div>

          {/* Toast Notification */}
          {saveToast && (
            <div className="p-3 bg-emerald-950/90 border border-emerald-500 text-emerald-200 text-xs font-bold rounded-xl flex items-center space-x-2 shadow-lg">
              <span>✅</span>
              <span>{saveToast}</span>
            </div>
          )}

          {/* 1. CHARACTER SECTION */}
          {activeSection === 'character' && (
            <div className="space-y-6">
              <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                    {editingCharId ? '✏️ 인물 에셋 정보 수정' : '+ 새 인물 에셋 등록 (ComfyUI 결과물 / 프롬프트)'}
                  </h3>
                  {editingCharId && (
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="text-xs text-slate-400 hover:text-slate-200 underline font-normal"
                    >
                      수정 취소
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="border border-dashed border-slate-700 rounded-xl p-4 flex flex-col items-center justify-center bg-[#0D131F] min-h-[180px]">
                    {charImagePreview ? (
                      <div className="relative w-full h-full flex flex-col items-center">
                        <img src={charImagePreview} alt="Preview" className="max-h-36 rounded-lg object-contain" />
                        <button onClick={() => setCharImagePreview(null)} className="mt-2 text-[10px] text-rose-400 hover:underline">
                          이미지 제거
                        </button>
                      </div>
                    ) : (
                      <label className="cursor-pointer text-center space-y-1">
                        <div className="w-10 h-10 mx-auto rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                          🖼️
                        </div>
                        <span className="text-xs text-slate-400 block font-mono">얼굴/턴어라운드 사진 업로드</span>
                        <span className="text-[10px] text-slate-500 block font-mono">클릭하여 파일 선택 (.png)</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleImageFileUpload(e, setCharImagePreview)}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>

                  <div className="md:col-span-2 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-mono text-slate-400 block mb-1">인물 이름</label>
                        <input
                          type="text"
                          value={charName}
                          onChange={(e) => setCharName(e.target.value)}
                          placeholder="예: 잠수정 함장, 소나 탐지관"
                          className="w-full bg-[#0D131F] border border-slate-700 text-slate-200 text-xs py-1.5 px-3 rounded-lg focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-mono text-slate-400 block mb-1">연령/성별 영문 프롬프트</label>
                        <input
                          type="text"
                          value={charAgeGender}
                          onChange={(e) => setCharAgeGender(e.target.value)}
                          placeholder="Korean male in mid-30s"
                          className="w-full bg-[#0D131F] border border-slate-700 text-slate-200 text-xs py-1.5 px-3 rounded-lg focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-mono text-slate-400 block mb-1">체형 및 외형</label>
                        <input
                          type="text"
                          value={charBodyBuild}
                          onChange={(e) => setCharBodyBuild(e.target.value)}
                          placeholder="athletic muscular build, broad shoulders"
                          className="w-full bg-[#0D131F] border border-slate-700 text-slate-200 text-xs py-1.5 px-3 rounded-lg focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-mono text-slate-400 block mb-1">이목구비 특징</label>
                        <input
                          type="text"
                          value={charFace}
                          onChange={(e) => setCharFace(e.target.value)}
                          placeholder="sharp jawline, cold intense gaze, high nose"
                          className="w-full bg-[#0D131F] border border-slate-700 text-slate-200 text-xs py-1.5 px-3 rounded-lg focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-mono text-slate-400 block mb-1">헤어스타일</label>
                        <input
                          type="text"
                          value={charHair}
                          onChange={(e) => setCharHair(e.target.value)}
                          placeholder="short neat military style black hair"
                          className="w-full bg-[#0D131F] border border-slate-700 text-slate-200 text-xs py-1.5 px-3 rounded-lg focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-mono text-slate-400 block mb-1">불변 키워드 (쉼표 구분)</label>
                        <input
                          type="text"
                          value={charTraits}
                          onChange={(e) => setCharTraits(e.target.value)}
                          placeholder="faint scar on cheek, stoic expression"
                          className="w-full bg-[#0D131F] border border-slate-700 text-slate-200 text-xs py-1.5 px-3 rounded-lg focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-mono text-slate-400 block mb-1">LoRA 파일명 (선택)</label>
                        <input
                          type="text"
                          value={charLoraName}
                          onChange={(e) => setCharLoraName(e.target.value)}
                          placeholder="character_lora_v1.safetensors"
                          className="w-full bg-[#0D131F] border border-slate-700 text-slate-200 text-xs py-1.5 px-3 rounded-lg focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                          <span>LoRA 추천 강도: {charLoraStrength}</span>
                        </div>
                        <input
                          type="range"
                          min="0.1"
                          max="1.5"
                          step="0.05"
                          value={charLoraStrength}
                          onChange={(e) => setCharLoraStrength(parseFloat(e.target.value))}
                          className="w-full accent-indigo-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end items-center space-x-2 pt-2">
                  {editingCharId && (
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition cursor-pointer"
                    >
                      취소
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSaveCharacter}
                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition shadow-md shadow-indigo-900/30 cursor-pointer"
                  >
                    {editingCharId ? '💾 인물 정보 수정 저장 완료' : '+ 인물 에셋 사전 등록 완료'}
                  </button>
                </div>
              </div>

              {/* Character List Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {project.characters.map((char) => (
                  <div key={char.id} className="glass-panel p-4 rounded-xl border border-slate-800 space-y-3 relative group">
                    <div className="absolute top-3 right-3 flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => handleStartEditCharacter(char)}
                        className="text-slate-400 hover:text-indigo-300 text-xs font-mono transition cursor-pointer"
                        title="인물 정보 수정"
                      >
                        ✏️ 수정
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCharacter(char.id)}
                        className="text-slate-500 hover:text-rose-400 text-xs font-mono transition cursor-pointer"
                        title="인물 삭제"
                      >
                        &times; 삭제
                      </button>
                    </div>

                    <div className="flex items-start space-x-3">
                      <div className="w-16 h-20 rounded-lg bg-[#070A10] border border-slate-800 overflow-hidden flex-shrink-0 flex items-center justify-center">
                        {char.refImagePath ? (
                          <img src={char.refImagePath} alt={char.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xl">👤</span>
                        )}
                      </div>

                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <h4 className="text-xs font-bold text-slate-100">{char.name}</h4>
                          {char.loraName && (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                              LoRA
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono truncate">{char.ageGender}</p>
                        <p className="text-[11px] text-slate-400 font-mono truncate">{char.faceFeatures}</p>
                      </div>
                    </div>

                    <div className="bg-[#070A10] p-2 rounded-lg border border-slate-800/80 text-[10px] font-mono text-slate-300 line-clamp-2">
                      {char.lockedPromptBlock}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. WARDROBE SECTION */}
          {activeSection === 'wardrobe' && (
            <div className="space-y-6">
              <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-4">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                  + 새 의상 및 착장 프리셋 등록
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="border border-dashed border-slate-700 rounded-xl p-4 flex flex-col items-center justify-center bg-[#0D131F] min-h-[160px]">
                    {wbImagePreview ? (
                      <div className="relative w-full h-full flex flex-col items-center">
                        <img src={wbImagePreview} alt="Preview" className="max-h-32 rounded-lg object-contain" />
                        <button onClick={() => setWbImagePreview(null)} className="mt-2 text-[10px] text-rose-400 hover:underline">
                          이미지 제거
                        </button>
                      </div>
                    ) : (
                      <label className="cursor-pointer text-center space-y-1">
                        <div className="w-10 h-10 mx-auto rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                          👗
                        </div>
                        <span className="text-xs text-slate-400 block font-mono">의상 레퍼런스 사진 업로드</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleImageFileUpload(e, setWbImagePreview)}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>

                  <div className="md:col-span-2 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-mono text-slate-400 block mb-1">대상 인물</label>
                        <select
                          value={wbCharId}
                          onChange={(e) => setWbCharId(e.target.value)}
                          className="w-full bg-[#0D131F] border border-slate-700 text-slate-200 text-xs py-1.5 px-3 rounded-lg focus:border-indigo-500 font-mono"
                        >
                          {project.characters.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] font-mono text-slate-400 block mb-1">의상 명칭</label>
                        <input
                          type="text"
                          value={wbName}
                          onChange={(e) => setWbName(e.target.value)}
                          placeholder="예: 잠수정 파일럿 슈트, 동계 제복"
                          className="w-full bg-[#0D131F] border border-slate-700 text-slate-200 text-xs py-1.5 px-3 rounded-lg focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-mono text-slate-400 block mb-1">상의/하의 영문 프롬프트</label>
                      <input
                        type="text"
                        value={wbDesc}
                        onChange={(e) => setWbDesc(e.target.value)}
                        placeholder="dark navy submarine uniform, tactical fleece jacket, cargo pants"
                        className="w-full bg-[#0D131F] border border-slate-700 text-slate-200 text-xs py-1.5 px-3 rounded-lg focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-mono text-slate-400 block mb-1">신발 및 소품</label>
                      <input
                        type="text"
                        value={wbShoesProps}
                        onChange={(e) => setWbShoesProps(e.target.value)}
                        placeholder="tactical combat boots, acoustic headset around neck"
                        className="w-full bg-[#0D131F] border border-slate-700 text-slate-200 text-xs py-1.5 px-3 rounded-lg focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleAddWardrobe}
                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition shadow-md shadow-indigo-900/30"
                  >
                    + 의상 사전 등록 완료
                  </button>
                </div>
              </div>

              {/* Wardrobe List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {project.wardrobes.map((wb) => {
                  const owner = project.characters.find((c) => c.id === wb.characterId);
                  return (
                    <div key={wb.id} className="glass-panel p-4 rounded-xl border border-slate-800 space-y-3 relative group">
                      <button
                        onClick={() => handleDeleteWardrobe(wb.id)}
                        className="absolute top-3 right-3 text-slate-500 hover:text-rose-400 text-xs font-mono transition"
                      >
                        &times; 삭제
                      </button>

                      <div className="flex items-start space-x-3">
                        <div className="w-16 h-20 rounded-lg bg-[#070A10] border border-slate-800 overflow-hidden flex-shrink-0 flex items-center justify-center">
                          {wb.refImagePath ? (
                            <img src={wb.refImagePath} alt={wb.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xl">👗</span>
                          )}
                        </div>

                        <div className="space-y-1 flex-1 min-w-0">
                          <h4 className="text-xs font-bold text-slate-100">{wb.name}</h4>
                          <p className="text-[11px] text-indigo-400 font-mono">대상: {owner?.name || '공용'}</p>
                          <p className="text-[11px] text-slate-400 font-mono truncate">{wb.outfitDescription}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. LANDMARK SECTION */}
          {activeSection === 'landmark' && (
            <div className="space-y-6">
              <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-4">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                  + 새 배경 및 장소 랜드마크 등록
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="border border-dashed border-slate-700 rounded-xl p-4 flex flex-col items-center justify-center bg-[#0D131F] min-h-[160px]">
                    {lmImagePreview ? (
                      <div className="relative w-full h-full flex flex-col items-center">
                        <img src={lmImagePreview} alt="Preview" className="max-h-32 rounded-lg object-contain" />
                        <button onClick={() => setLmImagePreview(null)} className="mt-2 text-[10px] text-rose-400 hover:underline">
                          이미지 제거
                        </button>
                      </div>
                    ) : (
                      <label className="cursor-pointer text-center space-y-1">
                        <div className="w-10 h-10 mx-auto rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                          🏛️
                        </div>
                        <span className="text-xs text-slate-400 block font-mono">배경 레퍼런스 사진 업로드</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleImageFileUpload(e, setLmImagePreview)}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>

                  <div className="md:col-span-2 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-mono text-slate-400 block mb-1">배경 명칭</label>
                        <input
                          type="text"
                          value={lmName}
                          onChange={(e) => setLmName(e.target.value)}
                          placeholder="예: 수심 400m 심해 난파선, 잠수정 조종실"
                          className="w-full bg-[#0D131F] border border-slate-700 text-slate-200 text-xs py-1.5 px-3 rounded-lg focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-mono text-slate-400 block mb-1">위치/지리 설정</label>
                        <input
                          type="text"
                          value={lmLocation}
                          onChange={(e) => setLmLocation(e.target.value)}
                          placeholder="East Sea abyss, 400 meters depth"
                          className="w-full bg-[#0D131F] border border-slate-700 text-slate-200 text-xs py-1.5 px-3 rounded-lg focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-mono text-slate-400 block mb-1">구조 및 건축/환경 재질</label>
                      <input
                        type="text"
                        value={lmStructure}
                        onChange={(e) => setLmStructure(e.target.value)}
                        placeholder="ancient sunken wooden vessel, rusty metal hull, dense water pressure, silt"
                        className="w-full bg-[#0D131F] border border-slate-700 text-slate-200 text-xs py-1.5 px-3 rounded-lg focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-mono text-slate-400 block mb-1">조명 및 대기 분위기</label>
                      <input
                        type="text"
                        value={lmLighting}
                        onChange={(e) => setLmLighting(e.target.value)}
                        placeholder="pitch black abyss, harsh submersible headlight beams, volumetric water haze"
                        className="w-full bg-[#0D131F] border border-slate-700 text-slate-200 text-xs py-1.5 px-3 rounded-lg focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleAddLandmark}
                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition shadow-md shadow-indigo-900/30"
                  >
                    + 배경 랜드마크 사전 등록 완료
                  </button>
                </div>
              </div>

              {/* Landmark List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {project.landmarks.map((lm) => (
                  <div key={lm.id} className="glass-panel p-4 rounded-xl border border-slate-800 space-y-3 relative group">
                    <button
                      onClick={() => handleDeleteLandmark(lm.id)}
                      className="absolute top-3 right-3 text-slate-500 hover:text-rose-400 text-xs font-mono transition"
                    >
                      &times; 삭제
                    </button>

                    <div className="flex items-start space-x-3">
                      <div className="w-16 h-20 rounded-lg bg-[#070A10] border border-slate-800 overflow-hidden flex-shrink-0 flex items-center justify-center">
                        {lm.refImagePaths && lm.refImagePaths.length > 0 ? (
                          <img src={lm.refImagePaths[0]} alt={lm.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xl">🏛️</span>
                        )}
                      </div>

                      <div className="space-y-1 flex-1 min-w-0">
                        <h4 className="text-xs font-bold text-slate-100">{lm.name}</h4>
                        <p className="text-[11px] text-teal-400 font-mono truncate">{lm.location}</p>
                        <p className="text-[11px] text-slate-400 font-mono truncate">{lm.structureMaterials}</p>
                      </div>
                    </div>

                    <div className="bg-[#070A10] p-2 rounded-lg border border-slate-800/80 text-[10px] font-mono text-slate-300 line-clamp-2">
                      {lm.lockedPromptBlock}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. SCENE MASTER ARCHIVE SECTION */}
          {activeSection === 'scene' && (
            <div className="space-y-6">
              <div className="glass-panel p-5 rounded-xl border border-amber-900/50 bg-gradient-to-r from-amber-950/20 to-[#0B0F19] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-amber-300 font-mono flex items-center space-x-2">
                    <span>🎬 마스터 씬 장면 보관소 (Scene Master Plates)</span>
                  </h3>
                  <p className="text-xs text-slate-300 mt-1">
                    각본 콘티에서 확립된 <strong>공간 배치, 조명 톤, 카메라 미장센의 기준 플레이트</strong>입니다. 3단계에서 Qwen 다각도 회전과 소품 연출의 베이스로 직결됩니다.
                  </p>
                </div>
                <button
                  onClick={onNextTab}
                  className="px-4 py-2 bg-gradient-to-r from-amber-600 to-indigo-600 hover:from-amber-500 hover:to-indigo-500 text-white rounded-lg text-xs font-bold transition shadow-md flex items-center space-x-1.5 flex-shrink-0"
                >
                  <span>3단계 2D 스토리보드 바로가기 &rarr;</span>
                </button>
              </div>

              {/* Scene Plates Grid */}
              {project.cuts.filter((c) => c.winnerImagePath || (c.candidates && c.candidates.length > 0)).length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {project.cuts
                    .filter((c) => c.winnerImagePath || (c.candidates && c.candidates.length > 0))
                    .map((cut) => {
                      const sceneImg = cut.candidates?.[0]?.imagePath || cut.winnerImagePath;
                      return (
                        <div
                          key={cut.id}
                          className="glass-panel p-4 rounded-xl border border-amber-900/40 bg-[#0C101A]/80 hover:border-amber-700/60 transition space-y-3 relative group"
                        >
                          {/* Card Header: Origin Tag & Camera Mod */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                                🎬 {cut.id} 마스터 씬
                              </span>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                [출처: {project.chapter || '1화'}]
                              </span>
                            </div>
                            <span className="text-[11px] font-mono text-slate-400">
                              {cut.cameraWeatherMod}
                            </span>
                          </div>

                          {/* Large Scene Image Preview */}
                          {sceneImg && (
                            <div className="w-full h-52 rounded-lg bg-[#070A10] border border-slate-800 overflow-hidden flex items-center justify-center">
                              <img src={sceneImg} alt={cut.id} className="w-full h-full object-cover" />
                            </div>
                          )}

                          {/* Korean Text & Dialogue */}
                          <p className="text-xs text-slate-200 line-clamp-2 leading-relaxed">
                            {cut.originalText}
                          </p>
                          {cut.dialogueText && (
                            <div className="text-[11px] text-amber-300 font-mono bg-[#070A10] px-2 py-1 rounded border border-amber-900/30 truncate">
                              &ldquo;{cut.dialogueText}&rdquo;
                            </div>
                          )}

                          {/* Direct Navigation to Tab 3 with this Cut */}
                          <div className="pt-2 border-t border-slate-800 flex justify-end">
                            <button
                              onClick={onNextTab}
                              className="text-xs text-amber-400 hover:text-amber-300 font-mono font-bold flex items-center space-x-1"
                            >
                              <span>스토리보드에서 Qwen 앵글 회전 연출하기 &rarr;</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div className="glass-panel p-12 rounded-2xl border border-slate-800 text-center space-y-3">
                  <span className="text-3xl">🎬</span>
                  <h4 className="text-sm font-bold text-slate-300">보관된 마스터 씬이 없습니다</h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                    [1. 스크립트 디렉터]에서 컷별로 쾌속 시안을 렌더링한 후,<br />
                    <strong>&lsquo;[🎬 이 이미지를 마스터 씬으로 확정 및 채택]&rsquo;</strong> 버튼을 누르면 이 보관소에 자동으로 족보가 등록됩니다.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
