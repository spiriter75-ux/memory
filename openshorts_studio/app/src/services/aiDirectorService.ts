/**
 * OpenShorts Pro Studio V2 - AI Script Director Service
 * 100% Exact Port of Proven Storyboard Gemini & Ollama Pipeline
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { StoryboardCut, ReferenceSlots, INSTALLED_UNET_MODELS } from '../types';
import { comfyClient } from './comfyClient';

export interface AIDecompositionResult {
  projectTitle: string;
  chapter: string;
  cuts: StoryboardCut[];
}

export interface OllamaModelInfo {
  name: string;
  size?: number;
  modified_at?: string;
}

/** Robust JSON Extractor & Repair Engine for Truncated/Messy LLM Outputs */
function extractJson(text: string): any {
  if (!text) return {};
  try {
    // 1. think 태그 제거
    let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    // 2. 마크다운 코드블록 제거
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch) {
      cleaned = codeBlockMatch[1].trim();
    }

    // 3. 1차 시도: 표준 JSON.parse
    try {
      const parsed = JSON.parse(cleaned);
      const panels = parsed.panels || parsed.cuts || (Array.isArray(parsed) ? parsed : null);
      if (panels && panels.length > 0) return { panels };
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (_) {}

    // 4. 2차 시도: 제어문자/줄바꿈 이스케이프 보정 후 parse
    try {
      const sanitized = cleaned.replace(/[\u0000-\u001F]+/g, (match) => {
        if (match === '\n') return '\\n';
        if (match === '\r') return '\\r';
        if (match === '\t') return '\\t';
        return '';
      });
      const parsed = JSON.parse(sanitized);
      const panels = parsed.panels || parsed.cuts || (Array.isArray(parsed) ? parsed : null);
      if (panels && panels.length > 0) return { panels };
    } catch (_) {}

    // 5. 3차 시도: 중간에 잘린 JSON (Truncated JSON) 자동 닫기 복구
    const panelsIdx = cleaned.indexOf('"panels"');
    if (panelsIdx !== -1) {
      const bracketIdx = cleaned.indexOf('[', panelsIdx);
      if (bracketIdx !== -1) {
        const lastCloseBrace = cleaned.lastIndexOf('}');
        if (lastCloseBrace > bracketIdx) {
          const repaired = cleaned.substring(0, lastCloseBrace + 1) + '\n]}';
          try {
            const parsed = JSON.parse(repaired);
            if (parsed.panels && parsed.panels.length > 0) {
              return { panels: parsed.panels };
            }
          } catch (_) {
            try {
              const sanitizedRepaired = repaired.replace(/[\u0000-\u001F]+/g, (m) => (m === '\n' ? '\\n' : ''));
              const parsed = JSON.parse(sanitizedRepaired);
              if (parsed.panels && parsed.panels.length > 0) {
                return { panels: parsed.panels };
              }
            } catch (_) {}
          }
        }
      }
    }

    // 6. 4차 시도: 정규식 기반 개별 패널 블록 무차별 구조적 추출 (가장 강력한 Fallback)
    const panelRegex = /\{\s*"panelNumber"[\s\S]*?\n\s*\}/g;
    let m: RegExpExecArray | null;
    const recoveredPanels: any[] = [];
    while ((m = panelRegex.exec(cleaned)) !== null) {
      try {
        const singlePanel = JSON.parse(m[0]);
        if (singlePanel && (singlePanel.panelNumber || singlePanel.sceneDescription || singlePanel.imagePrompt)) {
          recoveredPanels.push(singlePanel);
        }
      } catch (_) {
        const pNum = m[0].match(/"panelNumber"\s*:\s*(\d+)/);
        const framing = m[0].match(/"framing"\s*:\s*"([^"]*)"/);
        const desc = m[0].match(/"sceneDescription"\s*:\s*"([^"]*)"/);
        const prompt = m[0].match(/"imagePrompt"\s*:\s*"([^"]*)"/);
        const dial = m[0].match(/"dialogue"\s*:\s*"([^"]*)"/);
        if (desc || prompt || pNum) {
          recoveredPanels.push({
            panelNumber: pNum ? parseInt(pNum[1], 10) : recoveredPanels.length + 1,
            framing: framing ? framing[1] : 'Medium Shot',
            sceneDescription: desc ? desc[1] : '',
            imagePrompt: prompt ? prompt[1] : '',
            dialogue: dial ? dial[1] : '',
          });
        }
      }
    }

    if (recoveredPanels.length > 0) {
      return { panels: recoveredPanels };
    }

    return {};
  } catch (err) {
    console.warn('extractJson fallback warning:', err);
    return {};
  }
}

