import { useState } from 'react';
import { Sparkles, FileText, AlertCircle } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { generateStoryboard } from '../services/aiService';
import StoryboardPanelCard from './StoryboardPanelCard';
import PromptReviewModal from './PromptReviewModal';
import type { StoryboardPanel } from '../types';

export default function EditorTab() {
  const { novelText, setNovelText, panels, setPanels } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [pendingPanels, setPendingPanels] = useState<StoryboardPanel[]>([]);

  const handleGenerate = async () => {
    if (!novelText.trim()) {
      setErrorMsg('소설이나 시나리오 텍스트를 입력해주세요.');
      return;
    }
    
    setLoading(true);
    setErrorMsg('');
    try {
      const result = await generateStoryboard(novelText, (msg) => setStatusMsg(msg));
      if (result && result.panels) {
        // [복구] 작가의 검수를 위한 리뷰 모달 단계 복원
        setPendingPanels(result.panels.map((p: any) => ({ ...p, id: p.id || crypto.randomUUID() })));
        setShowReviewModal(true);
      }
    } catch (err: any) {
      setErrorMsg(err.message || '스토리보드 생성 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
      setStatusMsg('');
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Editor Layout: Split view on Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 h-full divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-700 overflow-hidden">
        
        {/* Left: Input Textarea */}
        <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex justify-between items-center">
            <h2 className="font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <FileText className="w-4 h-4 text-primary-500" />
              텍스트 입력 (Input)
            </h2>
            <button
              onClick={handleGenerate}
              disabled={loading}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                loading 
                  ? 'bg-slate-200 text-slate-500 cursor-not-allowed dark:bg-slate-700'
                  : 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm'
              }`}
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {loading ? '추출 중...' : '콘티 추출하기'}
            </button>
          </div>
          
          <div className="flex-1 p-4 overflow-hidden flex flex-col relative">
            {errorMsg && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-200 dark:border-red-900/30 rounded-md text-sm flex items-start gap-2 animate-in fade-in">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
            
            <textarea
              className="flex-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none shadow-sm transition-all"
              placeholder="여기에 소설이나 시나리오 텍스트를 붙여넣으세요..."
              value={novelText}
              onChange={(e) => setNovelText(e.target.value)}
              disabled={loading}
            />
            
            {loading && statusMsg && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-4 py-2 rounded-full text-xs shadow-lg animate-pulse flex items-center gap-2">
                <span>{statusMsg}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Results View */}
        <div className="flex flex-col h-[50vh] lg:h-full bg-slate-100 dark:bg-slate-950 overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <h2 className="font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <Sparkles className="w-4 h-4 text-amber-500" />
              스토리보드 결과 (Output)
              <span className="ml-auto text-xs font-normal text-slate-500 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-full">
                {panels.length} Panels
              </span>
            </h2>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4 relative">
            {panels.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 p-8 text-center">
                <FileText className="w-12 h-12 mb-3 opacity-20" />
                <p>텍스트를 입력하고 '콘티 추출하기' 버튼을 클릭하면<br/>여기에 스토리보드 패널이 생성됩니다.</p>
              </div>
            ) : (
              panels.map((panel, idx) => (
                <div key={panel.id || idx} className="animate-in slide-in-from-bottom-4 fade-in duration-500 flex flex-col" style={{ animationFillMode: "both", animationDelay: `${idx * 100}ms` }}>
                  <StoryboardPanelCard panel={panel} />
                </div>
              ))
            )}
          </div>
        </div>
        
      </div>

      {showReviewModal && (
        <PromptReviewModal 
          initialPanels={pendingPanels}
          onConfirm={(reviewedPanels) => {
            setPanels(reviewedPanels);
            setShowReviewModal(false);
          }}
          onCancel={() => setShowReviewModal(false)}
        />
      )}
    </div>
  );
}
