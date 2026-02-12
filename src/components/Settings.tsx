import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'motion/react'
import { useSettingsStore } from '../store/useSettingsStore'
import { fetchModels } from '../api/models'
import { toast } from 'sonner'
import { X, Lock, Link, Sun, Moon, Languages, Box, RefreshCw, ChevronDown, Check } from 'lucide-react'
import type { Theme, Language } from '../store/useSettingsStore'

interface SettingsProps {
  onClose: () => void
}

export default function Settings({ onClose }: SettingsProps) {
  const { t, i18n } = useTranslation()
  const store = useSettingsStore()
  const [key, setKey] = useState(store.apiKey)
  const [url, setUrl] = useState(store.apiUrl)
  const [model, setModel] = useState(store.selectedModel)
  const [theme, setTheme] = useState<Theme>(store.theme)
  const [language, setLanguage] = useState<Language>(store.language)
  const [models, setModels] = useState<string[]>(store.availableModels)
  const [fetching, setFetching] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [errors, setErrors] = useState<{ key?: boolean; url?: boolean; model?: boolean }>({})
  const dropdownRef = useRef<HTMLDivElement>(null)
  const modelInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleFetchModels = async () => {
    if (!url.trim()) return
    setFetching(true)
    try {
      const fetched = await fetchModels(url.trim(), key.trim())
      setModels(fetched)
      store.setAvailableModels(fetched)
      if (fetched.length > 0) {
        setDropdownOpen(true)
        toast.success(t('settings.modelsFetched', { count: fetched.length }))
      }
    } catch {
      toast.error(t('settings.modelsFetchError'))
    } finally {
      setFetching(false)
    }
  }

  const handleSelectModel = (m: string) => {
    setModel(m)
    if (errors.model) setErrors((prev) => ({ ...prev, model: false }))
    setDropdownOpen(false)
  }

  const filteredModels = model.trim()
    ? models.filter((m) => m.toLowerCase().includes(model.toLowerCase()))
    : models

  const handleSave = () => {
    const newErrors = {
      key: !key.trim(),
      url: !url.trim(),
      model: !model.trim(),
    }
    setErrors(newErrors)

    if (newErrors.key || newErrors.url || newErrors.model) {
      toast.error(t('settings.requiredFields'))
      return
    }

    store.setApiKey(key.trim())
    store.setApiUrl(url.trim())
    store.setSelectedModel(model.trim())
    store.setTheme(theme)
    store.setLanguage(language)
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
          {/* API Key */}
          <div className="space-y-2">
            <label className="block text-xs font-medium uppercase tracking-widest text-neutral-400">
              {t('settings.apiKey')}
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="password"
                value={key}
                onChange={(e) => {
                  setKey(e.target.value)
                  if (errors.key) setErrors((prev) => ({ ...prev, key: false }))
                }}
                className={`w-full pl-10 pr-4 py-2.5 rounded-lg border bg-neutral-50 dark:bg-neutral-800/50 text-sm font-mono focus:outline-none focus:ring-2 focus:border-transparent transition-all ${errors.key
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-neutral-200 dark:border-neutral-700 focus:ring-black dark:focus:ring-neutral-400'
                  }`}
              />
            </div>
          </div>

          {/* API URL */}
          <div className="space-y-2">
            <label className="block text-xs font-medium uppercase tracking-widest text-neutral-400">
              {t('settings.apiUrl')}
            </label>
            <div className="relative">
              <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value)
                  if (errors.url) setErrors((prev) => ({ ...prev, url: false }))
                }}
                className={`w-full pl-10 pr-4 py-2.5 rounded-lg border bg-neutral-50 dark:bg-neutral-800/50 text-sm font-mono focus:outline-none focus:ring-2 focus:border-transparent transition-all ${errors.url
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-neutral-200 dark:border-neutral-700 focus:ring-black dark:focus:ring-neutral-400'
                  }`}
              />
            </div>
          </div>

          {/* Model Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-medium uppercase tracking-widest text-neutral-400">
              {t('settings.model')}
            </label>
            <div className="relative" ref={dropdownRef}>
              <Box className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 z-10" />
              <input
                type="text"
                value={model}
                onChange={(e) => {
                  setModel(e.target.value)
                  if (errors.model) setErrors((prev) => ({ ...prev, model: false }))
                  if (models.length > 0) setDropdownOpen(true)
                }}
                onFocus={() => {
                  if (models.length > 0) setDropdownOpen(true)
                }}
                placeholder={t('settings.modelPlaceholder')}
                ref={modelInputRef}
                className={`w-full pl-10 pr-36 py-2.5 rounded-lg border bg-neutral-50 dark:bg-neutral-800/50 text-sm font-mono placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all ${errors.model
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-neutral-200 dark:border-neutral-700 focus:ring-black dark:focus:ring-neutral-400'
                  }`}
              />
              {/* Right side buttons */}
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {model && (
                  <button
                    type="button"
                    onClick={() => {
                      setModel('')
                      modelInputRef.current?.focus()
                    }}
                    className="p-1.5 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5 text-neutral-400" />
                  </button>
                )}
                {models.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="p-1.5 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
                  >
                    <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleFetchModels}
                  disabled={fetching || !url.trim()}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-neutral-200 dark:bg-neutral-700 text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${fetching ? 'animate-spin' : ''}`} />
                  {fetching ? t('settings.fetchingModels') : t('settings.fetchModels')}
                </button>
              </div>

              {/* Dropdown */}
              <AnimatePresence>
                {dropdownOpen && filteredModels.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scaleY: 0.96 }}
                    animate={{ opacity: 1, y: 0, scaleY: 1 }}
                    exit={{ opacity: 0, y: -4, scaleY: 0.96 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    style={{ transformOrigin: 'top' }}
                    className="absolute top-full left-0 right-0 z-50 mt-1.5 max-h-48 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                  >
                    {filteredModels.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => handleSelectModel(m)}
                        className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-xs font-mono transition-colors cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 ${m === model
                            ? 'text-black dark:text-white bg-neutral-50 dark:bg-neutral-800/50'
                            : 'text-neutral-600 dark:text-neutral-400'
                          }`}
                      >
                        {m === model && <Check className="w-3 h-3 shrink-0" />}
                        <span className={m === model ? '' : 'ml-5'}>{m}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

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
            </div>
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
