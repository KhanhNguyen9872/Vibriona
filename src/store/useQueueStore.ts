import { create } from 'zustand'
import { streamGenerate, type HistoryMessage } from '../api/generate'
import { compactConversation } from '../api/compact'
import { API_CONFIG } from '../config/api'
import { useSettingsStore } from './useSettingsStore'
import { useSessionStore, type ChatMessage } from './useSessionStore'
import { extractCompletionMessage } from '../api/parseStream'
import type { Slide } from '../api/prompt'
import { getSystemPrompt } from '../api/prompt'
import { toast } from 'sonner'
import i18n from '../i18n'

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
  responseAction?: 'create' | 'update' | 'append' | 'delete' | 'ask' | 'response' | 'info' | 'batch'
  // Fields for ask action
  question?: string
  options?: string[]
  allowCustom?: boolean
  // Field for response action
  content?: string
  // Fields for info action
  slide_numbers?: number[]
  // Fields for batch action
  operations?: any[]
  hasReceivedAction?: boolean // Track when action type is known from stream
  /** Attached files (text + image) for the user message; images are sent as userImages to API */
  attachedFiles?: { name: string; content: string; type?: 'text' | 'image'; mimeType?: string }[]
  /** ID of user message in session (for cancel queue) */
  messageId?: string
  /** ID of transient thinking message (inserted when processing starts) */
  thinkingMessageId?: string
}

interface QueueState {
  items: QueueItem[]
  activeProcesses: Record<string, QueueItem>
  activeAborts: Record<string, AbortController>
  addToQueue: (prompt: string, projectId: string, contextSlides?: Slide[], attachedFiles?: QueueItem['attachedFiles'], messageId?: string) => void
  processNext: () => void
  updateItem: (id: string, patch: Partial<QueueItem>) => void
  completeActive: (id: string, result: string, slides: Slide[], thinking: string, completionMessage: string) => void
  failActive: (id: string, error: string) => void
  cancelActive: () => void
  cancelProjectProcess: (projectId: string) => void
  clearItems: () => void
  removeQueueItem: (itemId: string) => void
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

  addToQueue: (prompt, projectId, contextSlides, attachedFiles, messageId) => {
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
      attachedFiles,
      messageId,
    }
    set((state) => ({ items: [...state.items, item] }))

