import { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'motion/react'
import { useQueueStore } from '../store/useQueueStore'
import { useSessionStore } from '../store/useSessionStore'
import { useUIStore } from '../store/useUIStore'
import { toast } from 'sonner'
import { Sparkles, Loader2, Square, AlertCircle, X, Layers, Pencil } from 'lucide-react'

const MAX_CHARS = 4096

interface ChatInputProps {
  variant?: 'default' | 'centered'
  className?: string
}

export default function ChatInput({ variant = 'default', className = '' }: ChatInputProps) {
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { addToQueue, cancelProjectProcess, isProjectProcessing, items } = useQueueStore()
  const { addMessage, createSession, currentSessionId, getSelectedSlideIndices, clearSlideSelection, getCurrentSession, setProcessingSlides } = useSessionStore()
  const { setMobileActiveTab, startHeroHold } = useUIStore()

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
      toast.error(t('chat.error'), { description: lastError.error })
    }
  }, [lastError?.id, lastError?.error, t])

  const handleSubmit = () => {
    const trimmed = prompt.trim()
    if (!trimmed || isOverLimit || isProcessing) return

    // In new project (centered) mode, lock the hero view for 2s before transitioning
    if (isCentered) {
      startHeroHold()
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

    // Clear input + selection — in centered mode, delay clearing until after hero hold
    if (!isCentered) {
      setPrompt('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    } else {
      // In centered mode, clear after 2s (after hero hold)
      setTimeout(() => {
        setPrompt('')
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto'
        }
      }, 2000)
    }

    // Queue with or without context - use activeProjectId!
    addToQueue(trimmed, activeProjectId!, isContextEdit ? selectedSlides : undefined)
    
    // Trigger "Magic Overlay" immediately for selected slides
    if (isContextEdit) {
      setProcessingSlides(slideNums)
    }
    
    if (isContextEdit) clearSlideSelection()

    // Auto-switch to script view on mobile
    setMobileActiveTab('script')

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

  const isCentered = variant === 'centered'

  return (
    <div className={`
      shrink-0 
      ${isCentered ? 'bg-transparent pb-0 w-full max-w-3xl mx-auto' : 'border-t border-neutral-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 sm:px-6 py-3'}
      ${className}
    `}>
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

      <div className={isCentered ? '' : 'max-w-full mx-auto'}>
        <div className={`relative border rounded-2xl shadow-sm transition-all ${
          isProcessing
            ? 'bg-neutral-100 dark:bg-zinc-800/50 border-neutral-200 dark:border-zinc-600/50'
            : isCentered
              ? 'bg-white dark:bg-zinc-800/50 shadow-md border-neutral-200 dark:border-zinc-700 focus-within:ring-2 focus-within:border-neutral-400 dark:focus-within:border-zinc-500 hover:shadow-lg' 
              : 'bg-neutral-50 dark:bg-zinc-800/30 focus-within:ring-2 focus-within:border-neutral-400 dark:focus-within:border-zinc-500'
        } ${
          isOverLimit
            ? 'border-red-300 dark:border-red-800 focus-within:ring-red-200/50 dark:focus-within:ring-red-900/30'
            : isCentered 
              ? '' 
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
              <span className={`text-[10px] tabular-nums font-medium transition-colors ${
                isOverLimit
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
              {isCentered && isProcessing ? (
                <motion.button
                  disabled
                  className="relative flex items-center gap-2 px-4 py-2 rounded-xl bg-black dark:bg-white text-white dark:text-black text-[11px] font-semibold tracking-wide cursor-not-allowed overflow-hidden"
                  animate={{ scale: [1, 1.02, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <motion.div
                    className="absolute inset-0 rounded-xl"
                    style={{
                      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)',
                    }}
                    animate={{ x: ['-100%', '100%'] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                  />
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{t('chat.generating')}</span>
                </motion.button>
              ) : (
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
              )}
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
