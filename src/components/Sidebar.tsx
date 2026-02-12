import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { confirmAction } from '../utils/confirmAction'
import { motion, AnimatePresence } from 'motion/react'
import { MAX_PROJECTS } from '../config/limits'
import { useSessionStore, type Session } from '../store/useSessionStore'
import { useQueueStore } from '../store/useQueueStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { ProfileManagerDialog } from './profile/ProfileManagerDialog'
import {
  MessageSquare,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  MoreVertical,
  Trash2,
  Download,
  Pin,
  PinOff,
  Pencil,
  User,
  MoreHorizontal,
  FolderInput
} from 'lucide-react'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  onNewChat: () => void
  onSessionSelect?: () => void
}

export default function Sidebar({ collapsed, onToggle, onNewChat, onSessionSelect }: SidebarProps) {
  const { t } = useTranslation()
  const { sessions, currentSessionId, setCurrentSession, deleteSession, importSession, pinSession, renameSession, clearSessions } =
    useSessionStore()
  const { profiles, activeProfileId } = useSettingsStore()
  const { isProjectProcessing } = useQueueStore()
  
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null)
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [showProfileManager, setShowProfileManager] = useState(false)
  const [showFooterMenu, setShowFooterMenu] = useState(false)
  
  const renameInputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const footerMenuRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const activeProfile = profiles.find(p => p.id === activeProfileId)

  // Close menus on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuSessionId && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuSessionId(null)
      }
      if (showFooterMenu && footerMenuRef.current && !footerMenuRef.current.contains(e.target as Node)) {
        setShowFooterMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuSessionId, showFooterMenu])

  const handleSelect = (sessionId: string) => {
    setCurrentSession(sessionId)
    onSessionSelect?.()
  }

  const handleDelete = (id: string) => {
    setMenuSessionId(null)
    confirmAction(
      t('sessions.deleteConfirm'),
      () => deleteSession(id),
      { confirm: t('sessions.deleteSession'), cancel: t('chat.cancel') },
    )
  }

  const handleNewChatClick = useCallback(() => {
    // Check limit
    if (sessions.length >= MAX_PROJECTS) {
      toast.error(t('sessions.limitReached', { limit: MAX_PROJECTS }))
      return
    }
    onNewChat()
  }, [onNewChat, t, sessions])

  const handlePin = (id: string) => {
    setMenuSessionId(null)
    pinSession(id)
  }

  const handleStartRename = (session: Session) => {
    setMenuSessionId(null)
    setRenamingSessionId(session.id)
    setRenameValue(session.title)
    setTimeout(() => renameInputRef.current?.focus(), 50)
  }

  const handleRenameSubmit = () => {
    if (renamingSessionId && renameValue.trim()) {
      renameSession(renamingSessionId, renameValue.trim())
    }
    setRenamingSessionId(null)
    setRenameValue('')
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleRenameSubmit()
    } else if (e.key === 'Escape') {
      setRenamingSessionId(null)
      setRenameValue('')
    }
  }

  // Sort: pinned first, then by timestamp descending
  const sortedSessions = [...sessions].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return b.timestamp - a.timestamp
  })

  const handleExportSession = (id: string) => {
    setMenuSessionId(null)
    const session = sessions.find((s) => s.id === id)
    if (!session) return

    const payload = {
      meta: {
        app: 'Vibriona',
        version: '1.0',
        exportedAt: new Date().toISOString(),
      },
      project: {
        id: session.id,
        title: session.title,
        createdAt: session.timestamp,
        messages: session.messages,
        slides: session.slides,
      },
    }

    const json = JSON.stringify(payload, null, 2)
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vibriona-${session.title.slice(0, 30).replace(/\s+/g, '_')}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(t('sessions.exported'))
  }

  const handleImport = () => {
    fileInputRef.current?.click()
    setShowFooterMenu(false)
  }

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Check limit
    if (sessions.length >= MAX_PROJECTS) {
      toast.error(t('sessions.limitReached', { limit: MAX_PROJECTS }))
      // Reset input even if failed
      e.target.value = ''
      return
    }

    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string)

        // Support new schema (project wrapper) and legacy schema (flat)
        const isNewFormat = data.project && typeof data.project === 'object'
        const title = isNewFormat ? data.project.title : data.meta?.title
        const messages = isNewFormat ? data.project.messages : data.messages
        const slides = isNewFormat ? data.project.slides : data.slides
        const timestamp = isNewFormat
          ? (data.project.createdAt || Date.now())
          : (data.meta?.timestamp || Date.now())

        if (!title || !Array.isArray(messages)) {
          toast.error(t('sessions.importInvalid'))
          return
        }

        const session: Session = {
          id: crypto.randomUUID(),
          title,
          messages,
          slides: Array.isArray(slides) ? slides : [],
          timestamp,
        }

        importSession(session)
        toast.success(t('sessions.imported'))
      } catch {
        toast.error(t('sessions.importInvalid'))
      }
    }
    reader.readAsText(file)

    // Reset input so same file can be selected again
    e.target.value = ''
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const date = d.toLocaleDateString([], { day: '2-digit', month: '2-digit' })
    return `${time} ${date}`
  }

  return (
    <>
      <motion.aside
        animate={{ width: collapsed ? 48 : 260 }}
        transition={{ type: 'spring', stiffness: 400, damping: 35 }}
        className="shrink-0 h-full bg-neutral-50 dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 flex flex-col overflow-hidden"
      >
        {/* Top bar */}
        <div
          className={`shrink-0 flex items-center h-12 border-b border-neutral-200 dark:border-neutral-800 ${collapsed ? 'justify-center' : 'justify-between px-3'
            }`}
        >
          {!collapsed && (
            <button
              onClick={handleNewChatClick}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('sessions.newChat')}
            </button>
          )}
          <button
            onClick={onToggle}
            className="p-2 rounded-md text-neutral-400 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            title={collapsed ? t('sessions.expandSidebar') : t('sessions.collapseSidebar')}
          >
            {collapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
          </button>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto py-2 px-2 scrollbar-thin">
            {!collapsed && sessions.length === 0 ? (
              <p className="text-[11px] text-neutral-400 text-center mt-8 px-4">
                {t('sessions.empty')}
              </p>
            ) : (
               <AnimatePresence>
                {!collapsed ? sortedSessions.map((session) => (
                  <motion.div
                    key={session.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.15 }}
                    className="relative mb-0.5"
                  >
                    <button
                      onClick={() => handleSelect(session.id)}
                      className={`group w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all duration-200 cursor-pointer ${session.id === currentSessionId
                          ? 'bg-neutral-200/70 dark:bg-neutral-800'
                          : 'hover:bg-neutral-200/40 dark:hover:bg-neutral-800/40'
                        } ${menuSessionId && menuSessionId !== session.id ? 'blur-[2px] opacity-50 scale-[0.98] pointer-events-none' : ''
                        }`}
                    >
                      <div className="relative shrink-0">
                        <MessageSquare className="w-3.5 h-3.5 text-neutral-400" />
                        {session.pinned && (
                          <Pin className="w-2 h-2 text-amber-500 absolute -top-1 -right-1" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        {renamingSessionId === session.id ? (
                          <input
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={handleRenameKeyDown}
                            onBlur={handleRenameSubmit}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full text-[11px] font-medium leading-tight text-neutral-700 dark:text-neutral-300 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-blue-400"
                          />
                        ) : (
                          <p className="text-[11px] font-medium truncate leading-tight text-neutral-700 dark:text-neutral-300">
                            {session.title}
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-0.5">
                          <p className="text-[10px] text-neutral-400">
                            {formatTime(session.timestamp)}
                          </p>
                          <div className="flex items-center gap-2">
                            {isProjectProcessing(session.id) && (
                              <span className="dot-typing-mini scale-75 origin-right" />
                            )}
                            {session.slides && session.slides.length > 0 && (
                              <span className="text-[10px] font-medium text-neutral-500 bg-neutral-100 dark:bg-neutral-800 px-1.5 rounded-full">
                                {session.slides.length}{t('workspace.slidesUnitShort')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Three-dot menu trigger */}
                      <div
                        onClick={(e) => {
                          e.stopPropagation()
                          setMenuSessionId(menuSessionId === session.id ? null : session.id)
                        }}
                        className="p-1 rounded hover:bg-neutral-300/50 dark:hover:bg-neutral-700 transition-all cursor-pointer shrink-0"
                      >
                        <MoreVertical className="w-3 h-3 text-neutral-400" />
                      </div>
                    </button>

                    {/* Dropdown menu */}
                    <AnimatePresence>
                      {menuSessionId === session.id && (
                        <motion.div
                          ref={menuRef}
                          initial={{ opacity: 0, scale: 0.95, y: -2 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -2 }}
                          transition={{ duration: 0.12 }}
                          className="absolute right-2 top-full mt-0.5 z-50 w-40 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl"
                        >
                          <button
                            onClick={() => handlePin(session.id)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                          >
                            {session.pinned ? (
                              <><PinOff className="w-3 h-3 text-neutral-400" />{t('sessions.unpinProject')}</>
                            ) : (
                              <><Pin className="w-3 h-3 text-neutral-400" />{t('sessions.pinProject')}</>
                            )}
                          </button>
                          <button
                            onClick={() => handleStartRename(session)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3 h-3 text-neutral-400" />
                            {t('sessions.renameProject')}
                          </button>
                          <div className="my-0.5 mx-2 border-t border-neutral-100 dark:border-neutral-800" />
                          <button
                            onClick={() => handleExportSession(session.id)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                          >
                            <Download className="w-3 h-3 text-neutral-400" />
                            {t('sessions.exportSession')}
                          </button>
                          <div className="my-0.5 mx-2 border-t border-neutral-100 dark:border-neutral-800" />
                          <button
                            onClick={() => handleDelete(session.id)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            {t('sessions.deleteSession')}
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )) : (
                    // Collapsed View Items (Icons only)
                    <div className="flex flex-col items-center gap-2">
                        <button
                            onClick={handleNewChatClick}
                            className="p-2 rounded-lg text-neutral-400 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                            title={t('sessions.newChat')}
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>
                )}
               </AnimatePresence>
            )
          }
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-neutral-200 dark:border-neutral-800 p-2 space-y-1">
            <div className={`flex items-center ${collapsed ? 'justify-center flex-col gap-2' : 'justify-between gap-1'}`}>
                {/* Profile Button */}
                <button
                    onClick={() => setShowProfileManager(true)}
                    className={`flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white group ${collapsed ? '' : 'flex-1'}`}
                    title="Manage Profile"
                >
                    <div className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-zinc-800 flex items-center justify-center text-neutral-600 dark:text-zinc-400 border border-neutral-200 dark:border-zinc-700 group-hover:border-neutral-400 dark:group-hover:border-zinc-500 transition-colors shrink-0">
                        <User className="w-4 h-4" />
                    </div>
                    {!collapsed && (
                        <div className="flex flex-col items-start overflow-hidden min-w-0">
                            <span className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">{t('app.title')}</span>
                            <span className={`text-xs font-medium truncate w-full text-left ${!activeProfile ? 'text-amber-500' : ''}`}>
                                {activeProfile?.name || t('profiles.noProfile')}
                            </span>
                        </div>
                    )}
                </button>

                {/* 3-Dots Menu */}
                <div className="relative">
                    <button
                        onClick={() => setShowFooterMenu(!showFooterMenu)}
                        className="p-2 rounded-md hover:bg-neutral-200/60 dark:hover:bg-neutral-800 text-neutral-500 hover:text-black dark:text-neutral-400 dark:hover:text-white transition-colors"
                    >
                        <MoreHorizontal className="w-5 h-5" />
                    </button>

                    <AnimatePresence>
                        {showFooterMenu && (
                            <motion.div
                                ref={footerMenuRef}
                                initial={{ opacity: 0, scale: 0.95, y: -20, x: collapsed ? 10 : 0 }}
                                animate={{ opacity: 1, scale: 1, y: -45, x: collapsed ? 10 : 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: -20, x: collapsed ? 10 : 0 }}
                                className={`absolute bottom-full ${collapsed ? 'left-full ml-2' : 'right-0'} mb-2 z-50 w-48 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl`}
                            >
                                <button
                                    onClick={handleImport}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                                >
                                    <FolderInput className="w-4 h-4" />
                                    {t('sessions.importChat')}
                                </button>
                                <button
                                    onClick={() => {
                                        setShowFooterMenu(false);
                                        confirmAction(
                                            t('sessions.deleteAllConfirm'),
                                            clearSessions,
                                            { confirm: t('sessions.deleteAll'), cancel: t('chat.cancel') }
                                        );
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    {t('sessions.deleteAll')}
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>

        <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileSelected}
            className="hidden"
        />

      </motion.aside>
      <ProfileManagerDialog open={showProfileManager} onOpenChange={setShowProfileManager} />
    </>
  )
}