    // Start processing if this project is not already processing
    if (!get().activeProcesses[projectId]) {
      setTimeout(() => get().processNext(), 0)
    }
  },

  processNext: async () => {
    const { items, activeProcesses } = get()

    // Find next queued item whose project is not already processing
    const next = items.find((i) => i.status === 'queued' && !activeProcesses[i.projectId])
    if (!next) return

    const settings = useSettingsStore.getState()
    const apiUrl = settings.getApiUrl()
    const apiKey = settings.getApiKey()
    const apiType = settings.getApiType()
    const selectedModel = settings.getModel()
    const systemPrompt = getSystemPrompt(settings.getSystemPromptType())

    const sessionStore = useSessionStore.getState()
    const sessions = sessionStore.sessions
    const projectSession = sessions.find(s => s.id === next.projectId)
    
    // Check if compaction is needed
    const messages = projectSession?.messages ?? []
    const uncompactedMessages = projectSession?.lastCompactedIndex 
      ? messages.slice(projectSession.lastCompactedIndex)
      : messages
    
    // Trigger compaction if uncompacted messages >= threshold
    const shouldCompact = uncompactedMessages.length >= API_CONFIG.COMPACTION_THRESHOLD
    
    if (shouldCompact && projectSession) {
      // Show compaction indicator
      const compactingMsgId = sessionStore.addMessage({
        role: 'assistant',
        content: i18n.t('chat.compacting'),
        timestamp: Date.now(),
        isScriptGeneration: false,
        isThinking: true,
        isCompactionPlaceholder: true,
        compactionPhase: 'compacting',
      })

      try {
        // Messages to compact: all 10 uncompacted messages (no safety buffer)
        const messagesToCompact = uncompactedMessages.slice(0, API_CONFIG.COMPACTION_THRESHOLD)
        
        // If we have existing compacted context, prepend it
        const messagesToSummarize = projectSession.compactedContext
          ? [
              {
                id: 'compact-previous',
                role: 'assistant' as const,
                content: `[Previous summary: ${projectSession.compactedContext}]`,
                timestamp: 0,
                isScriptGeneration: false,
              },
              ...messagesToCompact
            ]
          : messagesToCompact
        
        await new Promise<void>((resolve, reject) => {
          compactConversation(
            messagesToSummarize,
            apiUrl,
            apiKey,
            selectedModel,
            apiType,
            {
              onComplete: (summary) => {
                // Save new compacted summary (includes old compact + new messages)
                const newCompactedIndex = projectSession.lastCompactedIndex 
                  ? projectSession.lastCompactedIndex + messagesToCompact.length
                  : messagesToCompact.length
                
                sessionStore.compactConversation(next.projectId, summary, newCompactedIndex)
                
                // Replace compaction indicator with completion message (shown in compact status UI)
                sessionStore.updateMessage(compactingMsgId, {
                  content: i18n.t('chat.compacted'),
                  isThinking: false,
                  compactionPhase: 'compacted',
                })
                resolve()
              },
              onError: (error) => {
                // Remove compaction indicator on error (hide from UI by clearing phase)
                sessionStore.updateMessage(compactingMsgId, {
                  content: '',
                  isThinking: false,
                  compactionPhase: undefined,
                })
                reject(error)
              }
            }
          )
        })

        // Refresh session after compaction
        const updatedSession = useSessionStore.getState().sessions.find(s => s.id === next.projectId)
        if (updatedSession) {
          Object.assign(projectSession, updatedSession)
        }
      } catch (error) {
        console.warn('Compaction failed, continuing with normal processing:', error)
      }
    }

    // Helper: get content for API history (user messages with attachedFiles get full content)
    const getMessageContentForHistory = (msg: ChatMessage): string => {
      let content = msg.content ?? ''
      if (msg.role === 'user' && msg.attachedFiles && msg.attachedFiles.length > 0) {
        const filesPart = msg.attachedFiles
          .map((f) => (f.type === 'image' ? `[Attached image: ${f.name}]` : `[From file: ${f.name}]\n\n${f.content}`))
          .join('\n\n')
        content = content.trim() ? `${content}\n\n${filesPart}` : filesPart
      }
      if (msg.role === 'assistant' && msg.isScriptGeneration && msg.slides && msg.slides.length > 0) {
        const afterJson = extractCompletionMessage(msg.content ?? '')
        const slideList = msg.slides.map((s) => `${s.slide_number}. ${s.title}`).join(', ')
        content = afterJson
          ? `${afterJson}\n[Slides: ${slideList}]`
          : `Generated ${msg.slides.length} slides: ${slideList}`
      }
      return content
    }

    // Build conversation history - use compacted context if available
    let history: HistoryMessage[] = []

    if (projectSession?.compactedContext) {
      // Use compacted summary + all recent messages after compaction
      const lastCompactedIndex = projectSession.lastCompactedIndex || 0
      const recentMessages = messages.slice(lastCompactedIndex)

      history = [
        { role: 'assistant', content: `[Previous conversation summary: ${projectSession.compactedContext}]` },
        ...recentMessages.map((msg) => ({
          role: msg.role,
          content: getMessageContentForHistory(msg)
        }))
      ]
    } else {
      // Normal sliding window (last 10 messages)
      history = messages
        .slice(-10)
        .map((msg) => ({
          role: msg.role,
          content: getMessageContentForHistory(msg)
        }))
    }

    // Mark item as processing and add to activeProcesses
    const processingItem = { ...next, status: 'processing' as const, streamingText: '', thinkingText: '' }
    set((state) => ({
      activeProcesses: { ...state.activeProcesses, [next.projectId]: processingItem },
      items: state.items.map((i) =>
        i.id === next.id ? processingItem : i
      ),
    }))

    // Clear isPending and add thinking message (anchored after parent user message)
    const session = sessionStore.sessions.find((s) => s.id === next.projectId)
    if (session) {
      // Safety net: remove any orphaned thinking bubbles (not compaction placeholders) so we never have more than one
      session.messages.forEach((m) => {
        if (m.isThinking && !m.isCompactionPlaceholder) {
          sessionStore.deleteMessage(m.id)
        }
      })
      const sessionAfterCleanup = sessionStore.sessions.find((s) => s.id === next.projectId)
      const messagesAfterCleanup = sessionAfterCleanup?.messages ?? []
      const parentMsg = next.messageId
        ? messagesAfterCleanup.find((m) => m.id === next.messageId)
        : messagesAfterCleanup.find((m) => m.role === 'user' && m.isPending)
      if (parentMsg) {
        sessionStore.updateMessage(parentMsg.id, { isPending: false })
        const thinkingMsgId = sessionStore.insertMessageAfter(
          parentMsg.id,
          {
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            isScriptGeneration: false,
            isThinking: true,
          },
          next.projectId
        )
        get().updateItem(next.id, { thinkingMessageId: thinkingMsgId })
      }
    }

    // Build the actual API prompt with SKELETON CONTEXT STRATEGY
    let apiPrompt = next.prompt
    
    // Helper: Build skeleton list (ID + Title only)
    const buildSkeletonList = (slides: Slide[]) => {
      // Return only slide_number and title for token optimization
      return slides.map(s => ({
        slide_number: s.slide_number,
        title: s.title,
      }))
    }

    if (next.contextSlides && next.contextSlides.length > 0) {
      // Targeted edit: user selected specific slides
      // Send skeleton for ALL slides + full details for SELECTED slides only
      const skeleton = buildSkeletonList(projectSession?.slides || [])
      const fullDetailsForSelected = next.contextSlides
      
      apiPrompt = `[SYSTEM_STATE: EXISTING_PROJECT_ACTIVE]
[PROJECT_STRUCTURE (Numbers & Titles Only)]:
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
[PROJECT_STRUCTURE (Numbers & Titles Only)]:
${JSON.stringify(skeleton, null, 2)}

USER REQUEST: ${next.prompt}`
    }

    // Build userImages from attached image files (base64 without data URL prefix for API)
    const userImages = (next.attachedFiles ?? [])
      .filter((f): f is typeof f & { type: 'image' } => f.type === 'image')
      .map((f) => {
        const base64 = f.content.startsWith('data:') ? f.content.replace(/^data:image\/[^;]+;base64,/, '') : f.content
        return { base64, mimeType: f.mimeType || 'image/jpeg' }
      })

    const abort = streamGenerate(apiUrl, apiKey, apiPrompt, selectedModel, apiType, {
      onToken: (fullText) => {
        get().updateItem(next.id, { streamingText: fullText })
      },
      onThinking: (thinkingText) => {
        get().updateItem(next.id, { thinkingText })
      },
      onResponseUpdate: (response) => {
        const { action, slides: newSlides, question, options, allowCustom, content, slide_numbers, operations } = response
        
        get().updateItem(next.id, { 
          slides: newSlides,
          responseAction: action as any,
          question, 
          options, 
          allowCustom,
          content,
          hasReceivedAction: true,
          slide_numbers,
          operations
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
          
          // 1. Determine Target slide numbers
          let targetNumbers = currentItem?.slide_numbers || []
          
          // 🛡️ PHASE 54: SMART FALLBACK: If Bot requested INFO but gave no numbers (or empty array), fetch ALL slides.
          if (targetNumbers.length === 0) {
            const projectSession = useSessionStore.getState().sessions.find(s => s.id === next.projectId)
            if (projectSession?.slides) {
              targetNumbers = projectSession.slides.map(s => s.slide_number)
            }
          }

          // 2. Execute Recursion if we have targets
          if (targetNumbers.length > 0) {
            // Retrieve Data
            const projectSession = useSessionStore.getState().sessions.find(s => s.id === next.projectId)
            const allSlides = projectSession?.slides || []
            const requestedSlides = allSlides.filter(s => targetNumbers.includes(s.slide_number))

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
4. **IMMEDIATELY** generate the JSON for the next logical action (e.g., "update" or "append").`

            // Update History (Append the Bot's "info" request AND the System's "data" response)
            // Ensure we append the actual text generated by the bot as the assistant response
            // If bot provided no numbers originally, we might want to synthesize the info request in history 
            // but relying on fullText is usually safer if it exists. 
            // If fullText is empty (edge case), we synthesize a proper info output.
            const infoMessageContent = fullText || JSON.stringify({ action: 'info', slide_numbers: targetNumbers })

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
                 const { action, slides, question, options, allowCustom, content, slide_numbers, operations } = res
                 get().updateItem(next.id, { 
                   slides,
                   responseAction: action as any, 
                   question,
                   options,
                   allowCustom,
                   content,
                   hasReceivedAction: true,
                   slide_numbers,
                   operations
                 })
              },
              onDone: (ft, s, th, cm) => {
                // Finally complete the item
                get().completeActive(next.id, ft, s, th, cm)
              },
              onError: (err) => {
                get().failActive(next.id, err)
                if (err === 'Cancelled') {
                  toast(i18n.t('chat.cancelled'))
                } else {
                  toast.error(err)
                }
              }
            }, newHistory, systemPrompt)

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
        if (error === 'Cancelled') {
          toast(i18n.t('chat.cancelled'))
        } else {
          toast.error(error)
        }
      },
    }, history, systemPrompt, undefined, undefined, userImages.length > 0 ? userImages : undefined)

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

    // Insert/replace chat message (anchored after parent, or replace thinking placeholder)
    const sessionStore = useSessionStore.getState()
    const insertOrReplace = (content: string, extra?: Partial<ChatMessage>) => {
      if (item.thinkingMessageId) {
        sessionStore.updateMessage(item.thinkingMessageId, {
          content,
          isThinking: false,
          ...extra,
        })
      } else if (item.messageId) {
        sessionStore.insertMessageAfter(
          item.messageId,
          {
            role: 'assistant',
            content,
            timestamp: Date.now(),
            isScriptGeneration: false,
            ...extra,
          },
          item.projectId
        )
      } else {
        sessionStore.addMessage({
          role: 'assistant',
          content,
          timestamp: Date.now(),
          isScriptGeneration: false,
          ...extra,
        })
      }
    }

    // 💬 If action is "response", create a chat message with the content
    if (item.responseAction === 'response' && item.content) {
      insertOrReplace(item.content)
    }

    // ❓ If action is "ask", create an interactive clarification message
    if (item.responseAction === 'ask' && item.question) {
      insertOrReplace(item.question, {
        isInteractive: true,
        clarification: {
          question: item.question,
          options: item.options || [],
          allowCustom: item.allowCustom,
        },
      })
    }

    // 🔀 If action is "batch", create a summary message
    if (item.responseAction === 'batch' && item.operations && item.operations.length > 0) {
      const opSummary = item.operations.map(op => {
        if (op.type === 'delete') {
          return `Deleted slide ${op.slide_number}`
        } else if (op.type === 'update') {
          return `Updated slide ${op.slide_number}`
        }
        return ''
      }).filter(Boolean).join(', ')
      
      insertOrReplace(`I have applied ${item.operations.length} changes: ${opSummary}`)
    }

    // 🛡️ Safety: For slide generation actions (create/update/append/delete), 
    // delete the thinking bubble here since App.tsx will create the final message
    if (item.thinkingMessageId && !['response', 'ask', 'batch'].includes(item.responseAction || '')) {
      sessionStore.deleteMessage(item.thinkingMessageId)
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

    // Replace zombie thinking bubble with error so it doesn't stay stuck as "Thinking..."
    if (item.thinkingMessageId) {
      useSessionStore.getState().updateMessage(item.thinkingMessageId, {
        content: error,
        isThinking: false,
      })
    }

    useSessionStore.getState().clearProcessingSlides()

    setTimeout(() => get().processNext(), 0)
  },

  cancelActive: () => {
    // Legacy method: cancel all active processes
    const { activeAborts, items } = get()
    Object.values(activeAborts).forEach(abort => abort.abort())

    // Replace all active thinking bubbles so they don't stay as zombies
    const sessionStore = useSessionStore.getState()
    items.forEach((i) => {
      if (i.status === 'processing' && i.thinkingMessageId) {
        sessionStore.updateMessage(i.thinkingMessageId, {
          content: i18n.t('chat.cancelled'),
          isThinking: false,
        })
      }
    })

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

  removeQueueItem: (itemId) => {
    const item = get().items.find((i) => i.id === itemId)
    if (!item || item.status !== 'queued') return
    set((state) => ({ items: state.items.filter((i) => i.id !== itemId) }))
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