function buildGeminiStoryboardPrompt(): string {
  return `You are a Master Webtoon & Storyboard Director.
Your task is to analyze the novel/scenario text and extract sequential, visually compelling webtoon storyboard cuts.

[LANGUAGE CONTRACT - VERY IMPORTANT]
1. 'imagePrompt' MUST be in ENGLISH (pure clean-plate diffusion prompt).
2. 'dialogue' MUST be in KOREAN ORIGINAL TEXT VERBATIM (원작 소설의 한국어 대사를 글자 그대로 보존할 것! 절대 영어로 번역하지 마시오!).
3. 'sceneDescription', 'narration', 'sfxText' MUST be in KOREAN (한국어 원문 표현 유지).

[CORE PACING & EXTRACTION RULES - DRAMATIC BEAT SYSTEM]
1. Do NOT mechanically split text by character length or sentence count.
2. Extract cuts based on DRAMATIC BEATS:
   - Action Transitions (character starts a significant action or combat move)
   - Emotional Punches / Turning Points (shocking reveal, decisive dialogue, extreme emotional change)
   - Spatial / Scene Transitions (camera moves to a new location or establishing shot)
3. Background/exposition paragraphs: Do NOT create separate cuts for pure narrative descriptions. Absorb them into the background/atmosphere of the nearest character cut.
4. Internal monologue: Convert to Korean narration OR express through character facial expression/body language in the visual prompt.
5. Dialogue & SFX: Extract Korean spoken words strictly into 'dialogue' and onomatopoeia/sound effects into 'sfxText'. Do NOT embed text in the visual image prompt.

[CLEAN PLATE & IMAGE PROMPT FORMULA]
- Every visual cut must be a CLEAN PLATE (no text, no speech bubbles rendered on image).
- Structure: [1. Framing/Camera Angle] + [2. Character Name + Pose/Facial Expression] + [3. Rich Environment & Atmospheric Setting with tactile props, spatial density, textures, and lighting] + [4. 'photorealistic 8k, cinematic film lighting, realistic 35mm photography, natural skin texture, depth of field, masterpiece, no text, no speech bubbles, no watermark']
- NEVER write lazy 1-word background descriptions (e.g. NEVER just 'inside room', 'dark background'). ALWAYS vividly describe the spatial atmosphere, architectural props, machinery/nature details, and cinematic lighting present in the novel context.

[Output Format]
Respond ONLY in valid JSON matching this schema:
{
  "panels": [
    {
      "panelNumber": 1,
      "framing": "Extreme Close-up | Low-angle | High-angle | Dutch Angle | Over-the-shoulder | Wide Shot",
      "sceneDescription": "한국어 장면 요약 (시각적 핵심 연출 및 원문 지문)",
      "imagePrompt": "English clean plate diffusion prompt with rich environment and character details",
      "narration": "한국어 나레이션 (없으면 빈 문자열)",
      "dialogue": "소설 속 한국어 원문 대사 그대로 (없으면 빈 문자열)",
      "sfxText": "한국어 의성어/효과음 (예: 쿵!, 콰아아, 스으윽, 없으면 빈 문자열)",
      "videoPrompt": {
        "mode": "i2v",
        "motion": "English camera and character motion for 5-sec video",
        "audio": "ambient soundscape and sound effects"
      }
    }
  ]
}`;
}

export class AIDirectorService {
  private getOllamaBaseUrl(): string {
    if (typeof window !== 'undefined' && window.location.port === '5173') {
      return '/api/ollama';
    }
    return 'http://127.0.0.1:11434';
  }

