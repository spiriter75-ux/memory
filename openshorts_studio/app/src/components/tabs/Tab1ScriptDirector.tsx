import React, { useState, useEffect } from 'react';
import { ProjectMaster, StoryboardCut, INSTALLED_UNET_MODELS } from '../../types';
import { aiDirectorService, OllamaModelInfo } from '../../services/aiDirectorService';
import { comfyClient } from '../../services/comfyClient';
import { WorkflowRegistry } from '../../services/workflowRegistry';

const workflowRegistry = new WorkflowRegistry();

interface Tab1Props {
  project: ProjectMaster;
  onUpdateCuts: (cuts: StoryboardCut[], projectTitle?: string, chapter?: string) => void;
  onUpdateCut?: (updatedCut: StoryboardCut) => void;
  onSendToBible?: (asset: {
    type: 'character' | 'wardrobe' | 'landmark' | 'scene';
    name: string;
    koreanName?: string;
    prompt: string;
    imagePath?: string;
    cutId: string;
    visualDetails?: string;
  }) => void;
  onNextTab: () => void;
}

export const Tab1ScriptDirector: React.FC<Tab1Props> = ({
  project,
  onUpdateCuts,
  onUpdateCut,
  onSendToBible,
  onNextTab,
}) => {
  const [novelText, setNovelText] = useState<string>(
    project.cuts.length > 0 ? project.cuts.map((c) => c.originalText).join('\n\n') : ''
  );

  // AI 엔진 선택: 'gemini' | 'ollama'
  const [aiProvider, setAiProvider] = useState<'gemini' | 'ollama'>(() => {
    return (localStorage.getItem('openshorts_ai_provider') as 'gemini' | 'ollama') || 'ollama';
  });

  // Gemini 설정
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => {
    return (
      localStorage.getItem('openshorts_gemini_api_key') ||
      localStorage.getItem('gemini_api_key') ||
      ''
    );
  });
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [geminiModel, setGeminiModel] = useState<string>(() => {
    return localStorage.getItem('openshorts_gemini_model') || 'gemini-2.5-flash';
  });

  // Ollama 설정
  const [availableOllamaModels, setAvailableOllamaModels] = useState<OllamaModelInfo[]>([]);
  const [selectedOllamaModel, setSelectedOllamaModel] = useState<string>(
    'huihui_ai/qwen3.5-abliterated:9b-Qwopus-q8_0'
  );
  const [ollamaConnected, setOllamaConnected] = useState<boolean | null>(null);

  // 실행 상태
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');

  // 컷 선택 및 쾌속 시안 렌더링 상태
  const [selectedCutId, setSelectedCutId] = useState<string | null>(
    project.cuts.length > 0 ? project.cuts[0].id : null
  );
  const [selectedDraftModelId, setSelectedDraftModelId] = useState<string>('z-image-turbo');
  const [isDraftRendering, setIsDraftRendering] = useState<boolean>(false);
  const [draftRenderProgress, setDraftRenderProgress] = useState<string>('');

  // 현재 선택된 컷
  const currentCut = project.cuts.find((c) => c.id === selectedCutId) || project.cuts[0] || null;

  // Gemini API Key 저장 핸들러
  const handleApiKeyChange = (val: string) => {
    setGeminiApiKey(val);
    localStorage.setItem('openshorts_gemini_api_key', val);
  };

  const handleProviderChange = (provider: 'gemini' | 'ollama') => {
    setAiProvider(provider);
    localStorage.setItem('openshorts_ai_provider', provider);
  };

  const handleGeminiModelChange = (val: string) => {
    setGeminiModel(val);
    localStorage.setItem('openshorts_gemini_model', val);
  };

  // 로컬 Ollama 모델 실시간 로딩
  useEffect(() => {
    let isMounted = true;
    const fetchModels = async () => {
      try {
        const models = await aiDirectorService.getInstalledModels();
        if (isMounted) {
          if (models.length > 0) {
            setAvailableOllamaModels(models);
            setOllamaConnected(true);
            const novelModel =
              models.find((m) => m.name.includes('abliterated')) ||
              models.find((m) => m.name.includes('qwen3.5:9b-Q8')) ||
              models.find((m) => m.name.includes('27B')) ||
              models[0];
            setSelectedOllamaModel(novelModel.name);
          } else {
            setOllamaConnected(false);
          }
        }
      } catch {
        if (isMounted) setOllamaConnected(false);
      }
    };
    fetchModels();
    return () => {
      isMounted = false;
    };
  }, []);

  // 컷 목록이 변경되면 첫 번째 컷 선택
  useEffect(() => {
    if (project.cuts.length > 0 && (!selectedCutId || !project.cuts.some((c) => c.id === selectedCutId))) {
      setSelectedCutId(project.cuts[0].id);
    }
  }, [project.cuts, selectedCutId]);

  // 대본 및 모든 컷 완전 초기화 (찌꺼기 100% 소각)
  const handleClearAllScript = () => {
    if (window.confirm('대본 텍스트 및 등록된 모든 컷을 완전히 비우고 초기화하시겠습니까?')) {
      setNovelText('');
      onUpdateCuts([], project.title, project.chapter);
    }
  };

  // 소설 콘티 분할 실행
  const handleRunAIDecomposition = async () => {
    if (!novelText.trim()) {
      alert('소설 원문 텍스트를 입력해 주십시오.');
      return;
    }

    setIsProcessing(true);
    setStatusMessage(aiProvider === 'gemini' ? 'Gemini AI 연결 중...' : '로컬 Ollama LLM 연결 중...');

    try {
      let result;
      if (aiProvider === 'gemini') {
        if (!geminiApiKey.trim()) {
          throw new Error('Gemini API 키가 입력되지 않았습니다. 상단 입력창에 유효한 Gemini API 키를 입력해 주십시오.');
        }
        result = await aiDirectorService.decomposeNovelWithGemini(
          novelText,
          geminiApiKey,
          geminiModel,
          (msg) => setStatusMessage(msg)
        );
      } else {
        result = await aiDirectorService.decomposeNovelWithOllama(
          novelText,
          selectedOllamaModel,
          (msg) => setStatusMessage(msg)
        );
      }

      onUpdateCuts(result.cuts, result.projectTitle, result.chapter);
      if (result.cuts.length > 0) {
        setSelectedCutId(result.cuts[0].id);
      }
      setStatusMessage(`AI 콘티 컷 추출 완료! (총 ${result.cuts.length}개 컷 구성됨)`);
    } catch (err: unknown) {
      alert(`[AI 분할 오류] ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // ⚡ 15스텝 쾌속 시안 단독 렌더링 핸들러
  const handleGenerateDraft = async (cut: StoryboardCut) => {
    if (isDraftRendering) return;
    setIsDraftRendering(true);
    setDraftRenderProgress('ComfyUI VRAM 정리 및 쾌속 렌더링 초기화...');

    try {
      await comfyClient.freeMemory();

      const promptText = cut.assembledPrompt || cut.originalText;
      const modelMeta = INSTALLED_UNET_MODELS.find((m) => m.id === selectedDraftModelId) 
        || INSTALLED_UNET_MODELS.find((m) => m.id === 'z-image-turbo') 
        || INSTALLED_UNET_MODELS[0];
      const seed = Math.floor(Math.random() * 100000000);
      const steps = modelMeta.recommendedSteps || 10;

      const workflow = workflowRegistry.buildDynamic2DWorkflow({
        unetModelId: modelMeta.id,
        prompt: promptText,
        seed,
        width: 768,
        height: 1152,
        steps,
        cfg: 1.0,
      });

      setDraftRenderProgress(`ComfyUI에 쾌속 시안 큐 전송 (${modelMeta.displayName})...`);
      const promptId = await comfyClient.queuePrompt(workflow.payload);

      setDraftRenderProgress('초안 이미지 생성 중 (약 2~3초 소요)...');
      const outputs = await comfyClient.waitForCompletion(promptId, (percent) => {
        setDraftRenderProgress(`시안 렌더링 중 (${percent}%)...`);
      });

      const imgUrl = comfyClient.extractOutputImageUrl(outputs as Record<string, any>);
      if (!imgUrl) {
        throw new Error('ComfyUI에서 시안 이미지가 출력되지 않았습니다.');
      }

      const newCandidate = {
        id: `draft_${Date.now()}`,
        engine: 'z_image_turbo_bf16',
        modelFileName: 'z_image_turbo_bf16.safetensors',
        imagePath: imgUrl,
        prompt: promptText,
        seed,
        createdAt: new Date().toISOString(),
      };

      const existingCandidates = cut.candidates || [];
      const updatedCandidates = [newCandidate, ...existingCandidates.filter((c) => c.imagePath !== imgUrl)];

      const updatedCut: StoryboardCut = {
        ...cut,
        candidates: updatedCandidates,
        selectedCandidateIndex: 0,
        winnerImagePath: cut.winnerImagePath || imgUrl,
      };

      if (onUpdateCut) {
        onUpdateCut(updatedCut);
      }
      setDraftRenderProgress('✅ 쾌속 시안 렌더링 완료!');
    } catch (err: unknown) {
      alert(`[시안 렌더링 오류] ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsDraftRendering(false);
    }
  };

  // 🎬 이 컷의 시안을 '마스터 씬 장면(Scene Reference)'으로 확정 및 채택
  const handleAdoptAsScene = () => {
    if (!currentCut) return;
    const latestImg = currentCut.candidates?.[0]?.imagePath || currentCut.winnerImagePath || undefined;
    if (onSendToBible) {
      onSendToBible({
        type: 'scene',
        name: `Cut ${currentCut.cutNumber} 씬 장면 (마스터 씬)`,
        koreanName: currentCut.originalText.substring(0, 24).trim(),
        prompt: currentCut.assembledPrompt || '',
        imagePath: latestImg,
        cutId: currentCut.id,
        visualDetails: `${currentCut.cameraWeatherMod || 'cinematic shot'} | ${currentCut.actingState || 'key scene staging'}`,
      });
    }
  };

  // 👤 이 컷을 '인물 DNA' 바이블로 채택
  const handleAdoptAsCharacter = () => {
    if (!currentCut) return;
    const latestImg = currentCut.candidates?.[0]?.imagePath || currentCut.winnerImagePath || undefined;
    if (onSendToBible) {
      onSendToBible({
        type: 'character',
        name: currentCut.actingState?.split(',')[0]?.trim() || `Cut ${currentCut.cutNumber} 인물`,
        koreanName: currentCut.originalText.substring(0, 15).trim(),
        prompt: currentCut.assembledPrompt || '',
        imagePath: latestImg,
        cutId: currentCut.id,
        visualDetails: currentCut.actingState || 'focused cinematic expression',
      });
    }
  };

  // 🏰 이 컷을 '배경 랜드마크' 바이블로 채택
  const handleAdoptAsLandmark = () => {
    if (!currentCut) return;
    const latestImg = currentCut.candidates?.[0]?.imagePath || currentCut.winnerImagePath || undefined;
    if (onSendToBible) {
      onSendToBible({
        type: 'landmark',
        name: `Cut ${currentCut.cutNumber} 씬 장소`,
        koreanName: currentCut.originalText.substring(0, 20).trim(),
        prompt: currentCut.assembledPrompt || '',
        imagePath: latestImg,
        cutId: currentCut.id,
        visualDetails: currentCut.cameraWeatherMod || 'cinematic environment',
      });
    }
  };

  // 👗 이 컷을 '의상' 바이블로 채택
  const handleAdoptAsWardrobe = () => {
    if (!currentCut) return;
    const latestImg = currentCut.candidates?.[0]?.imagePath || currentCut.winnerImagePath || undefined;
    if (onSendToBible) {
      onSendToBible({
        type: 'wardrobe',
        name: `Cut ${currentCut.cutNumber} 착장 의상`,
        koreanName: currentCut.originalText.substring(0, 15).trim(),
        prompt: currentCut.assembledPrompt || '',
        imagePath: latestImg,
        cutId: currentCut.id,
        visualDetails: 'detailed outfit and accessories',
      });
    }
  };

  return (
    <div className="w-full px-6 py-6 space-y-6 max-w-[1920px] mx-auto">
      {/* Top Banner & Mode Control */}
      <div className="glass-panel p-5 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <h2 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
              <span>AI 대본 디렉터 & 쾌속 시안 스튜디오</span>
            </h2>
            <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-indigo-950/80 text-indigo-300 border border-indigo-800">
              {aiProvider === 'gemini' ? '✨ Gemini API 모드' : '🦙 로컬 Ollama 모드'}
            </span>
            {project.cuts.length > 0 && (
              <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-800">
                총 {project.cuts.length}개 컷 구성됨
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            소설 속 극적 비트를 AI가 컷으로 분할하고, <strong>우측 작업대에서 15스텝 쾌속 시안을 즉시 생성하여 에셋 바이블로 바로 채택</strong>합니다.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={onNextTab}
            className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-lg transition shadow-md shadow-emerald-900/30 flex items-center space-x-2"
          >
            <span>다음: 에셋 바이블 (Asset Bible) &rarr;</span>
          </button>
        </div>
      </div>

      {/* Main 50:50 Split-View Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ======================================================== */}
        {/* LEFT 50% (Col 6): Novel Input & Extracted Cuts Feed      */}
        {/* ======================================================== */}
        <div className="lg:col-span-6 space-y-6">
          {/* AI Settings & Novel Input Panel */}
          <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-4">
            {/* AI Provider Switcher */}
            <div className="flex flex-wrap items-center justify-between border-b border-slate-800/80 pb-3 gap-3">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  콘티 추출 엔진:
                </span>
                <div className="flex bg-[#0A0E17] p-1 rounded-lg border border-slate-700">
                  <button
                    type="button"
                    onClick={() => handleProviderChange('ollama')}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition ${
                      aiProvider === 'ollama'
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    🦙 로컬 Ollama
                  </button>
                  <button
                    type="button"
                    onClick={() => handleProviderChange('gemini')}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition ${
                      aiProvider === 'gemini'
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    ✨ Gemini API
                  </button>
                </div>
              </div>

              {/* Action Button */}
              <button
                disabled={isProcessing}
                onClick={handleRunAIDecomposition}
                className={`px-5 py-2 rounded-lg text-xs font-bold text-white shadow-lg transition flex items-center space-x-2 disabled:bg-slate-800 disabled:text-slate-500 ${
                  aiProvider === 'gemini'
                    ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/30'
                    : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/30'
                }`}
              >
                <span>
                  {isProcessing
                    ? 'AI 장면 분석 중...'
                    : aiProvider === 'gemini'
                    ? '✨ Gemini AI 콘티 추출 실행'
                    : '🦙 Ollama AI 콘티 추출 실행'}
                </span>
              </button>
            </div>

            {/* Provider Options */}
            {aiProvider === 'ollama' ? (
              <div className="flex items-center justify-between text-xs font-mono">
                <div className="flex items-center space-x-2 flex-1 max-w-md">
                  <span className="text-slate-400">모델:</span>
                  <select
                    value={selectedOllamaModel}
                    onChange={(e) => setSelectedOllamaModel(e.target.value)}
                    className="w-full bg-[#0D131F] border border-slate-700 text-slate-200 text-xs py-1.5 px-2.5 rounded-lg focus:border-emerald-500"
                  >
                    {availableOllamaModels.map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full border ${
                    ollamaConnected
                      ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                      : 'bg-rose-950/60 text-rose-300 border-rose-800'
                  }`}
                >
                  {ollamaConnected ? '● Ollama 11434 온라인' : '○ Ollama 오프라인'}
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-400 font-mono">Gemini Key</label>
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="text-[10px] text-slate-400 underline"
                    >
                      {showApiKey ? '숨김' : '표시'}
                    </button>
                  </div>
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={geminiApiKey}
                    onChange={(e) => handleApiKeyChange(e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full bg-[#0D131F] border border-slate-700 text-slate-200 py-1.5 px-2.5 rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-mono block mb-1">Gemini 모델</label>
                  <select
                    value={geminiModel}
                    onChange={(e) => handleGeminiModelChange(e.target.value)}
                    className="w-full bg-[#0D131F] border border-slate-700 text-slate-200 py-1.5 px-2.5 rounded-lg text-xs font-mono"
                  >
                    <option value="gemini-2.5-flash">gemini-2.5-flash (추천)</option>
                    <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                    <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                  </select>
                </div>
              </div>
            )}

            {/* Novel Text Input */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                  소설 원문 텍스트 (화수, 지문, 대사 통합 입력)
                </label>
                {(novelText || project.cuts.length > 0) && (
                  <button
                    type="button"
                    onClick={handleClearAllScript}
                    className="text-[11px] font-bold text-rose-400 hover:text-rose-300 font-mono transition flex items-center space-x-1 cursor-pointer"
                    title="입력된 텍스트와 분할된 컷을 모두 비우고 깨끗한 빈 상태로 초기화합니다."
                  >
                    <span>🗑️ 대본 및 컷 비우기 (초기화)</span>
                  </button>
                )}
              </div>
              <textarea
                rows={5}
                value={novelText}
                onChange={(e) => setNovelText(e.target.value)}
                placeholder="소설 텍스트나 대본을 여기에 붙여넣으세요...&#10;&#10;예시:&#10;제1화: 심연의 침묵&#10;수심 400미터. 한 줄기 태양 빛조차 닿지 않는 심연..."
                className="w-full bg-[#0D131F] text-slate-200 text-xs p-3 rounded-xl border border-slate-800 focus:border-indigo-500 focus:outline-none font-mono leading-relaxed resize-y"
              />
            </div>

            {isProcessing && (
              <div className="p-2.5 bg-indigo-950/40 rounded-lg border border-indigo-800/60 text-indigo-300 font-mono text-xs text-center animate-pulse">
                {statusMessage}
              </div>
            )}
          </div>

          {/* Cuts Feed List */}
          {project.cuts.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold text-slate-300 uppercase font-mono">
                  📋 컷 목록 (클릭하여 우측에서 시안 렌더링 & 바이블 채택)
                </span>
                <span className="text-xs text-slate-500 font-mono">
                  선택된 컷: <span className="text-indigo-400 font-bold">{currentCut?.id || 'None'}</span>
                </span>
              </div>

              <div className="space-y-2.5 max-h-[720px] overflow-y-auto pr-1">
                {project.cuts.map((cut) => {
                  const isSelected = cut.id === selectedCutId;
                  const hasDraft = (cut.candidates && cut.candidates.length > 0) || Boolean(cut.winnerImagePath);
                  const draftImg = cut.candidates?.[0]?.imagePath || cut.winnerImagePath;

                  return (
                    <div
                      key={cut.id}
                      onClick={() => setSelectedCutId(cut.id)}
                      className={`glass-panel p-4 rounded-xl border cursor-pointer transition flex items-start space-x-3.5 ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-950/20 shadow-lg shadow-indigo-950/30'
                          : 'border-slate-800 hover:border-slate-700 bg-[#0C101A]/60'
                      }`}
                    >
                      {/* Thumbnail or Badge */}
                      <div className="w-16 h-20 rounded-lg bg-[#070A10] border border-slate-800 overflow-hidden flex-shrink-0 flex items-center justify-center">
                        {hasDraft && draftImg ? (
                          <img src={draftImg} alt={cut.id} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] font-mono text-slate-600 text-center px-1">
                            시안<br />대기
                          </span>
                        )}
                      </div>

                      {/* Cut Content Details */}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                              isSelected ? 'bg-indigo-600 text-white border-indigo-400' : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}>
                              {cut.id}
                            </span>
                            {cut.dialogueText && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                                대사
                              </span>
                            )}
                            {hasDraft && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                                ⚡시안 생성됨
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-mono text-slate-500">
                            {cut.cameraWeatherMod}
                          </span>
                        </div>

                        <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                          {cut.originalText}
                        </p>

                        {cut.dialogueText && (
                          <div className="text-[11px] text-amber-300/90 font-mono truncate bg-[#070A10] px-2 py-1 rounded border border-amber-900/30">
                            &ldquo;{cut.dialogueText}&rdquo;
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* RIGHT 50% (Col 6): Visual Draft Preview & Bible Transfer */}
        {/* ======================================================== */}
        <div className="lg:col-span-6 space-y-5 sticky top-6">
          {currentCut ? (
            <div className="glass-panel p-6 rounded-2xl border border-indigo-900/50 bg-[#0B0F19]/90 shadow-2xl space-y-5">
              {/* Header Bar */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-3">
                  <span className="text-sm font-bold font-mono px-2.5 py-1 rounded-lg bg-indigo-600 text-white shadow-md">
                    {currentCut.id}
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100">
                      실시간 쾌속 시안 검수 &amp; 바이블 채택 워크벤치
                    </h3>
                    <p className="text-[11px] font-mono text-slate-400">
                      카메라 앵글: {currentCut.cameraWeatherMod}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <select
                    value={selectedDraftModelId}
                    onChange={(e) => setSelectedDraftModelId(e.target.value)}
                    className="bg-[#070A10] border border-slate-700 text-slate-200 text-xs py-1.5 px-2.5 rounded-lg focus:border-amber-500 font-mono"
                  >
                    {INSTALLED_UNET_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.displayName}
                      </option>
                    ))}
                  </select>

                  <button
                    disabled={isDraftRendering}
                    onClick={() => handleGenerateDraft(currentCut)}
                    className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-xs font-bold rounded-lg transition shadow-lg shadow-orange-950/40 flex items-center space-x-1.5 disabled:opacity-50 flex-shrink-0"
                  >
                    <span>⚡ 쾌속 시안 렌더링</span>
                  </button>
                </div>
              </div>

              {/* Draft Visual Stage */}
              <div className="relative w-full h-[420px] rounded-xl bg-[#06080F] border border-slate-800 overflow-hidden flex items-center justify-center group">
                {currentCut.candidates && currentCut.candidates.length > 0 ? (
                  <img
                    src={currentCut.candidates[0].imagePath}
                    alt={currentCut.id}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-center space-y-3 p-6 max-w-sm">
                    <div className="w-16 h-16 mx-auto rounded-full bg-slate-900/80 border border-slate-800 flex items-center justify-center text-slate-600 text-2xl">
                      🖼️
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      아직 생성된 시안 이미지가 없습니다.<br />
                      상단의 <strong className="text-amber-400">[⚡ 15스텝 쾌속 시안 렌더링]</strong> 버튼을 누르면
                      2~3초 내에 고화질 시안이 여기에 표시됩니다.
                    </p>
                  </div>
                )}

                {/* Rendering Overlay */}
                {isDraftRendering && (
                  <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center space-y-3">
                    <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-xs font-mono text-amber-300 animate-pulse">
                      {draftRenderProgress}
                    </p>
                  </div>
                )}
              </div>

              {/* Bible Adoption Action Bar */}
              <div className="p-4 rounded-xl bg-[#0E1422] border border-indigo-800/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-300 font-mono flex items-center space-x-1.5">
                    <span>💡 이 컷의 시각 요소를 에셋 바이블로 채택하시겠습니까?</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    (클릭 시 Tab 2 등록 폼으로 자동 전송)
                  </span>
                </div>

                {/* Primary Master Scene Button */}
                <button
                  onClick={handleAdoptAsScene}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-600 via-indigo-600 to-purple-600 hover:from-amber-500 hover:via-indigo-500 hover:to-purple-500 text-white font-bold text-xs transition flex items-center justify-center space-x-2 shadow-lg shadow-indigo-950/50 border border-amber-400/40"
                >
                  <span className="text-base">🎬</span>
                  <span>이 이미지를 &lsquo;마스터 씬(Scene Reference)&rsquo;으로 확정 및 채택</span>
                  <span className="text-[10px] text-amber-200 font-normal font-mono">(전체 미장센/구도 기준점)</span>
                </button>

                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    onClick={handleAdoptAsCharacter}
                    className="p-2.5 rounded-lg bg-indigo-950/70 hover:bg-indigo-900/90 border border-indigo-700/60 text-indigo-200 text-xs font-bold transition flex flex-col items-center justify-center space-y-1 shadow-sm"
                  >
                    <span className="text-base">👤</span>
                    <span>인물 DNA로 채택</span>
                    <span className="text-[9px] text-indigo-400 font-mono">(주연 / 1회성 단역)</span>
                  </button>

                  <button
                    onClick={handleAdoptAsLandmark}
                    className="p-2.5 rounded-lg bg-teal-950/70 hover:bg-teal-900/90 border border-teal-700/60 text-teal-200 text-xs font-bold transition flex flex-col items-center justify-center space-y-1 shadow-sm"
                  >
                    <span className="text-base">🏰</span>
                    <span>배경 랜드마크로 채택</span>
                    <span className="text-[9px] text-teal-400 font-mono">(장소 및 환경)</span>
                  </button>

                  <button
                    onClick={handleAdoptAsWardrobe}
                    className="p-2.5 rounded-lg bg-purple-950/70 hover:bg-purple-900/90 border border-purple-700/60 text-purple-200 text-xs font-bold transition flex flex-col items-center justify-center space-y-1 shadow-sm"
                  >
                    <span className="text-base">👗</span>
                    <span>의상 프리셋으로 채택</span>
                    <span className="text-[9px] text-purple-400 font-mono">(착장 및 소품)</span>
                  </button>
                </div>
              </div>

              {/* Text & Prompt Details Card */}
              <div className="space-y-3 pt-1">
                <div className="space-y-1">
                  <span className="text-[11px] font-mono font-bold text-slate-400 uppercase">
                    소설 한국어 원문 지문 &amp; 대사
                  </span>
                  <p className="text-xs text-slate-200 leading-relaxed bg-[#070A10] p-3 rounded-lg border border-slate-800">
                    {currentCut.originalText}
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] font-mono font-bold text-slate-400 uppercase">
                    AI 영문 디퓨전 프롬프트 (Clean Plate Diffusion Prompt)
                  </span>
                  <textarea
                    rows={3}
                    value={currentCut.assembledPrompt || ''}
                    onChange={(e) => {
                      if (onUpdateCut) {
                        onUpdateCut({ ...currentCut, assembledPrompt: e.target.value });
                      }
                    }}
                    className="w-full bg-[#070A10] border border-slate-800 text-slate-300 text-xs p-2.5 rounded-lg focus:border-indigo-500 font-mono resize-none"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="glass-panel p-12 rounded-2xl border border-slate-800 text-center space-y-3">
              <span className="text-3xl">👈</span>
              <h3 className="text-sm font-bold text-slate-300">
                좌측에서 소설 텍스트를 넣고 콘티를 추출하세요.
              </h3>
              <p className="text-xs text-slate-500">
                추출된 컷을 클릭하면 이곳에 15스텝 쾌속 시안 렌더링 화면과 에셋 바이블 채택 도구가 열립니다.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
