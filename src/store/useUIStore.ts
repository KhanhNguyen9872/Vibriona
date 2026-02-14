import { create } from 'zustand'

interface UIState {
  mobileActiveTab: 'chat' | 'script'
  setMobileActiveTab: (tab: 'chat' | 'script') => void
  mobileScriptPanelVisible: boolean
  setMobileScriptPanelVisible: (visible: boolean) => void
  toggleMobileScriptPanel: () => void
  chatPanelVisible: boolean
  setChatPanelVisible: (visible: boolean) => void
  toggleChatPanel: () => void
  heroHold: boolean
  startHeroHold: () => void
  clearHeroHold: () => void
  splitPaneWidth: number // Percentage of width for chat panel (0-100)
  setSplitPaneWidth: (width: number) => void
  isInitialLoad: boolean
  setInitialLoad: (loading: boolean) => void
  activeMenuSlideNumber: number | null
  setActiveMenuSlideNumber: (number: number | null) => void
  viewMode: 'grid' | 'script'
  setViewMode: (mode: 'grid' | 'script') => void
}

let heroHoldTimer: ReturnType<typeof setTimeout> | null = null

export const useUIStore = create<UIState>((set) => ({
  mobileActiveTab: 'chat',
  setMobileActiveTab: (tab) => set({ mobileActiveTab: tab }),
  mobileScriptPanelVisible: true,
  setMobileScriptPanelVisible: (visible) => set({ mobileScriptPanelVisible: visible }),
  toggleMobileScriptPanel: () =>
    set((s) => {
      const next = !s.mobileScriptPanelVisible
      if (next === false && !s.chatPanelVisible) return { mobileScriptPanelVisible: false, chatPanelVisible: true }
      return { mobileScriptPanelVisible: next }
    }),
  chatPanelVisible: true,
  setChatPanelVisible: (visible) => set({ chatPanelVisible: visible }),
  toggleChatPanel: () =>
    set((s) => {
      const next = !s.chatPanelVisible
      if (next === false && !s.mobileScriptPanelVisible) return { chatPanelVisible: false, mobileScriptPanelVisible: true }
      return { chatPanelVisible: next }
    }),
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
  isInitialLoad: true,
  setInitialLoad: (loading) => set({ isInitialLoad: loading }),
  activeMenuSlideNumber: null,
  setActiveMenuSlideNumber: (number) => set({ activeMenuSlideNumber: number }),
  viewMode: (() => {
    try {
      const saved = localStorage.getItem('vibriona-view-mode')
      if (saved === 'grid' || saved === 'script') return saved
    } catch { /* noop */ }
    return 'grid'
  })(),
  setViewMode: (mode) => {
    try { localStorage.setItem('vibriona-view-mode', mode) } catch { /* noop */ }
    set({ viewMode: mode })
  },
}))
