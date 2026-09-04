import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { TabNav, TabId } from './components/TabNav';
import { Tab1ScriptDirector } from './components/tabs/Tab1ScriptDirector';
import { Tab2AssetBible } from './components/tabs/Tab2AssetBible';
import { Tab3StoryboardStudio } from './components/tabs/Tab3StoryboardStudio';
import { Tab4VideoStudio } from './components/tabs/Tab4VideoStudio';
import { Tab5MasteringStudio } from './components/tabs/Tab5MasteringStudio';
import { ProjectManagerModal } from './components/ProjectManagerModal';
import { projectService } from './services/projectService';
import { ProjectMaster, StoryboardCut, CharacterDNA, WardrobePreset, LandmarkDNA } from './types';

export const App: React.FC = () => {
  const [project, setProject] = useState<ProjectMaster>(projectService.getCurrentProject());
  
  // URL 파라미터 감지 (?tab=storyboard, ?tab=video 등)
  const initialTab: TabId = (() => {
    try {
      const p = new URLSearchParams(window.location.search).get('tab');
      if (p === 'storyboard' || p === 'video' || p === 'bible' || p === 'mastering') {
        return p as TabId;
      }
    } catch (_) { /* ignore */ }
    return 'script';
  })();

  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  // URL에서 projectId 파라미터 추출
  const queryProjectId = (() => {
    try {
      return new URLSearchParams(window.location.search).get('projectId');
    } catch {
      return null;
    }
  })();

  // 시작 시 작업 관리 모달 표시 여부 (새 창이거나 특정 projectId로 접속 시에는 모달 자동 숨김)
  const [isProjectManagerOpen, setIsProjectManagerOpen] = useState<boolean>(!queryProjectId);
  const [hasDuplicateWindow, setHasDuplicateWindow] = useState<boolean>(false);

  // Load project based on URL or IndexedDB on initial mount
  useEffect(() => {
    if (queryProjectId === 'new') {
      const fresh = projectService.createNewProject();
      projectService.setProject(fresh);
      setProject(fresh);
      return;
    }

    if (queryProjectId) {
      projectService.loadProjectById(queryProjectId).then((loaded) => {
        if (loaded && loaded.id) {
          projectService.setProject(loaded);
          setProject(loaded);
        } else {
          projectService.loadFromIndexedDB().then((idbProject) => {
            if (idbProject && idbProject.id) setProject(idbProject);
          });
        }
      });
    } else {
      projectService.loadFromIndexedDB().then((idbProject) => {
        if (idbProject && idbProject.id) {
          setProject(idbProject);
        }
      });
    }
  }, [queryProjectId]);

  // 동일 프로젝트 다중 창 동시 열림 감지 (BroadcastChannel)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.BroadcastChannel) return;
    const channel = new BroadcastChannel('openshorts_studio_sync');
    const myTabId = 'tab_' + Math.random().toString(36).substring(2, 9);

    const broadcast = () => {
      channel.postMessage({ type: 'HEARTBEAT', projectId: project.id, tabId: myTabId });
    };

    broadcast();
    const interval = setInterval(broadcast, 4000);

    channel.onmessage = (event) => {
      const data = event.data;
      if (data && data.type === 'HEARTBEAT') {
        if (data.projectId === project.id && data.tabId !== myTabId) {
          setHasDuplicateWindow(true);
        }
      }
    };

    return () => {
      clearInterval(interval);
      channel.close();
    };
  }, [project.id]);

  const [pendingBibleAsset, setPendingBibleAsset] = useState<{
    type: 'character' | 'wardrobe' | 'landmark' | 'scene';
    name: string;
    koreanName?: string;
    prompt: string;
    imagePath?: string;
    cutId: string;
    visualDetails?: string;
  } | null>(null);

  const handleSendToBible = (asset: {
    type: 'character' | 'wardrobe' | 'landmark' | 'scene';
    name: string;
    koreanName?: string;
    prompt: string;
    imagePath?: string;
    cutId: string;
    visualDetails?: string;
  }) => {
    setPendingBibleAsset(asset);
    setActiveTab('bible');
  };

  const handleUpdateTitle = (title: string, chapter: string) => {
    const updated = { ...project, title, chapter, updatedAt: new Date().toISOString() };
    projectService.setProject(updated);
    setProject(updated);
  };

  const handleUpdateCuts = (cuts: StoryboardCut[], projectTitle?: string, chapter?: string) => {
    const updated = {
      ...project,
      title: projectTitle || project.title,
      chapter: chapter || project.chapter,
      cuts,
      updatedAt: new Date().toISOString(),
    };
    projectService.setProject(updated);
    setProject(updated);
  };

  const handleUpdateCut = (updatedCut: StoryboardCut) => {
    const cuts = project.cuts.map((c) => (c.id === updatedCut.id ? updatedCut : c));
    const updated = { ...project, cuts, updatedAt: new Date().toISOString() };
    projectService.setProject(updated);
    setProject(updated);
  };

  const handleUpdateBible = (
    characters: CharacterDNA[],
    wardrobes: WardrobePreset[],
    landmarks: LandmarkDNA[]
  ) => {
    const updated = { ...project, characters, wardrobes, landmarks, updatedAt: new Date().toISOString() };
    projectService.setProject(updated);
    setProject(updated);
  };

  const handleSelectProject = (selected: ProjectMaster) => {
    projectService.setProject(selected);
    setProject(selected);
    setHasDuplicateWindow(false);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('projectId', selected.id);
      window.history.replaceState({}, '', url.toString());
    } catch (_) { /* ignore */ }
  };

  const handleCreateNewProject = (title: string, chapter: string, inNewWindow: boolean) => {
    const newProj = projectService.createNewProject(title, chapter);
    projectService.setProject(newProj);
    if (inNewWindow) {
      window.open(`/?projectId=${newProj.id}`, '_blank');
    } else {
      setProject(newProj);
      setHasDuplicateWindow(false);
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('projectId', newProj.id);
        window.history.replaceState({}, '', url.toString());
      } catch (_) { /* ignore */ }
    }
  };

  const handleOpenInNewWindow = (projectId: string) => {
    window.open(`/?projectId=${projectId}`, '_blank');
  };

  const handleDeleteProject = async (projectId: string) => {
    await projectService.deleteProject(projectId);
    if (project.id === projectId) {
      const fresh = projectService.createNewProject();
      projectService.setProject(fresh);
      setProject(fresh);
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('projectId', fresh.id);
        window.history.replaceState({}, '', url.toString());
      } catch (_) { /* ignore */ }
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#090D14] text-slate-100 selection:bg-indigo-600 selection:text-white">
      {/* 0. Multi-Window Same Project Duplicate Warning */}
      {hasDuplicateWindow && (
        <div className="bg-amber-950/90 border-b border-amber-600/70 px-6 py-2 flex items-center justify-between text-xs text-amber-200">
          <div className="flex items-center space-x-2">
            <span className="text-base">⚠️</span>
            <span>
              <strong>동일 프로젝트 다중 창 감지:</strong> 이 프로젝트(<code>{project.title}</code>)가 다른 브라우저 탭(창)에서도 열려 있습니다. 서로 다른 창에서 동시에 수정 시 저장 내용이 덮어씌워질 수 있으니 주의하세요.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setHasDuplicateWindow(false)}
            className="text-amber-300 hover:text-white px-2 py-0.5 rounded bg-amber-900/60 hover:bg-amber-800 text-[11px] font-bold cursor-pointer"
          >
            확인 ✕
          </button>
        </div>
      )}

      {/* 1. Header */}
      <Header
        project={project}
        onUpdateTitle={handleUpdateTitle}
        onLoadProject={(loaded) => {
          projectService.setProject(loaded);
          setProject(loaded);
        }}
        onOpenProjectManager={() => setIsProjectManagerOpen(true)}
      />

      {/* 1-1. Project Manager Modal */}
      <ProjectManagerModal
        isOpen={isProjectManagerOpen}
        canClose={true}
        currentProjectId={project.id}
        onClose={() => setIsProjectManagerOpen(false)}
        onSelectProject={handleSelectProject}
        onCreateNewProject={handleCreateNewProject}
        onDeleteProject={handleDeleteProject}
        onOpenInNewWindow={handleOpenInNewWindow}
      />

      {/* 2. 5-Tab Navigation */}
      <TabNav activeTab={activeTab} onSelectTab={setActiveTab} cutCount={project.cuts.length} />

      {/* 3. Main Tab Content */}
      <main className="flex-1">
        {activeTab === 'script' && (
          <Tab1ScriptDirector
            project={project}
            onUpdateCuts={handleUpdateCuts}
            onUpdateCut={handleUpdateCut}
            onSendToBible={handleSendToBible}
            onNextTab={() => setActiveTab('bible')}
          />
        )}
        {activeTab === 'bible' && (
          <Tab2AssetBible
            project={project}
            initialAsset={pendingBibleAsset}
            onClearInitialAsset={() => setPendingBibleAsset(null)}
            onUpdateBible={handleUpdateBible}
            onNextTab={() => setActiveTab('storyboard')}
          />
        )}
        {activeTab === 'storyboard' && (
          <Tab3StoryboardStudio
            project={project}
            onUpdateCut={handleUpdateCut}
            onUpdateCuts={handleUpdateCuts}
            onNextTab={() => setActiveTab('video')}
          />
        )}
        {activeTab === 'video' && (
          <Tab4VideoStudio
            project={project}
            onUpdateCut={handleUpdateCut}
            onUpdateCuts={handleUpdateCuts}
            onNextTab={() => setActiveTab('mastering')}
          />
        )}
        {activeTab === 'mastering' && <Tab5MasteringStudio project={project} />}
      </main>
    </div>
  );
};
