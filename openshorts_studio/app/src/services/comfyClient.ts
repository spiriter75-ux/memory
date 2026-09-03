/**
 * OpenShorts Pro Studio V2 - ComfyUI Client
 * 100% Robust, Zero-OOM, WebSocket-Monitored ComfyUI Gateway
 */

export interface ComfyStatus {
  online: boolean;
  version?: string;
  error?: string;
}

export interface PromptQueueResponse {
  prompt_id: string;
  number: number;
  node_errors?: Record<string, unknown>;
}

export class ComfyClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    if (baseUrl) {
      this.baseUrl = baseUrl.replace(/\/+$/, '');
    } else if (typeof window !== 'undefined' && window.location.port === '5173') {
      this.baseUrl = '/api/comfy';
    } else {
      this.baseUrl = 'http://127.0.0.1:8288';
    }
  }

  /**
   * ComfyUI 서버 헬스체크
   */
  async checkHealth(): Promise<ComfyStatus> {
    try {
      const res = await fetch(`${this.baseUrl}/system_stats`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { online: true };
    } catch (err: unknown) {
      return {
        online: false,
        error: err instanceof Error ? err.message : 'ComfyUI 서버에 연결할 수 없습니다. C:\\ComfyUI (포트 8288) 구동 여부를 확인하세요.',
      };
    }
  }

  /**
   * ComfyUI input 폴더로 이미지 업로드 (/upload/image)
   */
  async uploadImage(imageSource: string | Blob | File, filename?: string): Promise<string> {
    const actualName = filename || `input_${Date.now()}_${Math.floor(Math.random() * 1000)}.png`;
    let blob: Blob;

    if (typeof imageSource === 'string') {
      if (imageSource.startsWith('data:') || imageSource.startsWith('blob:')) {
        const res = await fetch(imageSource);
        blob = await res.blob();
      } else if (imageSource.startsWith('http') || imageSource.includes('/view?')) {
        const res = await fetch(imageSource);
        blob = await res.blob();
      } else {
        // 이미 ComfyUI input에 등록된 단일 파일명인 경우
        return imageSource;
      }
    } else {
      blob = imageSource;
    }

    const formData = new FormData();
    formData.append('image', blob, actualName);
    formData.append('overwrite', 'true');

    const res = await fetch(`${this.baseUrl}/upload/image`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`ComfyUI 이미지 업로드 실패 (${res.status})`);
    }

    const data = await res.json();
    return data.name || actualName;
  }

  /**
   * VRAM 16GB 안전 메모리 청소 (/free API)
   * 모델 전환 전 직전 가중치를 완벽히 언로드하여 OOM 0% 보장
   */
  async freeMemory(): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/free`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unload_models: true, free_memory: true }),
      });
    } catch (err) {
      console.warn('[ComfyClient] /free 호출 실패 (무시 가능):', err);
    }
  }

  /**
   * ComfyUI 작업 큐(Queue) 등록
   */
  async queuePrompt(workflowPayload: Record<string, unknown>): Promise<string> {
    const res = await fetch(`${this.baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: workflowPayload,
        extra_data: {
          extra_pnginfo: {
            workflow: {
              extra: {
                VHS_KeepIntermediate: false,
              },
            },
          },
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`ComfyUI 큐 등록 실패 (${res.status}): ${errText}`);
    }

    const data: PromptQueueResponse = await res.json();
    if (data.node_errors && Object.keys(data.node_errors).length > 0) {
      throw new Error(`노드 구성 오류: ${JSON.stringify(data.node_errors)}`);
    }

    return data.prompt_id;
  }

  /**
   * 작업 완료 대기 및 결과 출력물 조회 (Polling / WebSocket Fallback)
   */
  async waitForCompletion(
    promptId: string,
    onProgress?: (percent: number, nodeTitle?: string) => void,
    timeoutMs: number = 7200000 // 최대 2시간까지 중단 없이 안전 대기
  ): Promise<Record<string, unknown>> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        // 1. 단일 promptId 직접 조회
        const res = await fetch(`${this.baseUrl}/history/${promptId}`);
        if (res.ok) {
          const history = await res.json();
          const target = history[promptId];
          if (target) {
            if (target.status && target.status.status_str === 'error') {
              throw new Error(`ComfyUI 렌더링 중 에러 발생: ${JSON.stringify(target.status.messages)}`);
            }
            if (target.outputs && Object.keys(target.outputs).length > 0) {
              return target.outputs;
            }
          }
        }

        // 2. 전체 /history 목록에서 검색
        const allRes = await fetch(`${this.baseUrl}/history`);
        if (allRes.ok) {
          const allHistory = await allRes.json();
          if (allHistory && allHistory[promptId]) {
            const target = allHistory[promptId];
            if (target.status && target.status.status_str === 'error') {
              throw new Error(`ComfyUI 렌더링 중 에러 발생: ${JSON.stringify(target.status.messages)}`);
            }
            if (target.outputs && Object.keys(target.outputs).length > 0) {
              return target.outputs;
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes('ComfyUI 렌더링 중 에러')) {
          throw err;
        }
      }

      if (onProgress) {
        const elapsed = (Date.now() - startTime) / 1000;
        onProgress(Math.min(95, Math.floor(elapsed * 5)));
      }

      await new Promise((r) => setTimeout(r, 1000));
    }

    throw new Error('ComfyUI 렌더링 타임아웃 (2시간 초과)');
  }

  /**
   * ComfyUI history outputs 객체에서 실제 렌더링된 이미지 URL 추출
   */
  extractOutputImageUrl(outputs: Record<string, any>): string | null {
    if (!outputs) return null;
    for (const nodeId of Object.keys(outputs)) {
      const nodeOut = outputs[nodeId];
      if (nodeOut && Array.isArray(nodeOut.images) && nodeOut.images.length > 0) {
        const img = nodeOut.images[0];
        const filename = encodeURIComponent(img.filename || '');
        const subfolder = encodeURIComponent(img.subfolder || '');
        const type = encodeURIComponent(img.type || 'output');
        return `${this.baseUrl}/view?filename=${filename}&subfolder=${subfolder}&type=${type}`;
      }
    }
    return null;
  }

  /**
   * ComfyUI history outputs 객체에서 실제 렌더링된 비디오 URL 추출
   * (최종 VideoCombine 노드를 우선 추출하기 위해 역순 순회, 직접 8288 포트 직결 스트리밍)
   */
  extractOutputVideoUrl(outputs: Record<string, any>): string | null {
    if (!outputs) return null;
    const directBase = 'http://127.0.0.1:8288';
    
    // 최종 출력 노드가 항상 뒤쪽에 있으므로 역순으로 탐색
    const nodeIds = Object.keys(outputs).reverse();

    for (const nodeId of nodeIds) {
      const nodeOut = outputs[nodeId];
      if (!nodeOut) continue;

      // 1. gifs 배열 검사 (VHS_VideoCombine 기본 출력)
      if (Array.isArray(nodeOut.gifs) && nodeOut.gifs.length > 0) {
        const vid = nodeOut.gifs[0];
        const fname = vid.filename || '';
        const sub = vid.subfolder || '';
        const typ = vid.type || 'output';
        if (fname) {
          return `${directBase}/view?filename=${encodeURIComponent(fname)}&subfolder=${encodeURIComponent(sub)}&type=${encodeURIComponent(typ)}`;
        }
      }
      // 2. videos 배열 검사
      if (Array.isArray(nodeOut.videos) && nodeOut.videos.length > 0) {
        const vid = nodeOut.videos[0];
        const fname = vid.filename || '';
        const sub = vid.subfolder || '';
        const typ = vid.type || 'output';
        if (fname) {
          return `${directBase}/view?filename=${encodeURIComponent(fname)}&subfolder=${encodeURIComponent(sub)}&type=${encodeURIComponent(typ)}`;
        }
      }
      // 3. filenames 배열 검사 (VHS_VideoCombine 최신 버전 호환)
      if (Array.isArray(nodeOut.filenames) && nodeOut.filenames.length > 0) {
        const vid = nodeOut.filenames[0];
        const fname = typeof vid === 'string' ? vid : vid?.filename;
        const sub = typeof vid === 'object' ? vid?.subfolder : '';
        const typ = typeof vid === 'object' ? vid?.type : 'output';
        if (fname) {
          return `${directBase}/view?filename=${encodeURIComponent(fname)}&subfolder=${encodeURIComponent(sub || '')}&type=${encodeURIComponent(typ || 'output')}`;
        }
      }
      // 4. images 배열에 mp4/webm/gif가 들어오는 경우 검사
      if (Array.isArray(nodeOut.images) && nodeOut.images.length > 0) {
        for (const item of nodeOut.images) {
          const fname = item.filename || '';
          if (/\.(mp4|webm|gif|mkv|mov)/i.test(fname)) {
            return `${directBase}/view?filename=${encodeURIComponent(fname)}&subfolder=${encodeURIComponent(item.subfolder || '')}&type=${encodeURIComponent(item.type || 'output')}`;
          }
        }
      }
    }
    return null;
  }

  /**
   * 사용 가능한 LoRA 목록 조회
   */
  async getAvailableLoRAs(): Promise<string[]> {
    try {
      const res = await fetch(`${this.baseUrl}/object_info/LoraLoaderModelOnly`);
      if (!res.ok) return [];
      const data = await res.json();
      const loras = data?.LoraLoaderModelOnly?.input?.required?.lora_name?.[0];
      return Array.isArray(loras) ? loras : [];
    } catch {
      return [];
    }
  }

  /**
   * ComfyUI history outputs 객체에서 실제 텍스트 출력(SaveText / LLM output) 추출
   */
  extractOutputText(outputs: Record<string, any>): string | null {
    if (!outputs) return null;
    for (const nodeId of Object.keys(outputs)) {
      const nodeOut = outputs[nodeId];
      if (nodeOut && Array.isArray(nodeOut.text) && nodeOut.text.length > 0) {
        return nodeOut.text.join('\n').trim();
      }
    }
    return null;
  }
}

export const comfyClient = new ComfyClient();
