import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageSquarePlus, Edit3 } from 'lucide-react'

interface ClarificationRequestProps {
  question: string
  options: string[]
  allowCustom?: boolean
  onSelect: (answer: string) => void
  isAnswered?: boolean // New prop to lock UI from parent
  selectedOption?: string // Persisted selection
}

export default function ClarificationRequest({
  question,
  options,
  allowCustom,
  onSelect,
  isAnswered = false,
  selectedOption
}: ClarificationRequestProps) {
  const { t } = useTranslation()
  const [customInput, setCustomInput] = useState('')
  const [isTypingCustom, setIsTypingCustom] = useState(false)
  const [hasSelected, setHasSelected] = useState(isAnswered || !!selectedOption) // Optimistic lock

  // Determine if this specific instance is the skipped one
  const isSkipped = selectedOption === '###SKIPPED###'

  const handleSelect = (answer: string) => {
    if (hasSelected || isAnswered || isSkipped) return // Prevent if locked or skipped
    setHasSelected(true) 
    onSelect(answer)
  }

  const handleCustomSubmit = () => {
    if (customInput.trim() && !hasSelected && !isAnswered && !isSkipped) {
      setHasSelected(true)
      onSelect(customInput.trim())
      setCustomInput('')
      setIsTypingCustom(false)
    }
  }

  // ... (custom submit logic remains same)

  return (
    <div className={`flex flex-col gap-3 p-4 border rounded-xl transition-all ${
      isSkipped 
        ? 'opacity-50 grayscale pointer-events-none border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50' 
        : hasSelected
          ? 'bg-neutral-50 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 opacity-60 pointer-events-none'
          : 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-500/30'
      }`}>
      {/* Header */}
      <div className={`flex items-center gap-2 ${isSkipped ? 'text-neutral-500' : 'text-indigo-600 dark:text-indigo-300'}`}>
        <MessageSquarePlus className="w-4 h-4" />
        <span className="text-xs font-semibold">{t('clarification.header')}</span>
      </div>

      {/* The Question */}
      <p className="text-sm text-neutral-800 dark:text-neutral-200 font-medium">{question}</p>

      {/* Options Grid */}
      <div className="flex flex-wrap gap-2">
        {options.map((opt, idx) => (
          <button
            key={idx}
            onClick={() => handleSelect(opt)}
            disabled={hasSelected || isAnswered || !!selectedOption}
            className={`px-3 py-1.5 text-xs border rounded-full transition-all active:scale-95 ${
              selectedOption === opt
                ? 'bg-indigo-100 dark:bg-indigo-900/50 border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 font-medium ring-1 ring-indigo-500/30'
                : (hasSelected || isAnswered || !!selectedOption)
                  ? 'bg-neutral-100 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-400 dark:text-neutral-600 cursor-not-allowed opacity-50'
                  : 'bg-white dark:bg-zinc-800 hover:bg-indigo-100 dark:hover:bg-indigo-600 hover:text-indigo-700 dark:hover:text-white text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-zinc-700 cursor-pointer'
              }`}
          >
            {opt}
          </button>
        ))}

        {/* Custom Input Toggle - Hide if SKIPPED */}
        {allowCustom && !isTypingCustom && !hasSelected && !isAnswered && !selectedOption && !isSkipped && (
          <button
            onClick={() => setIsTypingCustom(true)}
            className="px-3 py-1.5 text-xs border border-dashed border-neutral-300 dark:border-zinc-600 text-neutral-500 dark:text-zinc-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:border-neutral-400 dark:hover:border-zinc-400 rounded-full transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Edit3 className="w-3 h-3" /> {t('clarification.customButton')}
          </button>
        )}
      </div>

      {/* Custom Input Field - Hide if SKIPPED */}
      {isTypingCustom && !hasSelected && !isAnswered && !selectedOption && !isSkipped && (
        <div className="flex gap-2 mt-1">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCustomSubmit()}
            placeholder={t('clarification.customPlaceholder')}
            className="flex-1 bg-white dark:bg-zinc-950 border border-neutral-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:focus:ring-indigo-500"
            autoFocus
          />
          <button
            onClick={handleCustomSubmit}
            disabled={!customInput.trim()}
            className="px-4 py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-500 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('clarification.send')}
          </button>
        </div>
      )}

      {/* Show selected custom answer if it was not in options AND NOT SKIPPED */}
      {selectedOption && !options.includes(selectedOption) && !isSkipped && (
        <div className="mt-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50 rounded-lg text-xs text-indigo-700 dark:text-indigo-300 italic">
          "{selectedOption}"
        </div>
      )}
    </div>
  )
}
