import { MessageSquare, FileText } from 'lucide-react'
import { motion } from 'motion/react'
import { useUIStore } from '../store/useUIStore'
import { useTranslation } from 'react-i18next'
import { useSessionStore } from '../store/useSessionStore'
import { useQueueStore } from '../store/useQueueStore'

export default function MobileNavToggle({ className = '' }: { className?: string }) {
  const { mobileActiveTab, setMobileActiveTab } = useUIStore()
  const { t } = useTranslation()
  const { getCurrentSession, currentSessionId } = useSessionStore()
  const { items, isProjectProcessing } = useQueueStore()

  const currentSession = getCurrentSession()
  const projectId = currentSessionId || ''
  const isCurrentProjectProcessing = isProjectProcessing(projectId)
  
  const hasSlideData =
    isCurrentProjectProcessing ||
    items.some((i) => i.status === 'done' && i.slides && i.slides.length > 0 && i.projectId === projectId) ||
    (currentSession?.slides && currentSession.slides.length > 0)

  // Only show toggle if there is content to toggle between
  if (!hasSlideData) return null

  return (
    <div className={`md:hidden flex items-center bg-neutral-100 dark:bg-neutral-800 p-1 rounded-full border border-neutral-200 dark:border-neutral-700 ${className}`}>
      <button
        onClick={() => setMobileActiveTab('chat')}
        className={`relative px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-colors ${
          mobileActiveTab === 'chat' ? 'text-black dark:text-white' : 'text-neutral-500 dark:text-neutral-400'
        }`}
      >
        {mobileActiveTab === 'chat' && (
          <motion.div
            layoutId="activeTab"
            className="absolute inset-0 bg-white dark:bg-neutral-600 rounded-full shadow-sm"
            initial={false}
            transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
          />
        )}
        <span className="relative z-10 flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5" />
          <span className="text-[10px] font-semibold">Chat</span>
        </span>
      </button>

      <button
        onClick={() => setMobileActiveTab('script')}
        className={`relative px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-colors ${
          mobileActiveTab === 'script' ? 'text-black dark:text-white' : 'text-neutral-500 dark:text-neutral-400'
        }`}
      >
        {mobileActiveTab === 'script' && (
          <motion.div
            layoutId="activeTab"
            className="absolute inset-0 bg-white dark:bg-neutral-600 rounded-full shadow-sm"
            initial={false}
            transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
          />
        )}
        <span className="relative z-10 flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" />
          <span className="text-[10px] font-semibold">{t('workspace.title')}</span>
        </span>
      </button>
    </div>
  )
}
