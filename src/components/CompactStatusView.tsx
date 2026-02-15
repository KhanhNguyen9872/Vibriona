import { useTranslation } from 'react-i18next'
import { Loader2, CheckCircle2 } from 'lucide-react'
import type { ChatMessage } from '../store/useSessionStore'

interface CompactStatusViewProps {
  message: ChatMessage
}

/**
 * Inline status for conversation compaction (not a chat bubble).
 * Shows "Compacting..." with spinner or "Conversation summary completed" with check.
 */
export default function CompactStatusView({ message }: CompactStatusViewProps) {
  const { t } = useTranslation()
  const isCompacting = message.compactionPhase === 'compacting'
  const isCompacted = message.compactionPhase === 'compacted'

  if (!isCompacting && !isCompacted) return null

  return (
    <div className="flex justify-center w-full py-1">
      <div
        className={`
          inline-flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-medium
          border shadow-sm
          ${isCompacting
            ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-200'
            : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-200'
          }
        `}
      >
        {isCompacting ? (
          <>
            <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden />
            <span>{t('chat.compacting')}</span>
          </>
        ) : (
          <>
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden />
            <span>{t('chat.compacted')}</span>
          </>
        )}
      </div>
    </div>
  )
}
