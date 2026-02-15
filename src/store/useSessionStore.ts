import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { temporal } from 'zundo'
import { MAX_PERSISTED_SESSIONS } from '../config/limits'
import { STORAGE_KEYS } from '../config/defaults'
import type { Slide } from '../api/prompt'
export const SKIPPED_VALUE = '###SKIPPED###'

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
  action?: 'create' | 'update' | 'append' | 'delete' | 'ask'
  isInteractive?: boolean
  clarification?: {
    question: string
    options: string[]
    allowCustom?: boolean
  }
  selectedOption?: string // Persisted selection
  isCompacted?: boolean // Mark messages included in a compaction
}

export interface Session {
  id: string
  title: string
  messages: ChatMessage[]
  slides: Slide[]
  timestamp: number
  selectedSlideIndices?: number[]
  pinned?: boolean
  compactedContext?: string // AI-generated summary of old messages
  compactedAt?: number // Timestamp when compaction occurred
  lastCompactedIndex?: number // Index of last message included in compaction
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
  deleteMessagesFrom: (messageId: string) => void
  hasCheckpointAfterTimestamp: (timestamp: number) => boolean
  getLastCheckpointBeforeMessageId: (messageId: string) => Slide[] | undefined
  newChat: () => void
  pinSession: (id: string) => void
  renameSession: (id: string, title: string) => void
  reorderSessions: (fromIndex: number, toIndex: number) => void
  // Slide operations (session-scoped)
  setSessionSlides: (slides: Slide[]) => void
  mergeSlides: (updatedSlides: Slide[]) => void
  updateSlide: (slideIndex: number, patch: Partial<Slide>) => void
  deleteSlide: (slideIndex: number) => void
  deleteSlides: (slideIndices: number[]) => void
  reorderSlides: (fromIndex: number, toIndex: number) => void
  reorderSlidesByIds: (newOrderIds: string[]) => void
  duplicateSlide: (slideIndex: number) => void
  // Highlight
  highlightSlide: (slideNumber: number) => void
  clearHighlight: () => void
  // Selection
  toggleSlideSelection: (index: number) => void
  clearSlideSelection: () => void
  selectAllSlides: () => void
  getSelectedSlideIndices: () => number[]
  // Snapshot restoration
  restoreSnapshot: (snapshot: Slide[]) => void
  // Processing state
  processingSlideNumbers: number[]
  setProcessingSlides: (numbers: number[]) => void
  addProcessingSlide: (slideNumber: number) => void
  removeProcessingSlide: (slideNumber: number) => void
  clearProcessingSlides: () => void
  clearSessions: () => void
  // Conversation compaction
  compactConversation: (sessionId: string, summary: string, upToIndex: number) => void
  getUncompactedMessages: () => ChatMessage[]
  clearCompaction: (sessionId: string) => void
}

