import { create } from 'zustand'

interface UIState {
  mobileActiveTab: 'chat' | 'script'
  setMobileActiveTab: (tab: 'chat' | 'script') => void
}

export const useUIStore = create<UIState>((set) => ({
  mobileActiveTab: 'chat',
  setMobileActiveTab: (tab) => set({ mobileActiveTab: tab }),
}))