  async getInstalledModels(): Promise<OllamaModelInfo[]> {
    const baseUrl = this.getOllamaBaseUrl();
    try {
      const res = await fetch(`${baseUrl}/api/tags`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return (data.models || []).map((m: { name: string; size?: number; modified_at?: string }) => ({
        name: m.name,
        size: m.size,
        modified_at: m.modified_at,
      }));
    } catch {
      try {
        const directRes = await fetch('http://127.0.0.1:11434/api/tags');
        if (!directRes.ok) return [];
        const directData = await directRes.json();
        return (directData.models || []).map((m: { name: string; size?: number; modified_at?: string }) => ({
          name: m.name,
          size: m.size,
          modified_at: m.modified_at,
        }));
      } catch {
        return [];
      }
    }
  }

  /**
   * Google Gemini API 소설 콘티 추출 (Storyboard 원본 공식 100% 적용)
   */
  async decomposeNovelWithGemini(
    novelText: string,
    apiKey: string,
    modelName: string = 'gemini-2.5-flash',
    onProgress?: (msg: string) => void
  ): Promise<AIDecompositionResult> {
    if (!apiKey || !apiKey.trim()) {
      throw new Error('Gemini API 키가 설정되지 않았습니다. API Key를 입력해 주세요.');
    }

    const geminiModelName = modelName.trim().replace(/^models\//, '') || 'gemini-2.5-flash';
    if (onProgress) onProgress(`Gemini AI(${geminiModelName})가 소설 씬을 분석하여 실사/웹툰 콘티를 구성 중입니다...`);

    const geminiPrompt = buildGeminiStoryboardPrompt();
    const genAI = new GoogleGenerativeAI(apiKey.trim());
    const model = genAI.getGenerativeModel({ model: geminiModelName });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Gemini API(${geminiModelName}) 응답 시간 초과 (90초). 네트워크 연결을 확인해 주세요.`)), 90000)
    );

    try {
      const apiPromise = model.generateContent({
        contents: [{ role: 'user', parts: [{ text: novelText }] }],
        systemInstruction: geminiPrompt,
        generationConfig: { responseMimeType: 'application/json' },
      });

      const res = await Promise.race([apiPromise, timeoutPromise]);
      const rawText = res.response.text();
      const data = extractJson(rawText);
      const rawPanels: any[] = data.panels || (Array.isArray(data) ? data : []);

      if (!rawPanels || rawPanels.length === 0) {
        throw new Error(`Gemini AI가 콘티 패널을 반환하지 않았습니다. 원문: ${rawText.substring(0, 200)}...`);
      }

      return this.mapPanelsToStoryboardCuts(rawPanels, novelText);
    } catch (geminiErr: any) {
      console.error('Gemini storyboard generation failed:', geminiErr);
      throw new Error(`Gemini 소설 콘티 생성 실패 (${geminiModelName}): ${geminiErr.message}`);
    }
  }

  /**
   * 로컬 Ollama 소설 콘티 추출 (Storyboard 원본 스트리밍/JSON 공식)
   */
  async decomposeNovelWithOllama(
    novelText: string,
    modelName: string = 'huihui_ai/qwen3.5-abliterated:9b-Qwopus-q8_0',
    onProgress?: (msg: string) => void
  ): Promise<AIDecompositionResult> {
    if (onProgress) onProgress(`로컬 Ollama AI(${modelName})가 소설 문맥을 분석하여 콘티를 구성 중입니다...`);

    const baseUrl = this.getOllamaBaseUrl();
    const ollamaPrompt = buildGeminiStoryboardPrompt();

    try {
      const res = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          prompt: novelText.trim(),
          system: ollamaPrompt,
          stream: false,
          format: 'json',
          think: false,
          options: {
            num_ctx: 16384,
            num_predict: 8192,
            temperature: 0.3,
            top_p: 0.9,
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Ollama 서버 응답 오류 (HTTP ${res.status}): ${errText}`);
      }

      const data = await res.json();
      const rawOutput = (data.response && data.response.trim()) || (data.thinking && data.thinking.trim()) || '';
      const parsed = extractJson(rawOutput);
      let rawPanels: any[] = parsed.panels || (Array.isArray(parsed) ? parsed : []);

      // 백업: 혹시 response와 thinking 둘 다 파싱 시도
      if ((!rawPanels || rawPanels.length === 0) && data.thinking && data.response) {
        const fallbackParsed = extractJson(data.thinking + '\n' + data.response);
        rawPanels = fallbackParsed.panels || (Array.isArray(fallbackParsed) ? fallbackParsed : []);
      }

      if (!rawPanels || rawPanels.length === 0) {
        throw new Error(`Ollama AI가 콘티 패널을 반환하지 않았습니다. 응답: ${rawOutput.substring(0, 250)}...`);
      }

      return this.mapPanelsToStoryboardCuts(rawPanels, novelText);
    } catch (ollamaErr: any) {
      throw new Error(`Ollama 소설 콘티 생성 실패 (${modelName}): ${ollamaErr.message}`);
    }
  }

  /**
   * 패널 데이터를 StoryboardCut 구조체로 매핑
   */
  private mapPanelsToStoryboardCuts(rawPanels: any[], novelText: string): AIDecompositionResult {
    let title = '신규 숏츠 프로젝트';
    let chapter = '제1화';

    const titleMatch = novelText.match(/^(제?\s*\d+화|[0-9]+장|[\w\s]+편)\s*[:：]?\s*(.*)/m);
    if (titleMatch) {
      chapter = titleMatch[1].trim();
      title = titleMatch[2]?.trim() || chapter;
    }

    const cuts: StoryboardCut[] = rawPanels.map((p: any, idx: number) => {
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

      const originalText = [p.sceneDescription, p.narration, p.dialogue].filter(Boolean).join(' ') || `컷 ${idx + 1}`;
      const dialogueText = p.dialogue && p.dialogue.trim() ? p.dialogue.trim() : null;
      const motion = p.videoPrompt?.motion || 'cinematic subtle action';
      const framing = p.framing || 'Cinematic Medium Shot';
      const assembledPrompt = p.imagePrompt || '';
      const videoKoreanPrompt = [
        p.sceneDescription ? `[장면] ${p.sceneDescription}` : '',
        motion ? `[동작] ${motion}` : '',
        p.characterState ? `[연기] ${p.characterState}` : '',
        framing ? `[카메라] ${framing}` : '',
        dialogueText ? `[대사] "${dialogueText}"` : '',
      ].filter(Boolean).join(' | ') || originalText;

      return {
        id: `cut_${String(idx + 1).padStart(3, '0')}`,
        cutNumber: idx + 1,
        originalText,
        dialogueText,
        actingState: p.characterState || 'tense, focused cinematic expression',
        actionPose: motion,
        cameraWeatherMod: framing,
        selectedCharacterId: null,
        selectedWardrobeId: null,
        selectedLandmarkId: null,
        slots: defaultSlots,
        selectedUnetModelId: INSTALLED_UNET_MODELS[0].id,
        activeLoras: [],
        selectedLoRAName: null,
        selectedLoRAStrength: 0.8,
        assembledPrompt,
        videoPrompt: null,
        videoKoreanPrompt,
        candidates: [],
        selectedCandidateIndex: 0,
        winnerImagePath: null,
        videoDurationSeconds: 5,
        draftVideoPath: null,
        upscaledVideoPath: null,
        videoRenderStatus: 'idle',
        errorMessage: null,
      };
    });

    return {
      projectTitle: title,
      chapter,
      cuts,
    };
  }

  /**
   * ★ H3 비디오 전용 프롬프트 확장 LLM (ComfyUI 내장 Gemma 4 12B Heretic)
   * C:\ComfyUI\models\LLM\gemma-4-12B-it-heretic-QAT-UD-Q4_K_XL.gguf 직결
   */
  async expandH3PromptWithLLM(params: {
    inputNovelText: string;
    dialogue?: string;
    modelName?: string;
    mode: 't2v' | 'i2v' | 'fl2v' | 'ref2va' | 'long_relay';
    durationSeconds?: number;
    onProgress?: (pct: number) => void;
  }): Promise<string> {
    const { inputNovelText, dialogue, mode, durationSeconds = 5, onProgress } = params;

    let modeInstruction = '';
    if (mode === 't2v') {
      modeInstruction = 'Create a 3-part T2VA prompt: 1) integrated_multimodal_description: [Shot 1] Cinematic..., 2) overall_soundscape:, 3) non_diegetic_music:.';
    } else if (mode === 'i2v') {
      modeInstruction = 'Line 1 MUST be: "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced." Followed by a blank line and the 3 core fields (integrated_multimodal_description, overall_soundscape, non_diegetic_music).';
    } else if (mode === 'fl2v') {
      modeInstruction = `Line 1 MUST be: "How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the ${durationSeconds.toFixed(2)}-second mark of the target video." Followed by a blank line and continuous interpolation description.`;
    } else {
      modeInstruction = 'Follow the full-reference 6-section format: 1) subject_definitions, 2) summary, 3) retention_analysis, 4) detailed_description ([Shot 1]), 5) overall_soundscape, 6) non_diegetic_music.';
    }

    const fullUserPrompt = `[TARGET MODE: ${mode.toUpperCase()}]
${modeInstruction}

Novel Scene / Action Input:
"${inputNovelText}"
${dialogue ? `Spoken Dialogue: "${dialogue}" (Preserve original Korean in <d>[Korean] "..."</d>)` : ''}
Video Duration: ${durationSeconds} seconds

Convert this scene into the official MiniMax H3 prompt structure now.`;

    const workflowPayload: Record<string, unknown> = {
      '1': {
        class_type: 'LLMTextProcessor',
        inputs: {
          model: 'gemma-4-12B-it-heretic-QAT-UD-Q4_K_XL.gguf',
          mmproj: 'none',
          system_prompt: 'minimaxH3ReversePrompt_r2vV30Beta.txt',
          prompt: fullUserPrompt,
          max_tokens: 2048,
          temperature: 0.7,
          top_p: 0.8,
          top_k: 20,
          repeat_penalty: 1.0,
          ctx_size: 8192,
          memory_mode: 'auto',
          n_gpu_layers: 99,
          n_cpu_moe_layers: 1,
          seed: Math.floor(Math.random() * 1000000000),
          timeout_seconds: 180,
          reasoning: 'off',
        },
      },
      '2': {
        class_type: 'SaveText',
        inputs: {
          text: ['1', 0],
          filename_prefix: 'openshorts_h3_prompt',
          format: 'txt',
        },
      },
    };

    try {
      const promptId = await comfyClient.queuePrompt(workflowPayload);
      const outputs = await comfyClient.waitForCompletion(promptId, (pct) => {
        if (onProgress) onProgress(pct);
      });
      const generatedText = comfyClient.extractOutputText(outputs);
      if (!generatedText) {
        throw new Error('Gemma-4 Heretic 모델이 응답을 반환하지 않았습니다.');
      }
      return generatedText;
    } catch (err: unknown) {
      console.error('[aiDirectorService] ComfyUI Gemma-4 Heretic error:', err);
      throw new Error(`ComfyUI Gemma-4 Heretic H3 프롬프트 생성 실패: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * 한글 자연어 지시문을 Qwen-Image-Edit 전용 고화질 영문 프롬프트로 변환
   */
  async translateToEnglishVisualPrompt(koreanText: string): Promise<string> {
    if (!koreanText || !koreanText.trim()) return '';

    const geminiKey = typeof window !== 'undefined' ? (localStorage.getItem('openshorts_gemini_api_key') || '') : '';
    if (geminiKey) {
      try {
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const res = await model.generateContent(
          `You are an expert AI image prompt engineer for Qwen Image Edit. Convert this Korean instruction into a concise, professional English visual prompt (e.g. realistic lighting, 8k, exact clothing/expression/background changes). Output ONLY the clean English prompt without any quotes or explanations: "${koreanText}"`
        );
        const text = res.response.text().trim();
        if (text) return text.replace(/^"|"$/g, '').replace(/```/g, '');
      } catch (e) {
        console.warn('[aiDirectorService] Gemini translation fallback:', e);
      }
    }

    // 로컬 Ollama 호출 시도
    try {
      const baseUrl = this.getOllamaBaseUrl();
      const res = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'huihui_ai/qwen3.5-abliterated:9b-Qwopus-q8_0',
          prompt: `Translate and convert this Korean image modification instruction into a concise, descriptive English visual editing prompt for Qwen Image Edit. Output ONLY the English prompt: "${koreanText}"`,
          stream: false,
          options: { temperature: 0.3, num_predict: 256 },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.response) return data.response.trim().replace(/^"|"$/g, '');
      }
    } catch (_) {
      // Local fallback
    }

    // 기본 키워드 매핑 폴백
    let result = koreanText;
    const mappings: [RegExp, string][] = [
      [/웃게\s*해줘|웃는\s*표정|미소/g, 'smiling happily, joyful expression, natural facial lighting'],
      [/선글라스\s*씌워줘|선글라스/g, 'wearing stylish black sunglasses on her face'],
      [/안경\s*벗겨줘|안경\s*제거/g, 'remove glasses, clear eyes'],
      [/갈색\s*머리/g, 'natural brown hair'],
      [/금발/g, 'blonde hair'],
      [/단발/g, 'bob cut hairstyle'],
      [/카페\s*배경/g, 'modern luxury cafe interior background, warm ambient lighting'],
      [/해변|바다\s*배경/g, 'sunny beach background, ocean horizon'],
      [/가죽\s*자켓/g, 'wearing black leather jacket'],
      [/정장|수트/g, 'wearing modern elegant business suit'],
      [/피부\s*보정|피부결/g, 'masterpiece, ultra-detailed skin texture, realistic lighting, 8k'],
    ];

    for (const [re, eng] of mappings) {
      if (re.test(result)) {
        result = result.replace(re, eng);
      }
    }

    let finalRes = result.replace(/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]+/g, '').trim() || 'masterpiece, realistic photography, highly detailed';
    if (!finalRes.toLowerCase().includes('unchanged') && !finalRes.toLowerCase().includes('preserve')) {
      finalRes += ', keep everything else unchanged';
    }
    return finalRes;
  }

  /**
   * 한글 장면 설명을 27B 모델(또는 Gemini fallback)로 헐리우드급 시네마틱 2D T2I 영문 프롬프트로 확장 작성
   * keep_alive: 0 을 주어 작성 직후 VRAM을 즉시 0MB로 퇴출(OOM 원천 방지)
   */
  async expandToCinematicT2IPrompt(koreanText: string): Promise<string> {
    if (!koreanText || !koreanText.trim()) return '';

    // 1순위: 로컬 Ollama orcarouter 27B 고화질 작성 (keep_alive: 0 적용)
    try {
      const baseUrl = this.getOllamaBaseUrl();
      const res = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'orcarouter/Qwen3.8-27B-Uncensored:q3_K_S',
          prompt: `Convert this Korean scene description into a masterpiece, ultra-detailed English image prompt for FLUX and realistic diffusion (include lighting, textures, 35mm film photography, 8k, photorealistic). Output ONLY the English prompt: "${koreanText}"`,
          system: 'You are an elite cinematic prompt engineer for FLUX and realistic 2D diffusion. Convert the user input into a masterpiece, highly detailed English visual prompt (camera framing, 35mm film grain, volumetric lighting, rich textures, photorealistic 8k). Output ONLY the final English prompt without any quotes, preamble, or conversational notes.',
          stream: false,
          keep_alive: 0,
          options: {
            temperature: 0.7,
            num_predict: 200,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        let promptText = (data.response || '').trim();
        // 생각 태그 및 잡담 정제
        promptText = promptText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        promptText = promptText.replace(/^"|"$/g, '').trim();
        if (promptText && promptText.length > 15) {
          return promptText;
        }
      }
    } catch (e) {
      console.warn('[aiDirectorService] Ollama 27B expansion fallback:', e);
    }

    // 2순위: Gemini API 키가 있을 경우 초고속 Gemini Fallback
    const geminiKey = typeof window !== 'undefined' ? (localStorage.getItem('openshorts_gemini_api_key') || '') : '';
    if (geminiKey) {
      try {
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const res = await model.generateContent(
          `You are an elite cinematic prompt engineer for FLUX and realistic 2D diffusion. Convert this Korean scene description into a masterpiece, ultra-detailed English image generation prompt (camera angle, 35mm film grain, volumetric lighting, rich textures, photorealistic 8k). Output ONLY the clean English prompt text: "${koreanText}"`
        );
        const text = res.response.text().trim();
        if (text) return text.replace(/^"|"$/g, '').replace(/```/g, '').trim();
      } catch (e) {
        console.warn('[aiDirectorService] Gemini expansion fallback:', e);
      }
    }

    // 3순위: 9B Ollama Fallback
    try {
      const baseUrl = this.getOllamaBaseUrl();
      const res = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen3.5:9b-Q8-Uncensored',
          prompt: `Convert this Korean concept into a masterpiece 35mm photographic English prompt: "${koreanText}"`,
          stream: false,
          keep_alive: 0,
          options: { temperature: 0.5, num_predict: 160 },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        let pText = (data.response || '').trim().replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        if (pText) return pText.replace(/^"|"$/g, '');
      }
    } catch (_) { }

    return `masterpiece, cinematic 35mm film photography, 8k, photorealistic, volumetric lighting, highly detailed: ${koreanText}`;
  }
}

export const aiDirectorService = new AIDirectorService();
