/**
 * OpenShorts Pro Studio V2 - Project & Scenario Service
 * Manages Local State, Project Metadata, and Automatic Cut Segmentation
 */

import { ProjectMaster, StoryboardCut, ReferenceSlots, INSTALLED_UNET_MODELS, ProjectSummary } from '../types';

const IDB_NAME = 'OpenShortsProStudioDB';
const IDB_VERSION = 1;
const IDB_STORE = 'projects';

function openProjectDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }
    const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class ProjectService {
  private currentProject: ProjectMaster;

  constructor() {
    this.currentProject = this.loadFromStorage() || this.createDefaultProject();
  }

  private loadFromStorage(): ProjectMaster | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = localStorage.getItem('openshorts_v2_project');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.id) return parsed;
        }
      }
    } catch (e) {
      console.warn('[ProjectService] localStorage 로드 실패 (기본값 생성):', e);
    }
    return null;
  }

  private saveToStorage(project: ProjectMaster): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('openshorts_v2_project', JSON.stringify(project));
      }
    } catch (e) {
      console.warn('[ProjectService] localStorage 용량 초과 감지 - IndexedDB로 안전하게 영구 저장됩니다.');
    }
  }

  async saveToIndexedDB(project: ProjectMaster): Promise<void> {
    try {
      const db = await openProjectDB();
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      // 고유 ID와 레거시 fallback 키 동시 저장
      store.put(project, project.id);
      store.put(project, 'current_project');
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.error('[ProjectService] IndexedDB 저장 실패:', err);
    }
  }

  async loadFromIndexedDB(): Promise<ProjectMaster | null> {
    try {
      const db = await openProjectDB();
      return new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const req = store.get('current_project');
        req.onsuccess = () => {
          if (req.result && req.result.id) {
            resolve(req.result as ProjectMaster);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  async loadProjectById(id: string): Promise<ProjectMaster | null> {
    try {
      const db = await openProjectDB();
      return new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const req = store.get(id);
        req.onsuccess = () => {
          if (req.result && req.result.id) {
            resolve(req.result as ProjectMaster);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  async listProjectsSummary(): Promise<ProjectSummary[]> {
    try {
      const db = await openProjectDB();
      return new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const req = store.openCursor();
        const map = new Map<string, ProjectMaster>();

        req.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const key = String(cursor.key);
            const val = cursor.value as ProjectMaster;
            if (val && val.id && key !== 'current_project') {
              map.set(val.id, val);
            }
            cursor.continue();
          } else {
            // 저장된 고유 ID 프로젝트가 없고 레거시 current_project만 있는 경우 대비
            if (map.size === 0) {
              const fallbackReq = store.get('current_project');
              fallbackReq.onsuccess = () => {
                if (fallbackReq.result && fallbackReq.result.id) {
                  map.set(fallbackReq.result.id, fallbackReq.result);
                }
                resolve(this.buildSummariesFromMap(map));
              };
              fallbackReq.onerror = () => resolve([]);
              return;
            }
            resolve(this.buildSummariesFromMap(map));
          }
        };
        req.onerror = () => resolve([]);
      });
    } catch (err) {
      console.error('[ProjectService] listProjectsSummary 실패:', err);
      return [];
    }
  }

  private buildSummariesFromMap(map: Map<string, ProjectMaster>): ProjectSummary[] {
    const list: ProjectSummary[] = [];
    map.forEach((p) => {
      const winnerCount = p.cuts ? p.cuts.filter((c) => !!c.winnerImagePath).length : 0;
      const videoCount = p.cuts ? p.cuts.filter((c) => !!c.upscaledVideoPath || !!c.draftVideoPath).length : 0;
      const firstWinner = p.cuts ? p.cuts.find((c) => !!c.winnerImagePath)?.winnerImagePath : null;
      const firstCharThumb = p.characters && p.characters[0]?.refImagePath;

      list.push({
        id: p.id,
        title: p.title || '제목 없음',
        chapter: p.chapter || '제1화',
        author: p.author || '대표님',
        createdAt: p.createdAt || new Date().toISOString(),
        updatedAt: p.updatedAt || new Date().toISOString(),
        cutCount: p.cuts ? p.cuts.length : 0,
        winnerCount,
        videoCount,
        previewThumbnail: firstWinner || firstCharThumb || null,
      });
    });

    return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async deleteProject(id: string): Promise<void> {
    try {
      const db = await openProjectDB();
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.delete(id);
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.error('[ProjectService] deleteProject 실패:', err);
    }
  }

  createNewProject(title: string = '신규 숏츠 프로젝트', chapter: string = '제1화'): ProjectMaster {
    const newProj = this.createDefaultProject(title);
    newProj.chapter = chapter;
    newProj.id = `proj_${Date.now()}`;
    return newProj;
  }


  createDefaultProject(title: string = '신규 숏츠 프로젝트'): ProjectMaster {
    return {
      id: `proj_${Date.now()}`,
      title,
      chapter: '제1화',
      author: '대표님',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      cuts: [],
      characters: [],
      wardrobes: [],
      landmarks: [],
      defaultUnetModelId: INSTALLED_UNET_MODELS[0].id,
      defaultVideoDuration: 5,
      upscaleTargetMP: 0.5,
    };
  }

  getCurrentProject(): ProjectMaster {
    return this.currentProject;
  }

  setProject(project: ProjectMaster): void {
    this.currentProject = project;
    this.saveToStorage(project);
    this.saveToIndexedDB(project);
  }

  /**
   * 프로젝트 데이터를 안전한 JSON 파일로 내 컴퓨터(다운로드)에 즉시 저장
   */
  exportProjectToFile(project: ProjectMaster): void {
    const jsonStr = JSON.stringify(project, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const safeTitle = (project.title || '신규_프로젝트').replace(/[/\\?%*:|"<>]/g, '_');
    const safeChapter = (project.chapter || '제1화').replace(/[/\\?%*:|"<>]/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `OpenShorts_${safeTitle}_${safeChapter}_${dateStr}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * 내 컴퓨터의 JSON 백업 파일을 읽어 프로젝트 데이터 복원
   */
  importProjectFromFile(file: File): Promise<ProjectMaster> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const parsed = JSON.parse(content);
          if (!parsed || !parsed.id) {
            throw new Error('유효한 OpenShorts 프로젝트 JSON 파일이 아닙니다.');
          }
          resolve(parsed as ProjectMaster);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
      reader.readAsText(file);
    });
  }

  /**
   * 소설 텍스트 파싱 및 컷 자동 분할
   */
  parseNovelIntoCuts(novelText: string): StoryboardCut[] {
    const lines = novelText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const cuts: StoryboardCut[] = [];

    lines.forEach((line, idx) => {
      const dialogueMatch = line.match(/["“](.+?)["”]/);
      const dialogueText = dialogueMatch ? dialogueMatch[1] : null;

      const defaultSlots: ReferenceSlots = {
        bg: null,
        face: null,
        face_b: null,
        wardrobe: null,
        pose: null,
        prop_1: null,
        vehicle: null,
        prop_2: null,
        style: null,
      };

      const cut: StoryboardCut = {
        id: `cut_${String(idx + 1).padStart(3, '0')}`,
        cutNumber: idx + 1,
        originalText: line,
        dialogueText: dialogueText,
        actingState: dialogueText ? 'focused expression, emotional delivery' : 'natural observation, calm stance',
        actionPose: 'standing naturally, eye-level cinematic shot',
        cameraWeatherMod: 'cinematic lighting, clear atmosphere',
        selectedCharacterId: null,
        selectedWardrobeId: null,
        selectedLandmarkId: null,
        slots: defaultSlots,
        selectedUnetModelId: INSTALLED_UNET_MODELS[0].id,
        activeLoras: [],
        selectedLoRAName: null,
        selectedLoRAStrength: 0.8,
        assembledPrompt: '',
        videoPrompt: null,
        videoKoreanPrompt: dialogueText ? `${line} (대사: "${dialogueText}")` : line,
        candidates: [],
        selectedCandidateIndex: 0,
        winnerImagePath: null,
        videoDurationSeconds: 5,
        draftVideoPath: null,
        upscaledVideoPath: null,
        videoRenderStatus: 'idle',
        errorMessage: null,
      };

      cuts.push(cut);
    });

    this.currentProject.cuts = cuts;
    return cuts;
  }
}

export const projectService = new ProjectService();
