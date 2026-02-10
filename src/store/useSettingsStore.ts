import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark'
export type Language = 'en' | 'vi'

interface SettingsState {
  apiKey: string
  apiUrl: string
  selectedModel: string
  availableModels: string[]
  theme: Theme
  language: Language
  setApiKey: (key: string) => void
  setApiUrl: (url: string) => void
  setSelectedModel: (model: string) => void
  setAvailableModels: (models: string[]) => void
  setTheme: (theme: Theme) => void
  setLanguage: (language: Language) => void
  isConfigured: () => boolean
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      apiKey: '',
      apiUrl: 'http://localhost:11434/api',
      selectedModel: '',
      availableModels: [],
      theme: 'dark',
      language: 'en',
      setApiKey: (apiKey) => set({ apiKey }),
      setApiUrl: (apiUrl) => set({ apiUrl }),
      setSelectedModel: (selectedModel) => set({ selectedModel }),
      setAvailableModels: (availableModels) => set({ availableModels }),
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      isConfigured: () => {
        const { apiKey, apiUrl } = get()
        return apiKey.trim().length > 0 && apiUrl.trim().length > 0
      },
    }),
    {
      name: 'vibriona-settings',
      partialize: (state) => ({
        apiKey: state.apiKey,
        apiUrl: state.apiUrl,
        selectedModel: state.selectedModel,
        theme: state.theme,
        language: state.language,
      }),
    }
  )
)
