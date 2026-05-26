import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  CharacterItem, LocationItem, ObjectItem, StoryboardPanel,
  AppSettings, ChatMessage, GenerationHistoryItem
} from '../types'

interface AppState {

  // Series Bible
  characters: CharacterItem[]
  locations: LocationItem[]
  objects: ObjectItem[]

  // Editor & Output
  novelText: string
  panels: StoryboardPanel[]
  currentProjectName: string

  // Settings
  settings: AppSettings

  // Actions
  addCharacter: (char: Omit<CharacterItem, 'id'>) => void
  updateCharacter: (id: string, char: Partial<CharacterItem>) => void
  deleteCharacter: (id: string) => void

  addLocation: (loc: Omit<LocationItem, 'id'>) => void
  updateLocation: (id: string, loc: Partial<LocationItem>) => void
  deleteLocation: (id: string) => void

  addObject: (obj: Omit<ObjectItem, 'id'>) => void
  updateObject: (id: string, obj: Partial<ObjectItem>) => void
  deleteObject: (id: string) => void

  setNovelText: (text: string) => void
  setPanels: (panels: StoryboardPanel[]) => void
  updatePanel: (id: string, panelUpdate: Partial<StoryboardPanel>) => void
  addPanel: (index?: number) => void
  duplicatePanel: (id: string) => void
  deletePanel: (id: string) => void
  movePanel: (id: string, direction: 'up' | 'down') => void

  updateSettings: (settings: Partial<AppSettings>) => void
  setCurrentProjectName: (name: string) => void

  chatMessages: ChatMessage[]
  addChatMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  clearChat: () => void
  toggleSidebar: () => void

  exportData: () => string
  importData: (jsonString: string) => void
  resetData: () => void
}

