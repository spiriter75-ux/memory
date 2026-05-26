import { useState } from 'react';
import { X, Check, Edit3, MessageSquare, Mic, Clapperboard } from 'lucide-react';
import type { StoryboardPanel } from '../types';

interface Props {
  initialPanels: StoryboardPanel[];
  onConfirm: (panels: StoryboardPanel[]) => void;
  onCancel: () => void;
}

export default function PromptReviewModal({ initialPanels, onConfirm, onCancel }: Props) {
  const [panels, setPanels] = useState<StoryboardPanel[]>(initialPanels);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleUpdatePrompt = (id: string, newPrompt: string) => {
    setPanels(prev => prev.map(p => p.id === id ? { ...p, imagePrompt: newPrompt } : p));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden border border-slate-200 dark:border-slate-700 flex flex-col scale-in-center">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-primary-500" />
              생성된 프롬프트 검토 (Prompt Review)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              LLM이 생성한 프롬프트를 확인하고 수정할 수 있습니다. [적용하기]를 누르면 스토리보드에 반영됩니다.
            </p>
          </div>
          <button onClick={onCancel} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {panels.map((panel, idx) => (
            <div key={panel.id || idx} className="group bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden transition-all hover:border-primary-300 dark:hover:border-primary-800">
              <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-700">
                
                {/* Panel Info (Left) */}
                <div className="w-full md:w-1/3 p-4 bg-white/50 dark:bg-slate-800/50">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 text-xs font-bold">
                      {panel.panelNumber}
                    </span>
                    <h3 className="font-bold text-sm text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                      <Clapperboard className="w-4 h-4" /> Panel {panel.panelNumber}
                    </h3>
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Scene Description</h4>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-4">
                        {panel.sceneDescription}
                      </p>
                    </div>
                    
                    <div className="flex gap-2">
                      {panel.narration && (
                        <div className="flex-1 p-2 bg-amber-50 dark:bg-amber-900/10 rounded border border-amber-100 dark:border-amber-900/20">
                          <div className="flex items-center gap-1 mb-1">
                            <Mic className="w-3 h-3 text-amber-500" />
                            <span className="text-[9px] font-bold text-amber-600 uppercase">Narration</span>
                          </div>
                          <p className="text-[11px] text-amber-800 dark:text-amber-200 italic line-clamp-2">"{panel.narration}"</p>
                        </div>
                      )}
                      {panel.dialogue && (
                        <div className="flex-1 p-2 bg-blue-50 dark:bg-blue-900/10 rounded border border-blue-100 dark:border-blue-900/20">
                          <div className="flex items-center gap-1 mb-1">
                            <MessageSquare className="w-3 h-3 text-blue-500" />
                            <span className="text-[9px] font-bold text-blue-600 uppercase">Dialogue</span>
                          </div>
                          <p className="text-[11px] text-blue-800 dark:text-blue-200 font-medium line-clamp-2">"{panel.dialogue}"</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Prompt Editor (Right) */}
                <div className="flex-1 p-4 flex flex-col bg-white dark:bg-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-bold text-primary-600 dark:text-primary-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3" /> Image Prompt (English)
                    </label>
                    <span className="text-[10px] text-slate-400 italic">Z-Anime Optimized Natural Language</span>
                  </div>
                  
                  <textarea
                    value={panel.imagePrompt}
                    onChange={(e) => handleUpdatePrompt(panel.id, e.target.value)}
                    className="flex-1 min-h-[120px] w-full p-4 text-[13px] font-mono leading-relaxed bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all text-slate-800 dark:text-slate-200"
                    placeholder="Enter image generation prompt..."
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 flex justify-end gap-3">
          <button 
            onClick={onCancel}
            className="px-6 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all"
          >
            취소 (Discard)
          </button>
          <button 
            onClick={() => onConfirm(panels)}
            className="px-8 py-2.5 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-lg shadow-primary-500/20 flex items-center gap-2 transition-all active:scale-95"
          >
            <Check className="w-4 h-4" /> 스토리보드에 적용하기 (Apply)
          </button>
        </div>
      </div>
    </div>
  );
}

const Sparkles = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);
