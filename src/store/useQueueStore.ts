import { create } from 'zustand'
import { streamGenerate, type HistoryMessage } from '../api/generate'
import { useSettingsStore } from './useSettingsStore'
import { useSessionStore } from './useSessionStore'
import { extractCompletionMessage } from '../api/parseStream'
import type { Slide } from '../api/prompt'

export interface QueueItem {
  id: string
  projectId: string
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
  responseAction?: 'create' | 'update' | 'append' | 'delete' | 'ask' | 'response' | 'info' | 'sort'
  // Fields for ask action
  question?: string
  options?: string[]
  allowCustom?: boolean
  // Field for response action
  content?: string
  // Fields for info action
  slide_ids?: string[]
  // Fields for sort action
  new_order?: string[]
  hasReceivedAction?: boolean // Track when action type is known from stream
}

interface QueueState {
  items: QueueItem[]
  activeProcesses: Record<string, QueueItem>
  activeAborts: Record<string, AbortController>
  addToQueue: (prompt: string, projectId: string, contextSlides?: Slide[]) => void
  processNext: () => void
  updateItem: (id: string, patch: Partial<QueueItem>) => void
  completeActive: (id: string, result: string, slides: Slide[], thinking: string, completionMessage: string) => void
  failActive: (id: string, error: string) => void
  cancelActive: () => void
  cancelProjectProcess: (projectId: string) => void
  clearItems: () => void
  // Helper methods
  getActiveProcessForProject: (projectId: string) => QueueItem | null
  isProjectProcessing: (projectId: string) => boolean
  // Legacy compatibility
  isProcessing: boolean
}

