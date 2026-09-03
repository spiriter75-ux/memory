/**
 * OpenShorts Pro Studio V2 - 9-Slot Adapter & Prompt Assembler
 * Implements strict rules from OpenShorts_Pro_Studio_9슬롯_매핑.md
 * 100% Pure Clean English Diffusion Prompts (Zero Korean Infiltration)
 */

import { ReferenceSlots, SlotKey, STUDIO_SLOT_DEFINITIONS, CharacterDNA, WardrobePreset, LandmarkDNA } from '../types';

export interface Compacted2DSlotResult {
  imagePaths: string[]; // ComfyUI 핀 0, 1, 2... 에 연결될 실제 파일 경로들
  slotKeyMapping: { slotKey: SlotKey; pinIndex: number; pictureTag: string }[];
  reindexedPrompt: string;
}

export interface H3I2VAPromptPayload {
  firstFramePath: string; // winner.png
  formattedPrompt: string;
  durationFrames: number;
}

export class SlotAdapter {
  /**
   * 표준 7단 프롬프트 조립기 (순수 영문 클린 플레이트 전용)
   */
  assemble7StagePrompt(params: {
    character?: CharacterDNA | null;
    wardrobe?: WardrobePreset | null;
    actingState?: string;
    actionPose?: string;
    landmark?: LandmarkDNA | null;
    cameraWeatherMod?: string;
    baseAssembledPrompt?: string;
  }): string {
    const parts: string[] = [];

    // 0. AI가 추출한 기본 영문 베이스 프롬프트가 있다면 최우선 채택
    if (params.baseAssembledPrompt && params.baseAssembledPrompt.trim()) {
      // 한글 지문이 섞여 들어가지 않도록 한글 제거 필터링
      const cleanBase = params.baseAssembledPrompt
        .replace(/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]+/g, '')
        .replace(/^,\s*|,\s*$/g, '')
        .trim();
      if (cleanBase) {
        parts.push(cleanBase);
      }
    }

    // [1] IDENTITY 고정 블록 (바이블 불변 DNA)
    if (params.character?.lockedPromptBlock) {
      const cleanChar = params.character.lockedPromptBlock.replace(/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]+/g, '').trim();
      if (cleanChar && !parts.some((p) => p.includes(cleanChar))) {
        parts.push(cleanChar);
      }
    }

    // [2] 이번 컷 의상 프리셋 (옷장 슬롯)
    if (params.wardrobe?.outfitDescription) {
      const cleanWb = params.wardrobe.outfitDescription.replace(/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]+/g, '').trim();
      if (cleanWb) {
        parts.push(`wearing ${cleanWb}`);
      }
    }

    // [3] 이번 컷 상태 / 액션 포즈 (영문만 허용)
    if (params.actionPose) {
      const cleanPose = params.actionPose.replace(/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]+/g, '').trim();
      if (cleanPose && !parts.some((p) => p.includes(cleanPose))) {
        parts.push(cleanPose);
      }
    }

    // [4] 배경 잠금 DNA (랜드마크 바이블)
    if (params.landmark?.lockedPromptBlock) {
      const cleanLm = params.landmark.lockedPromptBlock.replace(/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]+/g, '').trim();
      if (cleanLm && !parts.some((p) => p.includes(cleanLm))) {
        parts.push(`in the environment of ${cleanLm}`);
      }
    }

    // [5] 카메라, 조명, 날씨 (영문 앵글)
    if (params.cameraWeatherMod) {
      const cleanCam = params.cameraWeatherMod.replace(/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]+/g, '').trim();
      if (cleanCam && !parts.some((p) => p.includes(cleanCam))) {
        parts.push(cleanCam);
      }
    }

    // 빈 토큰 정리 및 최종 정돈 (하드코딩 문구 일체 배제)
    return parts
      .filter(Boolean)
      .join(', ')
      .replace(/,\s*,+/g, ', ')
      .replace(/^,\s*/, '')
      .trim();
  }

  /**
   * 2D 이미지 생성용 슬롯 압축 및 <Picture N> 동시 재번호 (7.3절 규격)
   */
  adaptSlotsFor2D(slots: ReferenceSlots, basePrompt: string): Compacted2DSlotResult {
    const imagePaths: string[] = [];
    const slotKeyMapping: { slotKey: SlotKey; pinIndex: number; pictureTag: string }[] = [];

    // 슬롯 1~9 순회하며 실제 파일이 존재하는 슬롯만 차례대로 압축
    STUDIO_SLOT_DEFINITIONS.forEach((def) => {
      const path = slots[def.key];
      if (path && path.trim().length > 0) {
        const pinIndex = imagePaths.length;
        const pictureTag = `<Picture ${pinIndex + 1}>`;
        imagePaths.push(path.trim());
        slotKeyMapping.push({
          slotKey: def.key,
          pinIndex,
          pictureTag,
        });
      }
    });

    // 프롬프트 상의 참조 태그 재정렬
    let reindexedPrompt = basePrompt;
    slotKeyMapping.forEach((m) => {
      if (m.slotKey === 'face' && !reindexedPrompt.includes(m.pictureTag)) {
        reindexedPrompt += `, face features referencing ${m.pictureTag}`;
      } else if (m.slotKey === 'bg' && !reindexedPrompt.includes(m.pictureTag)) {
        reindexedPrompt += `, background environment referencing ${m.pictureTag}`;
      } else if (m.slotKey === 'wardrobe' && !reindexedPrompt.includes(m.pictureTag)) {
        reindexedPrompt += `, costume style referencing ${m.pictureTag}`;
      }
    });

    return {
      imagePaths,
      slotKeyMapping,
      reindexedPrompt,
    };
  }

  /**
   * H3 I2VA 비디오 프롬프트 어댑터 (3.1절 / 4.2절 규격)
   * winner.png를 <Picture 1>(0.00초 첫 프레임)으로 단일 바인딩
   */
  adaptSlotsForH3I2VA(params: {
    winnerImagePath: string;
    dialogueText: string | null;
    sceneDescription: string;
    durationSeconds: number;
  }): H3I2VAPromptPayload {
    const { winnerImagePath, dialogueText, sceneDescription, durationSeconds } = params;

    const a = Math.max(3, Math.min(15, durationSeconds));
    const baseFrames = Math.max(5, Math.round(a * 24));
    const durationFrames = baseFrames + ((5 - (baseFrames % 17)) % 17);

    const header = 'For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.';

    const dialogueBlock = dialogueText
      ? `(S1) says directly: <d>[Korean] ${dialogueText.replace(/<d>|<\/d>|\[Korean\]/g, '').trim()}</d>`
      : '';

    const cleanScene = sceneDescription.replace(/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]+/g, '').trim() || 'cinematic action and realistic character movement';

    const body = `integrated_multimodal_description: [Shot 1] Live-action cinematic video, the character shown in <Picture 1> remains consistent, preserving facial appearance, clothing texture, and spatial environment layout. ${cleanScene} ${dialogueBlock} Natural Korean lip synchronization, subtle breathing, realistic eye contact, and smooth camera motion.
overall_soundscape: natural room ambience, subtle movement sounds, crisp clear spoken dialogue
non_diegetic_music: N/A`;

    const formattedPrompt = `${header}\n\n${body}`;

    return {
      firstFramePath: winnerImagePath,
      formattedPrompt,
      durationFrames,
    };
  }
}

export const slotAdapter = new SlotAdapter();
