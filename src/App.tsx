import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Toaster, toast } from 'sonner'
import { Settings as SettingsIcon, Menu, Github, Search } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useSettingsStore } from './store/useSettingsStore'
import { useQueueStore } from './store/useQueueStore'
import { useSessionStore } from './store/useSessionStore'
import { applyDelta } from './utils/slideMerger'
import Settings from './components/Settings'
import Sidebar from './components/Sidebar'
import MessageList from './components/MessageList'
import ChatInput from './components/ChatInput'
import ScriptWorkspace from './components/ScriptWorkspace'
import MobileNavToggle from './components/MobileNavToggle'
import ResizableDivider from './components/ResizableDivider'
import SEO from './components/SEO'
import ConfirmDialog from './components/ConfirmDialog'
import { useUIStore } from './store/useUIStore'
import GlobalSearch from './components/GlobalSearch'
import LoadingScreen from './components/LoadingScreen'
import HeroSection from './components/HeroSection'
import { usePWAInstall } from './hooks/usePWAInstall'

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
  const { theme } = useSettingsStore()
  const { items, getActiveProcessForProject, isProjectProcessing } = useQueueStore()
  const { sessions, createSession, addMessage, currentSessionId, getCurrentSession, setCurrentSession, setSessionSlides, newChat } = useSessionStore()
  const [showSettings, setShowSettings] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)
  const savedItemIds = useRef<Set<string>>(new Set())
  const scheduledDeletions = useRef<Set<string>>(new Set())
  const mountedRef = useRef(false)
  const isMobile = useIsMobile()
  const { mobileActiveTab, setMobileActiveTab, heroHold, splitPaneWidth, setSplitPaneWidth, isInitialLoad, setInitialLoad } = useUIStore()
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false)
  const { isInstallable, installApp } = usePWAInstall()

  useEffect(() => {
    if (isInitialLoad) {
      const timer = setTimeout(() => {
        setInitialLoad(false)
      }, 2300)
      return () => clearTimeout(timer)
    }
  }, [isInitialLoad, setInitialLoad])

  const currentSession = getCurrentSession()
  const messages = currentSession?.messages ?? []
  const projectId = currentSessionId || ''
  const isStreaming = isProjectProcessing(projectId)
  const activeItem = getActiveProcessForProject(projectId)
  
  // Intent-Aware: Only consider it "slide data" if action is slide-related
  const isSlideAction = activeItem?.responseAction === 'create' || 
                        activeItem?.responseAction === 'append' || 
                        activeItem?.responseAction === 'update'
  const hasReceivedSlideAction = activeItem?.hasReceivedAction && isSlideAction

  const hasSlideData =
    hasReceivedSlideAction ||
    items.some((i) => i.status === 'done' && i.slides && i.slides.length > 0 && i.projectId === projectId) ||
    (currentSession?.slides && currentSession.slides.length > 0)

  // Auto-switch to script panel on mobile when generating slides (but not for chat responses)
  useEffect(() => {
    if (!isMobile || !isStreaming) return
    if (hasReceivedSlideAction) {
      setMobileActiveTab('script')
    }
  }, [isMobile, hasReceivedSlideAction, isStreaming, setMobileActiveTab])

  // Background completion notification (global listener)
  useEffect(() => {
    const unsubscribe = useQueueStore.subscribe((state, prevState) => {
      // Find projects that just completed
      const prevProcesses = prevState?.activeProcesses || {}
      const currentProcesses = state?.activeProcesses || {}

      Object.keys(prevProcesses).forEach(pid => {
        // If project was processing but now isn't, and it's not the current project
        if (prevProcesses[pid] && !currentProcesses[pid] && pid !== currentSessionId) {
          const session = sessions.find(s => s.id === pid)
          if (session) {
            toast.success(t('workspace.backgroundComplete'), {
              description: t('workspace.backgroundCompleteDesc', { title: session.title }),
              action: {
                label: t('workspace.view'),
                onClick: () => setCurrentSession(pid)
              }
            })
          }
        }
      })
    })
    return unsubscribe
  }, [currentSessionId, sessions, setCurrentSession, t])

  // Persist completed slides to session & save messages
  useEffect(() => {
    const doneItems = items.filter(
      (i) => i.status === 'done' && i.slides && i.slides.length > 0 && i.result
    )
    for (const item of doneItems) {
      if (savedItemIds.current.has(item.id)) continue

      // Check if this item is already scheduled for delayed processing
      if (scheduledDeletions.current.has(item.id)) continue

      if (item.responseAction === 'delete') {
        scheduledDeletions.current.add(item.id)
        setTimeout(() => {
          handleMsgCreation(item)
        }, 2000)
        continue
      }

      handleMsgCreation(item)
    }
  }, [items, currentSessionId, createSession, addMessage, setSessionSlides])

  // Helper to process the message creation (extracted from effect)
  const handleMsgCreation = (item: any) => {
    // Re-check session in case it changed during timeout
    const currentSessionId = useSessionStore.getState().currentSessionId
    if (!currentSessionId && !item.prompt) return

    if (savedItemIds.current.has(item.id)) return

    let sessionId = currentSessionId
    if (!sessionId) {
      const title = item.prompt.length > 60
        ? item.prompt.slice(0, 60) + '...'
        : item.prompt
      sessionId = createSession(title)
    }

    // Capture previous state BEFORE updating
    const prevSlides = getCurrentSession()?.slides || []

    // Save slides to current session
    const action = item.responseAction || (item.contextSlideNumbers?.length ? 'update' : 'create')
    const mergedSlides = applyDelta(prevSlides, { action, slides: item.slides! })
    setSessionSlides(mergedSlides)

    // Capture full slide state after the update
    const updatedSession = getCurrentSession()
    const slideSnapshot = updatedSession?.slides
      ? JSON.parse(JSON.stringify(updatedSession.slides))
      : item.slides!

    let affectedSlides: any[] = []

    if (item.contextSlideNumbers && item.contextSlideNumbers.length > 0) {
      affectedSlides = item.slides!
    } else {
      affectedSlides = item.slides!.filter((s: any) => {
        const prev = prevSlides.find(p => p.slide_number === s.slide_number)
        if (!prev) return true
        return prev.content !== s.content || prev.title !== s.title
      })
    }

    addMessage({
      role: 'assistant',
      content: item.completionMessage
        || (item.responseAction === 'delete' && item.slides!.length > 0
          ? t('chat.deletedSlides', { count: item.slides!.length, slides: item.slides!.map((s: any) => s.slide_number).join(', ') })
          : (item.slides!.length > 0
            ? t('chat.generatedSlides', { count: item.slides!.length })
            : item.result!)),
      thinking: item.thinking,
      slides: item.slides,
      timestamp: Date.now(),
      isScriptGeneration: true,
      slideSnapshot,
      relatedSlideReferences: affectedSlides.map((s: any) => ({
        id: `slide-card-${s.slide_number}`,
        number: s.slide_number,
        label: t('chat.slideLabel', { number: s.slide_number })
      })),
      action // Pass the determined action to the message
    })

    savedItemIds.current.add(item.id)
  }

  // Sync dark class & theme color
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    
    // Update theme-color meta tag for mobile browser and PWA chrome
    let metaThemeColor = document.querySelector('meta[name="theme-color"]')
    if (!metaThemeColor) {
      metaThemeColor = document.createElement('meta')
      metaThemeColor.setAttribute('name', 'theme-color')
      document.getElementsByTagName('head')[0].appendChild(metaThemeColor)
    }
    metaThemeColor.setAttribute('content', theme === 'dark' ? '#0a0a0a' : '#ffffff')
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
        window.history.replaceState(null, '', import.meta.env.BASE_URL)
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
        window.history.pushState(null, '', `${import.meta.env.BASE_URL}?project_id=${currentSessionId}`)
      }
    } else {
      const params = new URLSearchParams(window.location.search)
      if (params.has('project_id')) {
        window.history.pushState(null, '', import.meta.env.BASE_URL)
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

  // Auto-adjust chat panel width when sidebar expands/collapses
  useEffect(() => {
    if (isMobile || !hasSlideData) return

    if (sidebarCollapsed) {
      // Sidebar collapsed: can use smaller chat width
      setSplitPaneWidth(35)
    } else {
      // Sidebar expanded: give chat more space
      setSplitPaneWidth(45)
    }
  }, [sidebarCollapsed, isMobile, hasSlideData, setSplitPaneWidth])

  const handleNewChat = useCallback(() => {
    // clearItems() // Don't clear items, allow background processing
    newChat()
    setSidebarCollapsed(false)
    setShowMobileSidebar(false)
    setMobileActiveTab('chat')
  }, [newChat, setMobileActiveTab])

  const handleSessionSelect = useCallback(() => {
    setShowMobileSidebar(false)
    setMobileActiveTab('chat')
  }, [setMobileActiveTab])

  return (
    <>
      <SEO />
      <AnimatePresence>
        {isInitialLoad && (
          <motion.div
            key="loading-screen"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="fixed inset-0 z-[60]"
          >
            <LoadingScreen />
          </motion.div>
        )}
      </AnimatePresence>
      <Toaster
        position="top-center"
        richColors
        closeButton
        theme={theme === 'dark' ? 'dark' : 'light'}
        offset="64px"
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
      <ConfirmDialog />


      <AnimatePresence>
        {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      </AnimatePresence>

      <div className="h-[100dvh] flex flex-col overflow-hidden bg-white dark:bg-neutral-950 transition-opacity">
        {/* Header */}
        <header className="shrink-0 h-12 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 z-40 relative">
          <div className="h-full flex items-center justify-between px-4">

            {/* Left Side */}
            <div className={`flex items-center gap-2.5 ${isMobile && isMobileSearchOpen ? 'hidden' : 'flex'}`}>
              {/* Mobile hamburger */}
              <button
                onClick={() => isMobile ? setShowMobileSidebar(true) : setSidebarCollapsed((v) => !v)}
                className="md:hidden p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <Menu className="w-4 h-4" />
              </button>
              <div
                onClick={handleNewChat}
                className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <img src={`${import.meta.env.BASE_URL}assets/logo.png`} alt="Logo" className="w-7 h-7 object-contain" />
                <span className="text-sm font-bold tracking-tight max-[480px]:hidden">{t('app.title')}</span>
              </div>
            </div>

            {/* Global Search Center */}
            {/* Desktop */}
            {!isMobile && (
              <div className="flex-1 flex justify-center">
                <GlobalSearch
                  isOpen={false}
                  onClose={() => { }}
                  isMobile={false}
                />
              </div>
            )}

            {/* Mobile Overlay */}
            <AnimatePresence>
              {isMobile && isMobileSearchOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="absolute inset-x-0 top-0 h-12 bg-white dark:bg-neutral-950 z-50 px-2 flex items-center border-b border-neutral-200 dark:border-neutral-800"
                >
                  <GlobalSearch
                    isOpen={true}
                    onClose={() => setIsMobileSearchOpen(false)}
                    isMobile={true}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Right side actions */}
            <div className={`flex items-center gap-2 ${isMobile && isMobileSearchOpen ? 'hidden' : 'flex'}`}>
              {isInstallable && (
                <button
                  onClick={installApp}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black dark:bg-white text-white dark:text-black text-[11px] font-bold hover:opacity-90 transition-all cursor-pointer shadow-sm active:scale-95"
                  title={t('app.install')}
                >
                  <img src={`${import.meta.env.BASE_URL}assets/logo.png`} alt="" className="w-3.5 h-3.5 invert dark:invert-0" />
                  <span>{t('app.install')}</span>
                </button>
              )}
              <MobileNavToggle />

              {isMobile && (
                <button
                  onClick={() => setIsMobileSearchOpen(true)}
                  className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  <Search className="w-[18px] h-[18px] text-neutral-500" />
                </button>
              )}

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
        <div className="flex-1 flex min-h-0 relative overflow-hidden">
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
          <div
            className={`
            flex flex-col min-w-0 bg-white dark:bg-neutral-950
            ${mobileActiveTab === 'chat' ? 'flex-1 w-full' : 'hidden'}
            md:flex ${hasSlideData && !heroHold ? 'md:min-w-[320px]' : 'md:flex-1 w-full'}
          `}
            style={hasSlideData && !isMobile && !heroHold ? { width: `${splitPaneWidth}%` } : undefined}>
            {/* Show hero only when no messages AND no slides (new project state) */}
            {heroHold || (messages.length === 0 && !hasSlideData) ? (
              <HeroSection />
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
          </div>

          {/* Resizable divider */}
          {hasSlideData && !heroHold && (
            <ResizableDivider
              onResize={setSplitPaneWidth}
              minWidth={500}
              maxPercentage={70}
            />
          )}

          {/* Workspace panel */}
          <AnimatePresence mode="popLayout">
            {hasSlideData && !heroHold && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                className={`
                  flex-col min-w-0 bg-white dark:bg-neutral-950
                  ${mobileActiveTab === 'script' ? 'flex flex-1 w-full' : 'hidden'}
                  md:flex
                `}
                style={!isMobile ? { width: `${100 - splitPaneWidth}%` } : undefined}
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
