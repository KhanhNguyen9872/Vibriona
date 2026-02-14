import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'motion/react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useSettingsStore } from '../store/useSettingsStore'
import { useUIStore } from '../store/useUIStore'
import { useSessionStore } from '../store/useSessionStore'
import { enhanceSlide } from '../api/enhance'
import { toast } from 'sonner'
import { confirmAction } from '../utils/confirmAction'
import {
  GripVertical,
  ChevronDown,
  ChevronRight,
  Trash2,
  Wand2,
  Image,
  FileText,
  Check,
  Timer,
  Layout,
  Mic,
  Pencil,
  MoreVertical,
  Copy,
  ArrowUpToLine,
  ArrowDownToLine,
} from 'lucide-react'
import type { Slide } from '../api/prompt'
import MarkdownRenderer from './MarkdownRenderer'

interface SlideCardProps {
  slide: Slide
  index: number
  selected: boolean
  onToggleSelect: (index: number) => void
  onEdit?: (index: number) => void
  readonly?: boolean
  isDragActive?: boolean
}



export default function SlideCard({
  slide,
  index,
  selected,
  onToggleSelect,
  onEdit,
  readonly = false,
  isDragActive = false,
}: SlideCardProps) {
  const { t } = useTranslation()
  const layoutLabels: Record<string, string> = {
    'split-left': t('workspace.layoutSplitLeft'),
    'split-right': t('workspace.layoutSplitRight'),
    'centered': t('workspace.layoutCentered'),
    'full-image': t('workspace.layoutFullImage'),
  }
  const { updateSlide, deleteSlide, addMessage, updateMessage, highlightedSlideIndex, clearHighlight, getCurrentSession, processingSlideNumbers, addProcessingSlide, removeProcessingSlide, duplicateSlide, reorderSlides } = useSessionStore()
  const store = useSettingsStore()
  const apiUrl = store.getApiUrl()
  const apiKey = store.getApiKey()
  const selectedModel = store.getModel()
  const { activeMenuSlideNumber, setActiveMenuSlideNumber } = useUIStore()

  const [expanded, setExpanded] = useState(false)
  const [flashing, setFlashing] = useState(false)
  // const [showMenu, setShowMenu] = useState(false) // Removed local state
  const menuRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const isHighlighted = highlightedSlideIndex === index
  const isProcessing = processingSlideNumbers?.includes(slide.slide_number)
  const showMenu = activeMenuSlideNumber === slide.slide_number
  const isBlurred = activeMenuSlideNumber !== null && activeMenuSlideNumber !== slide.slide_number

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `slide-${index}`, disabled: readonly })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // Cleanup abort on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenuSlideNumber(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu, setActiveMenuSlideNumber])

  // React to highlight: expand, scroll, flash
  useEffect(() => {
    if (!isHighlighted) return

    setExpanded(true)
    setFlashing(true)

    const scrollTimer = setTimeout(() => {
      const el = document.getElementById(`slide-card-${index}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 100)

    const clearTimer = setTimeout(() => {
      setFlashing(false)
      clearHighlight()
    }, 1600)

    return () => {
      clearTimeout(scrollTimer)
      clearTimeout(clearTimer)
    }
  }, [isHighlighted, index, clearHighlight])

  // Auto-expand when processing (generating/enhancing)
  useEffect(() => {
    if (isProcessing) {
      setExpanded(true)
    }
  }, [isProcessing])

  const handleEnhance = () => {
    if (isProcessing || readonly) return

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

        abortRef.current = enhanceSlide(
          apiUrl,
          apiKey,
          selectedModel,
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
  }

  const handleDuplicate = () => {
    duplicateSlide(index)
    setActiveMenuSlideNumber(null)
    toast.success(t('workspace.slideDuplicated'))
  }

  const handleMoveToStart = () => {
    reorderSlides(index, 0)
    setActiveMenuSlideNumber(null)
    toast.success(t('workspace.slideMovedStart'))
  }

  const handleMoveToEnd = () => {
    const session = getCurrentSession()
    if (!session) return
    reorderSlides(index, session.slides.length - 1)
    setActiveMenuSlideNumber(null)
    toast.success(t('workspace.slideMovedEnd'))
  }

  const handleDelete = () => {
    if (readonly) return
    setActiveMenuSlideNumber(null)
    confirmAction(
      t('workspace.deleteSlideConfirm', { number: slide.slide_number }),
      () => deleteSlide(index),
      { confirmText: t('workspace.delete'), cancelText: t('chat.cancel'), variant: 'destructive', title: t('workspace.delete') },
    )
  }

  const renderField = (
    field: 'content' | 'visual_description' | 'speaker_notes',
    icon: React.ReactNode,
    textClass: string
  ) => {
    const value = slide[field]
    if (!value) return null

    return (
      <div className="flex gap-2">
        <div className="shrink-0 mt-0.5">{icon}</div>
        {field === 'content' ? (
          <MarkdownRenderer content={value} className={textClass} />
        ) : (
          <p className={textClass}>{value}</p>
        )}
      </div>
    )
  }

  return (
    <div
      id={`slide-card-${index}`}
      ref={setNodeRef}
      style={style}
      className="origin-center"
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{
          opacity: isDragging ? 0 : 1,
          y: 0,
          scale: isDragActive && !isDragging ? 0.98 : 1,
          transition: { duration: isDragActive ? 0.2 : 0.15 },
        }}
        transition={{ duration: 0.2 }}
        className={`
        relative border rounded-xl transition-all duration-300
        ${showMenu ? 'z-40' : ''}
        ${isBlurred ? 'blur-[2px] opacity-60 pointer-events-none' : ''}
        ${selected
          ? 'border-black dark:border-neutral-400 bg-neutral-50 dark:bg-neutral-800/50'
          : slide._actionMarker === 'delete'
            ? 'border-red-500/80 bg-red-50/50 dark:bg-red-950/20'
            : slide._actionMarker === 'create' || slide._actionMarker === 'append'
              ? 'border-green-500/80 bg-green-50/50 dark:bg-green-950/20'
              : slide._actionMarker === 'update'
                ? 'border-yellow-500/80 bg-yellow-50/50 dark:bg-yellow-950/20'
                : slide._actionMarker === 'sort' // <--- NEW STYLE FOR SORT
                  ? 'border-blue-500/80 bg-blue-50/50 dark:bg-blue-950/20 z-10' // Blue + z-index bump
                  : 'border-neutral-200 dark:border-neutral-700/50 bg-white dark:bg-neutral-900'
        }
        ${isProcessing ? 'ring-1 ring-neutral-900/50 dark:ring-white/50' : ''}
        ${flashing ? 'slide-flash' : ''}
        ${slide._actionMarker ? 'opacity-70 scale-[0.98]' : ''}
      `}
      >
      {/* Magic Overlay (Processing) — Text-Only, Blur Only */}
      {isProcessing && (
        <div className="absolute inset-0 z-30 overflow-hidden rounded-xl bg-white/60 dark:bg-black/60 backdrop-blur-[2px] transition-all duration-300">
          {/* Centered Text (No Badge Background) */}
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <span className={`
              font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-widest text-center animate-pulse
              ${expanded ? 'text-sm' : 'text-[10px]'}
            `}>
              {t('workspace.refining')}
            </span>
          </div>
        </div>
      )}

      {/* Enhance overlay - REMOVED, using Magic Overlay above */}
      {/* Header row */}
      <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-neutral-100 dark:border-neutral-700/40">
        {/* Drag handle */}
        {!readonly && (
          <button
            {...attributes}
            {...listeners}
            className="p-0.5 rounded cursor-grab active:cursor-grabbing text-neutral-300 dark:text-neutral-600 hover:text-neutral-500 dark:hover:text-neutral-400 transition-colors"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Checkbox */}
        {!readonly && (
          <button
            onClick={() => onToggleSelect(index)}
            className={`
              w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors cursor-pointer
              ${selected
                ? 'bg-black dark:bg-white border-black dark:border-white'
                : 'border-neutral-300 dark:border-neutral-600 hover:border-neutral-400 dark:hover:border-neutral-500'
              }
            `}
          >
            {selected && <Check className="w-2.5 h-2.5 text-white dark:text-black" strokeWidth={3} />}
          </button>
        )}

        {/* Slide number */}
        <span className="flex items-center justify-center w-5 h-5 rounded bg-neutral-100 dark:bg-neutral-800 text-[10px] font-bold tabular-nums ml-0.5">
          {slide.slide_number}
        </span>

        {/* Title (read-only) */}
        <h3 className="text-sm font-semibold tracking-tight truncate flex-1">
          {slide.title}
        </h3>

        {/* Meta badges */}
        <div className="flex items-center gap-1 shrink-0">
          {slide.estimated_duration && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-[9px] font-medium text-neutral-500 tabular-nums">
              <Timer className="w-2.5 h-2.5" />
              {slide.estimated_duration}
            </span>
          )}
          {slide.layout_suggestion && (
            <span className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-[9px] font-medium text-neutral-500 hidden sm:flex items-center gap-0.5">
              <Layout className="w-2.5 h-2.5" />
              {layoutLabels[slide.layout_suggestion] || slide.layout_suggestion}
            </span>
          )}
        </div>

        {/* Actions cluster */}
        <div className="flex items-center gap-0.5 ml-1 shrink-0">
          {!readonly && (
            <>
              <button
                onClick={handleEnhance}
                disabled={isProcessing}
                title={t('workspace.enhance')}
                className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Wand2 className={`w-3.5 h-3.5 ${isProcessing ? 'text-indigo-400 animate-pulse' : 'text-neutral-400 hover:text-indigo-500 dark:hover:text-indigo-400'}`} />
              </button>
              <button
                onClick={() => onEdit?.(index)}
                title={t('workspace.editSlide')}
                className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5 text-neutral-400 hover:text-black dark:hover:text-white" />
              </button>
              <button
                onClick={() => setActiveMenuSlideNumber(showMenu ? null : slide.slide_number)}
                className={`p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer ${showMenu ? 'bg-neutral-100 dark:bg-neutral-800' : ''}`}
              >
                <MoreVertical className="w-3.5 h-3.5 text-neutral-400" />
              </button>
            </>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
            )}
          </button>
        </div>
      </div>

      {/* Expandable content (read-only) */}
      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="px-4 py-3.5 space-y-3"
        >
          {renderField(
            'content',
            <FileText className="w-3.5 h-3.5 text-neutral-400" />,
            'text-xs leading-relaxed text-neutral-600 dark:text-neutral-400'
          )}
          {renderField(
            'visual_description',
            <Image className="w-3.5 h-3.5 text-neutral-400" />,
            'text-[11px] leading-relaxed text-neutral-400 dark:text-neutral-500 italic'
          )}
          {renderField(
            'speaker_notes',
            <Mic className="w-3.5 h-3.5 text-neutral-400" />,
            'text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400'
          )}
        </motion.div>
      )}

      {/* Dropdown Menu */}
      <AnimatePresence>
        {showMenu && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.1 }}
            className="absolute right-3 top-10 z-50 w-48 py-1 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
          >
            <button
              onClick={handleDuplicate}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              <Copy className="w-3.5 h-3.5 text-neutral-400" />
              {t('workspace.duplicateSlide')}
            </button>
            <button
              onClick={handleMoveToStart}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              <ArrowUpToLine className="w-3.5 h-3.5 text-neutral-400" />
              {t('workspace.moveToStart')}
            </button>
            <button
              onClick={handleMoveToEnd}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              <ArrowDownToLine className="w-3.5 h-3.5 text-neutral-400" />
              {t('workspace.moveToEnd')}
            </button>
            <div className="my-1 border-t border-neutral-100 dark:border-neutral-800" />
            <button
              onClick={handleDelete}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t('workspace.delete')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      </motion.div>
    </div>
  )
}
