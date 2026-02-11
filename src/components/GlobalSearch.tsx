import { useState, useEffect, useRef, useMemo } from 'react'
import { Search, X, MessageSquare, LayoutTemplate, Presentation } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSessionStore } from '../store/useSessionStore'
import { motion, AnimatePresence } from 'motion/react'

interface SearchResult {
  type: 'project' | 'message' | 'slide'
  sessionId: string
  sessionTitle: string
  title: string
  subtitle?: string
  matchIndex?: number // For highlighting
  slideNumber?: number
  slideCount?: number
  timestamp?: number
}

interface GlobalSearchProps {
  isOpen: boolean
  onClose: () => void
  isMobile: boolean
}

export default function GlobalSearch({ isOpen, onClose, isMobile }: GlobalSearchProps) {
  const { t } = useTranslation()
  const { sessions, setCurrentSession, highlightSlide } = useSessionStore()
  const [query, setQuery] = useState('')
  const [showResults, setShowResults] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when opened on mobile
  useEffect(() => {
    if (isOpen && isMobile && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen, isMobile])

  // Click outside to close results
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowResults(false)
        if (isMobile) {
             // On mobile, clicking outside might not be enough if it covers screen, 
             // but here it's in header. We'll rely on X button or explicit close.
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isMobile, onClose])

  const results = useMemo(() => {
    if (!query.trim() || query.length < 2) return []

    const searchBuffer: SearchResult[] = []
    const lowerQuery = query.toLowerCase()

    sessions.forEach(session => {
      // 1. Match Project Title
      if (session.title.toLowerCase().includes(lowerQuery)) {
        searchBuffer.push({
          type: 'project',
          sessionId: session.id,
          sessionTitle: session.title,
          title: session.title,
          subtitle: t('search.projectMatch'),
          slideCount: session.slides.length,
          timestamp: session.timestamp,
        })
      }

      // 2. Match Messages
      session.messages.forEach(msg => {
        if (msg.role === 'user' || (msg.role === 'assistant' && !msg.isScriptGeneration)) { // Skip massive script payloads if desired, or include them
           // Actually, let's include all text content but truncate
           if (msg.content.toLowerCase().includes(lowerQuery)) {
             searchBuffer.push({
               type: 'message',
               sessionId: session.id,
               sessionTitle: session.title,
               title: msg.content.slice(0, 60) + (msg.content.length > 60 ? '...' : ''),
               subtitle: msg.role === 'user' ? t('search.userMatch') : t('search.botMatch'),
             })
           }
        }
      })

      // 3. Match Slides
      session.slides.forEach(slide => {
        if (
          slide.title?.toLowerCase().includes(lowerQuery) || 
          slide.content?.toLowerCase().includes(lowerQuery) ||
          slide.speaker_notes?.toLowerCase().includes(lowerQuery)
        ) {
           searchBuffer.push({
             type: 'slide',
             sessionId: session.id,
             sessionTitle: session.title,
             title: slide.title || t('chat.slideLabel', { number: slide.slide_number }),
             subtitle: t('search.slideMatch', 'Slide Content'),
             slideNumber: slide.slide_number
           })
        }
      })
    })

    // Remove duplicates (optional, simplified for now) and limit
    return searchBuffer.slice(0, 10)
  }, [query, sessions, t])

  const handleSelect = (result: SearchResult) => {
    setCurrentSession(result.sessionId)
    if (result.type === 'slide' && result.slideNumber) {
        // We need a small delay to ensure session switch happened if we want to highlight 
        // effectively, though zustand is sync. The workspace might need to mount.
        setTimeout(() => highlightSlide(result.slideNumber!), 300)
    }
    setQuery('')
    setShowResults(false)
    if (isMobile) onClose()
  }

  const handleClear = () => {
    setQuery('')
    setShowResults(false)
    if (isMobile) onClose()
  }

  // Mobile: Render only if isOpen
  // Desktop: Always render input
  if (isMobile && !isOpen) return null

  return (
    <div 
      ref={containerRef}
      className={`
        relative flex items-center
        ${isMobile 
          ? 'flex-1 w-full' 
          : 'w-[400px] mx-4'
        }
      `}
    >
      <div className="relative w-full">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-neutral-400" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setShowResults(true)
          }}
          onFocus={() => setShowResults(true)}
          className={`
            block w-full pl-10 pr-10 py-1.5 border border-neutral-200 dark:border-neutral-700 
            rounded-lg bg-neutral-50 dark:bg-neutral-900 text-sm 
            placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200 dark:focus:ring-neutral-700
            transition-all
            ${isMobile ? 'h-9' : 'h-8'}
          `}
          placeholder={t('search.placeholder')}
        />
        {(query || isMobile) && (
          <button
            onClick={handleClear}
            className="absolute inset-y-0 right-0 pr-2 flex items-center"
          >
            <div className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-md transition-colors">
               <X className="h-3.5 w-3.5 text-neutral-500" />
            </div>
          </button>
        )}
      </div>

      {/* Results Overlay */}
      <AnimatePresence>
        {showResults && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-neutral-900 rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-800 max-h-[400px] overflow-y-auto z-50 py-2"
          >
            {results.map((result, idx) => (
              <button
                key={`${result.sessionId}-${idx}`}
                onClick={() => handleSelect(result)}
                className="w-full text-left px-4 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors flex items-start gap-3 group"
              >
                <div className="mt-1 shrink-0 text-neutral-400 group-hover:text-black dark:group-hover:text-white transition-colors">
                    {result.type === 'project' && <LayoutTemplate className="w-4 h-4" />}
                    {result.type === 'message' && <MessageSquare className="w-4 h-4" />}
                    {result.type === 'slide' && <Presentation className="w-4 h-4" />}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                        {result.title}
                    </div>
                    <div className="text-xs text-neutral-500 flex items-center gap-1.5 truncate">
                        <span className="font-medium">{result.sessionTitle}</span>
                        <span className="text-neutral-300 dark:text-neutral-700">•</span>
                        <span>{result.subtitle}</span>
                        {result.type === 'project' && (
                          <>
                            <span className="text-neutral-300 dark:text-neutral-700">•</span>
                            <span>{t('search.slidesCount', { count: result.slideCount })}</span>
                            <span className="text-neutral-300 dark:text-neutral-700">•</span>
                            <span>{new Date(result.timestamp || 0).toLocaleDateString()}</span>
                          </>
                        )}
                    </div>
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
