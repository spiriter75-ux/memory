/**
 * fileSystemService.ts
 * Browser File System Access API를 이용한 로컬 폴더 관리
 */

let _projectDirHandle: FileSystemDirectoryHandle | null = null;

export function hasProjectFolder(): boolean {
  return _projectDirHandle !== null;
}

/** 1. 프로젝트 폴더 선택 (사용자 권한 필요) */
export async function selectProjectFolder(): Promise<string> {
  try {
    const handle = await (window as any).showDirectoryPicker({
      mode: 'readwrite'
    });
    _projectDirHandle = handle;
    return handle.name;
  } catch (err) {
    console.error('Folder selection cancelled or failed', err);
    throw err;
  }
}

/** 2. 이미지 Blob을 로컬 폴더의 /images 서브폴더에 저장 */
export async function saveImageToLocal(
  blob: Blob, 
  panelNumber: number, 
  historyId: string
): Promise<string> {
  if (!_projectDirHandle) throw new Error('프로젝트 폴더가 선택되지 않았습니다.');

  try {
    // images 폴더 확보
    const imagesDir = await _projectDirHandle.getDirectoryHandle('images', { create: true });
    
    // 파일명 생성: panel_01_uuid.png
    const fileName = `panel_${String(panelNumber).padStart(2, '0')}_${historyId.slice(0, 8)}.png`;
    const fileHandle = await imagesDir.getFileHandle(fileName, { create: true });
    
    // 파일 쓰기
    const writable = await (fileHandle as any).createWritable();
    await writable.write(blob);
    await writable.close();
    
    return fileName;
  } catch (err) {
    console.error('Image saving failed', err);
    throw err;
  }
}

/** 3. 저장된 이미지 파일을 읽어서 브라우저 URL로 변환 (표시용) */
export async function getImageUrl(fileName: string): Promise<string> {
  if (!_projectDirHandle) return '';
  try {
    const imagesDir = await _projectDirHandle.getDirectoryHandle('images');
    const fileHandle = await imagesDir.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return URL.createObjectURL(file);
  } catch {
    return '';
  }
}

/** 4. 프로젝트 설정(JSON) 저장 */
export async function saveProjectConfig(configData: object): Promise<void> {
  if (!_projectDirHandle) return;
  try {
    const fileHandle = await _projectDirHandle.getFileHandle('project_config.json', { create: true });
    const writable = await (fileHandle as any).createWritable();
    await writable.write(JSON.stringify(configData, null, 2));
    await writable.close();
  } catch (err) {
    console.error('Config saving failed', err);
  }
}

/** 5. 프로젝트 설정(JSON) 불러오기 */
export async function loadProjectConfig(): Promise<any> {
  if (!_projectDirHandle) throw new Error('프로젝트 폴더가 선택되지 않았습니다.');
  try {
    const fileHandle = await _projectDirHandle.getFileHandle('project_config.json');
    const file = await fileHandle.getFile();
    const content = await file.text();
    return JSON.parse(content);
  } catch (err) {
    console.error('Config loading failed', err);
    throw new Error('프로젝트 설정 파일을 찾을 수 없거나 읽을 수 없습니다.');
  }
}
/** 6. 스토리보드 패널 이미지와 텍스트 일괄 내보내기 (후처리용) */
export async function exportStoryboardsToLocal(panels: any[], novelText: string): Promise<void> {
  if (!_projectDirHandle) throw new Error('프로젝트 폴더가 선택되지 않았습니다.');

  try {
    const exportRoot = await _projectDirHandle.getDirectoryHandle('exports', { create: true });
    
    // 덮어쓰기 방지: 내보낼 때마다 고유한 시간 이름의 하위 폴더 생성
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const folderName = `콘티추출_${timestamp}`;
    const exportDir = await exportRoot.getDirectoryHandle(folderName, { create: true });
    
    for (const panel of panels) {
      // 파일명: panel_01 (고유 식별자 대신 번호 기반 매칭)
      const baseName = `panel_${String(panel.panelNumber).padStart(2, '0')}`;
      
      // 1. 이미지 파일 복사 (이미지가 있는 경우에만)
      const activeImage = panel.generationHistory?.find((h: any) => h.id === panel.activeImageId) || 
                          (panel.generationHistory && panel.generationHistory.length > 0 ? panel.generationHistory[panel.generationHistory.length - 1] : null);
                          
      if (activeImage && activeImage.fileName) {
        try {
          const imagesDir = await _projectDirHandle.getDirectoryHandle('images');
          const imgFileHandle = await imagesDir.getFileHandle(activeImage.fileName);
          const file = await imgFileHandle.getFile();
          
          const newImgHandle = await exportDir.getFileHandle(`${baseName}.png`, { create: true });
          const writableImg = await (newImgHandle as any).createWritable();
          await writableImg.write(file);
          await writableImg.close();
        } catch (err) {
          console.error(`이미지 복사 실패 (Panel ${panel.panelNumber}):`, err);
        }
      }
      
      // 2. 동일한 이름의 텍스트 파일 생성 (항상 생성)
      const txtContent = `[Novel Content / Scene]\n${panel.sceneDescription || novelText || ''}\n\n[Prompt]\n${panel.imagePrompt || ''}\n\n[Narration]\n${panel.narration || ''}\n\n[Dialogue]\n${panel.dialogue || ''}\n`;
      
      const txtHandle = await exportDir.getFileHandle(`${baseName}.txt`, { create: true });
      const writableTxt = await (txtHandle as any).createWritable();
      await writableTxt.write(txtContent);
      await writableTxt.close();
    }
  } catch (err) {
    console.error('Export failed', err);
    throw err;
  }
}
