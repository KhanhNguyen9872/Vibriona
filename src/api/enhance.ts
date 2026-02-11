import axios from 'axios'
import i18n from '../i18n'
import type { Slide } from './prompt'
import { extractContentFromChunk, parsePartialSlides } from './parseStream'

const ENHANCE_PROMPT = `You are a presentation content enhancer. You will receive a single slide object. Rewrite and improve its content to be more engaging, professional, and detailed. Also improve the visual_description to be more specific and creative.

Output ONLY a single valid JSON object (not an array) with the same fields: slide_number, title, content, visual_needs_image, visual_description, layout_suggestion, speaker_notes, estimated_duration. Do not wrap in markdown code blocks. Do not include any text before or after the JSON.`

export function enhanceSlide(
  apiUrl: string,
  apiKey: string,
  model: string,
  slide: Slide,
  onDone: (enhanced: Slide) => void,
  onError: (error: string) => void
): AbortController {
  const controller = new AbortController()
  let processedLength = 0
  let fullContent = ''

  const isOllama = apiUrl.includes('11434') || apiUrl.includes('ollama')
  const endpoint = isOllama
    ? `${apiUrl.replace(/\/+$/, '')}/chat`
    : `${apiUrl.replace(/\/+$/, '')}/chat/completions`

  const resolvedModel = model || (isOllama ? 'llama3' : 'gpt-4o-mini')
  const userMessage = JSON.stringify(slide)

  const body = {
    model: resolvedModel,
    messages: [
      { role: 'system', content: ENHANCE_PROMPT },
      { role: 'user', content: userMessage },
    ],
    stream: true,
  }

  axios({
    method: 'post',
    url: endpoint,
    data: body,
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey && !isOllama ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    responseType: 'text',
    signal: controller.signal,
    onDownloadProgress: (event) => {
      const raw = (event.event?.target as XMLHttpRequest)?.responseText
      if (!raw) return
      const { content, newProcessedLength } = extractContentFromChunk(raw, processedLength)
      processedLength = newProcessedLength
      if (content) fullContent += content
    },
  })
    .then(() => {
      // Try to parse the single object
      const trimmed = fullContent.trim()
      try {
        const parsed = JSON.parse(trimmed)
        if (parsed.title && parsed.content) {
          onDone({ ...slide, ...parsed, slide_number: slide.slide_number })
          return
        }
      } catch {
        // Try extracting from partial array
      }

      // Fallback: try partial slides parser
      const slides = parsePartialSlides(trimmed.startsWith('[') ? trimmed : `[${trimmed}]`)
      if (slides.length > 0) {
        onDone({ ...slide, ...slides[0], slide_number: slide.slide_number })
      } else {
        onError(i18n.t('errors.parse'))
      }
    })
    .catch((err) => {
      if (axios.isCancel(err)) return
      const status = err.response?.status
      if (status === 401) onError(i18n.t('errors.invalidKey'))
      else if (status === 429) onError(i18n.t('errors.rateLimit'))
      else if (err.code === 'ERR_NETWORK') onError(i18n.t('errors.network'))
      else onError(err.message || i18n.t('workspace.enhanceFailed'))
    })

  return controller
}