const initialSettings: AppSettings = {
  aiProvider: 'gemini',
  apiKey: '',
  aiModel: 'gemini-2.5-flash',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3',
  comfyUrl: 'http://localhost:8188',
  comfyModel: 'z-anime-distill-8step-fp8.safetensors',
  useUpscale: true,
  defaultSeed: 40,
  styleGuide: '고퀄리티 현대 웹툰풍, 선명한 라인과 화려한 채색, 시네마틱한 조명',
  globalConstraints: '배경에 불필요한 텍스트나 로고 제외. 일관된 캐릭터 외형 유지.',
  aspectRatio: '9:16',
  qualityTags: 'masterpiece, best quality, ultra-detailed, anime style, cinematic lighting, sharp focus',
  negativePrompt: 'low quality, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, deformed, disfigured, mutation, extra limbs, fused fingers, poorly drawn hands, watermark, signature, username, monochrome, photorealistic, realistic, 3d',
  promptTemplate: 'A high-quality anime illustration of [Subject]. [Appearance]. The scene takes place in [Background]. [Lighting]. [Style]. [QualityTags].',
  isSidebarOpen: false,
  learningContext: 'Z-Anime (S3-DiT) 전문가 연구 결과: 자연어(Full Sentence) 기반 묘사가 최적임. 텍스트 렌더링 시 " " 사용 권장. 시네마틱 조명(Cinematic lighting) 효과 강조 필수.'
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      characters: [],
      locations: [],
      objects: [],
      novelText: '',
      panels: [],
      currentProjectName: '',
      settings: initialSettings,

      addCharacter: (char) => set((state) => ({
        characters: [...state.characters, { ...char, id: crypto.randomUUID() }]
      })),
      updateCharacter: (id, char) => set((state) => ({
        characters: state.characters.map((c) => c.id === id ? { ...c, ...char } : c)
      })),
      deleteCharacter: (id) => set((state) => ({
        characters: state.characters.filter((c) => c.id !== id)
      })),

      addLocation: (loc) => set((state) => ({
        locations: [...state.locations, { ...loc, id: crypto.randomUUID() }]
      })),
      updateLocation: (id, loc) => set((state) => ({
        locations: state.locations.map((l) => l.id === id ? { ...l, ...loc } : l)
      })),
      deleteLocation: (id) => set((state) => ({
        locations: state.locations.filter((l) => l.id !== id)
      })),

      addObject: (obj) => set((state) => ({
        objects: [...state.objects, { ...obj, id: crypto.randomUUID() }]
      })),
      updateObject: (id, obj) => set((state) => ({
        objects: state.objects.map((o) => o.id === id ? { ...o, ...obj } : o)
      })),
      deleteObject: (id) => set((state) => ({
        objects: state.objects.filter((o) => o.id !== id)
      })),

      setNovelText: (text) => set({ novelText: text }),
      setPanels: (panels) => set({ panels }),
      updatePanel: (id, panelUpdate) => set((state) => ({
        panels: state.panels.map(p => p.id === id ? { ...p, ...panelUpdate } : p)
      })),

      addPanel: (index) => set((state) => {
        const newPanel: StoryboardPanel = {
          id: crypto.randomUUID(),
          panelNumber: state.panels.length + 1,
          sceneDescription: '',
          imagePrompt: '',
          narration: '',
          dialogue: '',
          generationHistory: []
        }
        const newPanels = [...state.panels]
        if (index !== undefined) {
          newPanels.splice(index, 0, newPanel)
        } else {
          newPanels.push(newPanel)
        }
        return { panels: newPanels.map((p, i) => ({ ...p, panelNumber: i + 1 })) }
      }),

      duplicatePanel: (id) => set((state) => {
        const targetIdx = state.panels.findIndex(p => p.id === id)
        if (targetIdx === -1) return state
        const target = state.panels[targetIdx]
        const newNode: StoryboardPanel = {
          ...target,
          id: crypto.randomUUID(),
          panelNumber: target.panelNumber + 1,
          generationHistory: [],
          activeImageId: undefined
        }
        const newPanels = [...state.panels]
        newPanels.splice(targetIdx + 1, 0, newNode)
        return { panels: newPanels.map((p, i) => ({ ...p, panelNumber: i + 1 })) }
      }),

      deletePanel: (id) => set((state) => {
        const newPanels = state.panels.filter(p => p.id !== id)
        return { panels: newPanels.map((p, i) => ({ ...p, panelNumber: i + 1 })) }
      }),

      movePanel: (id, direction) => set((state) => {
        const idx = state.panels.findIndex(p => p.id === id)
        if (idx === -1) return state
        const newPanels = [...state.panels]
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1
        if (targetIdx < 0 || targetIdx >= newPanels.length) return state

        const temp = newPanels[idx]
        newPanels[idx] = newPanels[targetIdx]
        newPanels[targetIdx] = temp

        return { panels: newPanels.map((p, i) => ({ ...p, panelNumber: i + 1 })) }
      }),

      setCurrentProjectName: (name) => set({ currentProjectName: name }),

      updateSettings: (newSettings) => set((state) => ({
        settings: { ...state.settings, ...newSettings }
      })),

      exportData: () => {
        const state = get()
        return JSON.stringify({
          characters: state.characters,
          locations: state.locations,
          objects: state.objects,
          novelText: state.novelText,
          panels: state.panels,
          settings: state.settings
        }, null, 2)
      },

      importData: (jsonString) => {
        try {
          const parsed = JSON.parse(jsonString)
          set({
            characters: parsed.characters || [],
            locations: parsed.locations || [],
            objects: parsed.objects || [],
            novelText: parsed.novelText || '',
            panels: parsed.panels || [],
            settings: { ...initialSettings, ...(parsed.settings || {}) }
          })
        } catch (e) {
          console.error('Failed to parse import data', e)
        }
      },

      resetData: () => set({
        characters: [],
        locations: [],
        objects: [],
        novelText: '',
        panels: [],
        currentProjectName: '',
        settings: initialSettings,
        chatMessages: []
      }),

      chatMessages: [],
      addChatMessage: (msg) => set((state) => ({
        chatMessages: [...state.chatMessages, { ...msg, id: crypto.randomUUID(), timestamp: Date.now() }]
      })),
      clearChat: () => set({ chatMessages: [] }),
      toggleSidebar: () => set((state) => ({
        settings: { ...state.settings, isSidebarOpen: !state.settings.isSidebarOpen }
      }))
    }),
    {
      name: 'webtoon-storyboard-storage',
    }
  )
)
