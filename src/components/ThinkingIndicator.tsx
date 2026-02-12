import { useState } from 'react'
// import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'motion/react'
import { Brain, ChevronDown } from 'lucide-react'

interface ThinkingIndicatorProps {
  thinkingText: string
  isStreaming: boolean
}

export default function ThinkingIndicator({ thinkingText, isStreaming }: ThinkingIndicatorProps) {
  // const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  if (!thinkingText && !isStreaming) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mb-4"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700/50 bg-neutral-50 dark:bg-neutral-800/30 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 transition-colors cursor-pointer w-full"
      >
        <div className="relative flex items-center justify-center w-5 h-5">
          <Brain className={`w-4 h-4 text-neutral-400 ${isStreaming ? 'animate-pulse' : ''}`} />
          {isStreaming && (
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neutral-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-neutral-500" />
            </span>
          )}
        </div>
        {isStreaming && (
          <span className="dot-typing text-neutral-400 ml-0.5">
            <span /><span /><span />
          </span>
        )}
        {thinkingText && (
          <ChevronDown
            className={`w-3 h-3 text-neutral-400 ml-auto transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          />
        )}
      </button>

      <AnimatePresence>
        {expanded && thinkingText && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="mt-2 px-3.5 py-3 rounded-xl border border-neutral-200 dark:border-neutral-700/50 bg-neutral-50/50 dark:bg-neutral-800/20 max-h-60 overflow-y-auto">
              <pre className="text-[11px] leading-relaxed text-neutral-400 dark:text-neutral-500 font-mono whitespace-pre-wrap break-words">
                {thinkingText}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
