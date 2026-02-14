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
import { generatePPTX, copyMarkdown, downloadJSON, generatePDF } from '../api/export'
import SlideCard from './SlideCard'
import ScriptView from './ScriptView'
import SlideEditorModal from './SlideEditorModal'
import SlideSkeleton from './SlideSkeleton'
import SkeletonLoader from './SkeletonLoader'
import ThinkingIndicator from './ThinkingIndicator'
import { confirmAction } from '../utils/confirmAction'
import { Layers, Clock, Trash2, Download, FileDown, ClipboardCopy, FileJson, ChevronDown, Plus, CheckSquare, X, Undo2, Redo2, LayoutGrid, ScrollText, FileText, Wand2 } from 'lucide-react'
import type { Slide } from '../api/prompt'

import { useSettingsStore } from '../store/useSettingsStore'
import { createDefaultSlide } from '../config/defaults'
import { enhanceSlide } from '../api/enhance'

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
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [activeDragIndex, setActiveDragIndex] = useState<number | null>(null)
  const [editingSlideIndex, setEditingSlideIndex] = useState<number | null>(null)
  const [addingSlide, setAddingSlide] = useState<Slide | null>(null)
  const exportRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const selectedSlideIndices = getSelectedSlideIndices()

  const currentSession = getCurrentSession()
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

  const handleExportPdf = async () => {
    setShowExportMenu(false)
    const tid = toast.loading(t('workspace.exporting'))
    try {
      await generatePDF(displaySlides, scriptName)
      toast.success(t('workspace.exportDone'), { id: tid })
    } catch {
      toast.error(t('workspace.enhanceFailed'), { id: tid })
    }
  }

  // Undo/Redo keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
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
          }
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

  return (
    <div className="h-full flex flex-col relative">
      {/* Workspace header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-700/50">
        <div className="flex items-center gap-2.5">
          <Layers className="w-4 h-4 text-neutral-400" />
          <h2 className="text-sm font-semibold tracking-tight">{t('workspace.title')}</h2>
          {displaySlides.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-[10px] font-medium text-neutral-500 tabular-nums max-[480px]:hidden">
              {displaySlides.length} {t('workspace.slidesUnit')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {timestamp && !isStreaming && (
            <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-neutral-400">
              <Clock className="w-3 h-3" />
              {timestamp}
            </div>
          )}
          {/* Undo / Redo */}
          {!isStreaming && displaySlides.length > 0 && (
            <>
              <button
                onClick={() => undo()}
                disabled={pastStates.length === 0}
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

          {/* View Mode Toggle */}
          {displaySlides.length > 0 && !isStreaming && (
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
                    className="absolute right-0 top-full mt-1 w-52 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700/50 bg-white dark:bg-neutral-900 z-50"
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
                    <div className="my-0.5 border-t border-neutral-100 dark:border-neutral-800" />
                    <button
                      onClick={handleExportPdf}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 text-neutral-400" />
                      {t('workspace.exportPdf')}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
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
      <div
        className={`flex-1 overflow-y-auto px-6 py-5 transition-all duration-200 ${showExportMenu ? 'blur-sm pointer-events-none select-none opacity-60' : ''
          }`}
      >
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
    </div>
  )
}
