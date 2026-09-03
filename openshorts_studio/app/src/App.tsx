import React, { useState } from 'react';
import { Header } from './components/Header';
import { TabNav, TabId } from './components/TabNav';
import { Tab1ScriptDirector } from './components/tabs/Tab1ScriptDirector';
import { Tab2AssetBible } from './components/tabs/Tab2AssetBible';
import { Tab3StoryboardStudio } from './components/tabs/Tab3StoryboardStudio';
import { Tab4VideoStudio } from './components/tabs/Tab4VideoStudio';
import { Tab5MasteringStudio } from './components/tabs/Tab5MasteringStudio';
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

  // Load full project from IndexedDB (persists multi-megabyte images without 5MB quota limits)
  React.useEffect(() => {
    projectService.loadFromIndexedDB().then((idbProject) => {
      if (idbProject && idbProject.id) {
        setProject(idbProject);
      }
    });
  }, []);
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

  return (
    <div className="min-h-screen flex flex-col bg-[#090D14] text-slate-100 selection:bg-indigo-600 selection:text-white">
      {/* 1. Header */}
      <Header
        project={project}
        onUpdateTitle={handleUpdateTitle}
        onLoadProject={(loaded) => {
          projectService.setProject(loaded);
          setProject(loaded);
        }}
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