export const useSessionStore = create<SessionState>()(
  temporal(
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
          pinned: false,
        }
        set((state) => {
          const list = state.sessions
          const pinnedCount = list.filter((s) => s.pinned === true).length
          const sessions = [...list.slice(0, pinnedCount), session, ...list.slice(pinnedCount)]
          return { sessions, currentSessionId: session.id }
        })
        return session.id
      },

      addMessage: (message) => {
        const { currentSessionId, sessions } = get()
        if (!currentSessionId) return ''

        const session = sessions.find(s => s.id === currentSessionId)
        let updatedMessages = session?.messages || []

        // Intent-aware: Check if the LAST message was an 'ask' action that hasn't been answered
        // If so, and we are adding a NEW USER message that isn't the answer (which is handled by MessageBubble separately),
        // then we should mark that Ask action as SKIPPED.
        // Note: MessageBubble calls updateMessage directly for the answer, so if we reach here, it's a manual chat input.
        if (message.role === 'user' && updatedMessages.length > 0) {
          const lastMsg = updatedMessages[updatedMessages.length - 1]
          if (lastMsg.role === 'assistant' && lastMsg.action === 'ask' && !lastMsg.selectedOption) {
             updatedMessages = updatedMessages.map(m => 
                m.id === lastMsg.id ? { ...m, selectedOption: SKIPPED_VALUE } : m
             )
          }
        }

        const fullMessage: ChatMessage = {
          ...message,
          id: crypto.randomUUID(),
        }

        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === currentSessionId
              ? { ...s, messages: [...updatedMessages, fullMessage], timestamp: Date.now() }
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
          pinned: session.pinned === true,
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

      deleteMessagesFrom: (messageId) => {
        const { currentSessionId } = get()
        if (!currentSessionId) return
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== currentSessionId) return s
            const msgIndex = s.messages.findIndex((m) => m.id === messageId)
            if (msgIndex === -1) return s
            return { ...s, messages: s.messages.slice(0, msgIndex) }
          }),
        }))
      },

      hasCheckpointAfterTimestamp: (timestamp) => {
        const session = get().getCurrentSession()
        if (!session) return false
        return session.messages.some(
          (m) => m.timestamp > timestamp && m.slideSnapshot && m.slideSnapshot.length > 0
        )
      },

      getLastCheckpointBeforeMessageId: (messageId) => {
        const session = get().getCurrentSession()
        if (!session) return undefined
        const idx = session.messages.findIndex((m) => m.id === messageId)
        if (idx <= 0) return undefined
        for (let i = idx - 1; i >= 0; i--) {
          const m = session.messages[i]
          if (m.slideSnapshot && m.slideSnapshot.length > 0) {
            return JSON.parse(JSON.stringify(m.slideSnapshot))
          }
        }
        return undefined
      },

      newChat: () => {
        set({ currentSessionId: null })
      },

      clearSessions: () => set({ sessions: [], currentSessionId: null }),

      pinSession: (id) =>
        set((state) => {
          const list = [...state.sessions]
          const idx = list.findIndex((s) => s.id === id)
          if (idx === -1) return state
          const session = list[idx]
          const nextPinned = session.pinned !== true
          if (nextPinned) {
            list.splice(idx, 1)
            list.unshift({ ...session, pinned: true })
            return { sessions: list }
          }
          return {
            sessions: list.map((s) =>
              s.id === id ? { ...s, pinned: false } : s
            ),
          }
        }),

      renameSession: (id, title) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, title } : s
          ),
        })),

      reorderSessions: (fromIndex, toIndex) =>
        set((state) => {
          const list = [...state.sessions]
          const [removed] = list.splice(fromIndex, 1)
          if (removed) list.splice(toIndex, 0, removed)
          return { sessions: list }
        }),

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

      reorderSlidesByIds: (newOrderIds) => {
        const { currentSessionId } = get()
        if (!currentSessionId) return
        
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== currentSessionId) return s
            
            // Create a map for O(1) lookup using slide_number
            const slideMap = new Map(
              s.slides.map((slide) => [
                `slide-${slide.slide_number}`,
                slide
              ])
            )
            
            // Reconstruct array based on new ID order
            const reordered = newOrderIds
              .map((id) => slideMap.get(id))
              .filter(Boolean) as Slide[]
            
            // Auto-renumber based on new position
            const renumbered = reordered.map((slide, idx) => ({
              ...slide,
              slide_number: idx + 1
            }))
            
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

      selectAllSlides: () => {
        const { currentSessionId, getCurrentSession } = get()
        if (!currentSessionId) return
        const session = getCurrentSession()
        if (!session) return
        
        const allIndices = session.slides.map((_, i) => i)
        
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === currentSessionId ? { ...s, selectedSlideIndices: allIndices } : s
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

      // Conversation compaction
      compactConversation: (sessionId, summary, upToIndex) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  compactedContext: summary,
                  compactedAt: Date.now(),
                  lastCompactedIndex: upToIndex,
                  messages: s.messages.map((msg, idx) =>
                    idx < upToIndex ? { ...msg, isCompacted: true } : msg
                  ),
                }
              : s
          ),
        })),

      getUncompactedMessages: () => {
        const { sessions, currentSessionId } = get()
        const session = sessions.find((s) => s.id === currentSessionId)
        if (!session) return []
        const lastCompactedIndex = session.lastCompactedIndex || 0
        return session.messages.slice(lastCompactedIndex)
      },

      clearCompaction: (sessionId) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  compactedContext: undefined,
                  compactedAt: undefined,
                  lastCompactedIndex: undefined,
                  messages: s.messages.map((msg) => ({ ...msg, isCompacted: false })),
                }
              : s
          ),
        })),
    }),
    {
      name: STORAGE_KEYS.SESSIONS,
      partialize: (state) => ({
        sessions: state.sessions.slice(0, MAX_PERSISTED_SESSIONS),
        currentSessionId: state.currentSessionId,
      }),
      merge: (persistedState, currentState) => {
        const p = persistedState as { sessions?: Session[]; currentSessionId?: string | null }
        const sessions = Array.isArray(p?.sessions)
          ? p.sessions.map((s) => ({ ...s, pinned: s.pinned === true }))
          : currentState.sessions
        return { ...currentState, ...p, sessions }
      },
    },
  ),
  {
    limit: 50,
    partialize: (state) => {
      // Only track session data for undo/redo, ignore transient UI state
      const { highlightedSlideIndex: _, processingSlideNumbers: __, ...rest } = state
      return rest
    },
    // Undo snapshots: all slide edits (updateSlide, deleteSlide, reorderSlides, setSessionSlides, etc.) go through set() and are tracked here.
    // Don't record "first creation" (0 → N slides) so Undo can't wipe the deck on first use
    diff: (pastState, currentState) => {
      const cid = (currentState as SessionState & { currentSessionId?: string | null }).currentSessionId
      if (!cid) return pastState as typeof currentState
      const pastSession = (pastState as { sessions?: Session[] })?.sessions?.find((s: Session) => s.id === cid)
      const currentSession = (currentState as { sessions?: Session[] })?.sessions?.find((s: Session) => s.id === cid)
      const pastSlides = pastSession?.slides?.length ?? 0
      const currentSlides = currentSession?.slides?.length ?? 0
      if (pastSlides === 0 && currentSlides > 0) return null
      return pastState as typeof currentState
    },
  },
  )
)
