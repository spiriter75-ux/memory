/**
 * OpenShorts Pro Studio V2 - Workflow Registry
 * Fully Dynamic UNET / GGUF / Diffusion Node Dispatcher
 * Exact Verified CLIP Encoders per Engine (with Huihui Abliterated Support)
 * Robust LoRA Bypass (when 'None' or null)
 */

import { INSTALLED_UNET_MODELS, InstalledUnetModel } from '../types';

export class WorkflowRegistry {
  /**
   * 선택된 UNET 모델에 맞춰 최적의 ComfyUI 노드 그래프를 동적으로 조립 (무제한 N개 LoRA 직렬 체인 지원)
   */
  buildDynamic2DWorkflow(params: {
    unetModelId: string;
    prompt: string;
    seed: number;
    width: number;
    height: number;
    steps?: number;
    shift?: number;
    cfg?: number;
    nsfwTier?: 'low' | 'high';
    enableHiresFix?: boolean;
    refImagePaths?: string[];
    loras?: { name: string; strength: number }[];
    loraName?: string | null;
    loraStrength?: number;
    lora2Name?: string | null;
    lora2Strength?: number;
  }): { payload: Record<string, unknown>; modelMeta: InstalledUnetModel } {
    const { unetModelId, prompt, seed, width, height, steps, shift, cfg, nsfwTier, enableHiresFix } = params;

    // 로라 리스트 정규화 (N개 무제한 지원)
    const validLoras: { name: string; strength: number }[] = [];
    if (params.loras && params.loras.length > 0) {
      params.loras.forEach((l) => {
        if (l.name && l.name !== 'None' && l.name.trim()) {
          validLoras.push({ name: l.name, strength: l.strength ?? 0.8 });
        }
      });
    } else {
      if (params.loraName && params.loraName !== 'None' && params.loraName.trim()) {
        validLoras.push({ name: params.loraName, strength: params.loraStrength ?? 0.8 });
      }
      if (params.lora2Name && params.lora2Name !== 'None' && params.lora2Name.trim()) {
        validLoras.push({ name: params.lora2Name, strength: params.lora2Strength ?? 0.8 });
      }
    }

    const modelMeta =
      INSTALLED_UNET_MODELS.find((m) => m.id === unetModelId) || INSTALLED_UNET_MODELS[0];

    let payload: Record<string, unknown>;

    if (modelMeta.loaderType === 'UnetLoaderGGUF') {
      payload = this.buildGGUFWorkflow({ modelMeta, prompt, seed, width, height, loras: validLoras });
    } else if (modelMeta.family === 'krea2') {
      payload = this.buildKrea2ExtendedWorkflow({ modelMeta, prompt, seed, width, height, loras: validLoras, steps, shift, cfg });
    } else if (modelMeta.family === 'zimage') {
      payload = this.buildZImageWorkflow({ modelMeta, prompt, seed, width, height, loras: validLoras, steps, shift, cfg, nsfwTier, enableHiresFix });
    } else if (modelMeta.loaderType === 'CheckpointLoaderSimple') {
      payload = this.buildCheckpointWorkflow({ modelMeta, prompt, seed, width, height, loras: validLoras });
    } else {
      payload = this.buildStandardUNETWorkflow({ modelMeta, prompt, seed, width, height, loras: validLoras });
    }

    return { payload, modelMeta };
  }

