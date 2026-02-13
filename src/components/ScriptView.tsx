import { useTranslation } from 'react-i18next'
import { motion } from 'motion/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FileText, Image, Mic, Timer, Layout, Pencil } from 'lucide-react'
import type { Slide } from '../api/prompt'

interface ScriptViewProps {
  slides: Slide[]
  readonly?: boolean
  onEdit?: (index: number) => void
}

export default function ScriptView({ slides, readonly = false, onEdit }: ScriptViewProps) {
  const { t } = useTranslation()

  const layoutLabels: Record<string, string> = {
    'split-left': t('workspace.layoutSplitLeft'),
    'split-right': t('workspace.layoutSplitRight'),
    'centered': t('workspace.layoutCentered'),
    'full-image': t('workspace.layoutFullImage'),
  }

  if (slides.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-neutral-400">{t('workspace.empty')}</p>
      </div>
    )
  }

  return (
    <div className="pb-20">
      {slides.map((slide, index) => (
        <motion.article
          key={slide.id || `slide-${slide.slide_number}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: index * 0.03 }}
          className="relative"
        >
          {/* Slide separator & number */}
          <div className={`flex items-center gap-3 ${index === 0 ? 'mb-4' : 'my-6'}`}>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-neutral-200 dark:via-neutral-700 to-transparent" />
            <span className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest tabular-nums select-none">
              Slide {slide.slide_number}
            </span>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-neutral-200 dark:via-neutral-700 to-transparent" />
          </div>

          {/* Slide content block */}
          <div className="pl-2 border-l-2 border-neutral-100 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-600 transition-colors">
            {/* Title + Edit button */}
            <div className="flex items-center justify-between pl-3 mb-2">
              <h2 className="text-lg font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
                {slide.title}
              </h2>
              {!readonly && onEdit && (
                <button
                  onClick={() => onEdit(index)}
                  className="shrink-0 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                  title={t('workspace.editSlide')}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Meta badges */}
            <div className="flex items-center gap-2 pl-3 mb-2">
              {slide.estimated_duration && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-[10px] font-medium text-neutral-500 tabular-nums">
                  <Timer className="w-2.5 h-2.5" />
                  {slide.estimated_duration}
                </span>
              )}
              {slide.layout_suggestion && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-[10px] font-medium text-neutral-500">
                  <Layout className="w-2.5 h-2.5" />
                  {layoutLabels[slide.layout_suggestion] || slide.layout_suggestion}
                </span>
              )}
            </div>

            {/* Content — rendered as Markdown */}
            <div className="flex gap-2 pl-3 mb-2">
              <FileText className="w-3.5 h-3.5 text-neutral-400 shrink-0 mt-1.5" />
              <div className="flex-1 prose prose-sm dark:prose-invert prose-neutral max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {slide.content || '—'}
                </ReactMarkdown>
              </div>
            </div>

            {/* Visual Description */}
            {slide.visual_description && (
              <div className="flex gap-2 pl-3 mb-2">
                <Image className="w-3.5 h-3.5 text-neutral-400 shrink-0 mt-1.5" />
                <p className="text-xs leading-relaxed text-neutral-400 dark:text-neutral-500 italic whitespace-pre-wrap flex-1">
                  {slide.visual_description}
                </p>
              </div>
            )}

            {/* Speaker Notes */}
            {slide.speaker_notes && (
              <div className="flex gap-2 pl-3 mb-1">
                <Mic className="w-3.5 h-3.5 text-neutral-400 shrink-0 mt-1.5" />
                <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400 whitespace-pre-wrap flex-1">
                  {slide.speaker_notes}
                </p>
              </div>
            )}
          </div>
        </motion.article>
      ))}
    </div>
  )
}
