import React, { useEffect, useState, useRef } from 'react';
import { comfyClient } from '../services/comfyClient';
import { projectService } from '../services/projectService';
import { ProjectMaster } from '../types';

interface HeaderProps {
  project: ProjectMaster;
  onUpdateTitle: (title: string, chapter: string) => void;
  onLoadProject?: (loaded: ProjectMaster) => void;
  onOpenProjectManager?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  project,
  onUpdateTitle,
  onLoadProject,
  onOpenProjectManager,
}) => {
  const [comfyOnline, setComfyOnline] = useState<boolean | null>(null);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    projectService.exportProjectToFile(project);
    setSaveToast('프로젝트가 다운로드 폴더에 저장되었습니다!');
    setTimeout(() => setSaveToast(null), 3000);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const loaded = await projectService.importProjectFromFile(file);
      if (onLoadProject) {
        onLoadProject(loaded);
      }
      setSaveToast('프로젝트를 성공적으로 불러왔습니다!');
      setTimeout(() => setSaveToast(null), 3000);
    } catch (err: unknown) {
      alert(`불러오기 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    const check = async () => {
      const res = await comfyClient.checkHealth();
      setComfyOnline(res.online);
    };
    check();
    const timer = setInterval(check, 10000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="border-b border-slate-800 bg-[#0B0F19] px-6 py-4 flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold tracking-widest text-indigo-400 bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-800/60">
              V2.0 CLEAN
            </span>
            <h1 className="text-lg font-bold text-slate-100 tracking-tight">
              OpenShorts Pro Studio
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            0원 로컬 고속 제작 엔진 (RTX 5060 Ti 16GB / ComfyUI :8288)
          </p>
        </div>
      </div>

      {/* Project Title & Chapter & Backup Controls */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2 bg-slate-900/90 px-3.5 py-1.5 rounded-lg border border-slate-800">
          <input
            type="text"
            value={project.title}
            onChange={(e) => onUpdateTitle(e.target.value, project.chapter)}
            placeholder="소설/숏츠 프로젝트 제목"
            className="bg-transparent text-sm font-semibold text-slate-200 focus:outline-none border-b border-transparent focus:border-indigo-500 w-44 text-center"
          />
          <span className="text-slate-600">/</span>
          <input
            type="text"
            value={project.chapter}
            onChange={(e) => onUpdateTitle(project.title, e.target.value)}
            placeholder="챕터/회차"
            className="bg-transparent text-sm text-slate-300 focus:outline-none border-b border-transparent focus:border-indigo-500 w-20 text-center"
          />
        </div>

        {/* 작업 관리자 & 원클릭 백업 저장 & 불러오기 버튼 */}
        <div className="flex items-center space-x-1.5">
          <button
            type="button"
            onClick={onOpenProjectManager}
            title="저장된 다른 프로젝트 목록 보기 및 새 창에서 열기"
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs font-bold transition flex items-center space-x-1 cursor-pointer shadow-sm"
          >
            <span>📁 작업 관리</span>
          </button>

          <button
            type="button"
            onClick={handleExport}
            title="현재 프로젝트 전체(대본, 컷, 에셋)를 JSON 파일로 내 PC에 저장"
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 rounded-md border border-slate-700 text-xs font-medium transition flex items-center space-x-1 cursor-pointer"
          >
            <span>💾 저장</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="이전에 저장한 프로젝트 JSON 파일 불러오기"
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md border border-slate-700 text-xs font-medium transition flex items-center space-x-1 cursor-pointer"
          >
            <span>📂 불러오기</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportFile}
            className="hidden"
          />
        </div>

        {saveToast && (
          <span className="text-xs text-emerald-400 bg-emerald-950/80 px-2 py-1 rounded border border-emerald-800 font-bold">
            ✓ {saveToast}
          </span>
        )}
      </div>

      {/* Server & Resource Status */}
      <div className="flex items-center space-x-4 text-xs font-mono">
        <div className="flex items-center space-x-2 bg-slate-900/80 px-3 py-1.5 rounded-md border border-slate-800">
          <span className="text-slate-400">ComfyUI 포트:</span>
          <span className="text-slate-200 font-bold">8288</span>
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${
              comfyOnline === true
                ? 'bg-emerald-500 shadow-[0_0_8px_#10B981]'
                : comfyOnline === false
                ? 'bg-rose-500 shadow-[0_0_8px_#EF4444]'
                : 'bg-amber-500 animate-pulse'
            }`}
          />
          <span className={comfyOnline ? 'text-emerald-400' : 'text-rose-400'}>
            {comfyOnline === true ? '연결됨' : comfyOnline === false ? '오프라인' : '확인중'}
          </span>
        </div>

        <button
          onClick={() => comfyClient.freeMemory()}
          title="VRAM 메모리 즉시 청소 (/free)"
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md border border-slate-700 text-xs font-medium transition"
        >
          VRAM 비우기 (/free)
        </button>
      </div>
    </header>
  );
};
