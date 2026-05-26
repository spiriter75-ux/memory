import { Settings, Save, FolderOpen, Trash2, Library, MessageSquare } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { selectProjectFolder, saveProjectConfig, exportStoryboardsToLocal } from '../services/fileSystemService';

interface HeaderProps {
  onOpenSettings: () => void;
}

export default function Header({ onOpenSettings }: HeaderProps) {
  const { currentProjectName, setCurrentProjectName, exportData, resetData, toggleSidebar, settings, panels, novelText } = useAppStore();

  const handleSelectFolder = async () => {
    try {
      const folderName = await selectProjectFolder();
      setCurrentProjectName(folderName);
      alert(`프로젝트 폴더가 선택되었습니다: ${folderName}`);
    } catch (err) {
      // User cancelled or error
    }
  };

  const handleSaveProject = async () => {
    if (!currentProjectName) {
      alert('먼저 프로젝트 폴더를 선택해주세요.');
      return;
    }
    try {
      // 1. 기존 설정 정보 저장
      const data = JSON.parse(exportData());
      await saveProjectConfig(data);
      
      // 2. 후처리용 이미지 및 텍스트 파일 추출 (exports 폴더)
      await exportStoryboardsToLocal(panels, novelText);
      
      alert('프로젝트 저장 및 이미지/텍스트 추출이 완료되었습니다. (exports 폴더 확인)');
    } catch (err: any) {
      alert(`저장 중 오류가 발생했습니다: ${err.message}`);
    }
  };

  const handleReset = () => {
    if (confirm('모든 데이터가 초기화됩니다. 이 작업은 되돌릴 수 없습니다. 진행하시겠습니까?')) {
      resetData();
    }
  };

  return (
    <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-4 sticky top-0 z-10 transition-colors">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2 text-primary-600 dark:text-primary-400">
          <Library className="w-6 h-6" />
          <h1 className="text-xl font-bold tracking-tight">AI 웹툰 스토리보드 기획</h1>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={handleSelectFolder}
            className={`px-3 py-1.5 transition-all flex items-center gap-1.5 text-sm font-bold border rounded-md ${
              currentProjectName 
                ? 'bg-primary-50 text-primary-700 border-primary-200' 
                : 'text-slate-600 hover:text-primary-700 dark:text-slate-300 border-transparent hover:bg-primary-50'
            }`}
            title="프로젝트 폴더 선택"
          >
            <FolderOpen className="w-4 h-4" /> 
            <span className="hidden sm:inline">
              {currentProjectName || '폴더 선택'}
            </span>
          </button>
          
          <button 
            onClick={handleSaveProject}
            className="px-3 py-1.5 text-slate-600 hover:text-primary-700 dark:text-slate-300 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-md transition-all flex items-center gap-1.5 text-sm font-bold border border-transparent hover:border-primary-200 dark:hover:border-primary-800"
            title="로컬 폴더에 저장 및 추출"
          >
            <Save className="w-4 h-4" /> <span className="hidden sm:inline">저장 / 추출</span>
          </button>

          <div className="w-px h-6 bg-slate-300 dark:bg-slate-600 mx-1"></div>

          <button 
            onClick={handleReset}
            className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-slate-700 rounded-md transition-all flex items-center gap-1 text-sm font-medium"
            title="전체 초기화"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <button 
            onClick={toggleSidebar}
            className={`p-2 rounded-md transition-all flex items-center gap-1 text-sm font-medium ${
              settings.isSidebarOpen 
                ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400 shadow-inner' 
                : 'text-slate-500 hover:text-primary-600 dark:text-slate-400 dark:hover:text-primary-400 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
            title="프롬프트 어시스턴트"
          >
            <MessageSquare className="w-4 h-4" />
          </button>

          <button 
            onClick={onOpenSettings}
            className="p-2 text-slate-500 hover:text-primary-600 dark:text-slate-400 dark:hover:text-primary-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-all flex items-center gap-1 text-sm font-medium"
            title="설정"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
