import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Toaster, toast } from 'sonner'
import { Settings as SettingsIcon, Menu, Github } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useSettingsStore } from './store/useSettingsStore'
import { useQueueStore } from './store/useQueueStore'
import { useSessionStore } from './store/useSessionStore'
import ConfigurationModal from './components/ConfigurationModal'
import Settings from './components/Settings'
import Sidebar from './components/Sidebar'
import MessageList from './components/MessageList'
import ChatInput from './components/ChatInput'
import ScriptWorkspace from './components/ScriptWorkspace'
import MobileNavToggle from './components/MobileNavToggle'
import SEO from './components/SEO'
import { useUIStore } from './store/useUIStore'

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [breakpoint])
  return isMobile
}

function App() {
  const { t } = useTranslation()
  const { theme, isConfigured } = useSettingsStore()
  const { items, isProcessing, clearItems } = useQueueStore()
  const { sessions, createSession, addMessage, currentSessionId, getCurrentSession, setCurrentSession, setSessionSlides, mergeSlides, newChat } = useSessionStore()
  const [showSettings, setShowSettings] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)
  const configured = isConfigured()
  const savedItemIds = useRef<Set<string>>(new Set())
  const mountedRef = useRef(false)
  const isMobile = useIsMobile()
  const { mobileActiveTab, setMobileActiveTab } = useUIStore()

  const currentSession = getCurrentSession()
  const messages = currentSession?.messages ?? []
  const sessionSlides = currentSession?.slides ?? []

  // Show workspace when we have slides (session-scoped or streaming)
  const hasSlideData =
    isProcessing ||
    items.some((i) => i.status === 'done' && i.slides && i.slides.length > 0) ||
    sessionSlides.length > 0

  // Streaming state for message list
  const activeItem = items.find((i) => i.status === 'processing')
  const isStreaming = isProcessing && activeItem != null

  // Auto-switch to workspace on mobile when slides arrive
  useEffect(() => {
    if (isMobile && hasSlideData && isStreaming) {
      setMobileActiveTab('script')
    }
  }, [isMobile, hasSlideData, isStreaming, setMobileActiveTab])

  // Persist completed slides to session & save messages
  useEffect(() => {
    const doneItems = items.filter(
      (i) => i.status === 'done' && i.slides && i.slides.length > 0 && i.result
    )
    for (const item of doneItems) {
      if (savedItemIds.current.has(item.id)) continue

      let sessionId = currentSessionId
      if (!sessionId) {
        const title = item.prompt.length > 60
          ? item.prompt.slice(0, 60) + '...'
          : item.prompt
        sessionId = createSession(title)
      }

      // Capture previous state BEFORE updating
      const prevSlides = getCurrentSession()?.slides || []

      // Save slides to current session (merge for contextual edits, replace otherwise)
      if (item.contextSlideNumbers && item.contextSlideNumbers.length > 0) {
        mergeSlides(item.slides!)
      } else {
        setSessionSlides(item.slides!)
      }

      // Capture full slide state after the update for snapshot restoration
      const updatedSession = getCurrentSession()
      const slideSnapshot = updatedSession?.slides
        ? JSON.parse(JSON.stringify(updatedSession.slides))
        : item.slides!

      // Calculate affected slides for "Smart Check"
      // If it's a context update (mergeSlides), the item.slides ARE the affected ones.
      // If it's a full generation/append, we diff against prevSlides.
      let affectedSlides: any[] = []

      if (item.contextSlideNumbers && item.contextSlideNumbers.length > 0) {
        affectedSlides = item.slides!
      } else {
        affectedSlides = item.slides!.filter(s => {
          const prev = prevSlides.find(p => p.slide_number === s.slide_number)
          if (!prev) return true // New slide
          // Check if content changed (ignoring purely visual/internal fields if needed, 
          // but title/content changes are what satisfy the user)
          return prev.content !== s.content || prev.title !== s.title
        })
      }

      // User message is added optimistically in ChatInput — only add assistant message here
      addMessage({
        role: 'assistant',
        content: item.completionMessage 
          || (item.slides!.length > 0
            ? `Generated ${item.slides!.length} slides for your presentation.`
            : item.result!),
        thinking: item.thinking,
        slides: item.slides,
        timestamp: Date.now(),
        isScriptGeneration: true,
        slideSnapshot,
        relatedSlideReferences: affectedSlides.map(s => ({
          id: `slide-card-${s.slide_number}`,
          number: s.slide_number,
          label: `Slide ${s.slide_number}`
        }))
      })

      savedItemIds.current.add(item.id)
    }
  }, [items, currentSessionId, createSession, addMessage, setSessionSlides, mergeSlides])

  // Sync dark class
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // Deep linking: restore session from URL on mount
  useEffect(() => {
    if (mountedRef.current) return
    mountedRef.current = true

    const params = new URLSearchParams(window.location.search)
    const projectId = params.get('project_id')

    if (projectId) {
      const { sessions: allSessions } = useSessionStore.getState()
      const exists = allSessions.some((s) => s.id === projectId)
      if (exists) {
        setCurrentSession(projectId)
        setSidebarCollapsed(true)
      } else {
        toast.error(t('sessions.notFound'))
        window.history.replaceState(null, '', '/')
      }
    } else {
      newChat()
      setSidebarCollapsed(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync currentSessionId → URL (after mount)
  useEffect(() => {
    if (!mountedRef.current) return

    if (currentSessionId) {
      const params = new URLSearchParams(window.location.search)
      if (params.get('project_id') !== currentSessionId) {
        window.history.pushState(null, '', `/?project_id=${currentSessionId}`)
      }
    } else {
      const params = new URLSearchParams(window.location.search)
      if (params.has('project_id')) {
        window.history.pushState(null, '', '/')
      }
    }
  }, [currentSessionId])

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search)
      const projectId = params.get('project_id')
      if (projectId) {
        const exists = sessions.some((s) => s.id === projectId)
        if (exists) {
          setCurrentSession(projectId)
          setSidebarCollapsed(true)
        } else {
          newChat()
          setSidebarCollapsed(false)
        }
      } else {
        newChat()
        setSidebarCollapsed(false)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [sessions, setCurrentSession, newChat])

  const handleNewChat = useCallback(() => {
    clearItems()
    newChat()
    setSidebarCollapsed(false)
    setShowMobileSidebar(false)
    setMobileActiveTab('chat')
  }, [clearItems, newChat, setMobileActiveTab])

  const handleSessionSelect = useCallback(() => {
    setShowMobileSidebar(false)
    setMobileActiveTab('chat')
  }, [setMobileActiveTab])

  return (
    <>
      <SEO />
      <Toaster
        position="top-center"
        richColors
        closeButton
        theme={theme === 'dark' ? 'dark' : 'light'}
        toastOptions={{
          className: 'dark:bg-neutral-900 dark:text-white dark:border-neutral-800 bg-white text-neutral-900 border-neutral-200 shadow-lg',
          descriptionClassName: 'text-neutral-500 dark:text-neutral-400',
          actionButtonStyle: {
            background: theme === 'dark' ? '#fff' : '#000',
            color: theme === 'dark' ? '#000' : '#fff',
          },
          style: {
            fontSize: '14px',
            padding: '16px',
            borderRadius: '12px',
          },
        }}
      />

      {!configured && <ConfigurationModal />}
      <AnimatePresence>
        {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      </AnimatePresence>

      <div className={`h-screen flex flex-col transition-opacity ${!configured ? 'opacity-30 pointer-events-none select-none' : ''}`}>
        {/* Header */}
        <header className="shrink-0 h-12 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 z-40">
          <div className="h-full flex items-center justify-between px-4">
            <div className="flex items-center gap-2.5">
              {/* Mobile hamburger */}
              <button
                onClick={() => isMobile ? setShowMobileSidebar(true) : setSidebarCollapsed((v) => !v)}
                className="md:hidden p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <Menu className="w-4 h-4" />
              </button>
              <img src={`${import.meta.env.BASE_URL}assets/logo.png`} alt="Logo" className="w-7 h-7 object-contain" />
              <span className="text-sm font-bold tracking-tight">{t('app.title')}</span>
              {isProcessing && (
                <span className="dot-typing text-neutral-400 ml-0.5">
                  <span /><span /><span />
                </span>
              )}
            </div>

            {/* Right side actions */}
            <div className="flex items-center gap-2">
              <MobileNavToggle />

              <button
                onClick={() => setShowSettings(true)}
                className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                title={t('settings.title')}
              >
                <SettingsIcon className="w-[18px] h-[18px] text-neutral-500" />
              </button>

              <a
                href="https://github.com/KhanhNguyen9872"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer text-neutral-500 hover:text-black dark:hover:text-white"
                title="GitHub"
              >
                <Github className="w-[18px] h-[18px]" />
              </a>
            </div>
          </div>
        </header>

        {/* Main content area */}
        <div className="flex-1 flex min-h-0 relative">
          {/* Desktop sidebar */}
          <div className="hidden md:block">
            <Sidebar
              collapsed={sidebarCollapsed}
              onToggle={() => setSidebarCollapsed((v) => !v)}
              onNewChat={handleNewChat}
              onSessionSelect={handleSessionSelect}
            />
          </div>

          {/* Mobile sidebar overlay */}
          <AnimatePresence>
            {showMobileSidebar && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="md:hidden fixed inset-0 z-50 flex"
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-black/50"
                  onClick={() => setShowMobileSidebar(false)}
                />
                <motion.div
                  initial={{ x: -280 }}
                  animate={{ x: 0 }}
                  exit={{ x: -280 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                  className="relative z-10 w-[280px] h-full"
                >
                  <Sidebar
                    collapsed={false}
                    onToggle={() => setShowMobileSidebar(false)}
                    onNewChat={handleNewChat}
                    onSessionSelect={handleSessionSelect}
                  />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Chat panel */}
          <motion.div
            layout
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className={`
            flex flex-col min-w-0 bg-white dark:bg-neutral-950
            ${mobileActiveTab === 'chat' ? 'flex-1 w-full' : 'hidden'}
            md:flex ${hasSlideData ? 'md:flex-[2] md:min-w-[320px] md:border-r md:border-neutral-200 md:dark:border-neutral-800' : 'md:flex-1 w-full'}
          `}>
            {messages.length === 0 && !isStreaming ? (
              <div className="flex-1 flex flex-col items-center justify-center p-4">
                <div className="w-full max-w-2xl space-y-8">
                  <div className="text-center space-y-2">
                    <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
                      {t('app.hero')}
                    </h1>
                    <p className="text-neutral-500 dark:text-neutral-400">
                      {t('app.heroSub')}
                    </p>
                  </div>
                  <ChatInput variant="centered" />
                </div>
              </div>
            ) : (
              <>
                <MessageList
                  messages={messages}
                  isStreaming={isStreaming}
                  streamingThinking={activeItem?.thinkingText}
                />
                <ChatInput />
              </>
            )}
          </motion.div>

          {/* Workspace panel */}
          <AnimatePresence mode="popLayout">
            {hasSlideData && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                className={`
                  flex-col min-w-0 bg-white dark:bg-neutral-950
                  ${mobileActiveTab === 'script' ? 'flex flex-1 w-full' : 'hidden'}
                  md:flex md:flex-[3]
                `}
              >
                 <ScriptWorkspace />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </>
  )
}

export default App
