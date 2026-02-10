import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'motion/react'
import { useSettingsStore } from '../store/useSettingsStore'
import { fetchModels } from '../api/models'
import { toast } from 'sonner'
import { Lock, Link, Box, RefreshCw, ChevronDown, Check } from 'lucide-react'

export default function ConfigurationModal() {
  const { t } = useTranslation()
  const { apiKey, apiUrl, selectedModel, setApiKey, setApiUrl, setSelectedModel, setAvailableModels } = useSettingsStore()
  const [key, setKey] = useState(apiKey)
  const [url, setUrl] = useState(apiUrl)
  const [model, setModel] = useState(selectedModel)
  const [models, setModels] = useState<string[]>([])
  const [fetching, setFetching] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [error, setError] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

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
      setAvailableModels(fetched)
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
    setDropdownOpen(false)
  }

  const filteredModels = model.trim()
    ? models.filter((m) => m.toLowerCase().includes(model.toLowerCase()))
    : models

  const handleSave = () => {
    if (!key.trim() || !url.trim()) {
      setError(true)
      return
    }
    setError(false)
    setApiKey(key.trim())
    setApiUrl(url.trim())
    setSelectedModel(model.trim())
    toast.success(t('settings.saved'))
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md mx-4 border border-neutral-200 dark:border-neutral-700/50 bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl"
      >
        {/* Header bar */}
        <div className="px-8 pt-8 pb-2">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-black dark:bg-white flex items-center justify-center">
              <Lock className="w-4 h-4 text-white dark:text-black" strokeWidth={2.5} />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">{t('config.title')}</h1>
          </div>
          <p className="text-sm text-neutral-500 mt-1 ml-11">{t('config.subtitle')}</p>
        </div>

        {/* Form */}
        <div className="px-8 pt-4 pb-8 space-y-5">
          <div className="space-y-2">
            <label className="block text-xs font-medium uppercase tracking-widest text-neutral-400">
              {t('config.apiKey')}
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={t('config.apiKeyPlaceholder')}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 text-sm font-mono placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-neutral-400 focus:border-transparent transition-all"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium uppercase tracking-widest text-neutral-400">
              {t('config.apiUrl')}
            </label>
            <div className="relative">
              <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t('config.apiUrlPlaceholder')}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 text-sm font-mono placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-neutral-400 focus:border-transparent transition-all"
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
                  if (models.length > 0) setDropdownOpen(true)
                }}
                onFocus={() => {
                  if (models.length > 0) setDropdownOpen(true)
                }}
                placeholder={t('settings.modelPlaceholder')}
                className="w-full pl-10 pr-24 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 text-sm font-mono placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-neutral-400 focus:border-transparent transition-all"
              />
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
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

              <AnimatePresence>
                {dropdownOpen && filteredModels.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scaleY: 0.96 }}
                    animate={{ opacity: 1, y: 0, scaleY: 1 }}
                    exit={{ opacity: 0, y: -4, scaleY: 0.96 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    style={{ transformOrigin: 'top' }}
                    className="absolute top-full left-0 right-0 z-50 mt-1.5 max-h-48 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl"
                  >
                    {filteredModels.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => handleSelectModel(m)}
                        className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-xs font-mono transition-colors cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                          m === model
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

          {error && (
            <p className="text-xs text-red-500 font-medium">{t('config.validation')}</p>
          )}

          <button
            onClick={handleSave}
            className="w-full py-2.5 rounded-lg bg-black dark:bg-white text-white dark:text-black text-sm font-semibold tracking-wide hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer"
          >
            {t('config.save')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
