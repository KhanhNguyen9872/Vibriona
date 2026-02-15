import { useEffect, useState } from 'react'
import { X, CircleStop, AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const EXPORT_HINT_KEYS = Array.from({ length: 40 }, (_, i) => `workspace.exportModalHint${i + 1}` as const)
const HINT_ROTATE_MS = 10_000

export interface ExportProgressModalProps {
  isOpen: boolean
  current: number
  total: number
  status: string
  /** When set, generation stopped due to error; show STOP icon and message instead of progress. */
  error?: string | null
  /** Called when user clicks the X button to close the overlay. */
  onClose?: () => void
}

function pickRandomHintIndex() {
  return Math.floor(Math.random() * EXPORT_HINT_KEYS.length)
}

export function ExportProgressModal({
  isOpen,
  current,
  total,
  status,
  error = null,
  onClose,
}: ExportProgressModalProps) {
  const { t } = useTranslation()
  const [hintIndex, setHintIndex] = useState(() => pickRandomHintIndex())

  useEffect(() => {
    if (!isOpen || !!error) return
    const id = setInterval(() => {
      setHintIndex(pickRandomHintIndex())
    }, HINT_ROTATE_MS)
    return () => clearInterval(id)
  }, [isOpen, error])

  if (!isOpen) return null

  const percentage = total > 0 ? Math.round((current / total) * 100) : 0
  const isError = !!error

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      aria-busy={!isError}
      aria-label={isError ? t('workspace.exportModalExportError') : t('workspace.exportModalTitle')}
    >
      <div className="relative bg-white dark:bg-zinc-900 border border-neutral-200 dark:border-zinc-700 rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-1 rounded-lg text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
            aria-label={t('workspace.exportModalClose')}
          >
            <X className="w-5 h-5" />
          </button>
        )}
        <div className="flex flex-col items-center">
          {isError ? (
            <div
              className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 mb-4"
              aria-hidden
            >
              <CircleStop className="w-7 h-7" />
            </div>
          ) : (
            <div
              className="animate-spin rounded-full h-12 w-12 border-2 border-neutral-300 dark:border-zinc-600 border-t-indigo-600 dark:border-t-indigo-500 mb-4"
              aria-hidden
            />
          )}
          <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">
            {isError ? t('workspace.exportModalStopped') : t('workspace.exportModalTitle')}
          </h3>
          {isError ? (
            <p className="text-sm text-red-600 dark:text-red-400 mb-6 text-center min-h-[2.5rem]">
              {error}
            </p>
          ) : (
            <>
              <p className="text-sm text-neutral-500 dark:text-zinc-400 mb-4 text-center min-h-[2.5rem]">
                {status || t('workspace.exportModalPreparing')}
              </p>
              <p className="text-xs text-neutral-400 dark:text-zinc-500 text-center mb-4 min-h-[2rem] transition-opacity duration-300" key={hintIndex}>
                {t(EXPORT_HINT_KEYS[hintIndex])}
              </p>
              <div className="w-full bg-neutral-200 dark:bg-zinc-700 rounded-full h-2.5 mb-2">
                <div
                  className="bg-indigo-600 dark:bg-indigo-500 h-2.5 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${percentage}%` }}
                  role="progressbar"
                  aria-valuenow={current}
                  aria-valuemin={0}
                  aria-valuemax={total}
                  aria-label={t('workspace.exportModalProgressLabel')}
                />
              </div>
              <div className="text-right w-full text-xs text-neutral-500 dark:text-zinc-400 mb-4">
                {t('workspace.exportModalSlidesCount', { current, total })}
              </div>
              <div className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  {t('workspace.exportModalDoNotClose')}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
