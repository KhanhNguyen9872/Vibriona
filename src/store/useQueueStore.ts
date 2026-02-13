import { create } from 'zustand'
import { streamGenerate, type HistoryMessage } from '../api/generate'
import { useSettingsStore } from './useSettingsStore'
import { useSessionStore } from './useSessionStore'
import { extractCompletionMessage } from '../api/parseStream'
import type { Slide } from '../api/prompt'
import { toast } from 'sonner'

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
    // Security: Sanitize prompt input
    const sanitizedPrompt = prompt
      .replace(/\0/g, '')                         // Remove null bytes
      .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars (keep \n \r \t)
      .slice(0, 50000)                            // Max 50k chars

    const item: QueueItem = {
      id: crypto.randomUUID(),
      projectId,
      prompt: sanitizedPrompt,
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

    const settings = useSettingsStore.getState()
    const apiUrl = settings.getApiUrl()
    const apiKey = settings.getApiKey()
    const apiType = settings.getApiType()
    const selectedModel = settings.getModel()

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
      // FORCE SIMPLE IDs for LLM Context: "slide-1", "slide-2", etc.
      // This reduces token usage and confusion for the Bot.
      return slides.map(s => ({
        id: `slide-${s.slide_number}`, // <--- FORCE SIMPLE ID
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

    const abort = streamGenerate(apiUrl, apiKey, apiPrompt, selectedModel, apiType, {
      onToken: (fullText) => {
        get().updateItem(next.id, { streamingText: fullText })
      },
      onThinking: (thinkingText) => {
        get().updateItem(next.id, { thinkingText })
      },
      onResponseUpdate: (response) => {
        const { action, slides: newSlides, question, options, allowCustom, content, slide_ids, new_order } = response
        
        get().updateItem(next.id, { 
          slides: newSlides,
          responseAction: action as any,
          question, 
          options, 
          allowCustom,
          content,
          hasReceivedAction: true,
          slide_ids,
          new_order
        })
      },
      onDone: (fullText, slides, thinking, completionMessage) => {
        // 🐛 DEBUG: Log completion
        // console.log('✅ [Bot Generation Complete (Phase 1)]', {
        //   slidesCount: slides?.length ?? 0,
        //   hasThinking: !!thinking,
        //   completionMessage,
        //   fullTextLength: fullText?.length ?? 0
        // })

        const currentItem = get().items.find(i => i.id === next.id)
        let finalSlides = slides || []
        let finalAction = currentItem?.responseAction

        // 🛡️ PHASE 53: SALVAGE LOGIC
        // Check if completionMessage contains lost slides (Bot violated JSON protocol)
        let salvagedSlides: Slide[] = []
        
        if (completionMessage && completionMessage.trim().match(/^,?\s*[\{\[]/)) {
          // Looks like JSON (starts with { or [ or ,)          
          try {
            // 1. Clean up: Remove leading commas or whitespace
            let cleanJson = completionMessage.trim().replace(/^,/, '')
            
            // 2. Wrap in array if it looks like a single object or list of objects
            if (cleanJson.startsWith('{')) {
               // It might be "}, { ... }" list pattern. Try to wrap it.
               cleanJson = `[${cleanJson}]`
            }
            
            // 3. Parse
            const parsed = JSON.parse(cleanJson)
            
            if (Array.isArray(parsed) && parsed.length > 0 && (parsed[0].slide_number || parsed[0].title)) {
               salvagedSlides = parsed
            }
          } catch (e) {
            console.warn('⚠️ [Salvage] Failed to parse completion text:', e)
          }
        }

        // 🔄 MERGE SALVAGED DATA
        if (salvagedSlides.length > 0) {
          finalSlides = [...finalSlides, ...salvagedSlides]
          
          // If we found slides, the action CANNOT be 'info' or 'ask'. Force 'append' or 'update'
          if (finalAction === 'info' || finalAction === 'ask' || !finalAction) {
             finalAction = 'append'
             // Update the item state with the corrected action
             get().updateItem(next.id, { responseAction: 'append' })
          }
        }
        
        // 🔄 PHASE 52 & 54: RECURSIVE LOOP FOR 'INFO' ACTION
        // Only run if we didn't salvage slides (meaning we genuinely need info)
        if (finalAction === 'info' && finalSlides.length === 0) {
          
          // 1. Determine Target IDs
          let targetIds = currentItem?.slide_ids || []
          
          // 🛡️ PHASE 54: SMART FALLBACK: If Bot requested INFO but gave no IDs (or empty array), fetch ALL slides.
          if (targetIds.length === 0) {
            const projectSession = useSessionStore.getState().sessions.find(s => s.id === next.projectId)
            if (projectSession?.slides) {
              targetIds = projectSession.slides.map(s => s.id || `slide-${s.slide_number}`)
            }
          }

          // 2. Execute Recursion if we have targets
          if (targetIds.length > 0) {
            // Retrieve Data
            const projectSession = useSessionStore.getState().sessions.find(s => s.id === next.projectId)
            const allSlides = projectSession?.slides || []
            const requestedSlides = allSlides.filter(s => {
              // 🛡️ PHASE 56: ROBUST ID MATCHING
              // Check BOTH the UUID and the 'slide-N' format
               const simpleId = `slide-${s.slide_number}`
               return (s.id && targetIds.includes(s.id)) || targetIds.includes(simpleId)
            })

            // 2. Get Original Intent
            const originalUserRequest = currentItem?.prompt || "User request unavailable"

            // 3. Construct ENHANCED Hidden Payload
            const hiddenPayload = `[SYSTEM: DATA_RETRIEVAL_RESULT]
Here is the FULL CONTENT of the slides you requested (or all slides):
${JSON.stringify(requestedSlides, null, 2)}

[CRITICAL INSTRUCTION]: 
1. The user's ORIGINAL REQUEST was: "${originalUserRequest}"
2. You now have the full context required to fulfill this request.
3. **DO NOT** reply with "I have received the data".
4. **IMMEDIATELY** generate the JSON for the next logical action (e.g., "sort", "update", or "append").
5. If the user asked to reorder, use 'action': 'sort' with the 'new_order' array.`

            // Update History (Append the Bot's "info" request AND the System's "data" response)
            // Ensure we append the actual text generated by the bot as the assistant response
            // If bot provided no IDs originally, we might want to synthesize the info request in history 
            // but relying on fullText is usually safer if it exists. 
            // If fullText is empty (edge case), we synthesize a proper info output.
            const infoMessageContent = fullText || JSON.stringify({ action: 'info', slide_ids: targetIds })

            const newHistory: HistoryMessage[] = [
              ...history, 
              { role: 'assistant', content: infoMessageContent },
              { role: 'user', content: hiddenPayload }
            ]

            // Update UI State (Keep it "Thinking...")
            get().updateItem(next.id, { 
              thinkingText: "Reading slide details...",
              status: 'processing' // Keep it processing
            })

            // Re-trigger Stream (Recursive Call)
            const newAbort = streamGenerate(apiUrl, apiKey, '', selectedModel, apiType, {
              onToken: (t) => get().updateItem(next.id, { streamingText: t }),
              onThinking: (t) => get().updateItem(next.id, { thinkingText: t }),
              onResponseUpdate: (res) => {
                 // Handle the NEXT action (e.g., 'sort' or 'update')
                 const { action, slides, question, options, allowCustom, content, slide_ids, new_order } = res
                 get().updateItem(next.id, { 
                   slides,
                   responseAction: action as any, 
                   question,
                   options,
                   allowCustom,
                   content,
                   hasReceivedAction: true,
                   slide_ids, // In case it asks for info again (rare but possible)
                   new_order 
                 })
              },
              onDone: (ft, s, th, cm) => {
                // Finally complete the item
                get().completeActive(next.id, ft, s, th, cm)
              },
              onError: (err) => {
                get().failActive(next.id, err)
                if (err.includes('CORS Error')) {
                  toast.error(err)
                }
              }
            }, newHistory)

            // Update active controller
            set(state => ({ activeAborts: { ...state.activeAborts, [next.projectId]: newAbort } }))
            
            return // 🛑 EXIT here, do not call completeActive() for the 'info' step
          }
        }

        // 🛑 FINAL FALLBACK: If 'info' but NO IDs and NO Slides -> Fail gracefully
        if (finalAction === 'info' && finalSlides.length === 0) {
          console.warn('🛑 [Error] Bot returned INFO but gave no IDs and no Slides.')
          get().failActive(next.id, "AI Error: The system could not retrieve the requested information.")
          return
        }

        get().completeActive(next.id, fullText, finalSlides, thinking, completionMessage)
      },
      onError: (error) => {
        get().failActive(next.id, error)
        if (error.includes('CORS Error')) {
          toast.error(error)
        }
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
      const currentSession = useSessionStore.getState().getCurrentSession()
      const beforeSlides = currentSession?.slides || []
      
      // Reorder the slides
      useSessionStore.getState().reorderSlidesByIds(item.new_order)
      
      // Get the new order to compare
      const afterSlides = useSessionStore.getState().getCurrentSession()?.slides || []
      
      // Find which slides moved
      const movements: string[] = []
      beforeSlides.forEach((slide: any, oldIndex: number) => {
        const newIndex = afterSlides.findIndex(s => (s.id || `slide-${s.slide_number}`) === (slide.id || `slide-${slide.slide_number}`))
        if (newIndex !== -1 && newIndex !== oldIndex) {
          movements.push(`**${slide.title}** (${oldIndex + 1} → ${newIndex + 1})`)
        }
      })
      
      const message = movements.length > 0
        ? `I have reordered the slides:\n${movements.join('\n')}`
        : 'I have reordered the slides for better flow.'
      
      useSessionStore.getState().addMessage({
        role: 'assistant',
        content: message,
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
