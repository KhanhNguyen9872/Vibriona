import { create } from 'zustand'
import { streamGenerate, type HistoryMessage } from '../api/generate'
import { useSettingsStore } from './useSettingsStore'
import { useSessionStore } from './useSessionStore'
import { extractCompletionMessage } from '../api/parseStream'
import type { Slide } from '../api/prompt'

export interface QueueItem {
  id: string
  prompt: string
  status: 'queued' | 'processing' | 'done' | 'error'
  streamingText?: string
  thinkingText?: string
  slides?: Slide[]
  result?: string
  thinking?: string
  completionMessage?: string
  error?: string
  contextSlides?: Slide[]
  contextSlideNumbers?: number[]
  responseAction?: 'create' | 'update' | 'append'
}

interface QueueState {
  items: QueueItem[]
  isProcessing: boolean
  activeAbort: AbortController | null
  addToQueue: (prompt: string, contextSlides?: Slide[]) => void
  processNext: () => void
  updateItem: (id: string, patch: Partial<QueueItem>) => void
  completeActive: (id: string, result: string, slides: Slide[], thinking: string, completionMessage: string) => void
  failActive: (id: string, error: string) => void
  cancelActive: () => void
  clearItems: () => void
}

export const useQueueStore = create<QueueState>()((set, get) => ({
  items: [],
  isProcessing: false,
  activeAbort: null,

  addToQueue: (prompt, contextSlides) => {
    const item: QueueItem = {
      id: crypto.randomUUID(),
      prompt,
      status: 'queued',
      contextSlides,
      contextSlideNumbers: contextSlides?.map((s) => s.slide_number),
    }
    set((state) => ({ items: [...state.items, item] }))

    if (!get().isProcessing) {
      setTimeout(() => get().processNext(), 0)
    }
  },

  processNext: () => {
    const { items, isProcessing } = get()
    if (isProcessing) return

    const next = items.find((i) => i.status === 'queued')
    if (!next) return

    const { apiUrl, apiKey, selectedModel } = useSettingsStore.getState()

    // Build conversation history from current session (sliding window of 10)
    const session = useSessionStore.getState().getCurrentSession()
    const history: HistoryMessage[] = (session?.messages ?? [])
      .slice(-10)
      .map((msg) => {
        let content = msg.content
        // For assistant script-generation messages, provide a compact summary
        // instead of raw JSON to save tokens
        if (msg.role === 'assistant' && msg.isScriptGeneration && msg.slides && msg.slides.length > 0) {
          const afterJson = extractCompletionMessage(msg.content)
          const slideList = msg.slides.map((s) => `${s.slide_number}. ${s.title}`).join(', ')
          content = afterJson
            ? `${afterJson}\n[Slides: ${slideList}]`
            : `Generated ${msg.slides.length} slides: ${slideList}`
        }
        return { role: msg.role, content }
      })

    set((state) => ({
      isProcessing: true,
      items: state.items.map((i) =>
        i.id === next.id ? { ...i, status: 'processing' as const, streamingText: '', thinkingText: '' } : i
      ),
    }))

    // Build the actual API prompt
    let apiPrompt = next.prompt
    if (next.contextSlides && next.contextSlides.length > 0) {
      // Targeted edit: user selected specific slides
      const selectedContent = next.contextSlides
        .map((s) => JSON.stringify(s))
        .join('\n')
      apiPrompt = `[CONTEXT: The user has selected specific slides to modify. Apply changes ONLY to these slides based on the instruction below. Return the modified slides as a JSON array with the same structure. Preserve their slide_number values exactly.]\n\n--- SELECTED SLIDES ---\n${selectedContent}\n-----------------------\n\nUSER INSTRUCTION: ${next.prompt}`
    } else if (session?.slides && session.slides.length > 0) {
      // Full edit mode: slides exist, user wants to refine
      apiPrompt = `CURRENT SLIDES JSON:\n${JSON.stringify(session.slides)}\n\nUSER REQUEST: ${next.prompt}`
    }

    const abort = streamGenerate(apiUrl, apiKey, apiPrompt, selectedModel, {
      onToken: (fullText) => {
        get().updateItem(next.id, { streamingText: fullText })
      },
      onThinking: (thinkingText) => {
        get().updateItem(next.id, { thinkingText })
      },
      onResponseUpdate: (action: any, slides) => {
        // Delta Update Logic:
        // We receive the "delta" (slides usually containing the new/changed ones)
        // We store the RAW slides from the stream in 'slides' property for now?
        // NO. ScriptWorkspace uses 'activeItem.slides' to render.
        // If we just store the partial delta there, ScriptWorkspace will flicker if it expects full.
        // BUT Step 2 says: "ScriptWorkspace needs to track responseAction".
        
        // Wait, if 'slides' in queue item is just the incoming ones, ScriptWorkspace needs to know how to merge them?
        // OR should we merge them HERE in the store so 'activeItem.slides' is always the FULL view?
        // The Plan said: "Update `ScriptWorkspace.tsx` to handle visual feedback based on `action`."
        // And "Logic Update: The `mergeSlides` Utility" in Phase 31 was about merging in frontend.
        
        // However, Phase 33 says: "Update `utils/slideMerger.ts` to implement `applyDelta`... Update `store/useQueueStore.ts` to use `applyDelta`"
        
        // Let's decide: QueueItem.slides should probably hold the ACCUMULATED/MERGED result or the RAW stream?
        // If we hold merged result, ScriptWorkspace is simple (just display).
        // If we hold raw stream, ScriptWorkspace must merge every render.
        
        // Given `applyDelta` takes (current, delta) -> newSlides, it suggests we should maintain the FULL state in QueueItem if possible,
        // OR we just store the incoming delta and let ScriptWorkspace merge it with Session slides?
        
        // ScriptWorkspace currently does: `mergeSlides(sessionSlides, streamingSlides)`
        // If streamingSlides is just the delta, `mergeSlides` (from Phase 31) handles overlay.
        // `applyDelta` (Phase 33) handles 'create' vs 'append' vs 'update'.
        
        // Let's store the RAW incoming slides (slide list from stream) in `items.slides`
        // AND store the action in `items.responseAction`.
        // ScriptWorkspace will use `applyDelta(sessionSlides, { action, slides: streamingSlides })`.
        
        get().updateItem(next.id, { slides, responseAction: action })
      },
      onDone: (fullText, slides, thinking, completionMessage) => {
        get().completeActive(next.id, fullText, slides, thinking, completionMessage)
      },
      onError: (error) => {
        get().failActive(next.id, error)
      },
    }, history)

    set({ activeAbort: abort })
  },

  updateItem: (id, patch) => {
    set((state) => ({
      items: state.items.map((i) =>
        i.id === id ? { ...i, ...patch } : i
      ),
    }))
  },

  completeActive: (id, result, slides, thinking, completionMessage) => {
    set((state) => ({
      isProcessing: false,
      activeAbort: null,
      items: state.items.map((i) =>
        i.id === id ? { ...i, status: 'done' as const, result, slides, thinking: thinking || undefined, completionMessage: completionMessage || undefined, streamingText: undefined, thinkingText: undefined } : i
      ),
    }))

    useSessionStore.getState().clearProcessingSlides()

    setTimeout(() => get().processNext(), 0)
  },

  failActive: (id, error) => {
    set((state) => ({
      isProcessing: false,
      activeAbort: null,
      items: state.items.map((i) =>
        i.id === id ? { ...i, status: 'error' as const, error, streamingText: undefined, thinkingText: undefined } : i
      ),
    }))

    useSessionStore.getState().clearProcessingSlides()

    setTimeout(() => get().processNext(), 0)
  },

  cancelActive: () => {
    const { activeAbort } = get()
    if (activeAbort) activeAbort.abort()

    set((state) => ({
      isProcessing: false,
      activeAbort: null,
      items: state.items.map((i) =>
        i.status === 'processing' ? { ...i, status: 'error' as const, error: 'Cancelled', streamingText: undefined, thinkingText: undefined } : i
      ),
    }))

    useSessionStore.getState().clearProcessingSlides()

    setTimeout(() => get().processNext(), 0)
  },

  clearItems: () => {
    const { activeAbort } = get()
    if (activeAbort) activeAbort.abort()
    set({ items: [], isProcessing: false, activeAbort: null })
  },
}))
