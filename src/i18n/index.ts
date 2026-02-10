import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en'
import vi from './vi'

const stored = localStorage.getItem('vibriona-settings')
const lang = stored ? JSON.parse(stored)?.state?.language ?? 'en' : 'en'

i18n.use(initReactI18next).init({
  resources: { en, vi },
  lng: lang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export default i18n
