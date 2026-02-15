import { useMemo, useState, useRef, useEffect } from 'react'
import { useSessionStore, type ChatMessage } from '../store/useSessionStore'
import { extractCompletionMessage } from '../api/parseStream'
import MarkdownRenderer from './MarkdownRenderer'
import { Sparkles, Presentation, RotateCcw, Copy, Edit, X, Paperclip } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import ClarificationRequest from './ClarificationRequest'
import { useQueueStore } from '../store/useQueueStore'
import { confirmAction } from '../utils/confirmAction'

const MAX_CHARS = 4096
const MAX_ATTACHED_FILES = 3
const MAX_ATTACH_BYTES = 200_000
const MAX_IMAGE_BYTES = 4_000_000
const ALLOWED_EXT = ['.txt', '.md', '.json', '.csv', '.jpg', '.jpeg', '.png', '.webp']
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp']
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp']

interface MessageBubbleProps {
  message: ChatMessage
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const { t } = useTranslation()
  const { highlightSlide, restoreSnapshot, getCurrentSession, addMessage, updateMessage, createSession, currentSessionId, deleteMessagesFrom, deleteMessage, hasCheckpointAfterTimestamp, getLastCheckpointBeforeMessageId, clearCompaction } = useSessionStore()
  const { addToQueue, items: queueItems, removeQueueItem } = useQueueStore()

  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState('')
  const [editedAttachedFiles, setEditedAttachedFiles] = useState<{ name: string; content: string; type?: 'text' | 'image'; mimeType?: string }[]>([])
  const [fileOverlay, setFileOverlay] = useState<{ name: string; content: string; type?: 'text' | 'image' } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      const len = textareaRef.current.value.length
      textareaRef.current.setSelectionRange(len, len)
    }
  }, [isEditing])

  useEffect(() => {
    if (!isEditing) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsEditing(false)
        setEditedContent(message.role === 'user' ? message.content : '')
        setEditedAttachedFiles(message.attachedFiles ? [...message.attachedFiles] : [])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isEditing, message.role, message.content, message.attachedFiles])

  // Handle clarification selection
  const handleClarificationSelect = (answer: string) => {
    // Send user's answer as a new message
    addMessage({
      role: 'user',
      content: answer,
      timestamp: Date.now(),
      isScriptGeneration: false
    })

    // Update the Ask message to persist the selection
    updateMessage(message.id, { selectedOption: answer })

    // Trigger new generation with the clarification answer
    let activeProjectId = currentSessionId
    if (!currentSessionId) {
      activeProjectId = createSession(answer.slice(0, 60))
    }
    addToQueue(answer, activeProjectId!)
  }

  // Clean content logic - must run before any early return (hooks rule)
  const displayContent = useMemo(() => {
    if (message.role !== 'assistant' || !message.isScriptGeneration) {
      // For user messages or normal chat, just return content
      return message.content
    }

    // Try extracting text after the JSON (works for both NDJSON and legacy format)
    const afterJson = extractCompletionMessage(message.content)
    if (afterJson) return afterJson

    // Check if content contains structured data (NDJSON or JSON array)
    const trimmed = message.content.trim()
    
    // NDJSON format: starts with { and contains newlines with more {
    const isNDJSON = trimmed.startsWith('{') && trimmed.includes('\n{')
    
    // Legacy JSON array format
    const isJSONArray = trimmed.startsWith('[') || trimmed.includes('[\n')
    
    if (isNDJSON || isJSONArray) {
      return `✅ ${t('chat.scriptGenerated')}`
    }

    return message.content
  }, [message.content, message.role, message.isScriptGeneration, t])

  // Render interactive clarification if present (after all hooks)
  if (message.isInteractive && message.clarification) {
    return (
      <div className="max-w-[85%]">
        <ClarificationRequest
          question={message.clarification.question}
          options={message.clarification.options}
          allowCustom={message.clarification.allowCustom}
          onSelect={handleClarificationSelect}
          selectedOption={message.selectedOption}
        />
      </div>
    )
  }

  const handleRestore = () => {
    if (!message.slideSnapshot || message.slideSnapshot.length === 0) return
    const currentSlides = getCurrentSession()?.slides ?? []
    if (JSON.stringify(currentSlides) === JSON.stringify(message.slideSnapshot)) {
      toast.info(t('chat.alreadyAtCheckpoint'))
      return
    }
    restoreSnapshot(JSON.parse(JSON.stringify(message.slideSnapshot)))
  }

  const handleCopy = async () => {
    const textToCopy = message.role === 'assistant' ? displayContent : message.content
    if (!textToCopy?.trim()) return
    try {
      await navigator.clipboard.writeText(textToCopy.trim())
      toast.success(t('chat.copied'))
    } catch {
      toast.error(t('chat.copyFailed'))
    }
  }

  const handleEdit = () => {
    setEditedContent(message.content ?? '')
    setEditedAttachedFiles(message.attachedFiles ? [...message.attachedFiles] : [])
    setIsEditing(true)
  }

  const handleCancelQueue = () => {
    const queueItem = queueItems.find((i) => i.messageId === message.id && i.status === 'queued')
    if (queueItem) {
      removeQueueItem(queueItem.id)
      deleteMessage(message.id)
    }
  }

  // Queue position for pending messages (1-based: 1 = next to process). Recomputes when queue changes (item sent/done/cancelled).
  const projectQueueKey = useMemo(
    () =>
      queueItems
        .filter((i) => i.projectId === currentSessionId && (i.status === 'queued' || i.status === 'processing'))
        .map((i) => `${i.id}:${i.status}`)
        .join(','),
    [queueItems, currentSessionId]
  )
  const queuePosition = useMemo(() => {
    if (!message.isPending || !currentSessionId) return null
    const projectItems = queueItems.filter(
      (i) => i.projectId === currentSessionId && (i.status === 'queued' || i.status === 'processing')
    )
    const idx = projectItems.findIndex((i) => i.messageId === message.id)
    return idx >= 0 ? idx + 1 : null
  }, [message.isPending, message.id, currentSessionId, projectQueueKey, queueItems])

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditedContent(message.content ?? '')
    setEditedAttachedFiles(message.attachedFiles ? [...message.attachedFiles] : [])
  }

  const removeEditedFile = (index: number) => {
    setEditedAttachedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const readFileAsText = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve((reader.result as string) ?? '')
      reader.onerror = () => reject(reader.error)
      reader.readAsText(file, 'UTF-8')
    })

  const readFileAsDataURL = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve((reader.result as string) ?? '')
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })

  const isImageFile = (file: File): boolean =>
    IMAGE_EXT.includes('.' + (file.name.split('.').pop() ?? '').toLowerCase()) || IMAGE_MIMES.includes(file.type)

  const handleEditAttachChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    e.target.value = ''
    if (files.length === 0) return
    const valid: File[] = []
    for (const file of files) {
      const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase()
      if (!ALLOWED_EXT.includes(ext) && !IMAGE_MIMES.includes(file.type)) {
        toast.error(t('chat.attachFileUnsupported'))
        continue
      }
      if (isImageFile(file)) {
        if (file.size > MAX_IMAGE_BYTES) {
          toast.error(t('chat.attachImageTooBig'))
          continue
        }
      } else {
        if (file.size > MAX_ATTACH_BYTES) {
          toast.error(t('chat.attachFileTooBig'))
          continue
        }
      }
      valid.push(file)
    }
    if (valid.length === 0) return
    const slots = MAX_ATTACHED_FILES - editedAttachedFiles.length
    if (slots <= 0) {
      toast.error(t('chat.attachFilesMaxCount'))
      return
    }
    const toProcess = valid.slice(0, slots)
    if (valid.length > slots) toast.error(t('chat.attachFilesMaxCount'))
    Promise.all(
      toProcess.map((file) => {
        if (isImageFile(file)) {
          return readFileAsDataURL(file).then((content) => ({
            name: file.name,
            content,
            type: 'image' as const,
            mimeType: file.type || 'image/jpeg',
          }))
        }
        return readFileAsText(file).then((content) => ({ name: file.name, content, type: 'text' as const }))
      })
    )
      .then((toAdd) => {
        setEditedAttachedFiles((prev) => [...prev, ...toAdd])
      })
      .catch(() => toast.error(t('chat.attachFileError')))
  }

  const performResend = () => {
    if (!currentSessionId) return
    const promptPart = editedContent.trim()
    const textFiles = editedAttachedFiles.filter((f) => f.type !== 'image')
    const filesPart =
      textFiles.length > 0
        ? textFiles.map((f) => `[From file: ${f.name}]\n\n${f.content}`).join('\n\n')
        : ''
    const fullContent =
      promptPart && filesPart ? promptPart + '\n\n' + filesPart : promptPart || filesPart
    if (!fullContent.trim() && editedAttachedFiles.length === 0) return
    if (fullContent.length > MAX_CHARS) {
      toast.error(t('chat.overLimit'))
      return
    }

    const snapshotToRestore = getLastCheckpointBeforeMessageId(message.id)
    deleteMessagesFrom(message.id)
    clearCompaction(currentSessionId)
    if (snapshotToRestore) restoreSnapshot(snapshotToRestore)
    addMessage({
      role: 'user',
      content: promptPart,
      timestamp: Date.now(),
      isScriptGeneration: false,
      ...(editedAttachedFiles.length > 0 && {
        attachedFiles: editedAttachedFiles.map((f) => ({ name: f.name, content: f.content, type: f.type, mimeType: f.mimeType }))
      })
    })
    addToQueue(fullContent.trim() || '', currentSessionId, undefined, editedAttachedFiles.length > 0 ? editedAttachedFiles.map((f) => ({ name: f.name, content: f.content, type: f.type, mimeType: f.mimeType })) : undefined)
    setIsEditing(false)
    setEditedAttachedFiles([])
  }

  const handleSaveEdit = () => {
    const promptPart = editedContent.trim()
    const hasFiles = editedAttachedFiles.length > 0
    if (!promptPart && !hasFiles) return
    const origFiles = message.attachedFiles ?? []
    const samePrompt = promptPart === (message.content ?? '')
    const filesSignature = (list: { name: string; content: string; type?: string; mimeType?: string }[]) =>
      list.map((f) => f.name + '\0' + (f.type ?? '') + '\0' + (f.mimeType ?? '') + '\0' + f.content).join('\0')
    const sameFiles = filesSignature(origFiles) === filesSignature(editedAttachedFiles)
    const contentUnchanged = samePrompt && sameFiles
    if (contentUnchanged) {
      setIsEditing(false)
      setEditedAttachedFiles([])
      return
    }
    if (hasCheckpointAfterTimestamp(message.timestamp)) {
      confirmAction(
        t('chat.editCheckpointWarning'),
        performResend,
        {
          title: t('chat.editCheckpointTitle'),
          variant: 'destructive',
          confirmText: t('common.confirm'),
          cancelText: t('common.cancel')
        }
      )
    } else {
      performResend()
    }
  }

  // Styling based on role (wider when user is editing so the text field feels full-width)
  const bubbleClass = message.role === 'user'
    ? `bg-neutral-200 dark:bg-zinc-700 text-neutral-900 dark:text-zinc-100 rounded-2xl rounded-br-md px-4 py-2.5 ${isEditing ? 'min-w-[70%] w-full max-w-[88%]' : 'max-w-[90%]'}`
    : 'bg-neutral-100 dark:bg-zinc-900 text-neutral-800 dark:text-zinc-300 rounded-2xl rounded-bl-md px-4 py-2.5 max-w-[90%]'

  return (
    <div className={bubbleClass}>
      {/* Script generation badge + Checkpoint + Time (Header) */}
      {message.role === 'assistant' && !message.isThinking && message.slideSnapshot && message.slideSnapshot.length > 0 && (
        <div className="flex flex-nowrap items-center justify-between gap-2 mb-1.5 w-full min-w-0">
          <div className="flex flex-nowrap items-center gap-2 min-w-0 flex-1">
            {/* Slides count (only for script generation) */}
            {message.isScriptGeneration && (
              <div className="flex items-center gap-1.5 shrink-0">
                {message.action === 'update' ? (
                   <Presentation className="w-3 h-3 text-neutral-400" />
                ) : (
                   <Sparkles className="w-3 h-3 text-neutral-400" />
                )}
                <span className="text-[10px] font-medium text-neutral-400">
                  {message.action === 'delete' ? '-' : (message.action === 'update' ? '' : '+')}
                  {message.slides?.length ?? 0} {t('workspace.slidesUnit')}
                </span>
              </div>
            )}

            {/* Checkpoint Button */}
            {message.slideSnapshot && message.slideSnapshot.length > 0 && (
              <button
                onClick={handleRestore}
                title={t('chat.restoreSnapshot') + ` (${t('chat.snapshotSlides', { count: message.slideSnapshot.length })})`}
                className="snapshot-restore flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold border border-neutral-200/80 dark:border-zinc-700/80 text-neutral-500 dark:text-zinc-400 hover:border-neutral-400 dark:hover:border-zinc-500 hover:text-neutral-700 dark:hover:text-zinc-200 transition-all active:scale-[0.97] cursor-pointer shrink-0"
              >
                <RotateCcw className="w-2.5 h-2.5 shrink-0" />
                <span className="hidden min-[480px]:inline">{t('chat.restoreSnapshot')}</span>
                <span className="text-neutral-400 dark:text-zinc-600 font-normal shrink-0">
                  ({t('chat.snapshotSlides', { count: message.slideSnapshot.length })})
                </span>
              </button>
            )}

            {/* Copy (icon only, to the right of Restore, top row) */}
            <button
              onClick={handleCopy}
              title={t('chat.copy')}
              aria-label={t('chat.copy')}
              className="flex items-center justify-center p-1 rounded-md border border-neutral-200/80 dark:border-zinc-700/80 text-neutral-500 dark:text-zinc-400 hover:border-neutral-400 dark:hover:border-zinc-500 hover:text-neutral-700 dark:hover:text-zinc-200 transition-all active:scale-[0.97] cursor-pointer shrink-0"
            >
              <Copy className="w-2.5 h-2.5" />
            </button>
          </div>

          {/* Time */}
          <p className="text-[10px] text-neutral-400 dark:text-zinc-500 whitespace-nowrap shrink-0 ml-1">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
            {' '}
            {new Date(message.timestamp).toLocaleDateString([], { day: '2-digit', month: '2-digit' })}
          </p>
        </div>
      )}

      {/* Thinking / Content */}
      {message.isThinking ? (
        <div className="flex items-center gap-2.5 py-1">
          <span className="dot-typing text-neutral-500">
            <span /><span /><span />
          </span>
          <span className="text-[12px] text-neutral-500">
            {message.content?.trim() ? message.content : t('workspace.enhancing')}
          </span>
        </div>
      ) : message.role === 'user' && isEditing ? (
        <div className="flex flex-col gap-2 mt-1 w-full min-w-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.json,.csv,image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            aria-hidden
            onChange={handleEditAttachChange}
          />
          <textarea
            ref={textareaRef}
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            className="w-full min-w-0 min-h-[60px] px-3 py-2 rounded-lg text-[13px] bg-neutral-100 dark:bg-zinc-800 border border-neutral-300 dark:border-zinc-600 text-neutral-900 dark:text-zinc-100 placeholder-neutral-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-zinc-500 resize-y box-border"
            placeholder={t('chat.placeholder')}
            rows={3}
          />
          {/* Attached files in edit mode */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-neutral-500 dark:text-zinc-400">
              {t('chat.attachLabel')}:
            </span>
            {editedAttachedFiles.map((f, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] bg-neutral-200/80 dark:bg-zinc-600/80 text-neutral-700 dark:text-zinc-200 truncate max-w-[180px]"
              >
                {f.type === 'image' ? (
                  <img src={f.content} alt="" className="w-8 h-8 object-cover rounded shrink-0" />
                ) : null}
                <span className="truncate" title={f.name}>{f.name}</span>
                <button
                  type="button"
                  onClick={() => removeEditedFile(i)}
                  title={t('chat.attachRemoveFile')}
                  className="p-0.5 rounded hover:bg-neutral-300 dark:hover:bg-zinc-500 shrink-0"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
            {editedAttachedFiles.length < MAX_ATTACHED_FILES && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title={t('chat.attachFile')}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border border-dashed border-neutral-400 dark:border-zinc-500 text-neutral-600 dark:text-zinc-400 hover:border-neutral-500 dark:hover:border-zinc-400 hover:bg-neutral-100 dark:hover:bg-zinc-700/50 transition-colors"
              >
                <Paperclip className="w-3 h-3" />
                {t('chat.attachFile')}
              </button>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={handleCancelEdit}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium border border-neutral-300 dark:border-zinc-600 text-neutral-600 dark:text-zinc-400 hover:bg-neutral-100 dark:hover:bg-zinc-800 transition-colors"
            >
              {t('chat.editCancel')}
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={!editedContent.trim() && editedAttachedFiles.length === 0}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-neutral-800 dark:bg-zinc-200 text-white dark:text-neutral-900 hover:bg-neutral-700 dark:hover:bg-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t('chat.editSend')}
            </button>
          </div>
        </div>
      ) : (
        <>
          {message.content?.trim() && (
            <MarkdownRenderer
              content={displayContent}
              className="text-[13px]"
            />
          )}
          {message.role === 'user' && message.attachedFiles && message.attachedFiles.length > 0 && (
            <div className={`mt-2 flex flex-wrap items-center gap-1.5 ${message.content?.trim() ? 'pt-2 border-t border-neutral-200/60 dark:border-zinc-600/60' : ''}`}>
              <span className="text-[11px] font-medium text-neutral-500 dark:text-zinc-400">
                {t('chat.attachLabel')}:
              </span>
              {message.attachedFiles.map((f, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setFileOverlay({ name: f.name, content: f.content, type: f.type })}
                  title={t('chat.attachViewFile')}
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-neutral-200/80 dark:bg-zinc-600/80 text-neutral-700 dark:text-zinc-200 hover:bg-neutral-300 dark:hover:bg-zinc-500 border border-transparent hover:border-neutral-400/50 dark:hover:border-zinc-500 transition-colors ${f.type === 'image' ? '' : 'truncate max-w-[180px]'}`}
                >
                  {f.type === 'image' ? (
                    <img src={f.content} alt="" className="w-8 h-8 object-cover rounded shrink-0" />
                  ) : null}
                  <span className="truncate">{f.name}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Overlay: view attached file content */}
      {fileOverlay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 dark:bg-black/60"
          onClick={() => setFileOverlay(null)}
          role="dialog"
          aria-modal="true"
          aria-label={t('chat.attachViewFile')}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-neutral-200 dark:border-zinc-700 max-w-2xl w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-neutral-200 dark:border-zinc-700">
              <span className="text-sm font-semibold text-neutral-900 dark:text-zinc-100 truncate min-w-0" title={fileOverlay.name}>
                {fileOverlay.name}
              </span>
              <button
                type="button"
                onClick={() => setFileOverlay(null)}
                className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-700 dark:hover:text-zinc-300 hover:bg-neutral-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
                aria-label={t('common.cancel')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {(fileOverlay.type === 'image' || fileOverlay.content.startsWith('data:image/')) ? (
              <div className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-[200px]">
                <img src={fileOverlay.content} alt={fileOverlay.name} className="max-w-full max-h-[70vh] object-contain rounded" />
              </div>
            ) : (
              <pre className="flex-1 overflow-auto px-4 py-3 text-[12px] leading-relaxed text-neutral-800 dark:text-zinc-200 whitespace-pre-wrap break-words font-sans">
                {fileOverlay.content}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* Slide reference badge (hidden when Quick Links are present) */}
      {message.relatedSlideNumber != null && !(message.relatedSlideReferences && message.relatedSlideReferences.length > 0) && (
        <button
          onClick={() => highlightSlide(message.relatedSlideNumber!)}
          className={`
            inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-md text-[10px] font-semibold
            transition-all active:scale-95 cursor-pointer
            ${message.role === 'user'
              ? 'bg-neutral-300/50 hover:bg-neutral-300 text-neutral-600 dark:bg-white/15 dark:hover:bg-white/25 dark:text-white/80'
              : 'bg-neutral-200 dark:bg-zinc-700 hover:bg-neutral-300 dark:hover:bg-zinc-600 text-neutral-600 dark:text-zinc-300'
            }
          `}
        >
          <Presentation className="w-2.5 h-2.5" />
          {t('chat.slideRef', { number: message.relatedSlideNumber })}
        </button>
      )}

      {/* Smart Navigation Buttons */}
      {message.relatedSlideReferences && message.relatedSlideReferences.length > 0 && (
        <div className={`mt-3 flex flex-wrap gap-2 pt-2 border-t ${message.role === 'user'
            ? 'border-neutral-300/50 dark:border-zinc-600'
            : 'border-neutral-200 dark:border-zinc-800'
          }`}>
          <span className={`text-[10px] uppercase tracking-wider font-semibold self-center mr-1 ${message.role === 'user'
              ? 'text-neutral-500 dark:text-zinc-400'
              : 'text-neutral-400 dark:text-zinc-500'
            }`}>
            {t('chat.quickLinks')}:
          </span>
          {message.relatedSlideReferences.map((ref) => (
            <button
              key={ref.number}
              onClick={() => highlightSlide(ref.number)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border active:scale-95 ${message.role === 'user'
                  ? 'bg-neutral-300/60 dark:bg-zinc-600 border-neutral-400/50 dark:border-zinc-500 text-neutral-700 dark:text-zinc-200 hover:bg-neutral-400/60 dark:hover:bg-zinc-500'
                  : 'bg-neutral-200 dark:bg-zinc-800 border-neutral-300 dark:border-zinc-700 text-neutral-700 dark:text-zinc-300 hover:bg-neutral-300 dark:hover:bg-zinc-700'
                }`}
            >
              {ref.label}
            </button>
          ))}
        </div>
      )}

      {/* Footer: Copy + Edit (user only) + Time — one line only */}
      {(message.role === 'user' || (message.role === 'assistant' && !(message.slideSnapshot && message.slideSnapshot.length > 0))) && !(message.role === 'user' && isEditing) && (
        <div className="flex flex-nowrap items-center justify-between gap-2 mt-2 min-w-0 w-full">
          <div className="flex flex-nowrap items-center gap-1 min-w-0">
            <button
              onClick={handleCopy}
              title={t('chat.copy')}
              aria-label={t('chat.copy')}
              className="flex items-center justify-center p-1 rounded-md border border-neutral-200/80 dark:border-zinc-700/80 text-neutral-500 dark:text-zinc-400 hover:border-neutral-400 dark:hover:border-zinc-500 hover:text-neutral-700 dark:hover:text-zinc-200 transition-all active:scale-[0.97] cursor-pointer shrink-0"
            >
              <Copy className="w-2.5 h-2.5" />
            </button>
            {message.role === 'user' && (
              message.isPending ? (
                <button
                  onClick={handleCancelQueue}
                  title={t('chat.cancelQueue')}
                  aria-label={t('chat.cancelQueue')}
                  className="flex items-center justify-center p-1 rounded-md border border-neutral-200/80 dark:border-zinc-700/80 text-neutral-500 dark:text-zinc-400 hover:border-red-500 hover:text-red-500 transition-all active:scale-[0.97] cursor-pointer shrink-0"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              ) : (
                <button
                  onClick={handleEdit}
                  title={t('chat.edit')}
                  aria-label={t('chat.edit')}
                  className="flex items-center justify-center p-1 rounded-md border border-neutral-200/80 dark:border-zinc-700/80 text-neutral-500 dark:text-zinc-400 hover:border-neutral-400 dark:hover:border-zinc-500 hover:text-neutral-700 dark:hover:text-zinc-200 transition-all active:scale-[0.97] cursor-pointer shrink-0"
                >
                  <Edit className="w-2.5 h-2.5" />
                </button>
              )
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {message.isPending && queuePosition != null && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-neutral-300/80 dark:bg-zinc-600/80 text-neutral-600 dark:text-zinc-300">
                {t('chat.queueBadge', { position: queuePosition })}
              </span>
            )}
            <p className={`text-[10px] whitespace-nowrap ${message.role === 'user'
              ? 'text-neutral-400 dark:text-zinc-400 pr-1'
              : 'text-neutral-400 dark:text-zinc-500 ml-2'
            }`}>
              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
              {' '}
              {new Date(message.timestamp).toLocaleDateString([], { day: '2-digit', month: '2-digit' })}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
