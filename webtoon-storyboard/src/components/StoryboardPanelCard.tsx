import { useState } from 'react';
import { Copy, CheckCircle2, MessageSquare, Mic, Clapperboard, Edit3, Image as ImageIcon, History, Play, Trash2, Plus, Copy as CopyIcon, ArrowUp, ArrowDown } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import type { StoryboardPanel, GenerationHistoryItem } from '../types';
import { generateWithComfy } from '../services/comfyUIService';
import { saveImageToLocal, getImageUrl, hasProjectFolder, selectProjectFolder } from '../services/fileSystemService';

interface Props {
  panel: StoryboardPanel;
}

export default function StoryboardPanelCard({ panel }: Props) {
  const { updatePanel, addPanel, duplicatePanel, deletePanel, movePanel, settings } = useAppStore();
  const [copied, setCopied] = useState(false);
  const [negCopied, setNegCopied] = useState(false);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState(panel.imagePrompt);

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(panel.imagePrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSavePrompt = () => {
    updatePanel(panel.id, { imagePrompt: editedPrompt });
    setIsEditingPrompt(false);
  };

  const handleGenerate = async () => {
    if (panel.isGenerating) return;
    
    // 0. 폴더 권한 확인 (새로고침 시 권한이 날아가므로 다시 요청)
    if (!hasProjectFolder()) {
      try {
        await selectProjectFolder();
      } catch (e) {
        alert("이미지를 저장할 폴더를 선택해야 생성을 시작할 수 있습니다.");
        return;
      }
    }
    
    updatePanel(panel.id, { isGenerating: true });
    
    try {
      // 1. 화면 비율에 따른 해상도 계산
      let width = 1024, height = 1024;
      if (settings.aspectRatio === '9:16') { width = 768; height = 1344; }
      else if (settings.aspectRatio === '3:4') { width = 896; height = 1152; }
      else if (settings.aspectRatio === '16:9') { width = 1344; height = 768; }

      // 2. ComfyUI 생성 요청
      const blob = await generateWithComfy({
        prompt: panel.imagePrompt,
        negativePrompt: settings.negativePrompt,
        seed: settings.defaultSeed, // 설정된 기본 시드값 사용
        width,
        height,
        characters: useAppStore.getState().characters,
        comfyUrl: settings.comfyUrl,
        comfyModel: settings.comfyModel,
        useUpscale: settings.useUpscale
      }); // 워크플로우 템플릿은 서비스 내부에서 처리하거나 전달

      // 3. 로컬 폴더에 실제 파일로 저장
      const historyId = crypto.randomUUID();
      const fileName = await saveImageToLocal(blob, panel.panelNumber, historyId);
      const imageUrl = await getImageUrl(fileName);

      // 4. 히스토리 업데이트
      const newItem: GenerationHistoryItem = {
        id: historyId,
        fileName,
        imageUrl,
        prompt: panel.imagePrompt,
        negativePrompt: settings.negativePrompt,
        seed: Math.floor(Math.random() * 1000000), // 실제 시드값 연동 필요
        timestamp: Date.now()
      };
      
      const newHistory = [...(panel.generationHistory || []), newItem];
      updatePanel(panel.id, {
        isGenerating: false,
        generationHistory: newHistory,
        activeImageId: newItem.id
      });
    } catch (err: any) {
      console.error(err);
      alert(`생성 실패: ${err.message}`);
      updatePanel(panel.id, { isGenerating: false });
    }
  };

  const activeImage = panel.generationHistory?.find(h => h.id === panel.activeImageId) || 
                      (panel.generationHistory && panel.generationHistory.length > 0 ? panel.generationHistory[panel.generationHistory.length - 1] : null);

  const handleRevertToHistory = (historyItem: GenerationHistoryItem) => {
    updatePanel(panel.id, {
      activeImageId: historyItem.id,
      imagePrompt: historyItem.prompt
    });
    setEditedPrompt(historyItem.prompt);
  };

  const handleDeleteHistory = (e: React.MouseEvent, historyId: string) => {
    e.stopPropagation();
    if (!confirm('이 생성 기록을 삭제하시겠습니까?')) return;
    
    const newHistory = panel.generationHistory?.filter(h => h.id !== historyId) || [];
    const newActiveId = panel.activeImageId === historyId 
      ? (newHistory.length > 0 ? newHistory[newHistory.length - 1].id : undefined)
      : panel.activeImageId;
      
    updatePanel(panel.id, {
      generationHistory: newHistory,
      activeImageId: newActiveId
    });
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm flex flex-col md:flex-row">
      {/* Left: Planning & Prompts */}
      <div className="flex-1 p-5 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-700 space-y-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 text-lg">
            <Clapperboard className="w-5 h-5 text-primary-500" />
            Panel {panel.panelNumber}
          </h3>
          <div className="flex items-center gap-1">
            <button onClick={() => movePanel(panel.id, 'up')} className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors" title="위로 이동"><ArrowUp className="w-4 h-4" /></button>
            <button onClick={() => movePanel(panel.id, 'down')} className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors" title="아래로 이동"><ArrowDown className="w-4 h-4" /></button>
            <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1"></div>
            <button onClick={() => addPanel(panel.panelNumber - 1)} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors" title="앞에 패널 추가"><Plus className="w-4 h-4" /></button>
            <button onClick={() => duplicatePanel(panel.id)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors" title="패널 복제"><CopyIcon className="w-4 h-4" /></button>
            <button onClick={() => deletePanel(panel.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors" title="패널 삭제"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Scene Description */}
        <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">장면 설명 (Scene)</h4>
          <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
            {panel.sceneDescription}
          </p>
        </div>

        {/* Image Prompt */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Positive Prompt</span>
            <div className="flex gap-1">
              {isEditingPrompt ? (
                <>
                  <button onClick={() => setIsEditingPrompt(false)} className="text-xs px-2 py-1 text-slate-500 hover:text-slate-700">취소</button>
                  <button onClick={handleSavePrompt} className="text-xs px-2 py-1 bg-primary-100 text-primary-700 rounded hover:bg-primary-200 font-bold">저장</button>
                </>
              ) : (
                <>
                  <button onClick={() => setIsEditingPrompt(true)} className="p-1 text-slate-400 hover:text-primary-600 transition-colors" title="프롬프트 수정"><Edit3 className="w-3.5 h-3.5" /></button>
                  <button onClick={handleCopyPrompt} className="p-1 text-slate-400 hover:text-primary-600 transition-colors" title="프롬프트 복사">
                    {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </>
              )}
            </div>
          </div>
          
          <div className={`p-3 rounded-lg border ${isEditingPrompt ? 'border-primary-400 bg-white dark:bg-slate-900' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900'} transition-all`}>
            {isEditingPrompt ? (
              <textarea 
                value={editedPrompt}
                onChange={(e) => setEditedPrompt(e.target.value)}
                className="w-full text-[13px] text-slate-800 dark:text-slate-200 font-mono leading-relaxed bg-transparent focus:outline-none resize-none min-h-[100px]"
              />
            ) : (
              <code className="text-[13px] text-primary-700 dark:text-primary-300 font-mono leading-relaxed block max-h-32 overflow-auto">
                {panel.imagePrompt}
              </code>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 pt-2">
          {panel.narration && (
            <div className="flex gap-2 p-2 bg-amber-50 dark:bg-amber-900/10 rounded border border-amber-100 dark:border-amber-900/30">
              <Mic className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-900 dark:text-amber-200 font-serif leading-relaxed">"{panel.narration}"</p>
            </div>
          )}
          {panel.dialogue && (
            <div className="flex gap-2 p-2 bg-blue-50 dark:bg-blue-900/10 rounded border border-blue-100 dark:border-blue-900/30">
              <MessageSquare className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-sm text-blue-900 dark:text-blue-200 font-semibold leading-relaxed">"{panel.dialogue}"</p>
            </div>
          )}
        </div>
      </div>

      {/* Right: Image Generation & History */}
      <div className="w-full md:w-80 bg-slate-50 dark:bg-slate-900/50 flex flex-col">
        {/* Active Image Display */}
        <div className="aspect-[3/4] bg-slate-200 dark:bg-slate-800 relative flex items-center justify-center border-b border-slate-200 dark:border-slate-700">
          {panel.isGenerating ? (
            <div className="flex flex-col items-center gap-3 animate-pulse">
              <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sm font-bold text-primary-600 dark:text-primary-400">이미지 생성 중...</span>
            </div>
          ) : activeImage ? (
            <img src={activeImage.imageUrl} alt="Generated Panel" className="w-full h-full object-contain" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-slate-400">
              <ImageIcon className="w-8 h-8 opacity-50" />
              <span className="text-xs font-medium uppercase tracking-wider">No Image</span>
            </div>
          )}
          
          {/* Generate Button (Floating) */}
          <button 
            onClick={handleGenerate}
            disabled={panel.isGenerating}
            className="absolute bottom-4 right-4 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-full shadow-lg font-bold text-sm flex items-center gap-2 transition-transform active:scale-95 disabled:opacity-50"
          >
            <Play className="w-4 h-4 fill-current" /> {panel.isGenerating ? '생성 중...' : '생성하기'}
          </button>
        </div>

        {/* History Gallery */}
        <div className="flex-1 p-3 flex flex-col min-h-[150px]">
          <div className="flex items-center gap-1.5 mb-2 text-slate-500 dark:text-slate-400">
            <History className="w-4 h-4" />
            <span className="text-[11px] font-bold uppercase tracking-wider">생성 히스토리</span>
          </div>
          
          <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
            {panel.generationHistory?.map((history, idx) => (
              <div 
                key={history.id}
                onClick={() => handleRevertToHistory(history)}
                className={`relative w-16 h-20 shrink-0 rounded-md overflow-hidden cursor-pointer border-2 transition-all group ${
                  activeImage?.id === history.id ? 'border-primary-500 ring-2 ring-primary-500/20' : 'border-transparent hover:border-slate-300'
                }`}
                title={`Seed: ${history.seed}`}
              >
                <img src={history.imageUrl} alt={`History ${idx}`} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <button 
                    onClick={(e) => handleDeleteHistory(e, history.id)}
                    className="p-1 bg-red-500 text-white rounded hover:bg-red-600"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="absolute top-0 left-0 bg-black/60 text-white text-[9px] px-1 font-mono">
                  #{idx + 1}
                </div>
              </div>
            ))}
            {(!panel.generationHistory || panel.generationHistory.length === 0) && (
              <div className="w-full text-center text-xs text-slate-400 mt-4 italic">
                아직 생성된 이미지가 없습니다.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
