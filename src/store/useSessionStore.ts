import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Slide } from '../api/prompt'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  slides?: Slide[]
  timestamp: number
  isScriptGeneration: boolean
  relatedSlideNumber?: number
  slideSnapshot?: Slide[]
  isThinking?: boolean
  relatedSlideReferences?: {
    id: string
    number: number
    label: string
  }[]
  action?: 'create' | 'update' | 'append' | 'delete'
}

export interface Session {
  id: string
  title: string
  messages: ChatMessage[]
  slides: Slide[]
  timestamp: number
  selectedSlideIndices?: number[]
}

interface SessionState {
  sessions: Session[]
  currentSessionId: string | null
  highlightedSlideIndex: number | null
  createSession: (title: string) => string
  addMessage: (message: Omit<ChatMessage, 'id'>) => string
  updateMessage: (messageId: string, patch: Partial<ChatMessage>) => void
  setCurrentSession: (id: string | null) => void
  deleteSession: (id: string) => void
  getCurrentSession: () => Session | undefined
  importSession: (session: Session) => void
  clearCurrentMessages: () => void
  newChat: () => void
  // Slide operations (session-scoped)
  setSessionSlides: (slides: Slide[]) => void
  mergeSlides: (updatedSlides: Slide[]) => void
  updateSlide: (slideIndex: number, patch: Partial<Slide>) => void
  deleteSlide: (slideIndex: number) => void
  deleteSlides: (slideIndices: number[]) => void
  reorderSlides: (fromIndex: number, toIndex: number) => void
  duplicateSlide: (slideIndex: number) => void
  // Highlight
  highlightSlide: (slideNumber: number) => void
  clearHighlight: () => void
  // Selection
  toggleSlideSelection: (index: number) => void
  clearSlideSelection: () => void
  getSelectedSlideIndices: () => number[]
  // Snapshot restoration
  restoreSnapshot: (snapshot: Slide[]) => void
  // Processing state
  processingSlideNumbers: number[]
  setProcessingSlides: (numbers: number[]) => void
  addProcessingSlide: (slideNumber: number) => void
  removeProcessingSlide: (slideNumber: number) => void
  clearProcessingSlides: () => void
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      sessions: [],
      currentSessionId: null,
      highlightedSlideIndex: null,
      processingSlideNumbers: [],

      createSession: (title) => {
        const session: Session = {
          id: crypto.randomUUID(),
          title,
          messages: [],
          slides: [],
          timestamp: Date.now(),
        }
        set((state) => ({
          sessions: [session, ...state.sessions],
          currentSessionId: session.id,
        }))
        return session.id
      },

