import { motion } from 'motion/react'

export default function SkeletonLoader() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="border border-neutral-200 dark:border-neutral-700/50 rounded-xl bg-white dark:bg-neutral-900 overflow-hidden skeleton-shimmer"
        >
          {/* Header skeleton */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-neutral-100 dark:border-neutral-700/40">
            <div className="w-6 h-6 rounded-md bg-neutral-200 dark:bg-neutral-800" />
            <div className="h-3.5 w-36 rounded bg-neutral-200 dark:bg-neutral-800" />
          </div>

          {/* Content skeleton */}
          <div className="px-5 py-4 space-y-3">
            <div className="space-y-2">
              <div className="h-2.5 w-full rounded bg-neutral-100 dark:bg-neutral-800/60" />
              <div className="h-2.5 w-4/5 rounded bg-neutral-100 dark:bg-neutral-800/60" />
              <div className="h-2.5 w-3/5 rounded bg-neutral-100 dark:bg-neutral-800/60" />
            </div>
            <div className="space-y-2 pt-1">
              <div className="h-2 w-2/3 rounded bg-neutral-100 dark:bg-neutral-900/60" />
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  )
}
