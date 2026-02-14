import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'motion/react'
import { useSettingsStore } from '../store/useSettingsStore'
import { toast } from 'sonner'
import { X, Sun, Moon, Languages, Mic } from 'lucide-react'
import type { Theme, Language } from '../store/useSettingsStore'

interface SettingsProps {
  onClose: () => void
}

export default function Settings({ onClose }: SettingsProps) {
  const { t, i18n } = useTranslation()
  const store = useSettingsStore()
  const [theme, setTheme] = useState<Theme>(store.theme)
  const [language, setLanguage] = useState<Language>(store.language)
  const [disableSuggestions, setDisableSuggestions] = useState<boolean>(store.disableSuggestions)
  const [autoSubmitOnSpeech, setAutoSubmitOnSpeech] = useState<boolean>(store.autoSubmitOnSpeech)

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const handleSave = () => {
    store.setTheme(theme)
    store.setLanguage(language)
    store.setDisableSuggestions(disableSuggestions)
    store.setAutoSubmitOnSpeech(autoSubmitOnSpeech)
    i18n.changeLanguage(language)
    toast.success(t('settings.saved'))
    onClose()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-lg mx-4 border border-neutral-200 dark:border-neutral-700/50 bg-white dark:bg-neutral-900 rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-6 pb-2">
          <h2 className="text-lg font-semibold tracking-tight">{t('settings.title')}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <div className="px-8 pt-4 pb-8 space-y-5">
          {/* Theme & Language row */}
          <div className="grid grid-cols-2 gap-4">
            {/* Theme */}
            <div className="space-y-2">
              <label className="block text-xs font-medium uppercase tracking-widest text-neutral-400">
                {t('settings.theme')}
              </label>
              <div className="flex rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                <button
                  onClick={() => setTheme('light')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors cursor-pointer ${theme === 'light'
                      ? 'bg-black text-white dark:bg-white dark:text-black'
                      : 'bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                    }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  {t('settings.light')}
                </button>
                <button
                  onClick={() => setTheme('dark')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors cursor-pointer ${theme === 'dark'
                      ? 'bg-black text-white dark:bg-white dark:text-black'
                      : 'bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                    }`}
                >
                  <Moon className="w-3.5 h-3.5" />
                  {t('settings.dark')}
                </button>
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                {t('settings.themeHint')}
              </p>
            </div>

            {/* Language */}
            <div className="space-y-2">
              <label className="block text-xs font-medium uppercase tracking-widest text-neutral-400">
                {t('settings.language')}
              </label>
              <div className="flex rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                <button
                  onClick={() => setLanguage('en')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors cursor-pointer ${language === 'en'
                      ? 'bg-black text-white dark:bg-white dark:text-black'
                      : 'bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                    }`}
                >
                  <Languages className="w-3.5 h-3.5" />
                  EN
                </button>
                <button
                  onClick={() => setLanguage('vi')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors cursor-pointer ${language === 'vi'
                      ? 'bg-black text-white dark:bg-white dark:text-black'
                      : 'bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                    }`}
                >
                  <Languages className="w-3.5 h-3.5" />
                  VI
                </button>
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                {t('settings.languageHint')}
              </p>
            </div>
          </div>

          {/* Suggestions */}
          <div className="space-y-2">
            <label className="block text-xs font-medium uppercase tracking-widest text-neutral-400">
              {t('settings.disableSuggestions')}
            </label>
            <div className="flex rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
              <button
                onClick={() => setDisableSuggestions(false)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors cursor-pointer ${!disableSuggestions
                    ? 'bg-black text-white dark:bg-white dark:text-black'
                    : 'bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
              >
                {t('common.no')}
              </button>
              <button
                onClick={() => setDisableSuggestions(true)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors cursor-pointer ${disableSuggestions
                    ? 'bg-black text-white dark:bg-white dark:text-black'
                    : 'bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
              >
                {t('common.yes')}
              </button>
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              {t('settings.disableSuggestionsHint')}
            </p>
          </div>

          {/* Auto submit on speech */}
          <div className="space-y-2">
            <label className="block text-xs font-medium uppercase tracking-widest text-neutral-400">
              {t('settings.autoSubmitOnSpeech')}
            </label>
            <div className="flex rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
              <button
                onClick={() => setAutoSubmitOnSpeech(false)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors cursor-pointer ${!autoSubmitOnSpeech
                    ? 'bg-black text-white dark:bg-white dark:text-black'
                    : 'bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
              >
                {t('common.no')}
              </button>
              <button
                onClick={() => setAutoSubmitOnSpeech(true)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors cursor-pointer ${autoSubmitOnSpeech
                    ? 'bg-black text-white dark:bg-white dark:text-black'
                    : 'bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
              >
                {t('common.yes')}
              </button>
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              {t('settings.autoSubmitOnSpeechHint')}
            </p>
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            className="w-full py-2.5 rounded-lg bg-black dark:bg-white text-white dark:text-black text-sm font-semibold tracking-wide hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer"
          >
            {t('settings.save')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