      addMessage: (message) => {
        const { currentSessionId } = get()
        if (!currentSessionId) return ''

        const fullMessage: ChatMessage = {
          ...message,
          id: crypto.randomUUID(),
        }

        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === currentSessionId
              ? { ...s, messages: [...s.messages, fullMessage], timestamp: Date.now() }
              : s
          ),
        }))
        return fullMessage.id
      },

      updateMessage: (messageId, patch) => {
        const { currentSessionId } = get()
        if (!currentSessionId) return
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== currentSessionId) return s
            return {
              ...s,
              messages: s.messages.map((m) =>
                m.id === messageId ? { ...m, ...patch } : m
              ),
            }
          }),
        }))
      },

      setCurrentSession: (id) => set({ currentSessionId: id }),

      deleteSession: (id) =>
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== id),
          currentSessionId: state.currentSessionId === id ? null : state.currentSessionId,
        })),

      getCurrentSession: () => {
        const { sessions, currentSessionId } = get()
        return sessions.find((s) => s.id === currentSessionId)
      },

      importSession: (session) => {
        const imported: Session = {
          ...session,
          id: crypto.randomUUID(),
          slides: session.slides ?? [],
          messages: session.messages.map((m) => ({
            ...m,
            id: m.id || crypto.randomUUID(),
          })),
        }
        set((state) => ({
          sessions: [imported, ...state.sessions],
          currentSessionId: imported.id,
        }))
      },

      clearCurrentMessages: () => {
        const { currentSessionId } = get()
        if (!currentSessionId) return
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === currentSessionId ? { ...s, messages: [] } : s
          ),
        }))
      },

      newChat: () => {
        set({ currentSessionId: null })
      },

      // --- Slide operations (scoped to current session) ---

      setSessionSlides: (slides) => {
        const { currentSessionId } = get()
        if (!currentSessionId) return
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === currentSessionId ? { ...s, slides } : s
          ),
        }))
      },

      mergeSlides: (updatedSlides) => {
        const { currentSessionId } = get()
        if (!currentSessionId) return
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== currentSessionId) return s
            const newSlides = s.slides.map((existing) => {
              const updated = updatedSlides.find((u) => u.slide_number === existing.slide_number)
              return updated ? { ...existing, ...updated } : existing
            })
            return { ...s, slides: newSlides }
          }),
        }))
      },

      updateSlide: (slideIndex, patch) => {
        const { currentSessionId } = get()
        if (!currentSessionId) return
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== currentSessionId) return s
            const newSlides = [...s.slides]
            newSlides[slideIndex] = { ...newSlides[slideIndex], ...patch }
            return { ...s, slides: newSlides }
          }),
        }))
      },

      deleteSlide: (slideIndex) => {
        const { currentSessionId } = get()
        if (!currentSessionId) return
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== currentSessionId) return s
            const newSlides = s.slides
              .filter((_, i) => i !== slideIndex)
              .map((sl, i) => ({ ...sl, slide_number: i + 1 }))
            return { ...s, slides: newSlides }
          }),
        }))
      },

      deleteSlides: (slideIndices) => {
        const { currentSessionId } = get()
        if (!currentSessionId) return
        const indexSet = new Set(slideIndices)
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== currentSessionId) return s
            const newSlides = s.slides
              .filter((_, i) => !indexSet.has(i))
              .map((sl, i) => ({ ...sl, slide_number: i + 1 }))
            return { ...s, slides: newSlides }
          }),
        }))
      },

      reorderSlides: (fromIndex, toIndex) => {
        const { currentSessionId } = get()
        if (!currentSessionId) return
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== currentSessionId) return s
            const newSlides = [...s.slides]
            const [moved] = newSlides.splice(fromIndex, 1)
            newSlides.splice(toIndex, 0, moved)
            const renumbered = newSlides.map((sl, i) => ({ ...sl, slide_number: i + 1 }))
            return { ...s, slides: renumbered }
          }),
        }))
      },

      duplicateSlide: (slideIndex) => {
        const { currentSessionId } = get()
        if (!currentSessionId) return
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== currentSessionId) return s
            const newSlides = [...s.slides]
            const slideToCopy = newSlides[slideIndex]
            if (!slideToCopy) return s
            
            const newSlide = {
              ...slideToCopy,
              title: `${slideToCopy.title} (Copy)`,
              slide_number: slideToCopy.slide_number + 1 // Temporary, renumbering fixes it
            }
            
            newSlides.splice(slideIndex + 1, 0, newSlide)
            const renumbered = newSlides.map((sl, i) => ({ ...sl, slide_number: i + 1 }))
            return { ...s, slides: renumbered }
          }),
        }))
      },

      highlightSlide: (slideNumber) => {
        const { sessions, currentSessionId } = get()
        const session = sessions.find((s) => s.id === currentSessionId)
        if (!session) return
        const idx = session.slides.findIndex((s) => s.slide_number === slideNumber)
        if (idx >= 0) {
          set({ highlightedSlideIndex: idx })
        }
      },

      clearHighlight: () => set({ highlightedSlideIndex: null }),

      toggleSlideSelection: (index) => {
        const { currentSessionId } = get()
        if (!currentSessionId) return
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== currentSessionId) return s
            const current = s.selectedSlideIndices || []
            const exists = current.includes(index)
            return {
              ...s,
              selectedSlideIndices: exists
                ? current.filter((i) => i !== index)
                : [...current, index],
            }
          }),
        }))
      },

      clearSlideSelection: () => {
        const { currentSessionId } = get()
        if (!currentSessionId) return
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === currentSessionId ? { ...s, selectedSlideIndices: [] } : s
          ),
        }))
      },

      getSelectedSlideIndices: () => {
        const { sessions, currentSessionId } = get()
        const session = sessions.find((s) => s.id === currentSessionId)
        return session?.selectedSlideIndices || []
      },

      restoreSnapshot: (snapshot) => {
        const { currentSessionId } = get()
        if (!currentSessionId) return
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === currentSessionId ? { ...s, slides: snapshot, selectedSlideIndices: [] } : s
          ),
        }))
      },

      setProcessingSlides: (nums) => set({ processingSlideNumbers: nums }),

      addProcessingSlide: (num) => set((state) => ({ 
        processingSlideNumbers: state.processingSlideNumbers.includes(num) 
          ? state.processingSlideNumbers 
          : [...state.processingSlideNumbers, num] 
      })),

      removeProcessingSlide: (num) => set((state) => ({ 
        processingSlideNumbers: state.processingSlideNumbers.filter((n) => n !== num) 
      })),
      
      clearProcessingSlides: () => set({ processingSlideNumbers: [] }),
    }),
    {
      name: 'vibriona-sessions',
      partialize: (state) => ({
        sessions: state.sessions.slice(0, 50),
        currentSessionId: state.currentSessionId,
      }),
    }
  )
)
