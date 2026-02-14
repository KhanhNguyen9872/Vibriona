import { useMemo } from 'react'
import { useSessionStore, type ChatMessage } from '../store/useSessionStore'
import { extractCompletionMessage } from '../api/parseStream'
import MarkdownRenderer from './MarkdownRenderer'
import { Sparkles, Presentation, RotateCcw, Copy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import ClarificationRequest from './ClarificationRequest'
import { useQueueStore } from '../store/useQueueStore'

interface MessageBubbleProps {
  message: ChatMessage
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const { t } = useTranslation()
  const { highlightSlide, restoreSnapshot, getCurrentSession, addMessage, updateMessage, createSession, currentSessionId } = useSessionStore()
  const { addToQueue } = useQueueStore()

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

  // Render interactive clarification if present
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

  // Clean content logic
  const displayContent = useMemo(() => {
    if (message.role !== 'assistant' || !message.isScriptGeneration) {
      // For user messages or normal chat, just return content
      return message.content
    }

    // Try extracting text after the JSON array
    const afterJson = extractCompletionMessage(message.content)
    if (afterJson) return afterJson

    // Check if content contains a JSON array at all (fallback)
    const trimmed = message.content.trim()
    if (trimmed.startsWith('[') || trimmed.includes('[\n')) {
      return `✅ ${t('chat.scriptGenerated')}`
    }

    return message.content
  }, [message.content, message.role, message.isScriptGeneration])

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

  // Styling based on role
  const bubbleClass = message.role === 'user'
    ? 'bg-neutral-200 dark:bg-zinc-700 text-neutral-900 dark:text-zinc-100 rounded-2xl rounded-br-md px-4 py-2.5 max-w-[80%]'
    : 'bg-neutral-100 dark:bg-zinc-900 text-neutral-800 dark:text-zinc-300 rounded-2xl rounded-bl-md px-4 py-2.5 max-w-[80%]'

  return (
    <div className={bubbleClass}>
      {/* Script generation badge + Checkpoint + Time (Header) */}
      {message.role === 'assistant' && !message.isThinking && message.slideSnapshot && message.slideSnapshot.length > 0 && (
        <div className="flex items-center justify-between mb-1.5 w-full">
          <div className="flex items-center gap-3">
            {/* Slides count (only for script generation) */}
            {message.isScriptGeneration && (
              <div className="flex items-center gap-1.5">
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
                className="snapshot-restore flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold border border-neutral-200/80 dark:border-zinc-700/80 text-neutral-500 dark:text-zinc-400 hover:border-neutral-400 dark:hover:border-zinc-500 hover:text-neutral-700 dark:hover:text-zinc-200 transition-all active:scale-[0.97] cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                {t('chat.restoreSnapshot')}
                <span className="text-neutral-400 dark:text-zinc-600 font-normal">
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
          <p className="text-[10px] text-neutral-400 dark:text-zinc-500 whitespace-nowrap ml-2 pr-4">
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
          <span className="text-[12px] text-neutral-500">{t('workspace.enhancing')}</span>
        </div>
      ) : (
        <MarkdownRenderer
          content={displayContent}
          className="text-[13px]"
        />
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

      {/* Footer: Copy + Time — one line only (user: Copy left; assistant: same style as header row) */}
      {(message.role === 'user' || (message.role === 'assistant' && !(message.slideSnapshot && message.slideSnapshot.length > 0))) && (
        <div className="flex flex-nowrap items-center justify-between gap-2 mt-2 min-w-0 w-full">
          <button
            onClick={handleCopy}
            title={t('chat.copy')}
            aria-label={t('chat.copy')}
            className="flex items-center justify-center p-1 rounded-md border border-neutral-200/80 dark:border-zinc-700/80 text-neutral-500 dark:text-zinc-400 hover:border-neutral-400 dark:hover:border-zinc-500 hover:text-neutral-700 dark:hover:text-zinc-200 transition-all active:scale-[0.97] cursor-pointer shrink-0"
          >
            <Copy className="w-2.5 h-2.5" />
          </button>
          <p className={`text-[10px] whitespace-nowrap shrink-0 ${message.role === 'user'
              ? 'text-neutral-400 dark:text-zinc-400 pr-1'
              : 'text-neutral-400 dark:text-zinc-500 ml-2'
            }`}>
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
            {' '}
            {new Date(message.timestamp).toLocaleDateString([], { day: '2-digit', month: '2-digit' })}
          </p>
        </div>
      )}
    </div>
  )
}
