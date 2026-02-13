import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'motion/react'
import TextareaAutosize from 'react-textarea-autosize'
import MDEditor from '@uiw/react-md-editor'
import remarkBreaks from 'remark-breaks'
import { X, FileText, Image, Mic, Type } from 'lucide-react'
import { useSettingsStore } from '../store/useSettingsStore'
import type { Slide } from '../api/prompt'

interface SlideEditorModalProps {
  slide: Slide
  onSave: (patch: Partial<Slide>) => void
  onClose: () => void
  mode?: 'edit' | 'add'
}

export default function SlideEditorModal({ slide, onSave, onClose, mode = 'edit' }: SlideEditorModalProps) {
  const { t } = useTranslation()
  const { theme } = useSettingsStore()
  const [title, setTitle] = useState(slide.title)
  const [content, setContent] = useState(slide.content)
  const [speakerNotes, setSpeakerNotes] = useState(slide.speaker_notes ?? '')
  const [visualDescription, setVisualDescription] = useState(slide.visual_description ?? '')
  const [error, setError] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

  // Focus title on mount
  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleSave = () => {
    if (!title.trim()) {
      setError(t('workspace.titleRequired'))
      titleRef.current?.focus()
      return
    }

    onSave({
      title: title.trim(),
      content: content.trim(),
      speaker_notes: speakerNotes.trim(),
      visual_description: visualDescription.trim(),
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="w-full h-full md:max-w-5xl md:max-h-[90vh] flex flex-col md:mx-4 md:rounded-2xl border border-neutral-200 dark:border-neutral-700/60 bg-white dark:bg-neutral-900 overflow-hidden"
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-[11px] font-bold tabular-nums">
              {slide.slide_number}
            </span>
            <h2 className="text-sm font-semibold tracking-tight">
              {mode === 'add'
                ? t('workspace.addSlideTitle', { number: slide.slide_number })
                : t('workspace.editSlideTitle', { number: slide.slide_number })
              }
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Title */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                <Type className="w-3 h-3" />
                {t('workspace.fieldTitle')}
                <span className="text-red-500">*</span>
              </label>
              {error && (
                <span className="text-[11px] font-medium text-red-500 animate-pulse">
                  {error}
                </span>
              )}
            </div>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                if (error) setError('')
              }}
              className={`
                w-full px-3.5 py-2.5 rounded-xl border bg-neutral-50 dark:bg-neutral-800/50 text-sm font-medium focus:outline-none focus:ring-2 transition-shadow
                ${error
                  ? 'border-red-500 focus:ring-red-200 dark:focus:ring-red-900/30'
                  : 'border-neutral-200 dark:border-neutral-700 focus:ring-neutral-300 dark:focus:ring-neutral-600'
                }
              `}
              placeholder={t('workspace.fieldTitlePlaceholder')}
            />
          </div>

          {/* Content */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
              <FileText className="w-3 h-3" />
              {t('workspace.fieldContent')}
            </label>
            <div data-color-mode={theme === 'dark' ? 'dark' : 'light'}>
              <MDEditor
                value={content}
                onChange={(val) => setContent(val || '')}
                height={280}
                preview="live"
                previewOptions={{ remarkPlugins: [remarkBreaks] }}
                className="!rounded-xl !border-neutral-200 dark:!border-neutral-700 !shadow-none"
              />
            </div>
          </div>

          {/* Speaker Notes */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
              <Mic className="w-3 h-3" />
              {t('workspace.fieldSpeakerNotes')}
            </label>
            <TextareaAutosize
              value={speakerNotes}
              onChange={(e) => setSpeakerNotes(e.target.value)}
              minRows={2}
              className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 transition-shadow"
              placeholder={t('workspace.fieldSpeakerNotesPlaceholder')}
            />
          </div>

          {/* Visual Description */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
              <Image className="w-3 h-3" />
              {t('workspace.fieldVisualDescription')}
            </label>
            <TextareaAutosize
              value={visualDescription}
              onChange={(e) => setVisualDescription(e.target.value)}
              minRows={2}
              className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 transition-shadow italic text-neutral-500 dark:text-neutral-400"
              placeholder={t('workspace.fieldVisualDescriptionPlaceholder')}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-end gap-2.5 px-6 py-4 border-t border-neutral-100 dark:border-neutral-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            {t('workspace.cancelEdit')}
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors cursor-pointer"
          >
            {t('workspace.saveChanges')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
