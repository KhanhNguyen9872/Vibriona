import type { Slide } from '../api/prompt'

export const STORAGE_KEYS = {
  HERO_SUGGESTIONS: 'vibriona-hero-suggestions',
  SESSIONS: 'vibriona-sessions',
}

export const createDefaultSlide = (slideNumber: number): Slide => ({
  slide_number: slideNumber,
  title: '',
  content: '',
  visual_needs_image: false,
  visual_description: '',
  layout_suggestion: 'intro',
  speaker_notes: '',
  estimated_duration: '1 min',
})
