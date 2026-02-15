import { useEffect, useState } from 'react'
import { X, CircleStop, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

const EXPORT_HINT_KEYS = Array.from({ length: 40 }, (_, i) => `workspace.exportModalHint${i + 1}` as const)
const HINT_ROTATE_MS = 10_000

export interface ExportProgressModalProps {
  isOpen: boolean
  /** When 'success' or 'error', show result overlay (icon + message + OK) instead of progress. */
  result?: 'success' | 'error' | null
  /** Message shown in result overlay (success or error text). */
  resultMessage?: string
  /** Filename shown under success message (e.g. "presentation.pptx"). */
  resultFileName?: string
  current: number
  total: number
  status: string
  /** When set during progress, generation stopped due to error; show STOP icon and message. */
  error?: string | null
  /** Array of time (ms) taken for each completed slide (fallback for estimate). */
  slideTimes?: number[]
  /** Timestamp (ms) when export started; used with elapsed time for accurate remaining estimate. */
  exportStartTime?: number | null
  /** Called when user clicks the X button (progress) or OK button (result) to close the overlay. */
  onClose?: () => void
}

const DEFAULT_ESTIMATE_MS = 2 * 60 * 1000 // 2 minutes, display-only before first slide completes

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

/** Format ms to MM:SS */
function formatTime(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function ExportProgressModal({
  isOpen,
  result = null,
  resultMessage = '',
  resultFileName = '',
  current,
  total,
  status,
  error = null,
  slideTimes = [],
  exportStartTime = null,
  onClose,
}: ExportProgressModalProps) {
  const { t } = useTranslation()
  const [hintIndex, setHintIndex] = useState(() => pickRandomHintIndex())
  const [tick, setTick] = useState(0)
  const isResultView = result === 'success' || result === 'error'

  // Tick every second so estimate updates based on elapsed time
  useEffect(() => {
    if (!isOpen || isResultView || current >= total) return
    const id = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [isOpen, isResultView, current, total])

  // Estimated time remaining: default 2:00 before any slide; then based on full elapsed from start
  const estimatedTimeRemaining = (() => {
    void tick // force recalc every second (tick updates in interval)
    if (current >= total) return null
    if (current === 0) return DEFAULT_ESTIMATE_MS
    const now = Date.now()
    if (exportStartTime != null) {
      const elapsed = now - exportStartTime
      const avgPerSlide = elapsed / current
      const remainingSlides = total - current
      return avgPerSlide * remainingSlides
    }
    if (slideTimes.length > 0) {
      const avgTime = slideTimes.reduce((sum, time) => sum + time, 0) / slideTimes.length
      return avgTime * (total - current)
    }
    return DEFAULT_ESTIMATE_MS
  })()

  useEffect(() => {
    if (!isOpen || !!error || isResultView) return
    const id = setInterval(() => {
      setHintIndex(pickRandomHintIndex())
    }, HINT_ROTATE_MS)
    return () => clearInterval(id)
  }, [isOpen, error, isResultView])

  if (!isOpen) return null

  const percentage = total > 0 ? Math.round((current / total) * 100) : 0
  const isError = !!error

  /** Result overlay: success or error with icon + message + OK */
  if (isResultView) {
    const isSuccess = result === 'success'
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 dark:bg-black/70 backdrop-blur-md"
        aria-label={isSuccess ? t('workspace.exportDone') : t('workspace.exportModalExportError')}
      >
        <div className="relative w-full max-w-md bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="p-6 sm:p-8">
            <div className="flex flex-col items-center text-center">
              <div
                className={`mb-6 flex items-center justify-center w-16 h-16 rounded-2xl ${
                  isSuccess
                    ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200'
                    : 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50'
                }`}
                aria-hidden
              >
                {isSuccess ? (
                  <CheckCircle className="w-9 h-9" strokeWidth={2} />
                ) : (
                  <XCircle className="w-9 h-9" strokeWidth={2} />
                )}
              </div>
              <p className={`text-base font-medium text-neutral-900 dark:text-white max-w-sm mx-auto ${isSuccess && resultFileName ? 'mb-0' : 'mb-6'}`}>
                {resultMessage}
              </p>
              {isSuccess && resultFileName && (
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1.5 mb-6 max-w-sm mx-auto truncate" title={resultFileName}>
                  {resultFileName}
                </p>
              )}
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto min-w-[120px] px-6 py-2.5 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  {t('common.ok')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  /** Progress overlay: generating... */
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
                  {estimatedTimeRemaining !== null && (
                    <span className="ml-2">
                      · {t('workspace.exportModalEstimatedTime')}: {formatTime(estimatedTimeRemaining)}
                    </span>
                  )}
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
