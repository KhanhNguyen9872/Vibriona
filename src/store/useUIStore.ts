import { create } from 'zustand'

interface UIState {
  mobileActiveTab: 'chat' | 'script'
  setMobileActiveTab: (tab: 'chat' | 'script') => void
  heroHold: boolean
  startHeroHold: () => void
  clearHeroHold: () => void
  splitPaneWidth: number // Percentage of width for chat panel (0-100)
  setSplitPaneWidth: (width: number) => void
}

let heroHoldTimer: ReturnType<typeof setTimeout> | null = null

export const useUIStore = create<UIState>((set) => ({
  mobileActiveTab: 'chat',
  setMobileActiveTab: (tab) => set({ mobileActiveTab: tab }),
  heroHold: false,
  startHeroHold: () => {
    if (heroHoldTimer) clearTimeout(heroHoldTimer)
    set({ heroHold: true })
    heroHoldTimer = setTimeout(() => {
      set({ heroHold: false })
      heroHoldTimer = null
    }, 2000)
  },
  clearHeroHold: () => {
    if (heroHoldTimer) clearTimeout(heroHoldTimer)
    heroHoldTimer = null
    set({ heroHold: false })
  },
  splitPaneWidth: 40, // Default 40% for chat panel
  setSplitPaneWidth: (width) => set({ splitPaneWidth: width }),
}))
