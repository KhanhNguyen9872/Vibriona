import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { motion, AnimatePresence } from 'motion/react'
import { useQueueStore } from '../store/useQueueStore'
import { useSessionStore } from '../store/useSessionStore'
import { mergeSlides, applyDelta } from '../utils/slideMerger'
import { generatePPTX, copyMarkdown, downloadJSON } from '../api/export'
import SlideCard from './SlideCard'
import SlideEditorModal from './SlideEditorModal'
import SlideSkeleton from './SlideSkeleton'
import SkeletonLoader from './SkeletonLoader'
import ThinkingIndicator from './ThinkingIndicator'
import { Layers, Clock, Trash2, Download, FileDown, ClipboardCopy, FileJson, ChevronDown } from 'lucide-react'
import type { Slide } from '../api/prompt'

export default function ScriptWorkspace() {
  const { t } = useTranslation()
  const { items, isProcessing } = useQueueStore()
  const { getCurrentSession, reorderSlides, deleteSlides, updateSlide, selectedSlideIndices, toggleSlideSelection, clearSlideSelection } = useSessionStore()
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [activeDragIndex, setActiveDragIndex] = useState<number | null>(null)
  const [editingSlideIndex, setEditingSlideIndex] = useState<number | null>(null)
  const exportRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const currentSession = getCurrentSession()
  const activeItem = items.find((i) => i.status === 'processing')
  const lastDoneItem = [...items].reverse().find((i) => i.status === 'done')

  const streamingSlides: Slide[] = activeItem?.slides ?? []
  const sessionSlides = currentSession?.slides ?? []
  const responseAction = activeItem?.responseAction

  // Smart Merge: Apply delta updates (create/update/append) or fallback to overlay
  const displaySlides = useMemo(() => {
    if (streamingSlides.length > 0) {
      // If we have an explicit action (Delta Protocol)
      if (responseAction) {
        return applyDelta(sessionSlides, { action: responseAction, slides: streamingSlides })
      }
      // Fallback to legacy/smart overlay
      if (sessionSlides.length === 0) return streamingSlides
      return mergeSlides(sessionSlides, streamingSlides)
    }
    return sessionSlides
  }, [sessionSlides, streamingSlides, responseAction])

  const isStreaming = isProcessing && activeItem != null
  
  // Skeleton Logic:
  // 1. Create/Reset: Show full skeleton if empty
  // 2. Append: Show bottom skeleton
  // 3. Update: Show NO skeleton (in-place update)
  const showFullSkeleton = isStreaming && displaySlides.length === 0 && !activeItem?.thinkingText
  
  // Show bottom skeleton ONLY if we are appending or default streaming (and not updating specific slides)
  const showBottomSkeleton = isStreaming && displaySlides.length > 0 && responseAction !== 'update'
  const isReadonly = isStreaming || streamingSlides.length > 0

  // Thinking content - show from active item (streaming) or last done item
  const thinkingText = activeItem?.thinkingText || lastDoneItem?.thinking || ''
  const showThinking = isStreaming ? !!activeItem?.thinkingText : !!lastDoneItem?.thinking

  const timestamp = currentSession?.timestamp
    ? new Date(currentSession.timestamp).toLocaleString()
    : null

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Close export menu on outside click
  useEffect(() => {
    if (!showExportMenu) return
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExportMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showExportMenu])

  // Auto-scroll to bottom when new slides arrive during generation
  useEffect(() => {
    if (isStreaming) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [displaySlides.length, isStreaming])

  const scriptName = currentSession?.title
    ? currentSession.title.slice(0, 40).replace(/\s+/g, '_')
    : 'presentation'

  const handleExportPptx = async () => {
    setShowExportMenu(false)
    const tid = toast.loading(t('workspace.exporting'))
    try {
      await generatePPTX(displaySlides, scriptName)
      toast.success(t('workspace.exportDone'), { id: tid })
    } catch {
      toast.error(t('workspace.enhanceFailed'), { id: tid })
    }
  }

  const handleCopyMarkdown = async () => {
    setShowExportMenu(false)
    const ok = await copyMarkdown(displaySlides)
    if (ok) toast.success(t('workspace.markdownCopied'))
    else toast.error(t('workspace.markdownCopyFailed'))
  }

  const handleExportJson = () => {
    setShowExportMenu(false)
    downloadJSON(displaySlides, scriptName)
    toast.success(t('workspace.exportDone'))
  }

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragIndex(Number(String(event.active.id).replace('slide-', '')))
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragIndex(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const fromIndex = Number(String(active.id).replace('slide-', ''))
    const toIndex = Number(String(over.id).replace('slide-', ''))
    reorderSlides(fromIndex, toIndex)
    clearSlideSelection()
  }, [reorderSlides, clearSlideSelection])

  const handleBulkDelete = () => {
    deleteSlides(selectedSlideIndices)
    clearSlideSelection()
  }

  const sortableIds = displaySlides.map((_, i) => `slide-${i}`)

  return (
    <div className="h-full flex flex-col relative">
      {/* Workspace header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-700/50">
        <div className="flex items-center gap-2.5">
          <Layers className="w-4 h-4 text-neutral-400" />
          <h2 className="text-sm font-semibold tracking-tight">{t('workspace.title')}</h2>
          {displaySlides.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-[10px] font-medium text-neutral-500 tabular-nums">
              {displaySlides.length} {t('workspace.slidesUnit')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {timestamp && !isStreaming && (
            <div className="flex items-center gap-1.5 text-[10px] text-neutral-400">
              <Clock className="w-3 h-3" />
              {timestamp}
            </div>
          )}
          {displaySlides.length > 0 && !isStreaming && (
            <div className="relative" ref={exportRef}>
              <button
                onClick={() => setShowExportMenu((v) => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('workspace.export')}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              <AnimatePresence>
                {showExportMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-1 w-52 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700/50 bg-white dark:bg-neutral-900 shadow-xl z-50"
                  >
                    <button
                      onClick={handleExportPptx}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                    >
                      <FileDown className="w-3.5 h-3.5 text-neutral-400" />
                      {t('workspace.exportPptx')}
                    </button>
                    <button
                      onClick={handleCopyMarkdown}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                    >
                      <ClipboardCopy className="w-3.5 h-3.5 text-neutral-400" />
                      {t('workspace.exportMarkdown')}
                    </button>
                    <button
                      onClick={handleExportJson}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                    >
                      <FileJson className="w-3.5 h-3.5 text-neutral-400" />
                      {t('workspace.exportJson')}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Slides area */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {/* Thinking indicator */}
        {showThinking && (
          <ThinkingIndicator
            thinkingText={thinkingText}
            isStreaming={isStreaming && !!activeItem?.thinkingText}
          />
        )}

        {showFullSkeleton ? (
          <SkeletonLoader />
        ) : displaySlides.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-3 pb-20">
                {displaySlides.map((slide, i) => (
                  <SlideCard
                    key={`${slide.slide_number}-${i}`}
                    slide={slide}
                    index={i}
                    selected={selectedSlideIndices.includes(i)}
                    onToggleSelect={toggleSlideSelection}
                    onEdit={(idx) => setEditingSlideIndex(idx)}
                    readonly={isReadonly}
                  />
                ))}
                <AnimatePresence>
                  {showBottomSkeleton && (
                    <SlideSkeleton />
                  )}
                </AnimatePresence>
                <div ref={bottomRef} />
              </div>
            </SortableContext>

            <DragOverlay dropAnimation={null}>
              {activeDragIndex !== null && displaySlides[activeDragIndex] && (
                <div className="scale-[1.03] shadow-2xl rounded-xl ring-1 ring-black/10 dark:ring-white/10 opacity-95">
                  <SlideCard
                    slide={displaySlides[activeDragIndex]}
                    index={activeDragIndex}
                    selected={false}
                    onToggleSelect={() => {}}
                    readonly
                  />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-neutral-400">{t('workspace.empty')}</p>
          </div>
        )}
      </div>

      {/* Floating bulk action bar */}
      <AnimatePresence>
        {selectedSlideIndices.length > 0 && !isReadonly && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30"
          >
            <div className="flex items-center gap-3 px-5 py-3 rounded-2xl border border-neutral-200 dark:border-neutral-700/50 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm shadow-xl">
              <span className="text-xs font-medium text-neutral-500 tabular-nums">
                {t('workspace.selected', { count: selectedSlideIndices.length })}
              </span>
              <div className="w-px h-4 bg-neutral-200 dark:bg-neutral-700" />
              <button
                onClick={handleBulkDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                {t('workspace.deleteSelected')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Slide editor modal */}
      <AnimatePresence>
        {editingSlideIndex !== null && displaySlides[editingSlideIndex] && (
          <SlideEditorModal
            slide={displaySlides[editingSlideIndex]}
            onSave={(patch) => {
              updateSlide(editingSlideIndex, patch)
              setEditingSlideIndex(null)
            }}
            onClose={() => setEditingSlideIndex(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
