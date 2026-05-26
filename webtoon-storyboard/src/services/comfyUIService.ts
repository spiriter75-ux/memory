/**
 * comfyUIService.ts - Workflow Accurate Version
 */
import type { CharacterItem } from '../types';

export interface GenerateParams {
  prompt: string;
  negativePrompt: string;
  seed: number; // -1이면 랜덤, 아니면 고정값
  width: number;
  height: number;
  characters: CharacterItem[];
  comfyUrl: string;
  comfyModel?: string;
  useUpscale?: boolean;
}

function buildWorkflow(params: GenerateParams) {
  const p = params;
  const finalSeed = p.seed;

  // 감지된 인물별 LoRA 매칭 (loraPath가 실제로 있는 것만 유효)
  const activeLoras = p.characters.filter(char => 
    char.loraPath && char.loraPath.trim() !== '' &&
    (p.prompt.toLowerCase().includes(char.name.toLowerCase()) || 
    (char.loraTrigger && p.prompt.toLowerCase().includes(char.loraTrigger.toLowerCase())))
  );

  const workflow: any = {
    "2": { "inputs": { "shift": 3.5, "model": ["140", 0] }, "class_type": "ModelSamplingAuraFlow" },
    "6": { "inputs": { "width": p.width, "height": p.height, "batch_size": 1 }, "class_type": "EmptyLatentImage" },
    "11": { "inputs": { "samples": ["17", 0], "vae": ["98", 0] }, "class_type": "VAEDecode" },
    "17": { "inputs": { "seed": ["54", 0], "steps": 10, "cfg": 1.1, "sampler_name": "euler", "scheduler": "beta", "denoise": 1, "model": ["2", 0], "positive": ["20", 0], "negative": ["100", 0], "latent_image": ["6", 0] }, "class_type": "KSampler" },
    "20": { "inputs": { "text": p.prompt, "clip": ["140", 1] }, "class_type": "CLIPTextEncode" },
    "54": { "inputs": { "seed": finalSeed }, "class_type": "Seed (rgthree)" },
    "89": { "inputs": { "clip_name": "qwen3_4b_fp8_scaled.safetensors", "type": "qwen_image", "device": "cpu" }, "class_type": "CLIPLoader" },
    "90": { "inputs": { "unet_name": p.comfyModel || "z-anime-distill-8step-fp8.safetensors", "weight_dtype": "fp8_e4m3fn" }, "class_type": "UNETLoader" },
    "91": { "inputs": { "vae_name": "ae.safetensors" }, "class_type": "VAELoader" },
    "93": { "inputs": { "filename_prefix": "Z-Anime", "images": ["11", 0] }, "class_type": "SaveImage" },
    "98": { "inputs": { "any_01": ["91", 0] }, "class_type": "Any Switch (rgthree)" },
    "100": { "inputs": { "text": p.negativePrompt, "clip": ["140", 1] }, "class_type": "CLIPTextEncode" },
    "140": { 
      "inputs": {
        "model": ["90", 0], "clip": ["89", 0],
        "lora_1": { "on": activeLoras.length >= 1, "lora": activeLoras.length >= 1 ? activeLoras[0].loraPath : "none", "strength": 1.0 },
        "lora_2": { "on": activeLoras.length >= 2, "lora": activeLoras.length >= 2 ? activeLoras[1].loraPath : "none", "strength": 1.0 },
        "lora_3": { "on": activeLoras.length >= 3, "lora": activeLoras.length >= 3 ? activeLoras[2].loraPath : "none", "strength": 1.0 },
        "lora_4": { "on": activeLoras.length >= 4, "lora": activeLoras.length >= 4 ? activeLoras[3].loraPath : "none", "strength": 1.0 },
        "lora_5": { "on": activeLoras.length >= 5, "lora": activeLoras.length >= 5 ? activeLoras[4].loraPath : "none", "strength": 1.0 }
      }, 
      "class_type": "Power Lora Loader (rgthree)" 
    }
  };

  if (p.useUpscale) {
    workflow["12"] = { "inputs": { "samples": ["14", 0], "vae": ["98", 0] }, "class_type": "VAEDecode" };
    workflow["14"] = { "inputs": { "seed": ["54", 0], "steps": 10, "cfg": 1, "sampler_name": "euler", "scheduler": "beta", "denoise": 0.4, "model": ["2", 0], "positive": ["20", 0], "negative": ["100", 0], "latent_image": ["45", 0] }, "class_type": "KSampler" };
    workflow["44"] = { "inputs": { "upscale_method": "lanczos", "scale_by": 1.5, "image": ["11", 0] }, "class_type": "ImageScaleBy" };
    workflow["45"] = { "inputs": { "pixels": ["44", 0], "vae": ["98", 0] }, "class_type": "VAEEncode" };
    workflow["95"] = { "inputs": { "filename_prefix": "Z-Anime-Upscale", "images": ["12", 0] }, "class_type": "SaveImage" };
  }

  return workflow;
}

export async function generateWithComfy(params: GenerateParams): Promise<Blob> {
  const workflow = buildWorkflow(params);
  const clientId = crypto.randomUUID();
  const baseUrl = params.comfyUrl.replace(/\/$/, "");

  const response = await fetch(`${baseUrl}/prompt`, {
    method: 'POST',
    body: JSON.stringify({ prompt: workflow, client_id: clientId })
  });
  
  if (!response.ok) throw new Error("ComfyUI 연결 실패");
  const { prompt_id } = await response.json();

  return new Promise((resolve, reject) => {
    const checkStatus = async () => {
      try {
        const historyRes = await fetch(`${baseUrl}/history/${prompt_id}`);
        const history = await historyRes.json();

        if (history[prompt_id]) {
          const outputs = history[prompt_id].outputs;
          const images = outputs["95"]?.images || outputs["93"]?.images;
          
          if (images && images.length > 0) {
            const fileName = images[0].filename;
            const imgRes = await fetch(`${baseUrl}/view?filename=${fileName}&type=output`);
            resolve(await imgRes.blob());
          } else {
            reject(new Error("이미지 출력물을 찾을 수 없습니다."));
          }
        } else {
          setTimeout(checkStatus, 1500);
        }
      } catch (err) {
        reject(err);
      }
    };
    checkStatus();
  });
}