  /**
   * 1. UnetLoaderGGUF 전용 워크플로우 (N개 LoRA 무제한 직렬 체인)
   */
  private buildGGUFWorkflow(p: {
    modelMeta: InstalledUnetModel;
    prompt: string;
    seed: number;
    width: number;
    height: number;
    loras: { name: string; strength: number }[];
  }): Record<string, unknown> {
    let lastModelOutput: [string, number] = ['1', 0];

    const nodes: Record<string, unknown> = {
      '1': {
        class_type: 'UnetLoaderGGUF',
        inputs: {
          unet_name: p.modelMeta.fileName,
        },
      },
      '2': {
        class_type: 'CLIPLoader',
        inputs: {
          clip_name: 'Huihui-Qwen3-VL-4B-Instruct-abliterated-fp8_scaled.safetensors',
          type: 'qwen_image',
          device: 'default',
        },
      },
      '3': {
        class_type: 'VAELoader',
        inputs: {
          vae_name: 'qwen_image_vae.safetensors',
        },
      },
      '4': {
        class_type: 'EmptySD3LatentImage',
        inputs: {
          width: p.width,
          height: p.height,
          batch_size: 1,
        },
      },
      '5': {
        class_type: 'CLIPTextEncode',
        inputs: {
          text: p.prompt,
          clip: ['2', 0],
        },
      },
    };

    // N개 LoRA 순차 직렬 체인 노드 선행 생성
    p.loras.forEach((l, idx) => {
      const nodeKey = `lora_${idx}`;
      nodes[nodeKey] = {
        class_type: 'LoraLoaderModelOnly',
        inputs: {
          model: lastModelOutput,
          lora_name: l.name,
          strength_model: l.strength,
        },
      };
      lastModelOutput = [nodeKey, 0];
    });

    // 최종 LoRA 모델에 AuraFlow 및 CFGNorm 샘플링 패치 적용
    nodes['6'] = {
      class_type: 'ModelSamplingAuraFlow',
      inputs: {
        shift: 3.1,
        model: lastModelOutput,
      },
    };
    nodes['7'] = {
      class_type: 'CFGNorm',
      inputs: {
        strength: 1.0,
        model: ['6', 0],
      },
    };
    nodes['8'] = {
      class_type: 'KSampler',
      inputs: {
        seed: p.seed,
        steps: p.modelMeta.recommendedSteps,
        cfg: 1.0,
        sampler_name: p.modelMeta.recommendedSampler,
        scheduler: p.modelMeta.recommendedScheduler,
        denoise: 1.0,
        model: ['7', 0],
        positive: ['5', 0],
        negative: ['5', 0],
        latent_image: ['4', 0],
      },
    };
    nodes['9'] = {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['8', 0],
        vae: ['3', 0],
      },
    };
    nodes['11'] = {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: 'openshorts_v2/qwen_gguf',
        images: ['9', 0],
      },
    };

    return nodes;
  }

  /**
   * 2. Krea 2 Turbo Extended 워크플로우 (무검열 로라 집중, 업스케일/디테일러 제거)
   * 기반 JSON: Krea2 Turbo Workflow + Upscale + Edit + Uncen.json
   */
  buildKrea2ExtendedWorkflow(p: {
    modelMeta: InstalledUnetModel;
    prompt: string;
    seed: number;
    width: number;
    height: number;
    loras: { name: string; strength: number }[];
    steps?: number;
    shift?: number;
    cfg?: number;
  }): Record<string, unknown> {
    let lastModelOutput: [string, number] = ['1', 0];

    const nodes: Record<string, unknown> = {
      '1': {
        class_type: 'UNETLoader',
        inputs: {
          unet_name: p.modelMeta.fileName,
          weight_dtype: 'default',
        },
      },
      '2': {
        class_type: 'CLIPLoader',
        inputs: {
          clip_name: 'Huihui-Qwen3-VL-4B-Instruct-abliterated-fp8_scaled.safetensors',
          type: 'krea2',
        },
      },
      '3': {
        class_type: 'VAELoader',
        inputs: {
          vae_name: 'qwen_image_vae.safetensors',
        },
      },
      '4': {
        class_type: 'EmptyLatentImage',
        inputs: {
          width: p.width,
          height: p.height,
          batch_size: 1,
        },
      },
      '5': {
        class_type: 'CLIPTextEncode',
        inputs: {
          text: p.prompt,
          clip: ['2', 0],
        },
      },
      '6': {
        class_type: 'CLIPTextEncode',
        inputs: {
          text: 'blurry, distorted, plastic skin, anime, low quality, artifacts, watermark',
          clip: ['2', 0],
        },
      },
    };

    // [무검열 로직] N개 LoRA 순차 직렬 체인 노드 선행 생성
    // JSON의 DonutLoRAStack 대신 가장 안정적인 LoraLoaderModelOnly 체인 사용 (업스케일/SAM 제외)
    p.loras.forEach((l, idx) => {
      const nodeKey = `lora_${idx}`;
      nodes[nodeKey] = {
        class_type: 'LoraLoaderModelOnly',
        inputs: {
          model: lastModelOutput,
          lora_name: l.name,
          strength_model: l.strength,
        },
      };
      lastModelOutput = [nodeKey, 0];
    });

    // 최종 LoRA 모델에 AuraFlow 샘플링 패치 적용
    nodes['12'] = {
      class_type: 'ModelSamplingAuraFlow',
      inputs: {
        shift: p.shift ?? 3.0,
        model: lastModelOutput,
      },
    };
    nodes['7'] = {
      class_type: 'KSampler',
      inputs: {
        seed: p.seed,
        steps: p.steps ?? p.modelMeta.recommendedSteps, // 16 steps
        cfg: p.cfg ?? 2.0, // CFG 2.0
        sampler_name: p.modelMeta.recommendedSampler, // euler
        scheduler: p.modelMeta.recommendedScheduler, // simple
        denoise: 1.0,
        model: ['12', 0],
        positive: ['5', 0],
        negative: ['6', 0],
        latent_image: ['4', 0],
      },
    };
    nodes['8'] = {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['7', 0],
        vae: ['3', 0],
      },
    };
    nodes['9'] = {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: 'openshorts_v2/krea2',
        images: ['8', 0],
      },
    };

    return nodes;
  }

  /**
   * 3. Krea 2 Turbo RAW INT8 초고속 워크플로우
   * 기반 JSON: krea2TurboFastImageTo_v10.json
   */
  buildKrea2FastWorkflow(p: {
    modelMeta: InstalledUnetModel;
    prompt: string;
    seed: number;
    width: number;
    height: number;
    loras: { name: string; strength: number }[];
    steps?: number;
    cfg?: number;
  }): Record<string, unknown> {
    let lastModelOutput: [string, number] = ['1', 0];

    const nodes: Record<string, unknown> = {
      '1': {
        class_type: 'UNETLoader',
        inputs: { unet_name: p.modelMeta.fileName, weight_dtype: 'default' },
      },
      '2': {
        class_type: 'DualCLIPLoader',
        inputs: { clip_name1: 'clip_l.safetensors', clip_name2: 't5xxl_fp8_e4m3fn.safetensors', type: 'flux' },
      },
      '3': { class_type: 'VAELoader', inputs: { vae_name: 'ae.safetensors' } },
      '4': {
        class_type: 'EmptySD3LatentImage',
        inputs: { width: p.width, height: p.height, batch_size: 1 },
      },
      '5': { class_type: 'CLIPTextEncode', inputs: { text: p.prompt, clip: ['2', 0] } },
      '6': {
        class_type: 'CLIPTextEncode',
        inputs: { text: 'blurry, distorted, plastic skin, anime, watermark', clip: ['2', 0] },
      },
    };

    p.loras.forEach((l, idx) => {
      const nodeKey = `lora_${idx}`;
      nodes[nodeKey] = {
        class_type: 'LoraLoaderModelOnly',
        inputs: { model: lastModelOutput, lora_name: l.name, strength_model: l.strength },
      };
      lastModelOutput = [nodeKey, 0];
    });

    nodes['7'] = {
      class_type: 'Krea2RebalanceConditioning', // Fast version specific node
      inputs: { model: lastModelOutput },
    };

    nodes['8'] = {
      class_type: 'KSampler',
      inputs: {
        seed: p.seed,
        steps: p.steps ?? p.modelMeta.recommendedSteps,
        cfg: p.cfg ?? 2.0,
        sampler_name: p.modelMeta.recommendedSampler,
        scheduler: p.modelMeta.recommendedScheduler,
        denoise: 1.0,
        model: ['7', 0],
        positive: ['5', 0],
        negative: ['6', 0],
        latent_image: ['4', 0],
      },
    };

    nodes['9'] = { class_type: 'VAEDecode', inputs: { samples: ['8', 0], vae: ['3', 0] } };
    nodes['10'] = { class_type: 'SaveImage', inputs: { filename_prefix: 'openshorts_v2/krea2_fast', images: ['9', 0] } };

    return nodes;
  }

  /**
   * 3. Z-Image Turbo / Ultimate 워크플로우 (N개 LoRA 무제한 직렬 체인, 노 업스케일 네이티브)
   * 기준: zImageBaseTurboProGradeNSFWLowOrHigh_v1501Upgrades.json
   */
  private buildZImageWorkflow(p: {
    modelMeta: InstalledUnetModel;
    prompt: string;
    seed: number;
    width: number;
    height: number;
    loras: { name: string; strength: number }[];
    steps?: number;
    shift?: number;
    cfg?: number;
    nsfwTier?: 'low' | 'high';
    enableHiresFix?: boolean;
  }): Record<string, unknown> {
    let lastModelOutput: [string, number] = ['1', 0];

    const isHiresFix = p.enableHiresFix !== false;
    const effectiveShift = p.shift ?? 3.5;
    const effectiveSteps = p.steps ?? (isHiresFix ? 10 : 8);
    const effectiveCfg = p.cfg ?? (isHiresFix ? 1.1 : 1.0);

    const nodes: Record<string, unknown> = {
      '1': {
        class_type: 'UNETLoader',
        inputs: {
          unet_name: p.modelMeta.fileName,
          weight_dtype: 'default',
        },
      },
      '2': {
        class_type: 'CLIPLoader',
        inputs: {
          clip_name: 'qwen3_4b_fp8_scaled.safetensors',
          type: 'lumina2',
          device: 'default',
        },
      },
      '3': {
        class_type: 'VAELoader',
        inputs: {
          vae_name: 'ae.safetensors',
        },
      },
      '4': {
        class_type: 'EmptyLatentImage',
        inputs: {
          width: p.width,
          height: p.height,
          batch_size: 1,
        },
      },
      '5': {
        class_type: 'CLIPTextEncode',
        inputs: {
          text: p.prompt,
          clip: ['2', 0],
        },
      },
      // 🌟 ConditioningZeroOut: 네거티브 텍스트 오염을 수학적으로 0으로 완전 제거하여 Z-Image 특유의 뭉개짐을 완벽 방지
      '6': {
        class_type: 'ConditioningZeroOut',
        inputs: {
          conditioning: ['5', 0],
        },
      },
    };

    // N개 LoRA 순차 직렬 체인 노드 선행 생성
    p.loras.forEach((l, idx) => {
      const nodeKey = `lora_${idx}`;
      nodes[nodeKey] = {
        class_type: 'LoraLoaderModelOnly',
        inputs: {
          model: lastModelOutput,
          lora_name: l.name,
          strength_model: l.strength,
        },
      };
      lastModelOutput = [nodeKey, 0];
    });

    // Z-Image Turbo shift 패치 적용 (기본 3.5)
    nodes['12'] = {
      class_type: 'ModelSamplingAuraFlow',
      inputs: {
        shift: effectiveShift,
        model: lastModelOutput,
      },
    };

    // [1단계] 베이스 생성 (ZeroOut 네거티브 적용)
    nodes['7'] = {
      class_type: 'KSampler',
      inputs: {
        seed: p.seed,
        steps: effectiveSteps,
        cfg: effectiveCfg,
        sampler_name: isHiresFix ? 'euler' : 'res_multistep',
        scheduler: isHiresFix ? 'beta' : 'simple',
        denoise: 1.0,
        model: ['12', 0],
        positive: ['5', 0],
        negative: ['6', 0],
        latent_image: ['4', 0],
      },
    };

    // [1단계 디코드]
    nodes['8'] = {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['7', 0],
        vae: ['3', 0],
      },
    };

    if (isHiresFix) {
      // [2단계 하이레스 확대] 1.5배 란초스 업스케일
      nodes['44'] = {
        class_type: 'ImageScaleBy',
        inputs: {
          upscale_method: 'lanczos',
          scale_by: 1.5,
          image: ['8', 0],
        },
      };

      // [2단계 잠재공간 변환] VAEEncode
      nodes['45'] = {
        class_type: 'VAEEncode',
        inputs: {
          pixels: ['44', 0],
          vae: ['3', 0],
        },
      };

      // [2단계 디테일 정제 KSampler] 10스텝, CFG 1.0, euler, beta, denoise 0.4
      nodes['14'] = {
        class_type: 'KSampler',
        inputs: {
          seed: p.seed,
          steps: 10,
          cfg: 1.0,
          sampler_name: 'euler',
          scheduler: 'beta',
          denoise: 0.4,
          model: ['12', 0],
          positive: ['5', 0],
          negative: ['6', 0],
          latent_image: ['45', 0],
        },
      };

      // [최종 디코드]
      nodes['15'] = {
        class_type: 'VAEDecode',
        inputs: {
          samples: ['14', 0],
          vae: ['3', 0],
        },
      };

      // [최종 완성본 저장]
      nodes['9'] = {
        class_type: 'SaveImage',
        inputs: {
          filename_prefix: 'openshorts_v2/z_image',
          images: ['15', 0],
        },
      };
    } else {
      // 1단계 초고속 직행 모드 저장
      nodes['9'] = {
        class_type: 'SaveImage',
        inputs: {
          filename_prefix: 'openshorts_v2/z_image',
          images: ['8', 0],
        },
      };
    }

    return nodes;
  }

  /**
   * 4. CheckpointLoaderSimple 워크플로우 (N개 LoRA 무제한 체인)
   */
  private buildCheckpointWorkflow(p: {
    modelMeta: InstalledUnetModel;
    prompt: string;
    seed: number;
    width: number;
    height: number;
    loras: { name: string; strength: number }[];
  }): Record<string, unknown> {
    let lastModelOutput: [string, number] = ['1', 0];
    let lastClipOutput: [string, number] = ['1', 1];

    const nodes: Record<string, unknown> = {
      '1': {
        class_type: 'CheckpointLoaderSimple',
        inputs: {
          ckpt_name: p.modelMeta.fileName,
        },
      },
      '2': {
        class_type: 'EmptyLatentImage',
        inputs: {
          width: p.width,
          height: p.height,
          batch_size: 1,
        },
      },
    };

    // N개 LoRA 순차 직렬 체인 노드 선행 생성
    p.loras.forEach((l, idx) => {
      const nodeKey = `lora_${idx}`;
      nodes[nodeKey] = {
        class_type: 'LoraLoader',
        inputs: {
          model: lastModelOutput,
          clip: lastClipOutput,
          lora_name: l.name,
          strength_model: l.strength,
          strength_clip: l.strength,
        },
      };
      lastModelOutput = [nodeKey, 0];
      lastClipOutput = [nodeKey, 1];
    });

    nodes['3'] = {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: p.prompt,
        clip: lastClipOutput,
      },
    };
    nodes['4'] = {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: 'blurry, low quality, watermark, deformed, bad anatomy',
        clip: lastClipOutput,
      },
    };
    nodes['5'] = {
      class_type: 'KSampler',
      inputs: {
        seed: p.seed,
        steps: p.modelMeta.recommendedSteps,
        cfg: 7.0,
        sampler_name: p.modelMeta.recommendedSampler,
        scheduler: p.modelMeta.recommendedScheduler,
        denoise: 1.0,
        model: lastModelOutput,
        positive: ['3', 0],
        negative: ['4', 0],
        latent_image: ['2', 0],
      },
    };
    nodes['6'] = {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['5', 0],
        vae: ['1', 2],
      },
    };
    nodes['7'] = {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: 'openshorts_v2/checkpoint',
        images: ['6', 0],
      },
    };

    return nodes;
  }

  /**
   * 5. 표준 UNET 워크플로우 (FLUX / SD3.5 계열)
   */
  private buildStandardUNETWorkflow(p: {
    modelMeta: InstalledUnetModel;
    prompt: string;
    seed: number;
    width: number;
    height: number;
    loras: { name: string; strength: number }[];
  }): Record<string, unknown> {
    let lastModelOutput: [string, number] = ['1', 0];

    const nodes: Record<string, unknown> = {
      '1': {
        class_type: 'UNETLoader',
        inputs: {
          unet_name: p.modelMeta.fileName,
          weight_dtype: 'default',
        },
      },
      '2': {
        class_type: 'CLIPLoader',
        inputs: {
          clip_name: 'Huihui-Qwen3-VL-4B-Instruct-abliterated-fp8_scaled.safetensors',
          type: 'qwen_image',
          device: 'default',
        },
      },
      '3': {
        class_type: 'VAELoader',
        inputs: {
          vae_name: 'qwen_image_vae.safetensors',
        },
      },
      '4': {
        class_type: 'EmptySD3LatentImage',
        inputs: {
          width: p.width,
          height: p.height,
          batch_size: 1,
        },
      },
      '5': {
        class_type: 'CLIPTextEncode',
        inputs: {
          text: p.prompt,
          clip: ['2', 0],
        },
      },
    };

    // N개 LoRA 순차 직렬 체인 노드 선행 생성
    p.loras.forEach((l, idx) => {
      const nodeKey = `lora_${idx}`;
      nodes[nodeKey] = {
        class_type: 'LoraLoaderModelOnly',
        inputs: {
          model: lastModelOutput,
          lora_name: l.name,
          strength_model: l.strength,
        },
      };
      lastModelOutput = [nodeKey, 0];
    });

    nodes['6'] = {
      class_type: 'KSampler',
      inputs: {
        seed: p.seed,
        steps: p.modelMeta.recommendedSteps,
        cfg: 1.0,
        sampler_name: p.modelMeta.recommendedSampler,
        scheduler: p.modelMeta.recommendedScheduler,
        denoise: 1.0,
        model: lastModelOutput,
        positive: ['5', 0],
        negative: ['5', 0],
        latent_image: ['4', 0],
      },
    };
    nodes['7'] = {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['6', 0],
        vae: ['3', 0],
      },
    };
    nodes['8'] = {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: 'openshorts_v2/standard_unet',
        images: ['7', 0],
      },
    };

    return nodes;
  }

  /**
   * 6-A. MiniMax H3 T2V (Text-to-Video / 순수 텍스트 기반 배경 및 이펙트 영상 렌더링)
   */
  buildH3T2VVideoWorkflow(params: {
    prompt: string;
    seed: number;
    durationFrames: number;
    clipName?: string;
    aspectRatio?: '9:16' | '16:9' | '1:1';
    resolutionTier?: '0.2MP' | '0.5MP';
    loraName?: string | null;
    loraStrength?: number;
    loras?: { name: string; strength: number }[];
  }): Record<string, unknown> {
    const {
      prompt,
      seed,
      durationFrames,
      clipName = 'qwen3vl_32b_heretic_minimax_h3_nvfp4.safetensors',
      aspectRatio = '9:16',
      resolutionTier = '0.2MP',
    } = params;

    let width = 352;
    let height = 608;

    if (resolutionTier === '0.5MP') {
      if (aspectRatio === '9:16') {
        width = 544;
        height = 960;
      } else if (aspectRatio === '16:9') {
        width = 960;
        height = 544;
      } else {
        width = 768;
        height = 768;
      }
    } else {
      if (aspectRatio === '16:9') {
        width = 608;
        height = 352;
      } else if (aspectRatio === '1:1') {
        width = 448;
        height = 448;
      }
    }

    const validLoras: { name: string; strength: number }[] = [];
    if (params.loras && params.loras.length > 0) {
      params.loras.forEach((l) => {
        if (l.name && l.name !== 'None' && l.name.trim()) {
          validLoras.push({ name: l.name, strength: l.strength ?? 1.0 });
        }
      });
    } else if (params.loraName && params.loraName !== 'None' && params.loraName.trim()) {
      validLoras.push({ name: params.loraName, strength: params.loraStrength ?? 1.0 });
    }

    let lastModelOutput: [string, number] = ['144', 0];

    const nodes: Record<string, unknown> = {
      '119': { inputs: { vae_name: 'minimax_h3_video_vae_fp16.safetensors' }, class_type: 'VAELoader' },
      '120': { inputs: { vae_name: 'minimax_h3_audio_vae_fp32.safetensors' }, class_type: 'VAELoader' },
      '127': {
        inputs: { unet_name: 'MiniMax-H3-fl2va-curve-Q5_1.gguf' },
        class_type: 'UnetLoaderGGUF',
      },
      '128': {
        inputs: { clip_name: clipName, type: 'minimax', device: 'default' },
        class_type: 'CLIPLoader',
      },
      '145': { inputs: { model: ['127', 0] }, class_type: 'MiniMaxH3MemoryEfficientSageAttentionPatch' },
      '144': {
        inputs: {
          model: ['145', 0],
          lora_name: 'minimaxh3\\minimax_h3_turbo_v4_step600_ema.safetensors',
          strength: 1.0,
          low_vram: false,
        },
        class_type: 'MiniMaxH3TurboLoRA',
      },
      '136': {
        inputs: {
          prompt,
          width,
          height,
          length: durationFrames || 107,
          ref_image_size: 'max',
          clip: ['128', 0],
          vae: ['119', 0],
          audio_vae: ['120', 0],
        },
        class_type: 'MiniMaxH3ReferenceToVideo',
      },
      '129': { inputs: { noise_seed: seed }, class_type: 'RandomNoise' },
      '157': { inputs: {}, class_type: 'MiniMaxH3TurboSampler' },
      '125': {
        inputs: {
          noise: ['129', 0],
          guider: ['126', 0],
          sampler: ['157', 0],
          sigmas: ['124', 0],
          latent_image: ['136', 1],
        },
        class_type: 'SamplerCustomAdvanced',
      },
      '122': { inputs: { samples: ['125', 0], vae: ['119', 0] }, class_type: 'VAEDecode' },
      '121': { inputs: { samples: ['125', 0], vae: ['120', 0] }, class_type: 'VAEDecodeAudio' },
      '150': {
        inputs: {
          filename_prefix: 'video/MiniMax_H3_T2V',
          frame_rate: 24,
          loop_count: 0,
          format: 'video/h264-mp4',
          pix_fmt: 'yuv420p',
          crf: 19,
          save_metadata: false,
          trim_to_audio: false,
          pingpong: false,
          save_output: true,
          images: ['122', 0],
          audio: ['121', 0],
        },
        class_type: 'VHS_VideoCombine',
      },
    };

    validLoras.forEach((l, idx) => {
      const nodeKey = `h3_t2v_lora_${idx}`;
      nodes[nodeKey] = {
        class_type: 'MiniMaxH3TurboLoRA',
        inputs: {
          model: lastModelOutput,
          lora_name: l.name,
          strength: l.strength,
          low_vram: false,
        },
      };
      lastModelOutput = [nodeKey, 0];
    });

    nodes['126'] = { inputs: { model: lastModelOutput, conditioning: ['136', 0] }, class_type: 'BasicGuider' };
    nodes['124'] = {
      inputs: { scheduler: 'simple', steps: 4, denoise: 1.0, model: lastModelOutput },
      class_type: 'BasicScheduler',
    };

    return nodes;
  }

  /**
   * 6. MiniMax H3 1단계 0.2MP 고속 초안 비디오 렌더링 워크플로우
   */
  buildH3DraftVideoWorkflow(params: {
    firstFramePath: string;
    prompt: string;
    seed: number;
    durationFrames: number;
    clipName?: string;
    aspectRatio?: '9:16' | '16:9' | '1:1';
    resolutionTier?: '0.2MP' | '0.5MP';
    loraName?: string | null;
    loraStrength?: number;
    loras?: { name: string; strength: number }[];
  }): Record<string, unknown> {
    const {
      firstFramePath,
      prompt,
      seed,
      durationFrames,
      clipName = 'qwen3vl_32b_heretic_minimax_h3_nvfp4.safetensors',
      aspectRatio = '9:16',
      resolutionTier = '0.2MP',
    } = params;

    let width = 352;
    let height = 608;

    if (resolutionTier === '0.5MP') {
      if (aspectRatio === '9:16') {
        width = 544;
        height = 960;
      } else if (aspectRatio === '16:9') {
        width = 960;
        height = 544;
      } else {
        width = 768;
        height = 768;
      }
    } else {
      if (aspectRatio === '16:9') {
        width = 608;
        height = 352;
      } else if (aspectRatio === '1:1') {
        width = 448;
        height = 448;
      }
    }

    const validLoras: { name: string; strength: number }[] = [];
    if (params.loras && params.loras.length > 0) {
      params.loras.forEach((l) => {
        if (l.name && l.name !== 'None' && l.name.trim()) {
          validLoras.push({ name: l.name, strength: l.strength ?? 1.0 });
        }
      });
    } else if (params.loraName && params.loraName !== 'None' && params.loraName.trim()) {
      validLoras.push({ name: params.loraName, strength: params.loraStrength ?? 1.0 });
    }

    let lastModelOutput: [string, number] = ['144', 0];

    const nodes: Record<string, unknown> = {
      '119': { inputs: { vae_name: 'minimax_h3_video_vae_fp16.safetensors' }, class_type: 'VAELoader' },
      '120': { inputs: { vae_name: 'minimax_h3_audio_vae_fp32.safetensors' }, class_type: 'VAELoader' },
      '127': {
        inputs: { unet_name: 'MiniMax-H3-fl2va-curve-Q5_1.gguf' },
        class_type: 'UnetLoaderGGUF',
      },
      '128': {
        inputs: { clip_name: clipName, type: 'minimax', device: 'default' },
        class_type: 'CLIPLoader',
      },
      '145': { inputs: { model: ['127', 0] }, class_type: 'MiniMaxH3MemoryEfficientSageAttentionPatch' },
      '144': {
        inputs: {
          model: ['145', 0],
          lora_name: 'minimaxh3\\minimax_h3_turbo_v4_step600_ema.safetensors',
          strength: 1.0,
          low_vram: false,
        },
        class_type: 'MiniMaxH3TurboLoRA',
      },
      '130': { inputs: { image: firstFramePath }, class_type: 'LoadImage' },
      '136': {
        inputs: {
          prompt,
          width,
          height,
          length: durationFrames || 107,
          ref_image_size: 'max',
          'ref_images.ref_image_0': ['130', 0],
          clip: ['128', 0],
          vae: ['119', 0],
          audio_vae: ['120', 0],
        },
        class_type: 'MiniMaxH3ReferenceToVideo',
      },
      '129': { inputs: { noise_seed: seed }, class_type: 'RandomNoise' },
      '157': { inputs: {}, class_type: 'MiniMaxH3TurboSampler' },
      '125': {
        inputs: {
          noise: ['129', 0],
          guider: ['126', 0],
          sampler: ['157', 0],
          sigmas: ['124', 0],
          latent_image: ['136', 1],
        },
        class_type: 'SamplerCustomAdvanced',
      },
      '122': { inputs: { samples: ['125', 0], vae: ['119', 0] }, class_type: 'VAEDecode' },
      '121': { inputs: { samples: ['125', 0], vae: ['120', 0] }, class_type: 'VAEDecodeAudio' },
      '150': {
        inputs: {
          filename_prefix: 'video/MiniMax_H3_Draft',
          frame_rate: 24,
          loop_count: 0,
          format: 'video/h264-mp4',
          pix_fmt: 'yuv420p',
          crf: 19,
          save_metadata: false,
          trim_to_audio: false,
          pingpong: false,
          save_output: true,
          images: ['122', 0],
          audio: ['121', 0],
        },
        class_type: 'VHS_VideoCombine',
      },
    };

    validLoras.forEach((l, idx) => {
      const nodeKey = `h3_i2v_lora_${idx}`;
      nodes[nodeKey] = {
        class_type: 'MiniMaxH3TurboLoRA',
        inputs: {
          model: lastModelOutput,
          lora_name: l.name,
          strength: l.strength,
          low_vram: false,
        },
      };
      lastModelOutput = [nodeKey, 0];
    });

    nodes['126'] = { inputs: { model: lastModelOutput, conditioning: ['136', 0] }, class_type: 'BasicGuider' };
    nodes['124'] = {
      inputs: { scheduler: 'simple', steps: 4, denoise: 1.0, model: lastModelOutput },
      class_type: 'BasicScheduler',
    };

    return nodes;
  }

  /**
   * 8. 2D I2I (Image-to-Image / 부위 수정 & 참조 보정) 워크플로우 (N개 LoRA 무제한 체인)
   */
  buildDynamic2DI2IWorkflow(params: {
    initImagePath: string;
    denoise: number;
    unetModelId: string;
    prompt: string;
    seed: number;
    width: number;
    height: number;
    loras?: { name: string; strength: number }[];
    loraName?: string | null;
    loraStrength?: number;
  }): { payload: Record<string, unknown>; modelMeta: InstalledUnetModel } {
    const { initImagePath, denoise = 0.65, unetModelId, prompt, seed, width = 768, height = 1344 } = params;
    const modelMeta = INSTALLED_UNET_MODELS.find((m) => m.id === unetModelId) || INSTALLED_UNET_MODELS[0];

    const validLoras: { name: string; strength: number }[] = [];
    if (params.loras && params.loras.length > 0) {
      params.loras.forEach((l) => {
        if (l.name && l.name !== 'None' && l.name.trim()) {
          validLoras.push({ name: l.name, strength: l.strength ?? 0.8 });
        }
      });
    } else if (params.loraName && params.loraName !== 'None' && params.loraName.trim()) {
      validLoras.push({ name: params.loraName, strength: params.loraStrength ?? 0.8 });
    }

    let lastModelOutput: [string, number] = ['1', 0];

    const nodes: Record<string, unknown> = {
      '1': {
        class_type: modelMeta.loaderType === 'UnetLoaderGGUF' ? 'UnetLoaderGGUF' : 'UNETLoader',
        inputs: { unet_name: modelMeta.fileName },
      },
      '2': {
        // ★ I2I 무검열 CLIP — 디스크 실제 파일명 통일 (abliterated fp8)
        class_type: 'CLIPLoader',
        inputs: {
          clip_name: 'Huihui-Qwen3-VL-4B-Instruct-abliterated-fp8_scaled.safetensors',
          type: modelMeta.family === 'krea2' ? 'krea2' : 'qwen_image',
          device: 'default',
        },
      },
      '3': {
        class_type: 'VAELoader',
        inputs: { vae_name: 'qwen_image_vae.safetensors' },
      },
      '4': {
        class_type: 'LoadImage',
        inputs: { image: initImagePath },
      },
      '5': {
        class_type: 'VAEEncode',
        inputs: { pixels: ['4', 0], vae: ['3', 0] },
      },
      '6': {
        class_type: 'CLIPTextEncode',
        inputs: { text: prompt, clip: ['2', 0] },
      },
    };

    // N개 LoRA 순차 직렬 체인 노드 선행 생성
    validLoras.forEach((l, idx) => {
      const nodeKey = `lora_${idx}`;
      nodes[nodeKey] = {
        class_type: 'LoraLoaderModelOnly',
        inputs: {
          model: lastModelOutput,
          lora_name: l.name,
          strength_model: l.strength,
        },
      };
      lastModelOutput = [nodeKey, 0];
    });

    nodes['7'] = {
      class_type: 'ModelSamplingAuraFlow',
      inputs: {
        shift: 3.1,
        model: lastModelOutput,
      },
    };
    nodes['8'] = {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps: modelMeta.recommendedSteps,
        cfg: 1.0,
        sampler_name: modelMeta.recommendedSampler,
        scheduler: modelMeta.recommendedScheduler,
        denoise,
        model: ['7', 0],
        positive: ['6', 0],
        negative: ['6', 0],
        latent_image: ['5', 0],
      },
    };
    nodes['9'] = {
      class_type: 'VAEDecode',
      inputs: { samples: ['8', 0], vae: ['3', 0] },
    };
    nodes['11'] = {
      class_type: 'SaveImage',
      inputs: { filename_prefix: 'openshorts_v2/i2i', images: ['9', 0] },
    };

    return { payload: nodes, modelMeta };
  }

  /**
   * 8-2. Qwen-Image-Edit 단일/멀티 참조 편집
   * 기준: Qwen Image Edit Rapid v1.0 (2)_Fixed.json
   * - CheckpointLoaderSimple: Qwen-Rapid-AIO-NSFW-v23.safetensors
   * - LoRA: Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors (ON 상태)
   * - 샘플러: ClownsharKSampler_Beta (linear/euler, 8steps, scheduler: beta57)
   * - Positive: TextEncodeQwenImageEditPlus (image1 + image2 멀티참조)
   * - Negative: TextEncodeQwenImageEdit (단일이미지, 부정 프롬프트 전용)
   */
  buildQwenCharacterSwapWorkflow(params: {
    targetImagePath: string;    // image1: 배경/포즈 타깃 (필수)
    characterImagePath?: string; // image2: 얼굴/외형 레퍼런스 (선택 — 없으면 단일이미지 편집)
    prompt: string;
    negativePrompt?: string;
    seed: number;
    steps?: number;
    loraName?: string | null;
    loraStrength?: number;
  }): Record<string, unknown> {
    const {
      targetImagePath,
      characterImagePath,
      prompt,
      negativePrompt = 'ugly, blurry, distorted, artifacts, bad, wrong, low quality, anime, digital art, semirealistic, cartoon, manga, drawing, fake, unreal',
      seed,
      steps = 8,
      loraName,
      loraStrength = 1.0,
    } = params;

    // Qwen Edit 전용 정격 LoRA 정규화 (경로 역슬래시 \ 통일 및 비-Qwen LoRA 전달 시 Lightning 8step으로 안전 자동 전환)
    let safeLoraName = loraName ? loraName.replace(/\//g, '\\') : '';
    if (!safeLoraName || !safeLoraName.toLowerCase().includes('qwen')) {
      safeLoraName = 'Qwen\\Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors';
    }

    // 2장 인물 얼굴 교체 시 프롬프트 처리:
    // 사용자가 입력한 프롬프트가 있으면 사용자의 지시를 100% 최우선 그대로 사용하고,
    // 프롬프트가 완전히 비어있을 때만 기본 얼굴 교체 지시어로 작동
    let finalPrompt = (prompt || '').trim();
    if (!finalPrompt) {
      if (characterImagePath) {
        finalPrompt = 'Replace the face, facial features, and hairstyle of the person in the first image with the person from the second image. Keep the body pose, clothing, and background identical.';
      } else {
        finalPrompt = 'Photorealistic portrait, highly detailed, 8k resolution.';
      }
    }

    // Qwen-Rapid-AIO-NSFW-v23는 이미 Lightning 가속과 NSFW가 체크포인트에 자체 병합(Baked-in)된 All-in-One 모델입니다.
    // 따라서 추가 Lightning LoRA를 이중으로 씌우면 과가속(Over-distillation)으로 인해 무지개빛 반점/노이즈가 발생하므로,
    // 다각도/애니/코코아 등 특수 스타일 LoRA가 아닐 때는 순수 Rapid AIO 모델로 직결하여 가장 깨끗한 원본 화질을 보장합니다.
    const isCustomStyleLora = safeLoraName && !safeLoraName.toLowerCase().includes('lightning');

    // Positive TextEncodeQwenImageEditPlus 입력 구성 (이미지 2장이면 멀티, 1장이면 단일)
    const positiveInputs: Record<string, unknown> = {
      prompt: finalPrompt,
      clip: isCustomStyleLora ? ['103', 1] : ['118', 1],
      vae: ['200', 0],
      image1: ['93', 0],
    };
    if (characterImagePath) {
      positiveInputs['image2'] = ['94', 0];
    }

    const nodes: Record<string, unknown> = {
      // ─── 모델 로더 (Qwen Rapid AIO NSFW v23) ───
      '118': {
        class_type: 'CheckpointLoaderSimple',
        inputs: { ckpt_name: 'Qwen-Rapid-AIO-NSFW-v23.safetensors' },
      },
      // ─── 샘플링 조정 (AuraFlow shift 3.0) ───
      '66': {
        class_type: 'ModelSamplingAuraFlow',
        inputs: {
          shift: 3.0,
          model: isCustomStyleLora ? ['103', 0] : ['118', 0],
        },
      },
      '75': {
        class_type: 'CFGNorm',
        inputs: { strength: 1.0, pre_cfg: false, model: ['66', 0] },
      },
      // ─── VAE ───
      '200': {
        class_type: 'VAELoader',
        inputs: { vae_name: 'qwen_image_vae.safetensors' },
      },
      // ─── 타깃 이미지 로드 & 스케일 ───
      '78': { class_type: 'LoadImage', inputs: { image: targetImagePath } },
      '93': {
        class_type: 'ImageScaleToTotalPixels',
        inputs: { upscale_method: 'lanczos', megapixels: 1, resolution_steps: 1, image: ['78', 0] },
      },
      // ─── VAE 인코드 (타깃 이미지 → latent) ───
      '88': {
        class_type: 'VAEEncode',
        inputs: { pixels: ['93', 0], vae: ['200', 0] },
      },
      // ─── Positive 인코더 (TextEncodeQwenImageEditPlus) ───
      '119': {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: positiveInputs,
      },
      // ─── Negative 인코더 (TextEncodeQwenImageEdit — 단일이미지 부정 전용) ───
      '77': {
        class_type: 'TextEncodeQwenImageEdit',
        inputs: {
          prompt: negativePrompt,
          clip: isCustomStyleLora ? ['103', 1] : ['118', 1],
          vae: ['200', 0],
          image: ['93', 0],
        },
      },
      // ─── 샘플러: Qwen Rapid AIO 골든 정격 (euler_ancestral / beta 4~6step) ───
      '121': {
        class_type: 'KSampler',
        inputs: {
          seed,
          steps: steps <= 4 ? 4 : steps,
          cfg: 1.0,
          sampler_name: 'euler_ancestral',
          scheduler: 'beta',
          denoise: 1.0,
          model: ['75', 0],
          positive: ['119', 0],
          negative: ['77', 0],
          latent_image: ['88', 0],
        },
      },
      // ─── VAE 디코드 & 저장 ───
      '8': {
        class_type: 'VAEDecode',
        inputs: { samples: ['121', 0], vae: ['200', 0] },
      },
      '102': {
        class_type: 'SaveImage',
        inputs: { filename_prefix: 'openshorts_v2/qwen_edit', images: ['8', 0] },
      },
    };

    // 특수 스타일 LoRA가 활성화된 경우만 LoraLoader 노드 추가
    if (isCustomStyleLora) {
      nodes['103'] = {
        class_type: 'LoraLoader',
        inputs: {
          model: ['118', 0],
          clip: ['118', 1],
          lora_name: safeLoraName,
          strength_model: loraStrength,
          strength_clip: 1.0,
        },
      };
    }

    // 캐릭터 참조 이미지가 있는 경우 추가 노드 삽입
    if (characterImagePath) {
      nodes['79'] = { class_type: 'LoadImage', inputs: { image: characterImagePath } };
      nodes['94'] = {
        class_type: 'ImageScaleToTotalPixels',
        inputs: { upscale_method: 'lanczos', megapixels: 1, resolution_steps: 1, image: ['79', 0] },
      };
    }

    return nodes;
  }

  /**
   * 8-3. Qwen 2511 다각도 뷰 생성 (Multiple-Angles / 인물 앵글 변환)
   * 기준: Qwen2511Multiple-Angles.json & Qwen-Rapid-AIO-NSFW-v23.safetensors
   * - Checkpoint: Qwen-Rapid-AIO-NSFW-v23.safetensors
   * - LoRA 1 (Lightning 8step): Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors
   * - LoRA 2 (Angles): qwen-image-edit-2511-multiple-angles-lora.safetensors
   * - 샘플러: KSampler (euler, simple, 8steps, EmptySD3LatentImage 1024×1536)
   */
  buildQwenMultipleAnglesWorkflow(params: {
    sourceImagePath: string;  // 원본 인물 이미지
    prompt: string;           // 베이스 프롬프트 (각도 태그 자동 추가)
    angleTag?: string;        // 카메라 각도 태그 예: '<sks> front view eye-level shot close-up'
    seed?: number;
    width?: number;
    height?: number;
    anglesLoraStrength?: number;
  }): Record<string, unknown> {
    const {
      sourceImagePath,
      prompt,
      angleTag = '<sks> front view eye-level shot medium shot',
      seed = Math.floor(Math.random() * 1e9),
      width = 1024,
      height = 1536,
      anglesLoraStrength = 1.0,
    } = params;

    const fullPrompt = angleTag ? `${prompt}, ${angleTag}` : prompt;

    return {
      // ─── 베이스 체크포인트 모델 ───
      '118': {
        class_type: 'CheckpointLoaderSimple',
        inputs: { ckpt_name: 'Qwen-Rapid-AIO-NSFW-v23.safetensors' },
      },
      // ─── LoRA 1: Lightning 8steps (가속) ───
      '162': {
        class_type: 'LoraLoader',
        inputs: {
          model: ['118', 0],
          clip: ['118', 1],
          lora_name: 'Qwen\\Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors',
          strength_model: 1.0,
          strength_clip: 1.0,
        },
      },
      // ─── LoRA 2: Multiple-Angles (각도 생성) ───
      '161': {
        class_type: 'LoraLoaderModelOnly',
        inputs: {
          model: ['162', 0],
          lora_name: 'Qwen\\Qwen-image-edit-2511-multiple-angles-lora.safetensors',
          strength_model: anglesLoraStrength,
        },
      },
      // ─── 샘플링 패치 ───
      '164': {
        class_type: 'ModelSamplingAuraFlow',
        inputs: { shift: 3.1, model: ['161', 0] },
      },
      '175': {
        class_type: 'CFGNorm',
        inputs: { strength: 1, model: ['164', 0] },
      },
      // ─── 소스 이미지 로드 & 리사이즈 ───
      '158': { class_type: 'LoadImage', inputs: { image: sourceImagePath } },
      '159': {
        class_type: 'ImageScaleToTotalPixels',
        inputs: { upscale_method: 'lanczos', megapixels: 1, resolution_steps: 1, image: ['158', 0] },
      },
      // ─── Positive (멀티참조, image1 = 소스) ───
      '68': {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: {
          prompt: fullPrompt,
          clip: ['162', 1],
          vae: ['118', 2],
          image1: ['159', 0],
        },
      },
      // ─── FluxKontext 레퍼런스 래핑 ───
      '70': {
        class_type: 'FluxKontextMultiReferenceLatentMethod',
        inputs: { conditioning: ['68', 0], reference_latents_method: 'index_timestep_zero' },
      },
      // ─── Negative ───
      '69': {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: {
          prompt: '泛黄，AI感，不真实，丑陋，油腻的皮肤，异常的肢体，不协调的肢体, blurry, low quality',
          clip: ['162', 1],
          vae: ['118', 2],
          image1: ['159', 0],
        },
      },
      '71': {
        class_type: 'FluxKontextMultiReferenceLatentMethod',
        inputs: { conditioning: ['69', 0], reference_latents_method: 'index_timestep_zero' },
      },
      // ─── Latent ───
      '66': {
        class_type: 'EmptySD3LatentImage',
        inputs: { width, height, batch_size: 1 },
      },
      // ─── KSampler (8steps, euler/simple) ───
      '165': {
        class_type: 'KSampler',
        inputs: {
          seed,
          steps: 8,
          cfg: 1,
          sampler_name: 'euler',
          scheduler: 'simple',
          denoise: 1,
          model: ['175', 0],
          positive: ['70', 0],
          negative: ['71', 0],
          latent_image: ['66', 0],
        },
      },
      // ─── VAE 디코드 & 저장 ───
      '156': {
        class_type: 'VAEDecode',
        inputs: { samples: ['165', 0], vae: ['118', 2] },
      },
      '217': {
        class_type: 'SaveImage',
        inputs: { filename_prefix: 'openshorts_v2/qwen_angles', images: ['156', 0] },
      },
    };
  }

  /**
   * 8-4. H3 다중참조(REF2VA) 전용 4면 전신 턴어라운드 시트 생성
   * 1장의 16:9 와이드 이미지에 [전신 정면 | 좌측면 | 우측면 | 후면] 4개 전신 뷰를 나란히 생성하여
   * H3 비디오의 REF2VA <Subject 2: 인물 얼굴/전신> 슬롯에 최적화된 360도 공간 레퍼런스를 제공
   */
  buildQwenH3TurnaroundSheetWorkflow(params: {
    sourceImagePath: string;
    prompt?: string;
    seed?: number;
  }): Record<string, unknown> {
    const {
      sourceImagePath,
      prompt = 'clean photography, highly detailed, realistic skin texture, identical clothing, full body standing pose',
      seed = Math.floor(Math.random() * 1e9),
    } = params;

    const turnaroundPrompt = prompt || 'clean photography, highly detailed, realistic skin texture, identical clothing, full body standing pose';

    // 4개 전신 뷰(정면, 좌측면, 우측면, 후면)를 각각 깨끗하게 렌더링한 후 ImageConcatMulti로 병합하여 노이즈 없는 16:9 와이드 시트 생성
    return this.buildQwenOneClickMultiViewWorkflow({
      sourceImagePath,
      seed,
      customPrompt: turnaroundPrompt,
      width: 448,
      height: 768,
    });
  }

  /**
   * 8-5. Qwen 2511 일괄 다중 뷰 (人物一键多视图 - 전후좌우 4뷰 동시 생성)
   * 1장의 참조 이미지로부터 정면, 좌측면, 우측면, 후면 4개의 뷰를 렌더링하고 가로로 병합하여 노이즈 없는 1장 시트로 출력.
   */
  buildQwenOneClickMultiViewWorkflow(params: {
    sourceImagePath: string;
    seed?: number;
    customPrompt?: string;
    width?: number; // 뷰당 너비 (기본 448)
    height?: number; // 뷰당 높이 (기본 768)
  }): Record<string, unknown> {
    const {
      sourceImagePath,
      seed = Math.floor(Math.random() * 1e9),
      customPrompt,
      width = 448,
      height = 768,
    } = params;

    const nodes: Record<string, any> = {
      // ─── 베이스 체크포인트 (Qwen Rapid AIO NSFW v2.3) ───
      '118': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'Qwen-Rapid-AIO-NSFW-v23.safetensors' } },
      // ─── LoRA 1: Multiple-Angles LoRA (각도 제어) ───
      '161': { class_type: 'LoraLoaderModelOnly', inputs: { model: ['118', 0], lora_name: 'Qwen\\Qwen-image-edit-2511-multiple-angles-lora.safetensors', strength_model: 0.9 } },
      // ─── 샘플링 패치 (AuraFlow shift: 3.0) ───
      '164': { class_type: 'ModelSamplingAuraFlow', inputs: { shift: 3.0, model: ['161', 0] } },
      '175': { class_type: 'CFGNorm', inputs: { strength: 1.0, model: ['164', 0] } },
      // ─── 소스 이미지 로드 & 리사이즈 ───
      '158': { class_type: 'LoadImage', inputs: { image: sourceImagePath } },
      '159': { class_type: 'ImageScaleToTotalPixels', inputs: { upscale_method: 'lanczos', megapixels: 1, resolution_steps: 1, image: ['158', 0] } },
      '66': { class_type: 'EmptySD3LatentImage', inputs: { width, height, batch_size: 1 } },
      // ─── 네거티브 공통 ───
      '69': { class_type: 'TextEncodeQwenImageEditPlus', inputs: { prompt: '泛黄，AI感，不真实，丑陋，油腻的皮肤，异常的肢体，不协调的肢体, blurry, low quality, artifacts, chromatic aberration, noise', clip: ['118', 1], vae: ['118', 2], image1: ['159', 0] } },
      '71': { class_type: 'FluxKontextMultiReferenceLatentMethod', inputs: { conditioning: ['69', 0], reference_latents_method: 'index_timestep_zero' } },
    };

    // 4가지 앵글 프리셋
    const angles = [
      { id: 'front', tag: '<sks> front view eye-level shot full body standing pose', desc: '白色背景。生成角色全身的正视图，保持面部和服装完全一致。' },
      { id: 'left', tag: '<sks> left side view eye-level shot full body standing pose', desc: '白色背景。生成角色全身的左侧视图，保持面部和服装完全一致。' },
      { id: 'right', tag: '<sks> right side view eye-level shot full body standing pose', desc: '白色背景。生成角色全身的右侧视图，保持面部和服装完全一致。' },
      { id: 'back', tag: '<sks> back view eye-level shot full body standing pose', desc: '白色背景。生成角色全身的后视图，保持面部和服装完全一致。' },
    ];

    const imageOutputs: string[] = [];

    angles.forEach((angle, idx) => {
      const pNodeId = `pos_txt_${idx}`;
      const kNodeId = `pos_ktx_${idx}`;
      const sNodeId = `sampler_${idx}`;
      const vNodeId = `vae_${idx}`;

      const promptText = customPrompt
        ? `${angle.tag}, solid white background, ${customPrompt}`
        : `${angle.tag}, ${angle.desc}, solid white background, highly detailed`;

      // Positive Text Encode
      nodes[pNodeId] = {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: { prompt: promptText, clip: ['118', 1], vae: ['118', 2], image1: ['159', 0] },
      };
      // Kontext Wrap
      nodes[kNodeId] = {
        class_type: 'FluxKontextMultiReferenceLatentMethod',
        inputs: { conditioning: [`${pNodeId}`, 0], reference_latents_method: 'index_timestep_zero' },
      };
      // KSampler (Rapid 6 steps, euler/simple)
      nodes[sNodeId] = {
        class_type: 'KSampler',
        inputs: {
          seed: seed + idx * 7,
          steps: 6,
          cfg: 1.0,
          sampler_name: 'euler',
          scheduler: 'simple',
          denoise: 1.0,
          model: ['175', 0],
          positive: [`${kNodeId}`, 0],
          negative: ['71', 0],
          latent_image: ['66', 0],
        },
      };
      // VAE Decode
      nodes[vNodeId] = {
        class_type: 'VAEDecode',
        inputs: { samples: [`${sNodeId}`, 0], vae: ['118', 2] },
      };

      imageOutputs.push(vNodeId);
    });

    // ─── 4개 뷰 가로 병합 (ImageConcatMulti) ───
    nodes['concat_final'] = {
      class_type: 'ImageConcatMulti',
      inputs: {
        image_1: [imageOutputs[0], 0],
        image_2: [imageOutputs[1], 0],
        image_3: [imageOutputs[2], 0],
        image_4: [imageOutputs[3], 0],
        inputcount: 4,
        direction: 'right', // 4면을 가로로 정렬
        match_image_size: true,
      },
    };

    nodes['save_final'] = {
      class_type: 'SaveImage',
      inputs: { filename_prefix: 'openshorts_v2/qwen_4view', images: ['concat_final', 0] },
    };

    return nodes;
  }
  /**
   * 9. MiniMax H3 FL2V (First-Last Frame to Video / 2장 키프레임 보간 비디오)
   */
  buildH3FL2VVideoWorkflow(params: {
    firstFramePath: string;
    lastFramePath: string;
    prompt: string;
    seed: number;
    durationFrames: number;
    clipName?: string;
    aspectRatio?: '9:16' | '16:9' | '1:1';
    resolutionTier?: '0.2MP' | '0.5MP';
    loraName?: string | null;
    loraStrength?: number;
    loras?: { name: string; strength: number }[];
  }): Record<string, unknown> {
    const {
      firstFramePath,
      lastFramePath,
      prompt,
      seed,
      durationFrames,
      clipName = 'qwen3vl_32b_heretic_minimax_h3_nvfp4.safetensors',
      aspectRatio = '9:16',
      resolutionTier = '0.2MP',
    } = params;

    let width = 352;
    let height = 608;

    if (resolutionTier === '0.5MP') {
      if (aspectRatio === '9:16') {
        width = 544;
        height = 960;
      } else if (aspectRatio === '16:9') {
        width = 960;
        height = 544;
      } else {
        width = 768;
        height = 768;
      }
    } else {
      if (aspectRatio === '16:9') {
        width = 608;
        height = 352;
      } else if (aspectRatio === '1:1') {
        width = 448;
        height = 448;
      }
    }

    const validLoras: { name: string; strength: number }[] = [];
    if (params.loras && params.loras.length > 0) {
      params.loras.forEach((l) => {
        if (l.name && l.name !== 'None' && l.name.trim()) {
          validLoras.push({ name: l.name, strength: l.strength ?? 1.0 });
        }
      });
    } else if (params.loraName && params.loraName !== 'None' && params.loraName.trim()) {
      validLoras.push({ name: params.loraName, strength: params.loraStrength ?? 1.0 });
    }

    let lastModelOutput: [string, number] = ['144', 0];

    const nodes: Record<string, unknown> = {
      '119': { inputs: { vae_name: 'minimax_h3_video_vae_fp16.safetensors' }, class_type: 'VAELoader' },
      '120': { inputs: { vae_name: 'minimax_h3_audio_vae_fp32.safetensors' }, class_type: 'VAELoader' },
      '127': {
        inputs: { unet_name: 'MiniMax-H3-fl2va-curve-Q5_1.gguf' },
        class_type: 'UnetLoaderGGUF',
      },
      '128': {
        inputs: { clip_name: clipName, type: 'minimax', device: 'default' },
        class_type: 'CLIPLoader',
      },
      '145': { inputs: { model: ['127', 0] }, class_type: 'MiniMaxH3MemoryEfficientSageAttentionPatch' },
      '144': {
        inputs: {
          model: ['145', 0],
          lora_name: 'minimaxh3\\minimax_h3_turbo_v4_step600_ema.safetensors',
          strength: 1.0,
          low_vram: false,
        },
        class_type: 'MiniMaxH3TurboLoRA',
      },
      '130': { inputs: { image: firstFramePath }, class_type: 'LoadImage' },
      '131': { inputs: { image: lastFramePath }, class_type: 'LoadImage' },
      '136': {
        inputs: {
          prompt,
          width,
          height,
          length: durationFrames || 107,
          ref_image_size: 'max',
          'ref_images.ref_image_0': ['130', 0],
          'ref_images.ref_image_1': ['131', 0],
          clip: ['128', 0],
          vae: ['119', 0],
          audio_vae: ['120', 0],
        },
        class_type: 'MiniMaxH3ReferenceToVideo',
      },
      '129': { inputs: { noise_seed: seed }, class_type: 'RandomNoise' },
      '157': { inputs: {}, class_type: 'MiniMaxH3TurboSampler' },
      '125': {
        inputs: {
          noise: ['129', 0],
          guider: ['126', 0],
          sampler: ['157', 0],
          sigmas: ['124', 0],
          latent_image: ['136', 1],
        },
        class_type: 'SamplerCustomAdvanced',
      },
      '122': { inputs: { samples: ['125', 0], vae: ['119', 0] }, class_type: 'VAEDecode' },
      '121': { inputs: { samples: ['125', 0], vae: ['120', 0] }, class_type: 'VAEDecodeAudio' },
      '150': {
        inputs: {
          filename_prefix: 'video/MiniMax_H3_FL2V',
          frame_rate: 24,
          loop_count: 0,
          format: 'video/h264-mp4',
          pix_fmt: 'yuv420p',
          crf: 19,
          save_metadata: false,
          trim_to_audio: false,
          pingpong: false,
          save_output: true,
          images: ['122', 0],
          audio: ['121', 0],
        },
        class_type: 'VHS_VideoCombine',
      },
    };

    validLoras.forEach((l, idx) => {
      const nodeKey = `h3_fl2v_lora_${idx}`;
      nodes[nodeKey] = {
        class_type: 'MiniMaxH3TurboLoRA',
        inputs: {
          model: lastModelOutput,
          lora_name: l.name,
          strength: l.strength,
          low_vram: false,
        },
      };
      lastModelOutput = [nodeKey, 0];
    });

    nodes['126'] = { inputs: { model: lastModelOutput, conditioning: ['136', 0] }, class_type: 'BasicGuider' };
    nodes['124'] = {
      inputs: { scheduler: 'simple', steps: 4, denoise: 1.0, model: lastModelOutput },
      class_type: 'BasicScheduler',
    };

    return nodes;
  }

  /**
   * 10. MiniMax H3 REF2VA (멀티모달 다중 참조 에셋 비디오 렌더링)
   */
  buildH3Ref2vaVideoWorkflow(params: {
    refImages: string[];
    prompt: string;
    seed: number;
    durationFrames: number;
    clipName?: string;
    aspectRatio?: '9:16' | '16:9' | '1:1';
    resolutionTier?: '0.2MP' | '0.5MP';
    loraName?: string | null;
    loraStrength?: number;
    loras?: { name: string; strength: number }[];
  }): Record<string, unknown> {
    const {
      refImages,
      prompt,
      seed,
      durationFrames,
      clipName = 'qwen3vl_32b_heretic_minimax_h3_nvfp4.safetensors',
      aspectRatio = '9:16',
      resolutionTier = '0.2MP',
    } = params;

    let width = 352;
    let height = 608;

    if (resolutionTier === '0.5MP') {
      if (aspectRatio === '9:16') {
        width = 544;
        height = 960;
      } else if (aspectRatio === '16:9') {
        width = 960;
        height = 544;
      } else {
        width = 768;
        height = 768;
      }
    } else {
      if (aspectRatio === '16:9') {
        width = 608;
        height = 352;
      } else if (aspectRatio === '1:1') {
        width = 448;
        height = 448;
      }
    }

    const validLoras: { name: string; strength: number }[] = [];
    if (params.loras && params.loras.length > 0) {
      params.loras.forEach((l) => {
        if (l.name && l.name !== 'None' && l.name.trim()) {
          validLoras.push({ name: l.name, strength: l.strength ?? 1.0 });
        }
      });
    } else if (params.loraName && params.loraName !== 'None' && params.loraName.trim()) {
      validLoras.push({ name: params.loraName, strength: params.loraStrength ?? 1.0 });
    }

    let lastModelOutput: [string, number] = ['144', 0];

    const nodes: Record<string, unknown> = {
      '119': { inputs: { vae_name: 'minimax_h3_video_vae_fp16.safetensors' }, class_type: 'VAELoader' },
      '120': { inputs: { vae_name: 'minimax_h3_audio_vae_fp32.safetensors' }, class_type: 'VAELoader' },
      '127': {
        // ★ REF2VA 전용 최신 curve Q5_1 GGUF 가중치
        inputs: { unet_name: 'MiniMax-H3-ref2va-curve-Q5_1.gguf' },
        class_type: 'UnetLoaderGGUF',
      },
      '128': {
        inputs: { clip_name: clipName, type: 'minimax', device: 'default' },
        class_type: 'CLIPLoader',
      },
      '145': { inputs: { model: ['127', 0] }, class_type: 'MiniMaxH3MemoryEfficientSageAttentionPatch' },
      '144': {
        inputs: {
          model: ['145', 0],
          lora_name: 'minimaxh3\\minimax_h3_turbo_v4_step600_ema.safetensors',
          strength: 1.0,
          low_vram: false,
        },
        class_type: 'MiniMaxH3TurboLoRA',
      },
      '129': { inputs: { noise_seed: seed }, class_type: 'RandomNoise' },
      '157': { inputs: {}, class_type: 'MiniMaxH3TurboSampler' },
      '122': { inputs: { samples: ['125', 0], vae: ['119', 0] }, class_type: 'VAEDecode' },
      '121': { inputs: { samples: ['125', 0], vae: ['120', 0] }, class_type: 'VAEDecodeAudio' },
      '150': {
        inputs: {
          filename_prefix: 'video/MiniMax_H3_REF2VA',
          frame_rate: 24,
          loop_count: 0,
          format: 'video/h264-mp4',
          pix_fmt: 'yuv420p',
          crf: 19,
          save_metadata: false,
          trim_to_audio: false,
          pingpong: false,
          save_output: true,
          images: ['122', 0],
          audio: ['121', 0],
        },
        class_type: 'VHS_VideoCombine',
      },
    };

    const refImageInputs: Record<string, unknown> = {
      prompt,
      width,
      height,
      length: durationFrames || 107,
      ref_image_size: 'max',
      clip: ['128', 0],
      vae: ['119', 0],
      audio_vae: ['120', 0],
    };

    refImages.slice(0, 9).forEach((imgPath, idx) => {
      const loadNodeId = String(300 + idx);
      nodes[loadNodeId] = {
        class_type: 'LoadImage',
        inputs: { image: imgPath },
      };
      refImageInputs[`ref_images.ref_image_${idx}`] = [loadNodeId, 0];
    });

    nodes['136'] = {
      class_type: 'MiniMaxH3ReferenceToVideo',
      inputs: refImageInputs,
    };

    validLoras.forEach((l, idx) => {
      const nodeKey = `h3_ref2va_lora_${idx}`;
      nodes[nodeKey] = {
        class_type: 'MiniMaxH3TurboLoRA',
        inputs: {
          model: lastModelOutput,
          lora_name: l.name,
          strength: l.strength,
          low_vram: false,
        },
      };
      lastModelOutput = [nodeKey, 0];
    });

    nodes['126'] = {
      class_type: 'BasicGuider',
      inputs: { model: lastModelOutput, conditioning: ['136', 0] },
    };

    nodes['124'] = {
      inputs: { scheduler: 'simple', steps: 4, denoise: 1.0, model: lastModelOutput },
      class_type: 'BasicScheduler',
    };

    nodes['125'] = {
      class_type: 'SamplerCustomAdvanced',
      inputs: {
        noise: ['129', 0],
        guider: ['126', 0],
        sampler: ['157', 0],
        sigmas: ['124', 0],
        latent_image: ['136', 1],
      },
    };

    return nodes;
  }

  /**
   * 11. MiniMax H3 2단계 0.5MP 업스케일러 + RIFE 60fps 보간 워크플로우
   */
  buildH3UpscaleVideoWorkflow(params: {
    draftVideoPath: string;
    aspectRatio?: '9:16' | '16:9' | '1:1';
  }): Record<string, unknown> {
    const { draftVideoPath, aspectRatio = '9:16' } = params;

    // H3 공식 0.5MP 네이티브 표준 해상도
    let customWidth = 544;
    let customHeight = 960;
    if (aspectRatio === '16:9') {
      customWidth = 960;
      customHeight = 544;
    } else if (aspectRatio === '1:1') {
      customWidth = 768;
      customHeight = 768;
    } else {
      customWidth = 544;
      customHeight = 960;
    }

    // 웹 URL(/view?filename=...)이 넘어오더라도 ComfyUI 로컬 디스크 절대경로로 자동 정규화
    let resolvedVideoPath = draftVideoPath;
    if (draftVideoPath.includes('filename=')) {
      try {
        const urlObj = new URL(draftVideoPath, 'http://127.0.0.1:8288');
        const filename = decodeURIComponent(urlObj.searchParams.get('filename') || '');
        const subfolder = decodeURIComponent(urlObj.searchParams.get('subfolder') || '');
        if (filename) {
          resolvedVideoPath = `C:/ComfyUI/output/${subfolder ? subfolder + '/' : ''}${filename}`.replace(/\\/g, '/');
        }
      } catch (_) {
        const fMatch = draftVideoPath.match(/filename=([^&]+)/);
        const sMatch = draftVideoPath.match(/subfolder=([^&]+)/);
        if (fMatch) {
          const fn = decodeURIComponent(fMatch[1]);
          const sub = sMatch ? decodeURIComponent(sMatch[1]) : '';
          resolvedVideoPath = `C:/ComfyUI/output/${sub ? sub + '/' : ''}${fn}`.replace(/\\/g, '/');
        }
      }
    }

    return {
      '201': {
        inputs: {
          video: resolvedVideoPath,
          force_rate: 0,
          force_size: 'Custom',
          custom_width: customWidth,
          custom_height: customHeight,
          frame_load_cap: 0,
          skip_first_frames: 0,
          select_every_nth: 1,
        },
        class_type: 'VHS_LoadVideoPath',
      },
      '202': {
        inputs: {
          images: ['201', 0],
          source_fps: 24.0,
          target_fps: 60.0,
          scale: 1.0,
          model_name: 'flownet.pkl',
          batch_size: 8,
          use_fp16: true,
        },
        class_type: 'RIFEInterpolation',
      },
      '203': {
        inputs: {
          filename_prefix: 'video/MiniMax_H3_Master_60fps',
          frame_rate: 60,
          loop_count: 0,
          format: 'video/h264-mp4',
          pix_fmt: 'yuv420p',
          crf: 17,
          save_metadata: false,
          trim_to_audio: false,
          pingpong: false,
          save_output: true,
          images: ['202', 0],
          audio: ['201', 2],
        },
        class_type: 'VHS_VideoCombine',
      },
    };
  }

  /**
   * Qwen Image Edit Rapid (의상제거 / 배경제거 / 인물스왑)
   * 기반 JSON: Qwen Image Edit Rapid v1.0 (2)_Fixed.json
   */
  buildQwenRapidEditWorkflow(p: {
    targetImagePath: string;
    swapImagePath?: string;
    prompt: string;
    seed: number;
    denoise?: number;
    cfg?: number;
    loras?: { name: string; strength: number }[];
  }): Record<string, unknown> {
    const nodes: Record<string, unknown> = {
      '1': {
        class_type: 'LoadImage',
        inputs: { image: p.targetImagePath },
      },
      '93': {
        class_type: 'ImageScaleToTotalPixels',
        inputs: {
          upscale_method: 'lanczos',
          megapixels: 1,
          resolution_steps: 1,
          image: ['1', 0],
        },
      },
      '200': {
        class_type: 'VAELoader',
        inputs: { vae_name: 'qwen_image_vae.safetensors' },
      },
      '2': {
        class_type: 'CheckpointLoaderSimple',
        inputs: { ckpt_name: 'Qwen-Rapid-AIO-NSFW-v23.safetensors' },
      },
      '66': {
        class_type: 'ModelSamplingAuraFlow',
        inputs: {
          shift: 3.0,
          model: ['2', 0],
        },
      },
      '75': {
        class_type: 'CFGNorm',
        inputs: {
          strength: 1.0,
          pre_cfg: false,
          model: ['66', 0],
        },
      },
      '4': {
        class_type: 'TextEncodeQwenImageEdit',
        inputs: {
          prompt: 'ugly, blurry, distorted, artifacts, bad, wrong, low quality, anime, digital art, semirealistic, cartoon, manga, drawing, fake, unreal',
          clip: ['2', 1],
          vae: ['200', 0],
          image: ['93', 0],
        },
      },
      '6': {
        class_type: 'VAEEncode',
        inputs: {
          pixels: ['93', 0],
          vae: ['200', 0],
        },
      },
      '5': {
        class_type: 'ClownsharKSampler_Beta',
        inputs: {
          eta: 0,
          sampler_name: 'linear/euler',
          scheduler: 'simple',
          steps: 8,
          steps_to_run: -1,
          denoise: 1.0, // Qwen-Image-Edit 정석: 비전 컨디셔닝이 인코더에 물려있으므로 Denoise 1.0 필수!
          cfg: 1.0,
          seed: p.seed,
          sampler_mode: 'standard',
          bongmath: false,
          model: ['75', 0],
          positive: ['3', 0],
          negative: ['4', 0],
          latent_image: ['6', 0],
        },
      },
      '7': {
        class_type: 'VAEDecode',
        inputs: {
          samples: ['5', 0],
          vae: ['200', 0],
        },
      },
      '8': {
        class_type: 'SaveImage',
        inputs: {
          filename_prefix: 'openshorts_v2/qwen_edit',
          images: ['7', 0],
        },
      },
    };

    let finalPrompt = (p.prompt || '').trim();
    if (!finalPrompt) {
      finalPrompt = 'Clean and refine this image, masterpiece, highly detailed, realistic texture, keep everything else unchanged';
    } else if (!finalPrompt.toLowerCase().includes('unchanged') && !finalPrompt.toLowerCase().includes('preserve')) {
      finalPrompt += ', keep everything else unchanged';
    }

    const hasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(finalPrompt);
    if (hasKorean) {
      // 한글 입력 감지 시 Qwen3-VL 8B Heretic 모델을 자동 경유하여 영문 시각 프롬프트로 실시간 변환 후 인코딩!
      nodes['90'] = {
        class_type: 'AILab_QwenVL',
        inputs: {
          model_name: 'Qwen3-VL-8B-Heretic-Stable',
          quantization: '8-bit (Balanced)',
          attention_mode: 'auto',
          preset_prompt: '🌟 Detailed Description',
          custom_prompt: `Based on the reference image, translate and rewrite this Korean user instruction into a concise, professional English visual prompt for Qwen Image Edit: "${finalPrompt}". Always end your output with ", keep everything else unchanged". Return ONLY the English prompt text without quotes or explanations.`,
          max_tokens: 256,
          keep_model_loaded: true,
          seed: p.seed,
          image: ['93', 0],
        },
      };
      nodes['3'] = {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: {
          prompt: ['90', 0],
          clip: ['2', 1],
          vae: ['200', 0],
          image1: ['93', 0],
        },
      };
    } else {
      nodes['3'] = {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: {
          prompt: finalPrompt,
          clip: ['2', 1],
          vae: ['200', 0],
          image1: ['93', 0],
        },
      };
    }

    if (p.swapImagePath) {
      nodes['10'] = {
        class_type: 'LoadImage',
        inputs: { image: p.swapImagePath },
      };
      const node3Inputs = nodes['3'] as Record<string, any>;
      if (node3Inputs && node3Inputs.inputs) {
        node3Inputs.inputs.image2 = ['10', 0];
      }
    }

    return nodes;
  }

  /**
   * Qwen Multiple Angles (지정 각도 변환)
   * 기반 JSON: Qwen2511Multiple-Angles.json
   */
  buildQwenMultiAngleWorkflow(p: {
    targetImagePath: string;
    anglePrompt: string;
    seed: number;
    steps?: number;
    cfg?: number;
  }): Record<string, unknown> {
    return {
      '1': {
        class_type: 'LoadImage',
        inputs: { image: p.targetImagePath },
      },
      '2': {
        class_type: 'CheckpointLoaderSimple',
        inputs: { ckpt_name: 'Qwen-Rapid-AIO-NSFW-v23.safetensors' },
      },
      '3': {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: {
          prompt: `<sks> ${p.anglePrompt || 'front view eye-level shot medium shot'}`,
          clip: ['2', 1],
          image1: ['1', 0],
        },
      },
      '4': {
        class_type: 'TextEncodeQwenImageEdit',
        inputs: {
          prompt: 'ugly, blurry, distorted, artifacts, bad, wrong, low quality, anime, cartoon',
          clip: ['2', 1],
        },
      },
      '5': {
        class_type: 'KSampler',
        inputs: {
          seed: p.seed,
          steps: p.steps ?? 8,
          cfg: p.cfg ?? 1.0,
          sampler_name: 'euler',
          scheduler: 'simple',
          denoise: 1.0,
          model: ['2', 0],
          positive: ['3', 0],
          negative: ['4', 0],
          latent_image: ['6', 0],
        },
      },
      '6': {
        class_type: 'VAEEncode',
        inputs: { pixels: ['1', 0], vae: ['2', 2] },
      },
      '7': {
        class_type: 'VAEDecode',
        inputs: { samples: ['5', 0], vae: ['2', 2] },
      },
      '8': {
        class_type: 'SaveImage',
        inputs: {
          filename_prefix: 'openshorts_v2/qwen_angle',
          images: ['7', 0],
        },
      },
    };
  }

  /**
   * Qwen H3 원클릭 전신 다중 뷰 (4면 턴어라운드)
   * 기반 JSON: 人物一键多视图工作流 Qwen_image_edit_2511.json
   */
  buildQwenTurnaroundWorkflow(p: {
    targetImagePath: string;
    viewPresetText?: string;
    poseImagePath?: string;
    seed: number;
  }): Record<string, unknown> {
    const nodes: Record<string, unknown> = {
      '1': {
        class_type: 'LoadImage',
        inputs: { image: p.targetImagePath },
      },
      '2': {
        class_type: 'CheckpointLoaderSimple',
        inputs: { ckpt_name: 'Qwen-Rapid-AIO-NSFW-v23.safetensors' },
      },
      '3': {
        class_type: 'TextEncodeQwenImageEditPlusCustom_lrzjason',
        inputs: {
          prompt: p.viewPresetText || '白色背景。生成角色全身的正视图，姿势参考图二。',
          instruction: 'Describe the key features of the input image, then modify to full body turnaround view.',
          return_full_refs_cond: true,
          clip: ['2', 1],
          configs: [],
        },
      },
      '4': {
        class_type: 'KSampler',
        inputs: {
          seed: p.seed,
          steps: 4,
          cfg: 1.0,
          sampler_name: 'euler',
          scheduler: 'simple',
          denoise: 1.0,
          model: ['2', 0],
          positive: ['3', 0],
          negative: ['3', 1],
          latent_image: ['5', 0],
        },
      },
      '5': {
        class_type: 'EmptyLatentImage',
        inputs: { width: 1344, height: 768, batch_size: 1 },
      },
      '6': {
        class_type: 'VAEDecode',
        inputs: { samples: ['4', 0], vae: ['2', 2] },
      },
      '7': {
        class_type: 'SaveImage',
        inputs: {
          filename_prefix: 'openshorts_v2/qwen_turnaround',
          images: ['6', 0],
        },
      },
    };

    if (p.poseImagePath) {
      nodes['10'] = {
        class_type: 'LoadImage',
        inputs: { image: p.poseImagePath },
      };
    }

    return nodes;
  }

  /**
   * 12-A. MiniMax H3 2-Stage 캐릭터 시트 - 1단계 (얼굴 + 의상 기반 무결점 전·측·후 3뷰 턴어라운드)
   * T=1 정지영상 VAE 결합 원샷 렌더링
   */
  buildH3CharacterSheetStage1Workflow(p: {
    faceImagePath: string;
    wardrobeImagePath: string;
    koreanBodyPrompt?: string;
    resolution?: number; // 기본 1024 (1:1 Square) 또는 1344
    seed?: number;
    modelType?: 'safetensors' | 'gguf';
  }): Record<string, unknown> {
    const res = p.resolution || 1024;
    const seed = p.seed ?? Math.floor(Math.random() * 1e9);
    const bodyPrompt = (p.koreanBodyPrompt || '').trim();
    const isGGUF = p.modelType === 'gguf';

    return {
      // 1. 모델 로드: H3 Ref2VA (Safetensors vs GGUF 동적 분기)
      '10': isGGUF
        ? {
            class_type: 'UnetLoaderGGUF',
            inputs: { unet_name: 'MiniMax-H3-ref2va-curve-Q5_1.gguf' },
          }
        : {
            class_type: 'UNETLoader',
            inputs: { unet_name: 'minimaxH3INT8INT4_ref2vaINT8Pruned.safetensors' },
          },
      // 2. 4-Step Turbo LoRA
      '17': {
        class_type: 'LoraLoaderModelOnly',
        inputs: {
          model: ['10', 0],
          lora_name: 'minimaxh3/minimax_h3_turbo_v4_step600_ema.safetensors',
          strength_model: 0.75,
        },
      },
      // 3. Kitchen Attention Backend
      '136': {
        class_type: 'ModelAttentionBackend',
        inputs: {
          backend: 'comfy kitchen attention',
          model: ['17', 0],
        },
      },
      // 4. CLIP / Text Encoder
      '11': {
        class_type: 'CLIPLoader',
        inputs: {
          clip_name: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
          type: 'minimax',
          device: 'default',
        },
      },
      // 5. T=1 Image VAE & Audio VAE
      '2': {
        class_type: 'VAELoader',
        inputs: { vae_name: 'minimax_h3_t1_image_vae_step1597.safetensors' },
      },
      '3': {
        class_type: 'VAELoader',
        inputs: { vae_name: 'minimax_h3_audio_vae_fp32.safetensors' },
      },
      // 6. 이미지 입력: 얼굴(16) + 의상(21, 목 아래 크롭본)
      '16': {
        class_type: 'LoadImage',
        inputs: { image: p.faceImagePath },
      },
      '21': {
        class_type: 'LoadImage',
        inputs: { image: p.wardrobeImagePath },
      },
      // 7. 프롬프트 생성 (H3 표준 턴어라운드 영문 지시문)
      '24': {
        class_type: 'PrimitiveStringMultiline',
        inputs: {
          value: `subject_definitions:\n<Subject 1> is the adult character depicted in <Picture 1>, wearing the exact costume and clothing items from <Picture 2>.\n<Picture 1> is the identity face reference. Retain facial features, hair color, and likeness.\n<Picture 2> is the wardrobe and costume reference. Transfer the fabric, colors, and cuts precisely onto <Subject 1>.\n\nsummary:\n[reference generation] Create one static high-resolution character turnaround sheet containing exactly three full-body views: front view, side profile view, and rear back view of <Subject 1>.\n\nretention_analysis:\n<Subject 1>: fully_preserved - identity, skin tone, hair, age.\n<Picture 2>: fully_preserved - clothing, garments, shoes.\n\ndetailed_description:\nThe output is a single still image containing a three-view character turnaround sheet on a clean neutral studio background. From left to right: Front view, Side view (90-degree profile), and Back view. Proportions, lighting, and wardrobe are perfectly consistent across all three views.${bodyPrompt ? ` Body features: ${bodyPrompt}.` : ''}\nNo extra people, no motion blur, clean studio lighting, 8k uhd portrait.`,
        },
      },
      // 8. H3 Reference to Video (T=1 Still Image)
      '13': {
        class_type: 'MiniMaxH3ReferenceToVideo',
        inputs: {
          model: ['136', 0],
          clip: ['11', 0],
          vae: ['2', 0],
          audio_vae: ['3', 0],
          'ref_images.ref_image_0': ['16', 0],
          'ref_images.ref_image_1': ['21', 0],
          prompt: ['24', 0],
          width: res,
          height: res,
          length: 5,
          ref_image_size: 'max',
        },
      },
      // 9. Latent & Sampler
      '19': {
        class_type: 'ToobusyMiniMaxH3ImageLatent',
        inputs: { width: res, height: res },
      },
      '12': {
        class_type: 'RandomNoise',
        inputs: { noise_seed: seed, control_after_generate: 'fixed' },
      },
      '6': {
        class_type: 'KSamplerSelect',
        inputs: { sampler_name: 'er_sde' },
      },
      '7': {
        class_type: 'BasicScheduler',
        inputs: {
          model: ['136', 0],
          scheduler: 'sgm_uniform',
          steps: 8,
          denoise: 1.0,
        },
      },
      '9': {
        class_type: 'BasicGuider',
        inputs: {
          model: ['136', 0],
          conditioning: ['13', 0],
        },
      },
      '8': {
        class_type: 'SamplerCustomAdvanced',
        inputs: {
          noise: ['12', 0],
          guider: ['9', 0],
          sampler: ['6', 0],
          sigmas: ['7', 0],
          latent_image: ['19', 0],
        },
      },
      // 10. Decode & Save
      '5': {
        class_type: 'VAEDecode',
        inputs: {
          samples: ['8', 0],
          vae: ['2', 0],
        },
      },
      '106': {
        class_type: 'SaveImage',
        inputs: {
          images: ['5', 0],
          filename_prefix: 'charsheet/H3_2STAGE_STAGE1_3VIEW',
        },
      },
    };
  }

  /**
   * 12-B. MiniMax H3 2-Stage 캐릭터 시트 - 2단계 (1단계 정면 자동 크롭 + 동적 포즈/소품/배경 16:9 마스터 시트 합성)
   * 109번 서브그래프 완전 평탄화(Flattened) 무결점 API 직렬화
   */
  buildH3CharacterSheetStage2Workflow(p: {
    stage1SheetPath: string; // 1단계에서 생성된 3뷰 턴어라운드 이미지 경로
    poseImagePath?: string | null;
    poseOverrideText?: string;
    propImagePath?: string | null;
    propMode?: 'separate' | 'wield'; // 'separate': 단독 누끼 컷, 'wield': 캐릭터가 직접 파지
    bgImagePath?: string | null;
    extraPropImagePath?: string | null;
    panelCount?: number; // 1~4 (기본 3)
    threePanelLayout?: 'vertical' | 'horizontal'; // 3장일 때: 'vertical' = 좌측1열 세로+우측2칸, 'horizontal' = 상단1행 가로+하단2칸
    koreanPanelPrompt?: string;
    resolution?: number; // 기본 1024 or 1344
    seed?: number;
    modelType?: 'safetensors' | 'gguf';
  }): Record<string, unknown> {
    const res = p.resolution || 1024;
    const seed = p.seed ?? Math.floor(Math.random() * 1e9);
    const panelCount = p.panelCount || 3;
    const propMode = p.propMode || 'wield';
    const userPanelText = (p.koreanPanelPrompt || '').trim();
    const poseOverride = (p.poseOverrideText || '').trim();
    const isGGUF = p.modelType === 'gguf';

    const nodes: Record<string, unknown> = {
      // 1. 모델 로드: H3 Ref2VA (Safetensors vs GGUF 동적 분기)
      '10': isGGUF
        ? {
            class_type: 'UnetLoaderGGUF',
            inputs: { unet_name: 'MiniMax-H3-ref2va-curve-Q5_1.gguf' },
          }
        : {
            class_type: 'UNETLoader',
            inputs: { unet_name: 'minimaxH3INT8INT4_ref2vaINT8Pruned.safetensors' },
          },
      '17': {
        class_type: 'LoraLoaderModelOnly',
        inputs: {
          model: ['10', 0],
          lora_name: 'minimaxh3/minimax_h3_turbo_v4_step600_ema.safetensors',
          strength_model: 0.75,
        },
      },
      '136': {
        class_type: 'ModelAttentionBackend',
        inputs: {
          backend: 'comfy kitchen attention',
          model: ['17', 0],
        },
      },
      '11': {
        class_type: 'CLIPLoader',
        inputs: {
          clip_name: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
          type: 'minimax',
          device: 'default',
        },
      },
      '2': {
        class_type: 'VAELoader',
        inputs: { vae_name: 'minimax_h3_t1_image_vae_step1597.safetensors' },
      },
      '3': {
        class_type: 'VAELoader',
        inputs: { vae_name: 'minimax_h3_audio_vae_fp32.safetensors' },
      },

      // 2. 1단계 3뷰 이미지 로드
      '50': {
        class_type: 'LoadImage',
        inputs: { image: p.stage1SheetPath },
      },

      // 3. 1단계 정면 자동 크롭 (Node 98 연산: width / 3, Node 97: ImageCrop)
      '98': {
        class_type: 'MathExpression|pysssss',
        inputs: { expression: 'a / 3', a: res },
      },
      '97': {
        class_type: 'ImageCrop',
        inputs: {
          image: ['50', 0],
          width: ['98', 0],
          height: res,
          x: 0,
          y: 0,
        },
      },

      // 4. 프롬프트 조립
      '24': {
        class_type: 'PrimitiveStringMultiline',
        inputs: {
          value: `Create one static high-resolution character contact sheet containing exactly ${panelCount} distinct panels showing <Subject 1>.\n<Picture 1> is the frontal reference crop from Stage 1 turnaround. Maintain exact facial identity, hair, and clothing.\n${propMode === 'wield' ? 'PROP USAGE MODE — CHARACTER USES IT: The character actively wields or interacts with the prop/weapon in the action panels.' : 'PROP USAGE MODE — SEPARATE DISPLAY: The prop is presented cleanly as an isolated showcase item in one dedicated panel.'}\n${poseOverride ? `Pose instruction: ${poseOverride}.\n` : ''}${userPanelText ? `User Panel Plan:\n${userPanelText}\n` : ''}Each panel must be sharply defined, perfectly consistent with Picture 1, clean background, 8k resolution.`,
        },
      },

      // 5. MiniMax H3 Reference To Video (2단계 서브그래프 내부 노드 99 평탄화)
      '99': {
        class_type: 'MiniMaxH3ReferenceToVideo',
        inputs: {
          model: ['136', 0],
          clip: ['11', 0],
          vae: ['2', 0],
          audio_vae: ['3', 0],
          'ref_images.ref_image_0': ['97', 0], // 크롭된 1단계 정면 앵커
          prompt: ['24', 0],
          width: res,
          height: res,
          length: 5,
          ref_image_size: 'max',
        },
      },

      // 6. 2단계 Latent & Sampler (서브그래프 내부 노드 100, 101, 102, 103, 104 평탄화)
      '100': {
        class_type: 'RandomNoise',
        inputs: { noise_seed: seed, control_after_generate: 'fixed' },
      },
      '101': {
        class_type: 'ToobusyMiniMaxH3ImageLatent',
        inputs: { width: res, height: res },
      },
      '102': {
        class_type: 'BasicGuider',
        inputs: {
          model: ['136', 0],
          conditioning: ['99', 0],
        },
      },
      '6': {
        class_type: 'KSamplerSelect',
        inputs: { sampler_name: 'er_sde' },
      },
      '7': {
        class_type: 'BasicScheduler',
        inputs: {
          model: ['136', 0],
          scheduler: 'sgm_uniform',
          steps: 8,
          denoise: 1.0,
        },
      },
      '103': {
        class_type: 'SamplerCustomAdvanced',
        inputs: {
          noise: ['100', 0],
          guider: ['102', 0],
          sampler: ['6', 0],
          sigmas: ['7', 0],
          latent_image: ['101', 0],
        },
      },
      '104': {
        class_type: 'VAEDecode',
        inputs: {
          samples: ['103', 0],
          vae: ['2', 0],
        },
      },

      // 7. 최종 16:9 합성: 1단계 3뷰(좌측) + 2단계 패널(우측) 가로 병합 (Node 108)
      '108': {
        class_type: 'ImageConcanate',
        inputs: {
          image1: ['50', 0],
          image2: ['104', 0],
          direction: 'right',
        },
      },

      // 8. 16:9 캔버스 여백 패딩 (Node 117 연산: height / 16, Node 118: ImagePadForOutpaint)
      '117': {
        class_type: 'MathExpression|pysssss',
        inputs: { expression: 'a / 16', a: res },
      },
      '118': {
        class_type: 'ImagePadForOutpaint',
        inputs: {
          image: ['108', 0],
          top: ['117', 0],
          bottom: ['117', 0],
          left: 0,
          right: 0,
          feathering: 0,
        },
      },

      // 9. 저장 (서브그래프 내부 노드 14)
      '14': {
        class_type: 'SaveImage',
        inputs: {
          images: ['118', 0],
          filename_prefix: 'charsheet/H3_2STAGE_FINAL_SHEET',
        },
      },
    };

    // 선택적 슬롯 추가 (포즈, 소품, 배경, 추가 악세서리)
    let refIdx = 1;
    if (p.poseImagePath) {
      nodes['60'] = { class_type: 'LoadImage', inputs: { image: p.poseImagePath } };
      (nodes['99'] as any).inputs[`ref_images.ref_image_${refIdx}`] = ['60', 0];
      refIdx++;
    }
    if (p.propImagePath) {
      nodes['61'] = { class_type: 'LoadImage', inputs: { image: p.propImagePath } };
      (nodes['99'] as any).inputs[`ref_images.ref_image_${refIdx}`] = ['61', 0];
      refIdx++;
    }
    if (p.bgImagePath) {
      nodes['62'] = { class_type: 'LoadImage', inputs: { image: p.bgImagePath } };
      (nodes['99'] as any).inputs[`ref_images.ref_image_${refIdx}`] = ['62', 0];
      refIdx++;
    }
    if (p.extraPropImagePath && refIdx <= 4) {
      nodes['63'] = { class_type: 'LoadImage', inputs: { image: p.extraPropImagePath } };
      (nodes['99'] as any).inputs[`ref_images.ref_image_${refIdx}`] = ['63', 0];
      refIdx++;
    }

    return nodes;
  }

  /**
   * 12-C. 2D 에셋 즉석 쾌속 생성기 (Text-to-Asset: 의상 플랫레이, 무기 누끼, 클린 플레이트 배경)
   * 3초 고속 생성 (Z-Image / Krea2 / Qwen 경량)
   */
  buildQuickAssetGeneratorWorkflow(p: {
    prompt: string;
    assetType: 'wardrobe' | 'prop' | 'location';
    seed?: number;
    width?: number;
    height?: number;
  }): Record<string, unknown> {
    const seed = p.seed ?? Math.floor(Math.random() * 1e9);
    const w = p.width || (p.assetType === 'location' ? 1344 : 1024);
    const h = p.height || (p.assetType === 'location' ? 768 : 1024);

    let specializedPrompt = p.prompt.trim();
    if (p.assetType === 'wardrobe') {
      specializedPrompt = `flatlay product photography of ${p.prompt}, centered on solid white background, clothing neatly laid out, no mannequin, no human, sharp fabric texture, studio rim lighting, 8k uhd`;
    } else if (p.assetType === 'prop') {
      specializedPrompt = `isolated commercial product shot of ${p.prompt}, centered, pure white studio background, high-end craftsmanship, pristine reflections, sharp focus, 8k uhd, no person`;
    } else if (p.assetType === 'location') {
      specializedPrompt = `cinematic empty film set of ${p.prompt}, wide angle, clean plate, zero people, atmospheric architectural lighting, rich surface textures, photorealistic 8k`;
    }

    return {
      '1': {
        class_type: 'CheckpointLoaderSimple',
        inputs: { ckpt_name: 'Qwen-Rapid-AIO-NSFW-v23.safetensors' },
      },
      '2': {
        class_type: 'CLIPTextEncode',
        inputs: {
          text: specializedPrompt,
          clip: ['1', 1],
        },
      },
      '3': {
        class_type: 'CLIPTextEncode',
        inputs: {
          text: 'blurry, low quality, human, person, mannequin, messy, distorted, text, watermark',
          clip: ['1', 1],
        },
      },
      '4': {
        class_type: 'EmptyLatentImage',
        inputs: { width: w, height: h, batch_size: 1 },
      },
      '5': {
        class_type: 'KSampler',
        inputs: {
          seed,
          steps: 8,
          cfg: 3.5,
          sampler_name: 'euler',
          scheduler: 'simple',
          denoise: 1.0,
          model: ['1', 0],
          positive: ['2', 0],
          negative: ['3', 0],
          latent_image: ['4', 0],
        },
      },
      '6': {
        class_type: 'VAEDecode',
        inputs: {
          samples: ['5', 0],
          vae: ['1', 2],
        },
      },
      '7': {
        class_type: 'SaveImage',
        inputs: {
          filename_prefix: `openshorts_v2/assets/${p.assetType}`,
          images: ['6', 0],
        },
      },
    };
  }
}

export const workflowRegistry = new WorkflowRegistry();
