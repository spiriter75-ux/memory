/**
 * types.ts
 * 순환 참조 방지를 위한 독립 타입 정의 파일
 */

export interface CharacterItem {
  id: string
  name: string
  appearance: string
  loraTrigger: string
  loraPath: string
}

export interface LocationItem {
  id: string
  name: string
  description: string
}

export interface ObjectItem {
  id: string
  name: string
  description: string
}

export interface GenerationHistoryItem {
  id: string
  fileName: string
  imageUrl: string
  prompt: string
  negativePrompt: string
  seed: number
  timestamp: number
}

export interface StoryboardPanel {
  id: string
  panelNumber: number
  sceneDescription: string
  imagePrompt: string
  narration: string
  dialogue: string
  isGenerating?: boolean
  generationHistory?: GenerationHistoryItem[]
  activeImageId?: string
}

export interface AppSettings {
  aiProvider: 'gemini' | 'ollama'
  apiKey: string
  aiModel: string
  ollamaUrl: string
  ollamaModel: string
  comfyUrl: string
  comfyModel: string
  useUpscale: boolean
  defaultSeed: number
  styleGuide: string
  globalConstraints: string
  aspectRatio: '9:16' | '3:4' | '16:9'
  qualityTags: string
  negativePrompt: string
  promptTemplate: string
  isSidebarOpen: boolean
  learningContext: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}
