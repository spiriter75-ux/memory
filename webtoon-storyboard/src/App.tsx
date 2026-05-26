import { useState } from 'react';
import Header from './components/Header';
import EditorTab from './components/EditorTab';
import SeriesBibleTab from './components/SeriesBibleTab';
import SettingsModal from './components/SettingsModal';
import PromptAssistant from './components/PromptAssistant';
import { useAppStore } from './store/useAppStore';

function App() {
  const { settings } = useAppStore();
  const [activeTab, setActiveTab] = useState<'editor' | 'bible'>('editor');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col overflow-hidden h-screen">
      <Header onOpenSettings={() => setIsSettingsOpen(true)} />
      
      <div className="flex-1 flex overflow-hidden relative">
        <main className={`flex-1 flex flex-col p-4 gap-4 overflow-hidden transition-all duration-300 ${settings.isSidebarOpen ? 'mr-[350px]' : ''}`}>
          <div className="max-w-6xl mx-auto w-full flex flex-col h-full gap-4">
            {/* Multi-Tab Navigation */}
            <div className="flex space-x-2 bg-slate-200 dark:bg-slate-800 p-1 rounded-lg w-full max-w-sm mx-auto shrink-0">
              <button
                onClick={() => setActiveTab('editor')}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                  activeTab === 'editor' 
                    ? 'bg-white dark:bg-slate-700 shadow text-primary-600 dark:text-primary-400' 
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                기획 에디터 (Editor)
              </button>
              <button
                onClick={() => setActiveTab('bible')}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                  activeTab === 'bible' 
                    ? 'bg-white dark:bg-slate-700 shadow text-primary-600 dark:text-primary-400' 
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                시리즈 바이블 (Bible)
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden flex flex-col relative">
              {activeTab === 'editor' ? <EditorTab /> : <SeriesBibleTab />}
            </div>
          </div>
        </main>

        {/* Sidebar Chat */}
        {settings.isSidebarOpen && (
          <aside className="fixed right-0 top-[73px] bottom-0 w-[350px] z-20">
            <PromptAssistant />
          </aside>
        )}
      </div>

      {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}
    </div>
  );
}

export default App;
