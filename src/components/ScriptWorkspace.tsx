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
import { useUIStore } from '../store/useUIStore'
import { mergeSlides, applyDelta } from '../utils/slideMerger'
import { generatePPTX_AI, generatePPTX_Legacy, EXPORT_CANCELLED_MESSAGE, copyMarkdown, downloadJSON, generatePDF } from '../api/export'
import SlideCard from './SlideCard'
import { ExportProgressModal } from './ExportProgressModal'
import ScriptView from './ScriptView'
import SlideEditorModal from './SlideEditorModal'
import SlideSkeleton from './SlideSkeleton'
import SkeletonLoader from './SkeletonLoader'
import ThinkingIndicator from './ThinkingIndicator'
import { confirmAction } from '../utils/confirmAction'
import { Layers, Clock, Trash2, Download, FileDown, ClipboardCopy, FileJson, Plus, CheckSquare, X, Undo2, Redo2, LayoutGrid, ScrollText, FileText, Wand2, HelpCircle } from 'lucide-react'
import type { Slide } from '../api/prompt'

import { useSettingsStore } from '../store/useSettingsStore'
import { createDefaultSlide } from '../config/defaults'
import { enhanceSlide } from '../api/enhance'

/** True if undo is allowed (won't revert current session to empty slides) */
function getCanUndo(): boolean {
  const { pastStates } = useSessionStore.temporal.getState()
  if (pastStates.length === 0) return false
  const cur = useSessionStore.getState().getCurrentSession()
  const last = pastStates[pastStates.length - 1] as { sessions?: { id: string; slides?: unknown[] }[] } | undefined
  const pastS = last?.sessions?.find((s) => s.id === cur?.id)
  const wouldEmpty = (cur?.slides?.length ?? 0) > 0 && pastS && (!pastS.slides || pastS.slides.length === 0)
  return !wouldEmpty
}

