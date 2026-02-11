import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'

export default function LoadingScreen() {
  const { t } = useTranslation()
  const [progress, setProgress] = useState(0)
  
  // Select random text once on mount
  const [loadingText] = useState(() => {
    const texts = [
      t('loading.initializing') || 'Initializing...',
      t('loading.assets') || 'Loading assets...',
      t('loading.preparing') || 'Preparing workspace...',
      t('loading.connecting') || 'Connecting to server...',
      t('loading.warming') || 'Warming up engines...',
      t('loading.optimizing') || 'Optimizing performance...',
      t('loading.syncing') || 'Syncing cloud data...',
      t('loading.modules') || 'Loading AI modules...',
      t('loading.configuration') || 'Checking configuration...',
    ]
    return texts[Math.floor(Math.random() * texts.length)]
  })

  // Animate progress over ~1500ms
  useEffect(() => {
    // Stage 1: Fast start
    const t1 = setTimeout(() => {
      setProgress(30)
    }, 200)

    // Stage 2: Middle load
    const t2 = setTimeout(() => {
      setProgress(75)
    }, 600)

    // Stage 3: Almost done
    const t3 = setTimeout(() => {
      setProgress(95)
    }, 1200)

    // Stage 4: Complete
    const t4 = setTimeout(() => {
      setProgress(100)
    }, 1500)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      clearTimeout(t4)
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-white dark:bg-neutral-950">
      <div className="flex flex-col items-center gap-6 p-4">
        {/* Logo or Icon */}
        <motion.div
           initial={{ opacity: 0, scale: 0.8 }}
           animate={{ opacity: 1, scale: 1 }}
           transition={{ duration: 0.5, ease: "easeOut" }}
           className="relative"
        >
           <img 
             src={`${import.meta.env.BASE_URL}assets/logo.png`} 
             alt="Logo" 
             className="w-16 h-16 object-contain" 
           />
        </motion.div>
        
        {/* App Title */}
        <motion.h1 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white"
        >
          {t('app.title')}
        </motion.h1>

        <div className="flex flex-col items-center gap-2 mt-2">
          {/* Progress Bar Container */}
          <div className="w-64 h-1 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
            {/* Progress Bar Filler */}
            <motion.div 
              className="h-full bg-neutral-900 dark:bg-white rounded-full"
              initial={{ width: "0%" }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
            />
          </div>
          
          {/* Loading Status Text */}
          <motion.p
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-neutral-500 dark:text-neutral-400 font-medium h-4"
          >
            {loadingText}
          </motion.p>
        </div>
      </div>
    </div>
  )
}
