import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'motion/react'
import { Sparkles, Loader2, ArrowRight, RefreshCw, Mic, MicOff } from 'lucide-react'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'
import { toast } from 'sonner'
import { MAX_PROJECTS } from '../config/limits'
import { useQueueStore } from '../store/useQueueStore'
import { useSessionStore } from '../store/useSessionStore'
import { useUIStore } from '../store/useUIStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { generateDynamicSuggestions } from '../api/suggestions'


import { STORAGE_KEYS } from '../config/defaults'
import { API_CONFIG } from '../config/api'

const STORAGE_KEY = STORAGE_KEYS.HERO_SUGGESTIONS

export default function HeroChatInput() {
  const { t, i18n } = useTranslation()
  const [prompt, setPrompt] = useState('')
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [loadedSuggestionsCount, setLoadedSuggestionsCount] = useState(0)
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(true)
  const [, setIsUsingFallbackSuggestions] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { addToQueue, isProjectProcessing } = useQueueStore()
  const { addMessage, createSession, currentSessionId } = useSessionStore()
  const { startHeroHold } = useUIStore()
  const { isConfigured, disableSuggestions, autoSubmitOnSpeech } = useSettingsStore()
  const submitRef = useRef<(overrideText?: string) => void>(() => {})
  const promptRef = useRef(prompt)
  promptRef.current = prompt
  const pendingSubmitOnStopRef = useRef(false)

  const projectId = currentSessionId || ''
  const isProcessing = isProjectProcessing(projectId)

  const [interimTranscript, setInterimTranscript] = useState('')
  const onVoiceTranscript = useCallback((text: string) => {
    setPrompt((prev) => (prev ? prev + ' ' : '') + text)
    setInterimTranscript('')
    if (autoSubmitOnSpeech) {
      setTimeout(() => submitRef.current?.(), 280)
    }
  }, [autoSubmitOnSpeech])
  const onInterim = useCallback((text: string) => setInterimTranscript(text || ''), [])
  const speech = useSpeechRecognition(i18n.language, onVoiceTranscript, onInterim)

  // When listening, "effective" content = what's shown (prompt + interim); submit button enables and submits this
  const effectiveContent = speech.isListening
    ? (prompt + (prompt ? ' ' : '') + interimTranscript).trim()
    : prompt.trim()

  // Calculate character and word count
  const charCount = prompt.length
  const wordCount = prompt.trim() ? prompt.trim().split(/\s+/).length : 0

  // Auto-focus and auto-resize textarea
  useEffect(() => {
    const timer = setTimeout(() => {
      textareaRef.current?.focus()
      adjustTextareaHeight()
    }, 400)
    return () => clearTimeout(timer)
  }, [])

  // Adjust textarea height based on content
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }

  // Resize on content change
  useEffect(() => {
    adjustTextareaHeight()
  }, [prompt])

  // Voice: focus when listening; when stopped, merge interim and maybe auto-submit
  useEffect(() => {
    if (speech.isListening && textareaRef.current) {
      textareaRef.current.focus()
    }
    if (!speech.isListening) {
      const hadInterim = !!interimTranscript.trim()
      setPrompt((prev) => (prev ? prev + ' ' : '') + (interimTranscript || '').trim())
      setInterimTranscript('')
      if (hadInterim && autoSubmitOnSpeech) pendingSubmitOnStopRef.current = true
    }
  }, [speech.isListening, autoSubmitOnSpeech])

  // After merging interim on stop, submit once when prompt has updated (if auto-submit on speech)
  useEffect(() => {
    if (!speech.isListening && pendingSubmitOnStopRef.current && autoSubmitOnSpeech && prompt.trim()) {
      pendingSubmitOnStopRef.current = false
      submitRef.current?.(prompt)
    }
  }, [speech.isListening, autoSubmitOnSpeech, prompt])

  // Voice: show error toast
  useEffect(() => {
    if (speech.error) {
      toast.error(speech.error === 'Permission denied' ? t('chat.voicePermissionDenied') : t('chat.voiceError'))
    }
  }, [speech.error, t])

  const abortControllerRef = useRef<AbortController | null>(null)

  // Load dynamic suggestions with sessionStorage caching
  useEffect(() => {
    const loadSuggestions = async (forceRefresh = false) => {
      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      
      const controller = new AbortController()
      abortControllerRef.current = controller

      if (disableSuggestions) {
        setSuggestions([])
        setLoadedSuggestionsCount(0)
        setIsUsingFallbackSuggestions(false)
        setIsLoadingSuggestions(false)
        return
      }

      const allFallbacks = Array.from({ length: 100 }, (_, i) => t(`hero.suggestion${i + 1}`))
      const fallbackSuggestions = [...allFallbacks].sort(() => 0.5 - Math.random()).slice(0, 4)

      if (!isConfigured()) {
          setSuggestions(fallbackSuggestions)
          setLoadedSuggestionsCount(4)
          setIsUsingFallbackSuggestions(true)
          setIsLoadingSuggestions(false)
          return
      }

      const language = i18n.language as 'en' | 'vi'
      const storageKey = `${STORAGE_KEY}-${language}`

      // Try to load from sessionStorage first
      if (!forceRefresh) {
        try {
          const cached = sessionStorage.getItem(storageKey)
          if (cached) {
            const cachedSuggestions = JSON.parse(cached)
            if (Array.isArray(cachedSuggestions) && cachedSuggestions.length === API_CONFIG.SUGGESTION_COUNT) {
              setSuggestions(cachedSuggestions)
              setLoadedSuggestionsCount(API_CONFIG.SUGGESTION_COUNT)
              setIsUsingFallbackSuggestions(false)
              setIsLoadingSuggestions(false)
              return
            }
          }
        } catch {
          // Don't return, fall through to fetch
        }
      }

      // Fetch new suggestions from API with streaming
      try {
        setIsLoadingSuggestions(true)
        setSuggestions([])
        setLoadedSuggestionsCount(0)
        
        const streamingSuggestions: string[] = []
        const apiType = useSettingsStore.getState().getApiType()

        await generateDynamicSuggestions(language, apiType, {
          onSuggestion: (suggestion, index) => {
            if (controller.signal.aborted) return
            streamingSuggestions[index] = suggestion
            setSuggestions([...streamingSuggestions])
            setLoadedSuggestionsCount(index + 1)
          },
          onComplete: (finalSuggestions) => {
            if (controller.signal.aborted) return
            if (finalSuggestions.length === 4) {
              setSuggestions(finalSuggestions)
              setLoadedSuggestionsCount(4)
              setIsUsingFallbackSuggestions(false)
              // Only cache successful API suggestions
              sessionStorage.setItem(storageKey, JSON.stringify(finalSuggestions))
            } else {
              setSuggestions(fallbackSuggestions)
              setLoadedSuggestionsCount(4)
              setIsUsingFallbackSuggestions(true)
              // Do NOT cache fallback suggestions so we retry next time
            }
            setIsLoadingSuggestions(false)
          },
          onError: () => {
            if (controller.signal.aborted) return
            setSuggestions(fallbackSuggestions)
            setLoadedSuggestionsCount(4)
            setIsUsingFallbackSuggestions(true)
            setIsLoadingSuggestions(false)
          }
        }, controller.signal)
      } catch (error: any) {
        if (error.name === 'AbortError' || controller.signal.aborted) {
           return // Ignore aborts
        }
        setSuggestions(fallbackSuggestions)
        setLoadedSuggestionsCount(4)
        setIsUsingFallbackSuggestions(true)
        setIsLoadingSuggestions(false)
      }
    }

    loadSuggestions()
    
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [i18n.language, t, isConfigured, disableSuggestions])

  // Refresh suggestions handler
  const handleRefreshSuggestions = async () => {
    if (disableSuggestions) return;

    const getRandomFallbackSuggestions = () => {
      const all = Array.from({ length: 100 }, (_, i) => t(`hero.suggestion${i + 1}`))
      return [...all].sort(() => 0.5 - Math.random()).slice(0, 4)
    }

    if (!isConfigured()) return; // Silent failure for suggestions

    try {
      setIsLoadingSuggestions(true)
      setSuggestions([])
      setLoadedSuggestionsCount(0)

      const language = i18n.language as 'en' | 'vi'
      const storageKey = `${STORAGE_KEY}-${language}`

      // Clear cache
      sessionStorage.removeItem(storageKey)

      const streamingSuggestions: string[] = []
      const apiType = useSettingsStore.getState().getApiType()

      await generateDynamicSuggestions(language, apiType, {
        onSuggestion: (suggestion, index) => {
          streamingSuggestions[index] = suggestion
          setSuggestions([...streamingSuggestions])
          setLoadedSuggestionsCount(index + 1)
        },
        onComplete: (finalSuggestions) => {
          if (finalSuggestions.length === 4) {
            setSuggestions(finalSuggestions)
            setLoadedSuggestionsCount(4)
            setIsUsingFallbackSuggestions(false)
            // Only cache successful API suggestions
            sessionStorage.setItem(storageKey, JSON.stringify(finalSuggestions))
          } else {
            setSuggestions(getRandomFallbackSuggestions())
            setLoadedSuggestionsCount(4)
            setIsUsingFallbackSuggestions(true)
            // Do NOT cache fallback suggestions
          }
          setIsLoadingSuggestions(false)
        },
        onError: (error) => {
          if (error.includes('CORS Error') || error.includes('Service busy')) {
            toast.error(error)
          }
          setSuggestions(getRandomFallbackSuggestions())
          setLoadedSuggestionsCount(4)
          setIsUsingFallbackSuggestions(true)
          setIsLoadingSuggestions(false)
        }
      })
    } catch {
      setSuggestions(getRandomFallbackSuggestions())
      setLoadedSuggestionsCount(4)
      setIsUsingFallbackSuggestions(true)
      setIsLoadingSuggestions(false)
    }
  }

  const handleSubmit = async (e?: React.FormEvent, overrideText?: string) => {
    e?.preventDefault?.()
    const raw = overrideText ?? promptRef.current ?? prompt
    const trimmed = (typeof raw === 'string' ? raw : '').trim()
    if (!trimmed || isProcessing || isSubmitted) return

    const activeProfileId = useSettingsStore.getState().activeProfileId;
    if (!activeProfileId) {
        toast.error(t('config.noProfile'), {
            description: t('config.noProfileDesc')
        })
        return
    }

    if (!isConfigured()) {
        toast.error(t('config.validation'), {
            description: t('config.validationDesc')
        })
        return
    }

    // Check limit before generating
    const state = useSessionStore.getState()
    if (!state.currentSessionId && state.sessions.length >= MAX_PROJECTS) {
      toast.error(t('sessions.limitReached', { limit: MAX_PROJECTS }))
      return
    }

    setIsSubmitted(true)
    startHeroHold()

    // Create session
    let activeProjectId = currentSessionId
    if (!currentSessionId) {
      const title = trimmed.length > 60 ? trimmed.slice(0, 60) + '...' : trimmed
      activeProjectId = createSession(title)
    }

    // Add user message
    addMessage({
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
      isScriptGeneration: true,
    })

    // Queue processing
    addToQueue(trimmed, activeProjectId!)

    // Note: Mobile tab switching now happens automatically in App.tsx 
    // only when action is confirmed to be slide-related (intent-aware)
  }
  submitRef.current = (text?: string) => handleSubmit(undefined, text)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleSuggestionClick = (suggestion: string) => {
    setPrompt(suggestion)
    // Auto-submit after a brief delay to allow state update
    setTimeout(() => {
      handleSubmit()
    }, 100)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
      className="w-full space-y-5"
    >
      {/* Input Container */}
      <div className="relative group">
        <div
          className={`relative flex items-start rounded-2xl border transition-all duration-300 overflow-hidden ${isSubmitted
              ? 'bg-neutral-100 dark:bg-zinc-800/60 border-neutral-200 dark:border-zinc-700'
              : speech.isListening
                ? 'bg-red-50/50 dark:bg-red-950/20 border-red-300 dark:border-red-700/70 ring-2 ring-red-200/60 dark:ring-red-800/40'
                : 'bg-white dark:bg-zinc-800/50 border-neutral-200 dark:border-zinc-700 hover:border-neutral-400 dark:hover:border-zinc-500 focus-within:border-neutral-400 dark:focus-within:border-zinc-500'
            }`}
        >
          {/* Light sweep left-to-right when generating */}
          <AnimatePresence>
            {isSubmitted && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 rounded-2xl pointer-events-none z-10"
                aria-hidden
              >
                <motion.div
                  className="absolute inset-0 rounded-2xl"
                  style={{
                    background: 'linear-gradient(105deg, transparent 0%, transparent 35%, rgba(255,255,255,0.25) 50%, transparent 65%, transparent 100%)',
                    width: '60%',
                  }}
                  animate={{ x: ['-80%', '180%'] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.div
                  className="absolute inset-0 rounded-2xl dark:opacity-70"
                  style={{
                    background: 'linear-gradient(105deg, transparent 0%, transparent 38%, rgba(251,191,36,0.2) 50%, transparent 62%, transparent 100%)',
                    width: '50%',
                  }}
                  animate={{ x: ['-70%', '190%'] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay: 0.15 }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Sparkle accent */}
          <div className="pl-4 pr-1 py-3.5">
            <Sparkles className={`w-4 h-4 transition-colors duration-300 ${isSubmitted
                ? 'text-neutral-300 dark:text-zinc-600'
                : prompt.trim()
                  ? 'text-amber-500'
                  : 'text-neutral-300 dark:text-zinc-600'
              }`} />
          </div>

          <textarea
            ref={textareaRef}
            value={speech.isListening && interimTranscript ? prompt + (prompt ? ' ' : '') + interimTranscript : prompt}
            onChange={(e) => {
              setPrompt(e.target.value)
              if (speech.isListening) setInterimTranscript('')
            }}
            onKeyDown={handleKeyDown}
            placeholder={speech.isListening ? t('chat.voiceListeningPlaceholder') : t('chat.placeholder')}
            disabled={isSubmitted}
            rows={1}
            className="flex-1 bg-transparent text-sm leading-relaxed placeholder:text-neutral-400 dark:placeholder:text-zinc-500 focus:outline-none py-3.5 pr-2 mr-2 disabled:cursor-not-allowed resize-none min-h-[28px] max-h-[200px]"
          />

          {speech.isListening && (
            <div className="absolute left-12 right-20 bottom-2 flex items-end justify-center gap-1 h-8 pointer-events-none" aria-hidden>
              {(speech.audioLevels ?? Array(8).fill(0)).map((level, i) => {
                const height = Math.max(4, 4 + level * 36)
                return (
                  <div
                    key={i}
                    className="w-1.5 rounded-t rounded-b-sm bg-red-500 dark:bg-red-400 transition-[height] duration-100 ease-out"
                    style={{ height: `${height}px` }}
                  />
                )
              })}
            </div>
          )}

          {speech.isSupported && !isSubmitted && (
            <button
              type="button"
              onClick={speech.toggle}
              title={speech.isListening ? t('chat.voiceStop') : t('chat.voiceStart')}
              className={`self-center p-2 rounded-lg transition-colors touch-manipulation ${
                speech.isListening
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                  : 'text-neutral-400 dark:text-zinc-500 hover:text-neutral-600 dark:hover:text-zinc-400'
              }`}
            >
              {speech.isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          )}

          {/* Submit Button */}
          <div className="pr-2.5 py-2">
            <AnimatePresence mode="wait">
              {isSubmitted ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="relative flex items-center gap-2 px-4 py-2 rounded-xl bg-black dark:bg-white text-white dark:text-black overflow-hidden"
                >
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span className="text-[11px] font-semibold tracking-wide">{t('chat.generating')}</span>
                  {/* shimmer overlay */}
                  <motion.div
                    className="absolute inset-0 rounded-xl pointer-events-none"
                    style={{
                      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)',
                    }}
                    animate={{ x: ['-100%', '100%'] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                  />
                </motion.div>
              ) : (
                <motion.button
                  key="submit"
                  onClick={() => submitRef.current?.(speech.isListening ? effectiveContent : undefined)}
                  disabled={!effectiveContent}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-black dark:bg-white text-white dark:text-black text-[11px] font-semibold tracking-wide hover:opacity-90 active:scale-[0.97] transition-all disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  {t('chat.generate')}
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Ambient glow */}
        {!isSubmitted && (
          <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-amber-200/20 via-orange-200/10 to-rose-200/20 dark:from-amber-900/10 dark:via-orange-900/5 dark:to-rose-900/10 blur-xl -z-10 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-500" />
        )}
      </div>

      {/* Character/Word Count and Hint */}
      {!isSubmitted && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-between gap-2 px-1 text-[10px] text-neutral-400 dark:text-zinc-500"
        >
          <span className="hidden md:inline">{t('chat.hint')}</span>

          <div className="flex flex-1 md:flex-initial items-center justify-between md:justify-end gap-4">
            {!disableSuggestions && (
              <div className="flex items-center gap-2">
                <span>{t('hero.suggestionsLabel')}</span>
                <motion.button
                  onClick={handleRefreshSuggestions}
                  disabled={isLoadingSuggestions}
                  className="p-1 rounded-md hover:bg-neutral-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  title={t('hero.refreshSuggestions')}
                >
                  <RefreshCw className={`w-3 h-3 text-neutral-400 dark:text-zinc-500 ${isLoadingSuggestions ? 'animate-spin' : ''}`} />
                </motion.button>
              </div>
            )}

            <div className="ml-auto md:ml-0 flex items-center gap-3 border-l border-neutral-200 dark:border-zinc-700 pl-4">
              <span>{charCount} {t('chat.charUnit')}</span>
              <span>•</span>
              <span>{wordCount} {t('chat.wordUnit')}</span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Suggestion Chips */}
      <AnimatePresence>
        {!isSubmitted && !disableSuggestions && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3, delay: 0.25 }}
            className="space-y-2"
          >

            <div className="flex flex-wrap items-center justify-center gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                i < loadedSuggestionsCount && suggestions[i] ? (
                  // Show actual suggestion
                  <motion.button
                    key={`suggestion-${i}`}
                    onClick={() => handleSuggestionClick(suggestions[i])}
                    className="px-3 py-1.5 rounded-full text-[11px] font-medium text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-zinc-800/60 border border-neutral-200/60 dark:border-zinc-700/50 hover:bg-neutral-200/80 dark:hover:bg-zinc-700/60 hover:text-neutral-700 dark:hover:text-neutral-200 transition-all cursor-pointer"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    {suggestions[i]}
                  </motion.button>
                ) : (
                  // Show skeleton while loading
                  <motion.div
                    key={`skeleton-${i}`}
                    className="px-3 py-1.5 rounded-full bg-neutral-200 dark:bg-zinc-700 animate-pulse"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.06 }}
                    style={{ width: `${80 + Math.random() * 60}px`, height: '26px' }}
                  />
                )
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
