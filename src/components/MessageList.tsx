import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'motion/react'
import { User, Ellipsis, Eraser, Download, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { confirmAction } from '../utils/confirmAction'
import type { ChatMessage } from '../store/useSessionStore'
import { useSessionStore } from '../store/useSessionStore'
import { useQueueStore } from '../store/useQueueStore'
import MessageBubble from './MessageBubble'
import CompactStatusView from './CompactStatusView'
import { extractCompletionMessage } from '../api/parseStream'

interface MessageListProps {
  messages: ChatMessage[]
  isStreaming?: boolean
  streamingThinking?: string
}

export default function MessageList({ messages, isStreaming, streamingThinking }: MessageListProps) {
  const { t } = useTranslation()
  const bottomRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const { clearCurrentMessages, getCurrentSession, renameSession, currentSessionId } = useSessionStore()
  const { getActiveProcessForProject } = useQueueStore()
  const currentSession = getCurrentSession()
  
  // Check if we're waiting for action type to be determined
  const activeItem = getActiveProcessForProject(currentSessionId || '')
  const isWaitingForAction = isStreaming && !activeItem?.hasReceivedAction

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, isStreaming, streamingThinking])

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const handleClearChat = () => {
    setMenuOpen(false)
    confirmAction(
      t('chat.clearChatConfirm'),
      () => {
        clearCurrentMessages()
        toast.success(t('chat.chatCleared'))
      },
      { confirmText: t('chat.clearChat'), cancelText: t('chat.cancel'), variant: 'destructive', title: t('chat.clearChat') },
    )
  }

  const handleExportChat = () => {
    setMenuOpen(false)
    if (!currentSession || messages.length === 0) return

    const lines = messages.map((msg) => {
      const time = new Date(msg.timestamp).toLocaleString()
      const role = msg.role === 'user' ? t('chat.you') : t('chat.assistant')

      let content = msg.content
      if (msg.role === 'assistant' && msg.isScriptGeneration) {
        // Try extracting text after the JSON data
        const afterJson = extractCompletionMessage(msg.content)
        if (afterJson) {
          content = afterJson
        } else {
          // Check if content is structured data (NDJSON or JSON array)
          const trimmed = msg.content.trim()
          const isNDJSON = trimmed.startsWith('{') && trimmed.includes('\n{')
          const isJSONArray = trimmed.startsWith('[')
          
          if (isNDJSON || isJSONArray) {
            content = t('chat.scriptGenerated')
          }
        }
      }

      return `[${time}] ${role}:\n${content}\n`
    })

    const text = `Chat — ${currentSession.title}\n${'—'.repeat(40)}\n\n${lines.join('\n')}`
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vibriona-chat-${currentSession.title.slice(0, 30).replace(/\s+/g, '_')}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(t('chat.chatExported'))
  }

  const handleStartRename = () => {
    if (!currentSession) return
    setMenuOpen(false)
    setIsRenaming(true)
    setRenameValue(currentSession.title)
    setTimeout(() => renameInputRef.current?.focus(), 50)
  }

  const handleRenameSubmit = () => {
    if (currentSession && renameValue.trim()) {
      renameSession(currentSession.id, renameValue.trim())
    }
    setIsRenaming(false)
    setRenameValue('')
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleRenameSubmit()
    } else if (e.key === 'Escape') {
      setIsRenaming(false)
      setRenameValue('')
    }
  }

  // Shared Header Component
  const ChatHeader = (
    <div className="shrink-0 flex items-center justify-between h-10 px-4 border-b border-neutral-100 dark:border-zinc-800/60">
      {isRenaming ? (
        <input
          ref={renameInputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={handleRenameKeyDown}
          onBlur={handleRenameSubmit}
          className="w-full max-w-[300px] text-[11px] font-medium leading-tight text-neutral-700 dark:text-neutral-300 bg-white dark:bg-zinc-800 border border-neutral-300 dark:border-zinc-600 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-400"
        />
      ) : (
        <span
          className="text-[11px] font-medium text-neutral-400 dark:text-zinc-500 truncate cursor-pointer hover:text-neutral-600 dark:hover:text-zinc-300 transition-colors"
          onDoubleClick={handleStartRename}
          title={t('sessions.renameHint')}
        >
          {currentSession?.title ?? ''}
        </span>
      )}

      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          <Ellipsis className="w-4 h-4" />
        </button>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -2 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -2 }}
              transition={{ duration: 0.12 }}
              className="absolute right-0 top-full mt-1 z-50 w-44 py-1 rounded-lg border border-neutral-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg"
            >
              <button
                onClick={handleStartRename}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-neutral-600 dark:text-zinc-300 hover:bg-neutral-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <Pencil className="w-3 h-3 text-neutral-400" />
                {t('sessions.renameProject')}
              </button>
              <button
                onClick={handleExportChat}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-neutral-600 dark:text-zinc-300 hover:bg-neutral-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <Download className="w-3 h-3 text-neutral-400" />
                {t('chat.exportChat')}
              </button>
              <div className="my-0.5 mx-2 border-t border-neutral-100 dark:border-zinc-800" />
              <button
                onClick={handleClearChat}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
              >
                <Eraser className="w-3 h-3" />
                {t('chat.clearChat')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        {ChatHeader}
        {/* Empty message area */}
        <div className="flex-1" />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {ChatHeader}

      {/* Messages */}
      <div className={`flex-1 overflow-y-auto px-3 md:px-4 py-5 transition-all duration-200 ${menuOpen ? 'blur-sm pointer-events-none select-none opacity-60' : ''}`}>
        <div className="max-w-full mx-auto space-y-4">
          {(() => {
            // Split: trigger (last non-pending user) vs queued (pending) messages
            const triggerIndex = messages
              .map((m, i) => ({ m, i }))
              .reverse()
              .find(({ m }) => m.role === 'user' && !m.isPending)?.i ?? -1
            const beforeTrigger = triggerIndex >= 0 ? messages.slice(0, triggerIndex + 1) : messages
            const afterTrigger = triggerIndex >= 0 ? messages.slice(triggerIndex + 1) : []
            const hasThinkingMessage = messages.some((m) => m.isThinking)
            const showGlobalThinking = isStreaming && !hasThinkingMessage

            const renderMsg = (msg: ChatMessage) => {
              if (msg.isCompactionPlaceholder) {
                if (!msg.compactionPhase) return null
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="w-full"
                  >
                    <CompactStatusView message={msg} />
                  </motion.div>
                )
              }
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.2 }}
                  className={`flex gap-3 w-full min-w-0 ${msg.role === 'user' ? 'justify-end' : 'justify-start'} ${msg.isPending ? 'opacity-50' : ''}`}
                >
                  <div className={`flex gap-3 min-w-0 ${msg.role === 'user' ? 'flex-row-reverse flex-1 justify-start' : 'flex-row'}`}>
                    {msg.role === 'assistant' && (
                      <div className="shrink-0 w-7 h-7 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mt-0.5">
                        <img src="assets/logo.png" alt={t('app.title')} className="w-5 h-5 object-contain" />
                      </div>
                    )}
                    {msg.role === 'user' && (
                      <div className="shrink-0 w-7 h-7 rounded-lg bg-neutral-300 dark:bg-white flex items-center justify-center mt-0.5">
                        <User className="w-3.5 h-3.5 text-neutral-600 dark:text-black" />
                      </div>
                    )}
                    <MessageBubble message={msg} />
                  </div>
                </motion.div>
              )
            }

            return (
              <>
                {beforeTrigger.map(renderMsg)}
                {/* Thinking indicator: only when no per-message thinking (legacy/fallback) */}
                {showGlobalThinking && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="flex gap-3 justify-start"
            >
              <div className="shrink-0 w-7 h-7 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mt-0.5">
                <img src="assets/logo.png" alt={t('app.title')} className="w-5 h-5 object-contain animate-pulse" />
              </div>
              <div className="bg-neutral-100 dark:bg-zinc-900 rounded-2xl rounded-bl-md px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="dot-typing text-neutral-500">
                    <span /><span /><span />
                  </span>
                  <span className="text-[12px] text-neutral-500">
                    {isWaitingForAction ? t('chat.waiting') : (streamingThinking ? t('thinking.active') : t('chat.processing'))}
                  </span>
                </div>
              </div>
            </motion.div>
          )}
                {afterTrigger.map(renderMsg)}
              </>
            )
          })()}

          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}
