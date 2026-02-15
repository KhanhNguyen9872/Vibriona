import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { X, Check } from 'lucide-react'
import { type Session } from '../store/useSessionStore'
import { 
  PROJECT_ICONS, 
  PROJECT_ICON_IDS, 
  DEFAULT_PROJECT_ICON, 
  SessionIcon 
} from './Sidebar'

interface IconPickerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  session: Session
  onSelectIcon: (sessionId: string, iconId: string) => void
}

export function IconPickerModal({ open, onOpenChange, session, onSelectIcon }: IconPickerModalProps) {
  const { t } = useTranslation()
  const [previewIconId, setPreviewIconId] = useState<string | null>(null)

  // Reset preview when opening
  useEffect(() => {
    if (open) {
      setPreviewIconId(null)
    }
  }, [open])

  const currentIcon = previewIconId ?? session.icon ?? DEFAULT_PROJECT_ICON

  const handleApply = () => {
    onSelectIcon(session.id, currentIcon)
    onOpenChange(false)
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const date = d.toLocaleDateString([], { day: '2-digit', month: '2-digit' })
    return `${time} ${date}`
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', duration: 0.5, bounce: 0.3 }}
            className="fixed inset-0 z-[101] flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && onOpenChange(false)}
          >
            <div 
              className="bg-white dark:bg-zinc-900 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-800">
                <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
                  {t('sessions.chooseIcon')}
                </h2>
                <button
                  onClick={() => onOpenChange(false)}
                  className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                
                {/* Left Panel: Preview */}
                <div className="w-full md:w-[320px] bg-neutral-50 dark:bg-black/30 border-r border-neutral-200 dark:border-neutral-800 p-6 flex flex-col gap-8 overflow-y-auto">
                  <div>
                    <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-4">
                      {t('sessions.previewLabel')}
                    </h3>
                    
                    <div className="space-y-6 pointer-events-none select-none">
                      {/* Expanded View Preview */}
                      <div className="space-y-2">
                        <p className="text-[10px] text-neutral-400 text-center mb-2">Expanded</p>
                        <div className="w-[260px] bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden shadow-sm mx-auto p-2">
                          <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-neutral-200/70 dark:bg-neutral-800">
                            <SessionIcon iconId={currentIcon} className="w-4 h-4 text-neutral-600 dark:text-neutral-300 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-medium truncate leading-tight text-neutral-900 dark:text-white">
                                {session.title}
                              </p>
                              <div className="flex items-center justify-between mt-0.5">
                                <p className="text-[10px] text-neutral-400">
                                  {formatTime(session.timestamp)}
                                </p>
                                {session.slides && session.slides.length > 0 && (
                                  <span className="text-[10px] font-medium text-neutral-500 bg-neutral-100 dark:bg-neutral-700 px-1.5 rounded-full">
                                    {session.slides.length}p
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Collapsed View Preview */}
                      <div className="space-y-2">
                        <p className="text-[10px] text-neutral-400 text-center mb-2">Collapsed</p>
                        <div className="w-[60px] bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden shadow-sm mx-auto p-2 flex justify-center">
                          <div className="p-2 rounded-lg bg-neutral-200/70 dark:bg-neutral-800">
                            <SessionIcon iconId={currentIcon} className="w-5 h-5 text-neutral-900 dark:text-white" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Panel: Icon Grid */}
                <div className="flex-1 p-6 overflow-y-auto bg-white dark:bg-zinc-900/50">
                  <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
                    {PROJECT_ICON_IDS.map((id) => {
                      const Icon = PROJECT_ICONS[id]
                      const isSelected = currentIcon === id
                      return (
                        <button
                          key={id}
                          onClick={() => setPreviewIconId(id)}
                          className={`
                            aspect-square flex items-center justify-center rounded-xl text-3xl transition-all duration-200
                            ${isSelected 
                              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 scale-105 ring-2 ring-blue-600 ring-offset-2 dark:ring-offset-zinc-900' 
                              : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:scale-105'
                            }
                          `}
                        >
                          <Icon strokeWidth={1.5} className="w-8 h-8" />
                        </button>
                      )
                    })}
                  </div>
                </div>

              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-zinc-900/50">
                <button
                  onClick={() => onOpenChange(false)}
                  className="px-4 py-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/50 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleApply}
                  className="px-6 py-2 text-sm font-medium text-white bg-neutral-900 dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 rounded-lg shadow-lg shadow-black/5 transition-all active:scale-[0.98] flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  {t('sessions.applyIcon')}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