export const useQueueStore = create<QueueState>()((set, get) => ({
  items: [],
  activeProcesses: {},
  activeAborts: {},

  addToQueue: (prompt, projectId, contextSlides) => {
    const item: QueueItem = {
      id: crypto.randomUUID(),
      projectId,
      prompt,
      status: 'queued',
      contextSlides,
      contextSlideNumbers: contextSlides?.map((s) => s.slide_number),
    }
    set((state) => ({ items: [...state.items, item] }))

    // Start processing if this project is not already processing
    if (!get().activeProcesses[projectId]) {
      setTimeout(() => get().processNext(), 0)
    }
  },

  processNext: () => {
    const { items, activeProcesses } = get()

    // Find next queued item whose project is not already processing
    const next = items.find((i) => i.status === 'queued' && !activeProcesses[i.projectId])
    if (!next) return

    const { apiUrl, apiKey, selectedModel } = useSettingsStore.getState()

    // Build conversation history from the project's session (sliding window of 10)
    const sessions = useSessionStore.getState().sessions
    const projectSession = sessions.find(s => s.id === next.projectId)
    const history: HistoryMessage[] = (projectSession?.messages ?? [])
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

    // Mark item as processing and add to activeProcesses
    const processingItem = { ...next, status: 'processing' as const, streamingText: '', thinkingText: '' }
    set((state) => ({
      activeProcesses: { ...state.activeProcesses, [next.projectId]: processingItem },
      items: state.items.map((i) =>
        i.id === next.id ? processingItem : i
      ),
    }))

    // Build the actual API prompt with SKELETON CONTEXT STRATEGY
    let apiPrompt = next.prompt
    
    // Helper: Build skeleton list (ID + Title only)
    const buildSkeletonList = (slides: Slide[]) => {
      return slides.map(s => ({
        id: s.id || `slide-${s.slide_number}`,
        slide_number: s.slide_number,
        title: s.title,
        // Omit: content, speaker_notes, visual_description, etc.
      }))
    }

    if (next.contextSlides && next.contextSlides.length > 0) {
      // Targeted edit: user selected specific slides
      // Send skeleton for ALL slides + full details for SELECTED slides only
      const skeleton = buildSkeletonList(projectSession?.slides || [])
      const fullDetailsForSelected = next.contextSlides
      
      apiPrompt = `[SYSTEM_STATE: EXISTING_PROJECT_ACTIVE]
[PROJECT_STRUCTURE (IDs & Titles Only)]:
${JSON.stringify(skeleton, null, 2)}

[DETAILED_CONTEXT_FOR_SELECTED_SLIDES]:
${JSON.stringify(fullDetailsForSelected, null, 2)}

[CONTEXT: The user has selected specific slides to modify. Apply changes ONLY to these slides based on the instruction below. Return the modified slides as a JSON array with the same structure. Preserve their slide_number values exactly.]

USER INSTRUCTION: ${next.prompt}`
    } else if (projectSession?.slides && projectSession.slides.length > 0) {
      // Full edit mode: slides exist, user wants to refine
      // Send ONLY skeleton for all slides (token optimization!)
      const skeleton = buildSkeletonList(projectSession.slides)
      
      apiPrompt = `[SYSTEM_STATE: EXISTING_PROJECT_ACTIVE]
[PROJECT_STRUCTURE (IDs & Titles Only)]:
${JSON.stringify(skeleton, null, 2)}

USER REQUEST: ${next.prompt}`
    }

    const abort = streamGenerate(apiUrl, apiKey, apiPrompt, selectedModel, {
      onToken: (fullText) => {
        get().updateItem(next.id, { streamingText: fullText })
      },
      onThinking: (thinkingText) => {
        get().updateItem(next.id, { thinkingText })
      },
      onResponseUpdate: (response) => {
        // Extract all fields from the response object
        const { action, slides, question, options, allowCustom, content, slide_ids, new_order } = response

        // 🐛 DEBUG: Log full bot response
        // console.log('🤖 [Bot Response Update]', {
        //   action,
        //   slidesCount: slides?.length ?? 0,
        //   hasQuestion: !!question,
        //   hasOptions: !!options,
        //   hasContent: !!content,
        //   slide_ids,
        //   new_order,
        //   fullResponse: response
        // })

        // Store all relevant data in the queue item for UI components to consume
        get().updateItem(next.id, {
          slides,
          responseAction: action as any,
          question,
          options,
          allowCustom,
          content,
          hasReceivedAction: true, // Mark that action has been detected
          slide_ids, // Store for 'info' action
          new_order, // Store for 'sort' action
        })

        // 📥 PHASE 49: Handle "info" action (Data Retrieval Protocol)
        if (action === 'info' && slide_ids && slide_ids.length > 0) {
          const requestedIds = slide_ids
          const allSlides = projectSession?.slides || []
          const fullSlides = allSlides.filter(s => 
            requestedIds.includes(s.id || `slide-${s.slide_number}`)
          )
          
          // Construct hidden system message with full slide data
          const hiddenPrompt = `[SYSTEM: DATA_RETRIEVAL_RESULT]
Here are the full details you requested:
${JSON.stringify(fullSlides, null, 2)}

NOW, perform the user's original request based on this data.`
          
          // Re-submit with full context (append to history)
          const extendedHistory: HistoryMessage[] = [
            ...history,
            { role: 'assistant', content: JSON.stringify({ action: 'info', slide_ids }) },
            { role: 'user', content: hiddenPrompt }
          ]
          
          // Re-trigger stream generation with extended history
          const resubmitAbort = streamGenerate(apiUrl, apiKey, '', selectedModel, {
            onToken: (fullText) => get().updateItem(next.id, { streamingText: fullText }),
            onThinking: (thinkingText) => get().updateItem(next.id, { thinkingText }),
            onResponseUpdate: (response) => {
              const { action, slides, question, options, allowCustom, content, slide_ids, new_order } = response
              get().updateItem(next.id, {
                slides,
                responseAction: action as any,
                question,
                options,
                allowCustom,
                content,
                hasReceivedAction: true,
                slide_ids,
                new_order,
              })
            },
            onDone: (fullText, slides, thinking, completionMessage) => {
              get().completeActive(next.id, fullText, slides, thinking, completionMessage)
            },
            onError: (error) => get().failActive(next.id, error)
          }, extendedHistory)
          
          // Update abort controller
          set((state) => ({ activeAborts: { ...state.activeAborts, [next.projectId]: resubmitAbort } }))
          return // Exit early, wait for resubmit to complete
        }
      },
      onDone: (fullText, slides, thinking, completionMessage) => {
        // 🐛 DEBUG: Log completion
        // console.log('✅ [Bot Generation Complete]', {
        //   slidesCount: slides?.length ?? 0,
        //   hasThinking: !!thinking,
        //   completionMessage,
        //   fullTextLength: fullText?.length ?? 0
        // })

        get().completeActive(next.id, fullText, slides, thinking, completionMessage)
      },
      onError: (error) => {
        get().failActive(next.id, error)
      },
    }, history)

    set((state) => ({ activeAborts: { ...state.activeAborts, [next.projectId]: abort } }))
  },

  updateItem: (id, patch) => {
    set((state) => {
      // 1. Update the item in the list
      const newItems = state.items.map((i) =>
        i.id === id ? { ...i, ...patch } : i
      )

      // 2. Also update the corresponding project's active process if it matches
      // This is critical for UI components that subscribe to activeProcesses (like ScriptWorkspace)
      const targetItem = state.items.find((i) => i.id === id)
      let newActiveProcesses = state.activeProcesses

      if (targetItem && state.activeProcesses[targetItem.projectId]?.id === id) {
        newActiveProcesses = {
          ...state.activeProcesses,
          [targetItem.projectId]: { ...state.activeProcesses[targetItem.projectId], ...patch }
        }
      }

      return {
        items: newItems,
        activeProcesses: newActiveProcesses,
      }
    })
  },

  completeActive: (id, result, slides, thinking, completionMessage) => {
    const item = get().items.find(i => i.id === id)
    if (!item) return

    const { activeProcesses, activeAborts } = get()
    const newActiveProcesses = { ...activeProcesses }
    const newActiveAborts = { ...activeAborts }
    delete newActiveProcesses[item.projectId]
    delete newActiveAborts[item.projectId]

    set((state) => ({
      activeProcesses: newActiveProcesses,
      activeAborts: newActiveAborts,
      items: state.items.map((i) =>
        i.id === id ? { ...i, status: 'done' as const, result, slides, thinking: thinking || undefined, completionMessage: completionMessage || undefined, streamingText: undefined, thinkingText: undefined } : i
      ),
    }))

    // 💬 If action is "response", create a chat message with the content
    if (item.responseAction === 'response' && item.content) {
      useSessionStore.getState().addMessage({
        role: 'assistant',
        content: item.content,
        timestamp: Date.now(),
        isScriptGeneration: false
      })
    }

    // ❓ If action is "ask", create an interactive clarification message
    if (item.responseAction === 'ask' && item.question) {
      useSessionStore.getState().addMessage({
        role: 'assistant',
        content: item.question, // Fallback text
        timestamp: Date.now(),
        isScriptGeneration: false,
        isInteractive: true,
        clarification: {
          question: item.question,
          options: item.options || [],
          allowCustom: item.allowCustom
        }
      })
    }

    // 🔀 PHASE 50: If action is "sort", reorder slides based on new_order
    if (item.responseAction === 'sort' && item.new_order && item.new_order.length > 0) {
      useSessionStore.getState().reorderSlidesByIds(item.new_order)
      useSessionStore.getState().addMessage({
        role: 'assistant',
        content: 'I have reordered the slides for better flow.',
        timestamp: Date.now(),
        isScriptGeneration: false
      })
    }

    useSessionStore.getState().clearProcessingSlides()

    setTimeout(() => get().processNext(), 0)
  },

  failActive: (id, error) => {
    const item = get().items.find(i => i.id === id)
    if (!item) return

    const { activeProcesses, activeAborts } = get()
    const newActiveProcesses = { ...activeProcesses }
    const newActiveAborts = { ...activeAborts }
    delete newActiveProcesses[item.projectId]
    delete newActiveAborts[item.projectId]

    set((state) => ({
      activeProcesses: newActiveProcesses,
      activeAborts: newActiveAborts,
      items: state.items.map((i) =>
        i.id === id ? { ...i, status: 'error' as const, error, streamingText: undefined, thinkingText: undefined } : i
      ),
    }))

    useSessionStore.getState().clearProcessingSlides()

    setTimeout(() => get().processNext(), 0)
  },

  cancelActive: () => {
    // Legacy method: cancel all active processes
    const { activeAborts } = get()
    Object.values(activeAborts).forEach(abort => abort.abort())

    set((state) => ({
      activeProcesses: {},
      activeAborts: {},
      items: state.items.map((i) =>
        i.status === 'processing' ? { ...i, status: 'error' as const, error: 'Cancelled', streamingText: undefined, thinkingText: undefined } : i
      ),
    }))

    useSessionStore.getState().clearProcessingSlides()

    setTimeout(() => get().processNext(), 0)
  },

  cancelProjectProcess: (projectId) => {
    const { activeAborts, activeProcesses } = get()
    const abort = activeAborts[projectId]
    if (abort) abort.abort()

    const activeItem = activeProcesses[projectId]
    if (!activeItem) return

    const newActiveProcesses = { ...activeProcesses }
    const newActiveAborts = { ...activeAborts }
    delete newActiveProcesses[projectId]
    delete newActiveAborts[projectId]

    set((state) => ({
      activeProcesses: newActiveProcesses,
      activeAborts: newActiveAborts,
      items: state.items.map((i) =>
        i.id === activeItem.id ? { ...i, status: 'error' as const, error: 'Cancelled', streamingText: undefined, thinkingText: undefined } : i
      ),
    }))

    useSessionStore.getState().clearProcessingSlides()

    setTimeout(() => get().processNext(), 0)
  },

  clearItems: () => {
    const { activeAborts } = get()
    Object.values(activeAborts).forEach(abort => abort.abort())
    set({ items: [], activeProcesses: {}, activeAborts: {} })
  },

  // Helper methods
  getActiveProcessForProject: (projectId) => {
    return get().activeProcesses[projectId] || null
  },

  isProjectProcessing: (projectId) => {
    return !!get().activeProcesses[projectId]
  },

  // Legacy compatibility getter
  get isProcessing() {
    return Object.keys(get().activeProcesses).length > 0
  },
}))
