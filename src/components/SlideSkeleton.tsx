import { motion } from 'motion/react'

/** Single-card skeleton shown at the bottom of the slide list while streaming generates more slides. */
export default function SlideSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.97 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="border border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl bg-neutral-50/60 dark:bg-neutral-900/40 overflow-hidden skeleton-shimmer breathe-glow"
    >
      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-neutral-100 dark:border-neutral-700/40">
        <div className="w-5 h-5 rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="h-3 w-32 rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="ml-auto h-3 w-12 rounded bg-neutral-200 dark:bg-neutral-800" />
      </div>
      <div className="px-4 py-3 space-y-2">
        <div className="h-2 w-full rounded bg-neutral-200/70 dark:bg-neutral-800/50" />
        <div className="h-2 w-3/4 rounded bg-neutral-200/70 dark:bg-neutral-800/50" />
        <div className="h-2 w-1/2 rounded bg-neutral-200/70 dark:bg-neutral-800/50" />
      </div>
    </motion.div>
  )
}
