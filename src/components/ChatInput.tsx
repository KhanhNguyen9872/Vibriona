import { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'motion/react'
import { useQueueStore } from '../store/useQueueStore'
import { useSessionStore } from '../store/useSessionStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { API_CONFIG } from '../config/api'
import { STORAGE_KEYS } from '../config/defaults'
import { SYSTEM_PROMPT } from '../api/prompt'
import { toast } from 'sonner'
import { Sparkles, Loader2, Square, AlertCircle, X, Layers, Pencil, AlertTriangle } from 'lucide-react'

const MAX_CHARS = 4096

/** Circular progress icon: current/max (e.g. uncompacted messages before next compact). */
function ContextProgressIcon({ current, max }: { current: number; max: number }) {
  const progress = max > 0 ? Math.min(current / max, 1) : 0
  const size = 16
  const stroke = 2
  const r = (size - stroke) / 2 - 1
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - progress)

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      aria-hidden
    >
      {/* Background ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        opacity={0.2}
      />
      {/* Progress ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-[stroke-dashoffset] duration-300"
      />
    </svg>
  )
}

interface ChatInputProps {
  className?: string
}

export default function ChatInput({ className = '' }: ChatInputProps) {
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [contextTooltipOpen, setContextTooltipOpen] = useState(false)
  const contextTooltipRef = useRef<HTMLDivElement>(null)
  const { addToQueue, cancelProjectProcess, isProjectProcessing, items } = useQueueStore()
  const { addMessage, createSession, currentSessionId, clearSlideSelection, getSelectedSlideIndices, getCurrentSession, setProcessingSlides, clearCompaction } = useSessionStore()
  const { isConfigured } = useSettingsStore()

  const currentSession = getCurrentSession()
  const sessionSlides = currentSession?.slides ?? []
  const projectId = currentSessionId || ''
  const isProcessing = isProjectProcessing(projectId)

  const selectedSlideIndices = getSelectedSlideIndices()
  const selectedSlides = selectedSlideIndices
    .filter((i) => i < sessionSlides.length)
    .map((i) => sessionSlides[i])

  const isEditMode = sessionSlides.length > 0
  const isContextEdit = selectedSlides.length > 0

  const queuedCount = items.filter((i) => i.status === 'queued').length
  const lastError = [...items].reverse().find((i) => i.status === 'error')

  const charCount = prompt.length
  const wordCount = useMemo(() => {
    const trimmed = prompt.trim()
    if (!trimmed) return 0
    return trimmed.split(/\s+/).length
  }, [prompt])
  const isOverLimit = charCount > MAX_CHARS
  
  // Check for long conversation warning (total message count only, show once per project)
  const messageCount = currentSession?.messages.length || 0
  const warningStorageKey = currentSessionId ? `${STORAGE_KEYS.CONTEXT_WARNING_SHOWN}-${currentSessionId}` : ''
  const warningAlreadyShown = warningStorageKey ? sessionStorage.getItem(warningStorageKey) === '1' : false
  const shouldShowWarning =
    messageCount >= API_CONFIG.CONTEXT_WARNING_THRESHOLD && !warningAlreadyShown

  // Context = exactly what we send to the bot: system prompt + chat (compacted + messages)
  const contextStats = useMemo(() => {
    const messages = currentSession?.messages ?? []
    const lastCompactedIndex = currentSession?.lastCompactedIndex ?? 0
    const uncompactedCount = lastCompactedIndex > 0 ? messages.length - lastCompactedIndex : messages.length
    const compactedChars = currentSession?.compactedContext?.length ?? 0
    const recentMessages = lastCompactedIndex > 0 ? messages.slice(lastCompactedIndex) : messages
    const messagesChars = recentMessages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0)
    const systemChars = SYSTEM_PROMPT.length
    const chatChars = compactedChars + messagesChars
    const totalContextChars = systemChars + chatChars
    const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n))
    return {
      uncompactedCount,
      maxBeforeCompact: API_CONFIG.COMPACTION_THRESHOLD,
      systemChars,
      chatChars,
      totalContextChars,
      totalContextLabel: fmt(totalContextChars),
      systemLabel: fmt(systemChars),
      chatLabel: fmt(chatChars),
    }
  }, [currentSession?.messages, currentSession?.lastCompactedIndex, currentSession?.compactedContext])

  const handleResetContext = () => {
    if (currentSessionId) {
      clearCompaction(currentSessionId)
      sessionStorage.removeItem(`${STORAGE_KEYS.CONTEXT_WARNING_SHOWN}-${currentSessionId}`)
      toast.success(t('chat.contextReset'))
    }
  }

  // Mark warning as shown once displayed (so we only show once per project)
  useEffect(() => {
    if (shouldShowWarning && warningStorageKey) {
      sessionStorage.setItem(warningStorageKey, '1')
    }
  }, [shouldShowWarning, warningStorageKey])

  // Mobile: close context tooltip when tapping outside
  useEffect(() => {
    if (!contextTooltipOpen) return
    const close = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node
      if (contextTooltipRef.current?.contains(target)) return
      setContextTooltipOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close, { passive: true })
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
    }
  }, [contextTooltipOpen])

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 400) + 'px'
  }, [prompt])

  // Toast on error
  useEffect(() => {
    if (lastError?.error) {
      toast.error(t('chat.error'), { 
        description: lastError.error,
        id: `error-${lastError.id}`
      })
    }
  }, [lastError?.id, lastError?.error, t])

  const handleSubmit = () => {
    const trimmed = prompt.trim()
    if (!trimmed || isOverLimit || isProcessing) return

    const activeProfileId = useSettingsStore.getState().activeProfileId;
    if (!activeProfileId) {
        toast.error(t('config.noProfile'), {
            description: t('config.noProfileDesc')
        });
        return;
    }

    if (!isConfigured()) {
        toast.error(t('config.validation'), {
            description: t('config.validationDesc')
        });
        return;
    }

    // Optimistic: create session if needed
    let activeProjectId = currentSessionId
    if (!currentSessionId) {
      const title = trimmed.length > 60 ? trimmed.slice(0, 60) + '...' : trimmed
      activeProjectId = createSession(title)
    }

    const slideNums = selectedSlides.map((s) => s.slide_number)

    // Optimistic: add user message immediately
    addMessage({
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
      isScriptGeneration: true,
      ...(isContextEdit && {
        relatedSlideReferences: selectedSlides.map(s => ({
          id: `slide-card-${s.slide_number}`,
          number: s.slide_number,
          label: t('chat.slideLabel', { number: s.slide_number })
        }))
      })
    })

    // Clear input
    setPrompt('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    // Queue with or without context - use activeProjectId!
    addToQueue(trimmed, activeProjectId!, isContextEdit ? selectedSlides : undefined)

    // Trigger "Magic Overlay" immediately for selected slides
    if (isContextEdit) {
      setProcessingSlides(slideNums)
    }

    if (isContextEdit) clearSlideSelection()

    // Note: Mobile tab switching now happens automatically in App.tsx 
    // only when action is confirmed to be slide-related (intent-aware)

    if (queuedCount > 0) {
      toast(t('chat.queued'), {
        description: t('chat.queuePosition', { position: queuedCount + 1 }),
      })
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className={`shrink-0 border-t border-neutral-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 sm:px-6 py-3 ${className}`}>
      {/* Selection context bar */}
      <AnimatePresence>
        {selectedSlides.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 8 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.2 }}
            className="max-w-full mx-auto overflow-hidden"
          >
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/40">
              <Layers className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" />
              <span className="text-[11px] font-medium text-indigo-700 dark:text-indigo-300 truncate">
                {t('chat.editingContext', {
                  count: selectedSlides.length,
                  slides: selectedSlides.map((s) => `#${s.slide_number}`).join(', '),
                })}
              </span>
              <button
                onClick={clearSlideSelection}
                className="ml-auto p-0.5 rounded hover:bg-indigo-200/50 dark:hover:bg-indigo-800/40 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-3 h-3 text-indigo-400 dark:text-indigo-500" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error line */}
      {lastError && (
        <div className="mb-2 flex items-center gap-2 text-xs text-red-500 max-w-full mx-auto">
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span className="truncate">{lastError.error}</span>
        </div>
      )}

      {/* Long conversation warning */}
      <AnimatePresence>
        {shouldShowWarning && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 8 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.2 }}
            className="max-w-full mx-auto overflow-hidden"
          >
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                    {t('chat.longContextWarning')}
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    {t('chat.longContextDescription')}
                  </p>
                </div>
                <button
                  onClick={handleResetContext}
                  className="text-xs font-medium text-amber-600 dark:text-amber-500 hover:text-amber-700 dark:hover:text-amber-400 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  {t('chat.resetContext')}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-full mx-auto">
        <div className={`relative border rounded-2xl transition-all ${isProcessing
            ? 'bg-neutral-100 dark:bg-zinc-800/50 border-neutral-200 dark:border-zinc-600/50'
            : 'bg-neutral-50 dark:bg-zinc-800/30 focus-within:ring-2 focus-within:border-neutral-400 dark:focus-within:border-zinc-500'
          } ${isOverLimit
            ? 'border-red-300 dark:border-red-800 focus-within:ring-red-200/50 dark:focus-within:ring-red-900/30'
            : 'border-neutral-200 dark:border-zinc-700 focus-within:ring-black/20 dark:focus-within:ring-zinc-500/30'
          }`}>
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isContextEdit ? t('chat.editPlaceholder') : isEditMode ? t('chat.updatePlaceholder') : t('chat.placeholder')}
            rows={1}
            className="w-full resize-none bg-transparent text-sm leading-relaxed placeholder:text-neutral-400 focus:outline-none px-4 pt-4 pb-16"
          />

          {/* Bottom bar */}
          <div className="absolute inset-x-3 bottom-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className={`text-[10px] tabular-nums font-medium transition-colors ${isOverLimit
                  ? 'text-red-500'
                  : charCount > MAX_CHARS * 0.9
                    ? 'text-amber-500'
                    : 'text-neutral-400'
                }`}>
                {t('chat.charCount', { count: charCount, max: MAX_CHARS })}
              </span>
              {charCount > 0 && (
                <span className="text-[10px] text-neutral-400 tabular-nums hidden sm:block">
                  {t('chat.wordCount', { count: wordCount })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isProcessing && (
                <button
                  onClick={() => cancelProjectProcess(projectId)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 text-[11px] font-medium text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 active:scale-[0.97] transition-all cursor-pointer"
                >
                  <Square className="w-2.5 h-2.5" />
                  {t('chat.cancel')}
                </button>
              )}
              {/* Context usage: progress indicator (current/max) + tooltip (hover on desktop, tap to toggle on mobile) */}
              <div ref={contextTooltipRef} className="relative group">
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={t('chat.contextUsedLabel')}
                  onClick={() => setContextTooltipOpen((prev) => !prev)}
                  onKeyDown={(e) => e.key === 'Enter' && setContextTooltipOpen((prev) => !prev)}
                  className="p-1.5 rounded-lg text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-400 transition-colors cursor-pointer flex items-center justify-center touch-manipulation"
                >
                  <ContextProgressIcon
                    current={contextStats.uncompactedCount}
                    max={contextStats.maxBeforeCompact}
                  />
                </div>
                <div
                  className={`absolute bottom-full right-0 mb-1.5 px-2.5 py-1.5 rounded-lg w-max max-w-[min(90vw,320px)] border border-neutral-600 dark:border-neutral-400 bg-neutral-800 text-white dark:bg-neutral-100 dark:text-neutral-900 text-[11px] font-medium shadow-xl z-50 space-y-0.5 transition-opacity ${
                    contextTooltipOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none group-hover:opacity-100'
                  }`}
                >
                  <div className="whitespace-nowrap">
                    <span>{contextStats.uncompactedCount}/{contextStats.maxBeforeCompact}</span>
                    <span className="text-neutral-300 dark:text-neutral-500 mx-1">·</span>
                    <span>{contextStats.totalContextLabel}</span>
                    <span className="text-neutral-400 dark:text-neutral-600 ml-1">{t('chat.contextUsedLabel')}</span>
                  </div>
                  <div className="text-neutral-300 dark:text-neutral-600 whitespace-nowrap">
                    {t('chat.contextSystem')}: {contextStats.systemLabel}
                  </div>
                  <div className="text-neutral-300 dark:text-neutral-600 whitespace-nowrap">
                    {t('chat.contextChat')}: {contextStats.chatLabel}
                  </div>
                  <div className="absolute -bottom-1 right-4 w-2 h-2 bg-neutral-800 dark:bg-neutral-100 rotate-45" />
                </div>
              </div>
              <button
                onClick={handleSubmit}
                disabled={!prompt.trim() || isOverLimit || isProcessing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black dark:bg-white text-white dark:text-black text-[11px] font-semibold tracking-wide hover:opacity-90 active:scale-[0.97] transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                {isProcessing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : isEditMode ? (
                  <Pencil className="w-3.5 h-3.5" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                {isEditMode ? t('chat.update') : t('chat.generate')}
              </button>
            </div>
          </div>
        </div>

        {isOverLimit && (
          <p className="mt-1.5 text-[11px] text-red-500 font-medium text-center">
            {t('chat.overLimit')}
          </p>
        )}
      </div>
    </div>
  )
}
