import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'motion/react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useSettingsStore } from '../store/useSettingsStore'
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
}

const LAYOUT_LABELS: Record<string, string> = {
  'split-left': 'Split Left',
  'split-right': 'Split Right',
  'centered': 'Centered',
  'full-image': 'Full Image',
}

export default function SlideCard({
  slide,
  index,
  selected,
  onToggleSelect,
  onEdit,
  readonly = false,
}: SlideCardProps) {
  const { t } = useTranslation()
  const { updateSlide, deleteSlide, addMessage, updateMessage, highlightedSlideIndex, clearHighlight, getCurrentSession, processingSlideNumbers, addProcessingSlide, removeProcessingSlide } = useSessionStore()
  const { apiUrl, apiKey, selectedModel } = useSettingsStore()

  const [expanded, setExpanded] = useState(false)
  const [flashing, setFlashing] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const isHighlighted = highlightedSlideIndex === index
  const isProcessing = processingSlideNumbers?.includes(slide.slide_number)

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
      t('workspace.enhanceConfirm', 'Enhance this slide with AI?'),
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
            label: `Slide ${slide.slide_number}`
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
          slide,
          (enhanced) => {
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
                label: `Slide ${slide.slide_number}`
              }]
            })
            toast.success(t('workspace.enhanced'))
          },
          (error) => {
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
        confirm: t('workspace.enhance', 'Enhance'),
        cancel: t('chat.cancel'),
        description: t('workspace.enhanceDescription', 'AI will rewrite the content and visual description to make it more professional.'),
      }
    )
  }

  const handleDelete = () => {
    if (readonly) return
    confirmAction(
      t('workspace.deleteSlideConfirm', { number: slide.slide_number }),
      () => deleteSlide(index),
      { confirm: t('workspace.delete'), cancel: t('chat.cancel') },
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
    <motion.div
      id={`slide-card-${index}`}
      ref={setNodeRef}
      style={style}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      className={`
        relative border rounded-xl overflow-hidden transition-all duration-300
        ${isDragging ? 'opacity-30 z-50' : ''}
        ${selected
          ? 'border-black dark:border-neutral-400 bg-neutral-50 dark:bg-neutral-800/50'
          : 'border-neutral-200 dark:border-neutral-700/50 bg-white dark:bg-neutral-900'
        }
        ${isProcessing ? 'ring-1 ring-neutral-900/50 dark:ring-white/50' : ''}
        ${flashing ? 'slide-flash' : ''}
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
              Refining...
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
              {LAYOUT_LABELS[slide.layout_suggestion] ?? slide.layout_suggestion}
            </span>
          )}
        </div>

        {/* Actions cluster */}
        <div className="flex items-center gap-0.5 ml-1 shrink-0">
          {!readonly && (
            <>
              <button
                onClick={() => onEdit?.(index)}
                title={t('workspace.editSlide')}
                className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5 text-neutral-400 hover:text-black dark:hover:text-white" />
              </button>
              <button
                onClick={handleEnhance}
                disabled={isProcessing}
                title={t('workspace.enhance')}
                className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Wand2 className={`w-3.5 h-3.5 ${isProcessing ? 'text-indigo-400 animate-pulse' : 'text-neutral-400 hover:text-indigo-500 dark:hover:text-indigo-400'}`} />
              </button>
              <button
                onClick={handleDelete}
                title={t('workspace.delete')}
                className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 text-neutral-400 hover:text-red-500" />
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
    </motion.div>
  )
}
