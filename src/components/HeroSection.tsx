import { useTranslation } from 'react-i18next'
import HeroChatInput from './HeroChatInput'

interface HeroSectionProps {
  className?: string
}

export default function HeroSection({ className = '' }: HeroSectionProps) {
  const { t } = useTranslation()

  return (
    <div className={`flex-1 flex flex-col items-center justify-center p-4 ${className}`}>
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            {t('app.hero')}
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400">
            {t('app.heroSub')}
          </p>
        </div>
        <HeroChatInput />
      </div>
    </div>
  )
}
