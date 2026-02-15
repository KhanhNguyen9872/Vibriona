import { useEffect, useState } from 'react'
import { X, CircleStop, AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

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

/** Modern monochrome loading indicator: three dots bouncing */
function LoaderDots() {
  return (
    <div className="flex items-center justify-center gap-1.5" aria-hidden>
      <span
        className="w-2 h-2 rounded-full bg-neutral-800 dark:bg-neutral-200 animate-[bounce_0.6s_ease-in-out_infinite]"
        style={{ animationDelay: '0ms' }}
      />
      <span
        className="w-2 h-2 rounded-full bg-neutral-800 dark:bg-neutral-200 animate-[bounce_0.6s_ease-in-out_infinite]"
        style={{ animationDelay: '150ms' }}
      />
      <span
        className="w-2 h-2 rounded-full bg-neutral-800 dark:bg-neutral-200 animate-[bounce_0.6s_ease-in-out_infinite]"
        style={{ animationDelay: '300ms' }}
      />
    </div>
  )
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 dark:bg-black/70 backdrop-blur-md"
      aria-busy={!isError}
      aria-label={isError ? t('workspace.exportModalExportError') : t('workspace.exportModalTitle')}
    >
      <div className="relative w-full max-w-md bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="p-6 sm:p-8">
          {onClose && (
            <button
              type="button"
              onClick={() => {
                if (!isError) {
                  toast(t('workspace.exportModalCancelConfirm'), {
                    action: {
                      label: t('common.yes'),
                      onClick: onClose,
                    },
                    cancel: {
                      label: t('common.no'),
                      onClick: () => {},
                    },
                  })
                } else {
                  onClose()
                }
              }}
              className="absolute top-5 right-5 p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800/80 transition-colors"
              aria-label={t('workspace.exportModalClose')}
            >
              <X className="w-5 h-5" />
            </button>
          )}

          <div className="flex flex-col items-center text-center">
            {/* Icon: error vs loading */}
            <div className="mb-6 flex justify-center">
              {isError ? (
                <div
                  className="flex items-center justify-center w-14 h-14 rounded-2xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300"
                  aria-hidden
                >
                  <CircleStop className="w-7 h-7" strokeWidth={2} />
                </div>
              ) : (
                <div className="w-14 h-14 flex items-center justify-center">
                  <LoaderDots />
                </div>
              )}
            </div>

            {/* Title */}
            <h3 className="text-lg sm:text-xl font-semibold tracking-tight text-neutral-900 dark:text-white mb-1">
              {isError ? t('workspace.exportModalStopped') : t('workspace.exportModalTitle')}
            </h3>

            {isError ? (
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2 mb-2 min-h-[2.5rem] max-w-sm mx-auto">
                {error}
              </p>
            ) : (
              <>
                {/* Status */}
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2 mb-5 min-h-[2.5rem] max-w-xs mx-auto">
                  {status || t('workspace.exportModalPreparing')}
                </p>

                {/* Progress bar — black/white */}
                <div className="w-full max-w-[280px] mx-auto mb-3">
                  <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-neutral-900 dark:bg-white transition-all duration-300 ease-out"
                      style={{ width: `${percentage}%` }}
                      role="progressbar"
                      aria-valuenow={current}
                      aria-valuemin={0}
                      aria-valuemax={total}
                      aria-label={t('workspace.exportModalProgressLabel')}
                    />
                  </div>
                </div>
                <p className="text-xs text-neutral-400 dark:text-neutral-500 mb-6">
                  {t('workspace.exportModalSlidesCount', { current, total })}
                </p>

                {/* Hint — subtle card */}
                <div
                  className="w-full rounded-xl bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-100 dark:border-neutral-800 px-4 py-3 min-h-[3.5rem] flex items-center justify-center"
                  key={hintIndex}
                >
                  <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed transition-opacity duration-300">
                    {t(EXPORT_HINT_KEYS[hintIndex])}
                  </p>
                </div>

                {/* Do not close — yellow notice */}
                <div className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50">
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
    </div>
  )
}