export default function ScriptWorkspace() {
  const { t } = useTranslation()
  const { items, getActiveProcessForProject } = useQueueStore()
  const { 
    getCurrentSession, 
    reorderSlides, 
    deleteSlide,
    deleteSlides, 
    updateSlide, 
    getSelectedSlideIndices, 
    toggleSlideSelection, 
    clearSlideSelection, 
    selectAllSlides, 
    setSessionSlides,
    addMessage,
    updateMessage,
    processingSlideNumbers,
    addProcessingSlide,
    removeProcessingSlide
  } = useSessionStore()
  const { viewMode, setViewMode } = useUIStore()
  const { undo, redo, pastStates, futureStates } = useSessionStore.temporal.getState()
  const [showExportOverlay, setShowExportOverlay] = useState(false)
  const [showGeminiGuide, setShowGeminiGuide] = useState(false)
  const [showChatGPTGuide, setShowChatGPTGuide] = useState(false)
  const [showClaudeGuide, setShowClaudeGuide] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0, status: '' })
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportResult, setExportResult] = useState<'success' | 'error' | null>(null)
  const [exportResultMessage, setExportResultMessage] = useState('')
  const [exportResultFileName, setExportResultFileName] = useState('')
  const [exportTimeTracking, setExportTimeTracking] = useState<{
    startTime: number | null
    slideStartTime: number | null
    slideTimes: number[]
  }>({ startTime: null, slideStartTime: null, slideTimes: [] })
  const exportAbortRef = useRef<AbortController | null>(null)
  const [activeDragIndex, setActiveDragIndex] = useState<number | null>(null)
  const [editingSlideIndex, setEditingSlideIndex] = useState<number | null>(null)
  const [addingSlide, setAddingSlide] = useState<Slide | null>(null)
  const exportRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const headerContainerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  const selectedSlideIndices = getSelectedSlideIndices()

  const currentSession = getCurrentSession()
  // Block undo when it would revert to "no slides" (first creation) to avoid wiping the deck
  const lastPastState = pastStates.length > 0 ? pastStates[pastStates.length - 1] : null
  const pastSession = lastPastState?.sessions?.find((s: { id: string }) => s.id === currentSession?.id)
  const wouldRevertToEmpty =
    (currentSession?.slides?.length ?? 0) > 0 &&
    pastSession &&
    (!pastSession.slides || pastSession.slides.length === 0)
  const canUndo = pastStates.length > 0 && !wouldRevertToEmpty

  const projectId = currentSession?.id || ''
  const activeItem = getActiveProcessForProject(projectId)
  const lastDoneItem = [...items].reverse().find((i) => i.status === 'done' && i.projectId === projectId)

  const streamingSlides: Slide[] = activeItem?.slides ?? []
  const sessionSlides = currentSession?.slides ?? []
  const responseAction = activeItem?.responseAction

  // Smart Merge: Apply delta updates (create/update/append) or fallback to overlay
  const displaySlides = useMemo(() => {
    if (streamingSlides.length > 0) {
      // If we have an explicit action (Delta Protocol)
      if (responseAction) {
        return applyDelta(sessionSlides, { action: responseAction, slides: streamingSlides }, { markActions: true })
      }
      // Fallback to legacy/smart overlay
      if (sessionSlides.length === 0) return streamingSlides
      return mergeSlides(sessionSlides, streamingSlides)
    }
    return sessionSlides
  }, [sessionSlides, streamingSlides, responseAction])

  const isStreaming = !!activeItem
  const hasReceivedAction = activeItem?.hasReceivedAction ?? false

  // Skeleton Logic (Intent-Aware):
  // 1. Create/Reset: Show full skeleton if empty AND action is "create"
  // 2. Append: Show bottom skeleton AND action is "append"
  // 3. Update: Show NO skeleton (in-place update)
  // 4. Response/Ask: Show NO skeleton (chat only)
  const showFullSkeleton = isStreaming && displaySlides.length === 0 && responseAction === 'create' && hasReceivedAction

  // Show bottom skeleton if we are appending OR creating (and have some slides already)
  // This ensures that during a "create" stream, we see a skeleton at the bottom for the "next" slide
  const showBottomSkeleton = isStreaming && displaySlides.length > 0 && (responseAction === 'append' || responseAction === 'create') && hasReceivedAction
  const isReadonly = isStreaming || streamingSlides.length > 0

  // Thinking content - show from active item (streaming) or last done item
  const thinkingText = activeItem?.thinkingText || lastDoneItem?.thinking || ''
  const showThinking = isStreaming ? !!activeItem?.thinkingText : !!lastDoneItem?.thinking

  const timestamp = currentSession?.timestamp
    ? new Date(currentSession.timestamp).toLocaleString()
    : null

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Close export overlay on Escape
  useEffect(() => {
    if (!showExportOverlay) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showGeminiGuide) setShowGeminiGuide(false)
        else if (showChatGPTGuide) setShowChatGPTGuide(false)
        else if (showClaudeGuide) setShowClaudeGuide(false)
        else setShowExportOverlay(false)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [showExportOverlay, showGeminiGuide, showChatGPTGuide, showClaudeGuide])

  // Auto-scroll to bottom when new slides arrive during generation
  useEffect(() => {
    if (isStreaming) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [displaySlides.length, isStreaming])

  // React to script container width (resize) — hide timestamp and "Xuất" when narrow
  useEffect(() => {
    const el = headerContainerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width
        setContainerWidth(w)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scriptName = currentSession?.title
    ? currentSession.title.replace(/\s+/g, '_')
    : 'presentation'

  const handleExportPptx = async () => {
    setExportError(null)
    exportAbortRef.current = new AbortController()
    setIsExporting(true)
    setExportProgress({ current: 0, total: displaySlides.length, status: '' })
    
    const startTime = Date.now()
    let slideStartTime = startTime
    const slideTimes: number[] = []
    
    setExportTimeTracking({ startTime, slideStartTime, slideTimes: [] })
    
    try {
      await generatePPTX_AI(
        displaySlides,
        scriptName,
        (current, total, status) => {
          const now = Date.now()
          
          // When a new slide completes (current increases), record time
          if (current > slideTimes.length && slideTimes.length < total) {
            const slideTime = now - slideStartTime
            slideTimes.push(slideTime)
            slideStartTime = now
            setExportTimeTracking({ startTime, slideStartTime, slideTimes: [...slideTimes] })
          }
          
          setExportProgress({ current, total, status })
        },
        exportAbortRef.current.signal,
        t
      )
      setIsExporting(false)
      setExportProgress({ current: 0, total: 0, status: '' })
      setExportResult('success')
      setExportResultMessage(t('workspace.exportDone'))
      setExportResultFileName(`${scriptName}.pptx`)
      setExportTimeTracking({ startTime: null, slideStartTime: null, slideTimes: [] })
    } catch (err) {
      const raw = err as { error?: unknown; message?: string } | Error
      const message =
        typeof raw === 'object' && raw !== null && 'error' in raw && typeof (raw as { message?: string }).message === 'string'
          ? (raw as { message: string }).message
          : err instanceof Error
            ? err.message
            : t('workspace.enhanceFailed')
      if (message === EXPORT_CANCELLED_MESSAGE) {
        handleCloseExportOverlay()
        return
      }
      setExportError(message)
      setIsExporting(false)
      setExportProgress((prev) => ({ ...prev, status: '' }))
      setExportResult('error')
      setExportResultMessage(message)
      setExportTimeTracking({ startTime: null, slideStartTime: null, slideTimes: [] })
    }
  }

  const handleExportPptxLegacy = async () => {
    setShowExportOverlay(false)
    const tid = toast.loading(t('workspace.exporting'))
    try {
      await generatePPTX_Legacy(displaySlides, scriptName)
      toast.success(t('workspace.exportDone'), { id: tid })
    } catch {
      toast.error(t('workspace.enhanceFailed'), { id: tid })
    }
  }

  const handleCloseExportOverlay = () => {
    exportAbortRef.current?.abort()
    exportAbortRef.current = null
    setIsExporting(false)
    setExportError(null)
    setExportProgress({ current: 0, total: 0, status: '' })
    setExportResult(null)
    setExportResultMessage('')
    setExportResultFileName('')
    setExportTimeTracking({ startTime: null, slideStartTime: null, slideTimes: [] })
  }

  const handleCopyMarkdown = async () => {
    setShowExportOverlay(false)
    const ok = await copyMarkdown(displaySlides)
    if (ok) toast.success(t('workspace.markdownCopied'))
    else toast.error(t('workspace.markdownCopyFailed'))
  }

  const handleExportJson = () => {
    setShowExportOverlay(false)
    downloadJSON(displaySlides, scriptName)
    toast.success(t('workspace.exportDone'))
  }

  const handleExportPdf = async () => {
    setShowExportOverlay(false)
    const tid = toast.loading(t('workspace.exporting'))
    try {
      await generatePDF(displaySlides, scriptName)
      toast.success(t('workspace.exportDone'), { id: tid })
    } catch {
      toast.error(t('workspace.exportFailed'), { id: tid })
    }
  }

  // Undo/Redo keyboard shortcuts (Undo disabled on first creation to avoid wiping deck)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (getCanUndo()) undo()
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [undo, redo])




  const handleAddSlide = () => {
    const newSlideNumber = displaySlides.length + 1
    const newSlide: Slide = createDefaultSlide(newSlideNumber)
    setAddingSlide(newSlide)
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

  const store = useSettingsStore()

  // Centralized Enhance Handler (Matches SlideCard logic)
  const handleEnhanceSlide = useCallback((index: number) => {
    const slide = displaySlides[index]
    if (!slide) return

    // Prevent double-click
    if (processingSlideNumbers?.includes(slide.slide_number)) return

    confirmAction(
      t('workspace.enhanceConfirm'),
      () => {
        addProcessingSlide(slide.slide_number)

        addMessage({
          role: 'user',
          content: t('workspace.enhanceAction'),
          timestamp: Date.now(),
          isScriptGeneration: false,
          relatedSlideNumber: slide.slide_number,
          relatedSlideReferences: [{
            id: `slide-card-${slide.slide_number}`,
            number: slide.slide_number,
            label: t('chat.slideLabel', { number: slide.slide_number })
          }]
        })

        const thinkingMsgId = addMessage({
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          isScriptGeneration: false,
          isThinking: true,
        })

        enhanceSlide(
          store.getApiUrl(),
          store.getApiKey(),
          store.getModel(),
          store.getApiType(),
          slide,
          (enhanced: Slide) => {
            updateSlide(index, enhanced)
            removeProcessingSlide(slide.slide_number)

            const session = getCurrentSession()
            const slideSnapshot = session?.slides
              ? JSON.parse(JSON.stringify(session.slides))
              : undefined

            updateMessage(thinkingMsgId, {
              content: t('workspace.enhancedSlide', { number: slide.slide_number }),
              isThinking: false,
              relatedSlideNumber: slide.slide_number,
              slideSnapshot,
              relatedSlideReferences: [{
                id: `slide-card-${slide.slide_number}`,
                number: slide.slide_number,
                label: t('chat.slideLabel', { number: slide.slide_number })
              }]
            })
            toast.success(t('workspace.enhanced'))
          },
          (error: string) => {
            removeProcessingSlide(slide.slide_number)
            updateMessage(thinkingMsgId, {
              content: t('workspace.enhanceFailed'),
              isThinking: false,
            })
            toast.error(t('workspace.enhanceFailed'), { description: error })
          },
          store.getSystemPromptType()
        )
      },
      {
        confirmText: t('workspace.enhance'),
        cancelText: t('chat.cancel'),
        title: t('common.confirm'),
        icon: <Wand2 className="w-6 h-6 text-indigo-500" />,
        variant: 'default',
      }
    )
  }, [displaySlides, processingSlideNumbers, addProcessingSlide, addMessage, updateMessage, updateSlide, removeProcessingSlide, getCurrentSession, store, t])

  const handleDeleteSlide = useCallback((index: number) => {
    const slide = displaySlides[index]
    if (!slide) return

    confirmAction(
      t('workspace.deleteSlideConfirm', { number: slide.slide_number }),
      () => deleteSlide(index),
      {
        confirmText: t('workspace.delete'),
        cancelText: t('chat.cancel'),
        variant: 'destructive',
        title: t('workspace.delete')
      },
    )
  }, [displaySlides, deleteSlide, t])

  const handleBulkDelete = () => {
    confirmAction(
      t('workspace.deleteSelectedConfirm', { count: selectedSlideIndices.length }),
      () => {
        deleteSlides(selectedSlideIndices)
        clearSlideSelection()
      },
      {
        confirmText: t('common.yes'),
        cancelText: t('common.no'),
        description: t('workspace.deleteSelectedDescription'),
        variant: 'destructive',
        title: t('workspace.deleteSelected')
      }
    )
  }

  const sortableIds = displaySlides.map((_, i) => `slide-${i}`)

  const showTimestamp = containerWidth >= 520
  const showExportLabel = containerWidth >= 420

  return (
    <div ref={headerContainerRef} className="h-full flex flex-col relative min-w-0 w-full overflow-hidden">
      {/* Workspace header — scrolls horizontally when very narrow so content is not cut off */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-b border-neutral-200 dark:border-neutral-700/50 min-w-0 overflow-x-auto overflow-y-hidden">
        <div className="flex items-center gap-2.5 shrink-0">
          <Layers className="w-4 h-4 text-neutral-400" />
          <h2 className="text-sm font-semibold tracking-tight">{t('workspace.title')}</h2>
          {displaySlides.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-[10px] font-medium text-neutral-500 tabular-nums max-[480px]:hidden">
              {displaySlides.length} {t('workspace.slidesUnit')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {timestamp && !isStreaming && showTimestamp && (
            <div className="flex items-center gap-1.5 text-[10px] text-neutral-400">
              <Clock className="w-3 h-3" />
              {timestamp}
            </div>
          )}
          {/* Undo / Redo */}
          {!isStreaming && displaySlides.length > 0 && (
            <>
              <button
                onClick={() => canUndo && undo()}
                disabled={!canUndo}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                title={`${t('workspace.undo')} (Ctrl+Z)`}
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => redo()}
                disabled={futureStates.length === 0}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                title={`${t('workspace.redo')} (Ctrl+Y)`}
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
              <div className="w-px h-4 bg-neutral-200 dark:bg-neutral-700 mx-0.5" />
            </>
          )}

          {/* View Mode Toggle — same in empty state and when streaming */}
          <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition-all duration-150 cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-white dark:bg-neutral-700 shadow-sm text-neutral-900 dark:text-neutral-100'
                    : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'
                }`}
                title={t('workspace.gridView')}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('script')}
                className={`p-1.5 rounded-md transition-all duration-150 cursor-pointer ${
                  viewMode === 'script'
                    ? 'bg-white dark:bg-neutral-700 shadow-sm text-neutral-900 dark:text-neutral-100'
                    : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'
                }`}
                title={t('workspace.scriptView')}
              >
                <ScrollText className="w-3.5 h-3.5" />
              </button>
            </div>

          {displaySlides.length > 0 && !isStreaming && (
            <div ref={exportRef}>
              <button
                onClick={() => setShowExportOverlay(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                {showExportLabel && <span>{t('workspace.export')}</span>}
              </button>
            </div>
          )}

          {/* Add Slide Button */}
          {!isStreaming && (
            <button
              onClick={handleAddSlide}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              title={t('workspace.addSlide')}
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Slides area */}
      <div className="flex-1 overflow-y-auto px-6 py-5 transition-all duration-200">
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
          viewMode === 'script' ? (
            <ScriptView
              slides={displaySlides}
              readonly={isReadonly}
              onEdit={(idx) => setEditingSlideIndex(idx)}
              onEnhance={(idx) => handleEnhanceSlide(idx)}
              onDelete={handleDeleteSlide}
              processingSlideNumbers={processingSlideNumbers || []}
              showBottomSkeleton={showBottomSkeleton}
            />
          ) : (
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
                    isDragActive={activeDragIndex !== null}
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
                <div className="scale-105 rounded-xl shadow-2xl ring-2 ring-black/10 dark:ring-white/20 opacity-95 cursor-grabbing">
                  <SlideCard
                    slide={displaySlides[activeDragIndex]}
                    index={activeDragIndex}
                    selected={false}
                    onToggleSelect={() => { }}
                    readonly
                  />
                </div>
              )}
            </DragOverlay>
          </DndContext>
          )
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
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-2xl border border-neutral-200 dark:border-neutral-700/50 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm shadow-sm">
              <span className="text-xs font-medium text-neutral-500 tabular-nums px-2">
                {t('workspace.selected', { count: selectedSlideIndices.length })}
              </span>
              
              <div className="w-px h-4 bg-neutral-200 dark:bg-neutral-700 mx-1" />
              
              <button
                onClick={selectAllSlides}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                title={t('workspace.selectAll')}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                {t('workspace.selectAll')}
              </button>

              <button
                onClick={clearSlideSelection}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                title={t('workspace.unselectAll')}
              >
                <X className="w-3.5 h-3.5" />
                {t('workspace.unselectAll')}
              </button>

              <div className="w-px h-4 bg-neutral-200 dark:bg-neutral-700 mx-1" />

              <button
                onClick={handleBulkDelete}
                className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                title={t('workspace.deleteSelected')}
              >
                <Trash2 className="w-4 h-4" />
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
            mode="edit"
          />
        )}
      </AnimatePresence>

      {/* Add slide modal */}
      <AnimatePresence>
        {addingSlide && (
          <SlideEditorModal
            slide={addingSlide}
            onSave={(patch) => {
              const newSlide = { ...addingSlide, ...patch }
              setSessionSlides([...displaySlides, newSlide])
              setAddingSlide(null)
              // Scroll to bottom after adding
              setTimeout(() => {
                bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
              }, 100)
            }}
            onClose={() => setAddingSlide(null)}
            mode="add"
          />
        )}
      </AnimatePresence>

      {/* Export overlay */}
      <AnimatePresence>
        {showExportOverlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => !showGeminiGuide && setShowExportOverlay(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-lg bg-white dark:bg-zinc-950 border border-neutral-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 pb-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
                    {t('workspace.export')}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowExportOverlay(false)}
                    className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 dark:hover:text-zinc-400 dark:hover:bg-zinc-800 transition-colors"
                    aria-label={t('workspace.exportModalClose')}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Section 1: PowerPoint Options */}
                <div>
                  <h4 className="text-xs font-semibold text-neutral-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
                    {t('workspace.exportPowerPoint')}
                  </h4>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        confirmAction(
                          t('workspace.exportPptxConfirmMessage'),
                          () => {
                            setShowExportOverlay(false)
                            handleExportPptx()
                          },
                          {
                            title: t('workspace.exportPptxConfirmTitle'),
                            confirmText: t('common.yes'),
                            cancelText: t('common.no'),
                          }
                        )
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-neutral-200 dark:border-zinc-700 bg-neutral-50/50 dark:bg-zinc-900/50 hover:bg-neutral-100 dark:hover:bg-zinc-800/50 transition-colors text-left"
                    >
                      <Wand2 className="w-5 h-5 text-neutral-500 dark:text-zinc-400 shrink-0" />
                      <div className="flex-1 text-left min-w-0">
                        <div className="text-sm font-medium text-neutral-800 dark:text-zinc-200">
                          {t('workspace.exportPptxAI')}
                        </div>
                        <div className="text-xs text-neutral-500 dark:text-zinc-400">
                          {t('workspace.exportPptxAIDesc')}
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportPptxLegacy}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-neutral-200 dark:border-zinc-700 bg-neutral-50/50 dark:bg-zinc-900/50 hover:bg-neutral-100 dark:hover:bg-zinc-800/50 transition-colors text-left"
                    >
                      <FileDown className="w-5 h-5 text-neutral-500 dark:text-zinc-400 shrink-0" />
                      <div className="flex-1 text-left min-w-0">
                        <div className="text-sm font-medium text-neutral-800 dark:text-zinc-200">
                          {t('workspace.exportPptxLegacy')}
                        </div>
                        <div className="text-xs text-neutral-500 dark:text-zinc-400">
                          {t('workspace.exportPptxLegacyDesc')}
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Section 2: Data for other AI */}
                <div className="mt-5">
                  <h4 className="text-xs font-semibold text-neutral-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5">
                    {t('workspace.exportDataForOtherAI')}
                  </h4>
                  <p className="text-sm text-neutral-600 dark:text-zinc-400 mb-3">
                    {t('workspace.exportDataForOtherAIDescription')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleCopyMarkdown}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 dark:border-zinc-700 text-sm font-medium text-neutral-700 dark:text-zinc-300 hover:bg-neutral-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <ClipboardCopy className="w-4 h-4" />
                      {t('workspace.exportMarkdown')}
                    </button>
                    <button
                      type="button"
                      onClick={handleExportJson}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 dark:border-zinc-700 text-sm font-medium text-neutral-700 dark:text-zinc-300 hover:bg-neutral-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <FileJson className="w-4 h-4" />
                      {t('workspace.exportJson')}
                    </button>
                    <button
                      type="button"
                      onClick={handleExportPdf}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 dark:border-zinc-700 text-sm font-medium text-neutral-700 dark:text-zinc-300 hover:bg-neutral-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <FileText className="w-4 h-4" />
                      {t('workspace.exportPdf')}
                    </button>
                  </div>
                </div>

                {/* Section 3: AI Guides */}
                <div className="mt-5">
                  <h4 className="text-xs font-semibold text-neutral-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
                    {t('workspace.exportAIGuides')}
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setShowGeminiGuide(true)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 dark:border-zinc-700 text-sm font-medium text-neutral-700 dark:text-zinc-300 hover:bg-neutral-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <HelpCircle className="w-4 h-4" />
                      {t('workspace.exportGeminiGuide')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowChatGPTGuide(true)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 dark:border-zinc-700 text-sm font-medium text-neutral-700 dark:text-zinc-300 hover:bg-neutral-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <HelpCircle className="w-4 h-4" />
                      {t('workspace.exportChatGPTGuide')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowClaudeGuide(true)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 dark:border-zinc-700 text-sm font-medium text-neutral-700 dark:text-zinc-300 hover:bg-neutral-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <HelpCircle className="w-4 h-4" />
                      {t('workspace.exportClaudeGuide')}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gemini guide modal (inside export overlay flow) */}
      <AnimatePresence>
        {showGeminiGuide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[51] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setShowGeminiGuide(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white dark:bg-zinc-950 border border-neutral-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
                  {t('workspace.exportGeminiGuide')}
                </h3>
                <ol className="list-decimal list-inside space-y-2 text-sm text-neutral-600 dark:text-zinc-400">
                  {t('workspace.exportGeminiGuideSteps')
                    .split('\n')
                    .map((step, i) => (
                      <li key={i} className="pl-1">
                        {step.replace(/^\d+\.\s*/, '')}
                      </li>
                    ))}
                </ol>
              </div>
              <div className="p-4 bg-neutral-50 dark:bg-zinc-900/50 border-t border-neutral-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowGeminiGuide(false)}
                  className="w-full px-4 py-2.5 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  {t('workspace.exportGeminiGuideClose')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ChatGPT guide modal */}
      <AnimatePresence>
        {showChatGPTGuide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[51] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setShowChatGPTGuide(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white dark:bg-zinc-950 border border-neutral-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
                  {t('workspace.exportChatGPTGuide')}
                </h3>
                <ol className="list-decimal list-inside space-y-2 text-sm text-neutral-600 dark:text-zinc-400">
                  {t('workspace.exportChatGPTGuideSteps')
                    .split('\n')
                    .map((step, i) => (
                      <li key={i} className="pl-1">
                        {step.replace(/^\d+\.\s*/, '')}
                      </li>
                    ))}
                </ol>
              </div>
              <div className="p-4 bg-neutral-50 dark:bg-zinc-900/50 border-t border-neutral-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowChatGPTGuide(false)}
                  className="w-full px-4 py-2.5 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  {t('workspace.exportGeminiGuideClose')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Claude guide modal */}
      <AnimatePresence>
        {showClaudeGuide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[51] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setShowClaudeGuide(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white dark:bg-zinc-950 border border-neutral-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
                  {t('workspace.exportClaudeGuide')}
                </h3>
                <ol className="list-decimal list-inside space-y-2 text-sm text-neutral-600 dark:text-zinc-400">
                  {t('workspace.exportClaudeGuideSteps')
                    .split('\n')
                    .map((step, i) => (
                      <li key={i} className="pl-1">
                        {step.replace(/^\d+\.\s*/, '')}
                      </li>
                    ))}
                </ol>
              </div>
              <div className="p-4 bg-neutral-50 dark:bg-zinc-900/50 border-t border-neutral-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowClaudeGuide(false)}
                  className="w-full px-4 py-2.5 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  {t('workspace.exportGeminiGuideClose')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ExportProgressModal
        isOpen={isExporting || exportResult !== null}
        result={exportResult}
        resultMessage={exportResultMessage}
        resultFileName={exportResultFileName}
        current={exportProgress.current}
        total={exportProgress.total}
        status={exportProgress.status}
        error={exportError}
        slideTimes={exportTimeTracking.slideTimes}
        exportStartTime={exportTimeTracking.startTime}
        onClose={handleCloseExportOverlay}
      />
    </div>
  )
}
