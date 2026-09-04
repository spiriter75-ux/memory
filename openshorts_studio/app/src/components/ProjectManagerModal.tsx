import React, { useEffect, useState, useRef } from 'react';
import { projectService } from '../services/projectService';
import { ProjectMaster, ProjectSummary } from '../types';

interface ProjectManagerModalProps {
  isOpen: boolean;
  canClose: boolean;
  currentProjectId: string;
  onClose: () => void;
  onSelectProject: (project: ProjectMaster) => void;
  onCreateNewProject: (title: string, chapter: string, inNewWindow: boolean) => void;
  onDeleteProject: (projectId: string) => void;
  onOpenInNewWindow: (projectId: string) => void;
}

export const ProjectManagerModal: React.FC<ProjectManagerModalProps> = ({
  isOpen,
  canClose,
  currentProjectId,
  onClose,
  onSelectProject,
  onCreateNewProject,
  onDeleteProject,
  onOpenInNewWindow,
}) => {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [newChapter, setNewChapter] = useState('제1화');
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadList = async () => {
    setLoading(true);
    try {
      const list = await projectService.listProjectsSummary();
      setProjects(list);
    } catch (e) {
      console.error('프로젝트 목록 로드 실패:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadList();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const showNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3000);
  };

  const handleCreate = (inNewWindow: boolean) => {
    const title = newTitle.trim() || '신규 숏츠 프로젝트';
    const chapter = newChapter.trim() || '제1화';
    onCreateNewProject(title, chapter, inNewWindow);
    setNewTitle('');
    setNewChapter('제1화');
    if (!inNewWindow) {
      onClose();
    } else {
      showNotice('새 창에서 프로젝트가 열렸습니다.');
      loadList();
    }
  };

  const handleOpenCurrent = async (id: string) => {
    try {
      const proj = await projectService.loadProjectById(id);
      if (proj) {
        onSelectProject(proj);
        onClose();
      } else {
        alert('프로젝트를 불러오지 못했습니다.');
      }
    } catch (err) {
      alert(`오류: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleExportProject = async (id: string) => {
    try {
      const proj = await projectService.loadProjectById(id);
      if (proj) {
        projectService.exportProjectToFile(proj);
        showNotice(`'${proj.title}' 백업 파일이 다운로드되었습니다.`);
      }
    } catch (err) {
      alert(`백업 실패: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`정말로 '${title}' 프로젝트를 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
      return;
    }
    await onDeleteProject(id);
    await loadList();
    showNotice(`'${title}' 프로젝트가 삭제되었습니다.`);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const loaded = await projectService.importProjectFromFile(file);
      projectService.setProject(loaded);
      await loadList();
      showNotice(`'${loaded.title}' 프로젝트를 성공적으로 불러왔습니다!`);
    } catch (err) {
      alert(`불러오기 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[#0D131F] border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-slate-100">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">🎬</span>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-white flex items-center space-x-2">
                <span>프로젝트 작업 관리자</span>
                <span className="text-xs bg-indigo-900/60 text-indigo-300 px-2 py-0.5 rounded border border-indigo-700/50">
                  멀티 윈도우 독립 실행
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                작업을 선택하여 전환하거나, 새 창에서 별도로 열어 여러 프로젝트를 동시에 진행하세요.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {canClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer text-sm font-bold"
                title="닫기"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Notice Toast */}
        {actionNotice && (
          <div className="bg-emerald-950/90 border-b border-emerald-800 text-emerald-300 text-xs px-6 py-2 text-center font-semibold">
            ✓ {actionNotice}
          </div>
        )}

        {/* Modal Body - Scrollable */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
          
          {/* Section 1: Create New Project */}
          <div className="bg-gradient-to-br from-indigo-950/40 via-slate-900/80 to-slate-900/90 p-5 rounded-xl border border-indigo-800/40 shadow-inner">
            <div className="flex items-center space-x-2 mb-3">
              <span className="text-indigo-400 font-bold text-sm">➕ 신규 작업 시작하기</span>
              <span className="text-xs text-slate-500">| 빈 스토리보드 캔버스 생성</span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
              <div className="sm:col-span-6">
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="새 작업 제목 (예: 회귀한 재벌 3세)"
                  className="w-full bg-slate-950/80 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate(false);
                  }}
                />
              </div>
              <div className="sm:col-span-2">
                <input
                  type="text"
                  value={newChapter}
                  onChange={(e) => setNewChapter(e.target.value)}
                  placeholder="회차 (제1화)"
                  className="w-full bg-slate-950/80 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition text-center"
                />
              </div>
              <div className="sm:col-span-4 flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => handleCreate(false)}
                  className="flex-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition shadow-sm cursor-pointer text-center"
                >
                  이 창에서 시작
                </button>
                <button
                  type="button"
                  onClick={() => handleCreate(true)}
                  className="flex-1 px-3 py-2 bg-emerald-700 hover:bg-emerald-600 text-emerald-100 rounded-lg text-xs font-bold transition shadow-sm cursor-pointer text-center"
                  title="브라우저 새 탭에서 이 작업을 독립적으로 실행합니다"
                >
                  새 창에서 열기 ↗
                </button>
              </div>
            </div>
          </div>

          {/* Section 2: Saved Projects List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-slate-200">
                  내 작업 목록 <span className="text-indigo-400 font-mono">({projects.length})</span>
                </h3>
                <span className="text-xs text-slate-500">IndexedDB 영구 보관</span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs border border-slate-700 transition flex items-center space-x-1 cursor-pointer"
                >
                  <span>📂 백업 JSON 불러오기</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleImportFile}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={loadList}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded text-xs transition"
                  title="목록 새로고침"
                >
                  🔄
                </button>
              </div>
            </div>

            {loading ? (
              <div className="py-12 text-center text-slate-500 text-sm">
                저장된 프로젝트 목록을 불러오는 중...
              </div>
            ) : projects.length === 0 ? (
              <div className="py-12 text-center bg-slate-900/40 rounded-xl border border-dashed border-slate-800 text-slate-500 text-sm">
                저장된 작업이 없습니다. 상단의 [+ 신규 작업 시작하기]로 첫 작업을 시작해보세요!
              </div>
            ) : (
              <div className="space-y-2.5">
                {projects.map((p) => {
                  const isCurrent = p.id === currentProjectId;
                  const formattedDate = (() => {
                    try {
                      const d = new Date(p.updatedAt);
                      return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                    } catch {
                      return p.updatedAt;
                    }
                  })();

                  return (
                    <div
                      key={p.id}
                      className={`p-3.5 rounded-xl border transition flex items-center justify-between ${
                        isCurrent
                          ? 'bg-indigo-950/30 border-indigo-700/80 shadow-md ring-1 ring-indigo-600/40'
                          : 'bg-slate-900/70 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                      }`}
                    >
                      {/* Left: Thumbnail & Details */}
                      <div className="flex items-center space-x-3.5 min-w-0 flex-1">
                        <div className="w-12 h-12 rounded-lg bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center shrink-0">
                          {p.previewThumbnail ? (
                            <img
                              src={p.previewThumbnail}
                              alt={p.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-xl opacity-60">🎬</span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-sm text-slate-100 truncate">
                              {p.title}
                            </span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono shrink-0">
                              {p.chapter}
                            </span>
                            {isCurrent && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-700/60 shrink-0 flex items-center space-x-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                <span>현재 열림</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center space-x-3 text-xs text-slate-400 mt-1">
                            <span>컷 <strong className="text-slate-200">{p.cutCount}</strong></span>
                            <span>•</span>
                            <span>위너 <strong className="text-indigo-300">{p.winnerCount}</strong></span>
                            <span>•</span>
                            <span>비디오 <strong className="text-emerald-300">{p.videoCount}</strong></span>
                            <span>•</span>
                            <span className="text-slate-500">{formattedDate}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center space-x-1.5 shrink-0 ml-4">
                        {!isCurrent ? (
                          <button
                            type="button"
                            onClick={() => handleOpenCurrent(p.id)}
                            className="px-3 py-1.5 bg-indigo-600/90 hover:bg-indigo-600 text-white rounded-lg text-xs font-bold transition cursor-pointer"
                          >
                            열기
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={onClose}
                            className="px-3 py-1.5 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
                          >
                            작업 계속
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => onOpenInNewWindow(p.id)}
                          className="px-2.5 py-1.5 bg-emerald-900/50 hover:bg-emerald-800 text-emerald-200 border border-emerald-700/60 rounded-lg text-xs font-bold transition cursor-pointer"
                          title="새 브라우저 탭에서 독립 실행"
                        >
                          새 창 ↗
                        </button>

                        <button
                          type="button"
                          onClick={() => handleExportProject(p.id)}
                          className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition cursor-pointer"
                          title="JSON 단독 백업 다운로드"
                        >
                          💾
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(p.id, p.title)}
                          className="px-2 py-1.5 bg-rose-950/40 hover:bg-rose-900/80 text-rose-300 border border-rose-800/40 hover:border-rose-600 rounded-lg text-xs transition cursor-pointer"
                          title="프로젝트 삭제"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800/80 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center space-x-1.5">
            <span className="text-amber-400">💡</span>
            <span>
              <strong>새 창에서 열기:</strong> 여러 브라우저 탭에 각각 다른 프로젝트를 띄워두고 완전히 독립적으로 동시 작업할 수 있습니다.
            </span>
          </div>

          {canClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-semibold transition cursor-pointer"
            >
              닫기
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
