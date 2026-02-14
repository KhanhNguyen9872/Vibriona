import axios from 'axios'
import i18n from '../i18n'
import type { Slide } from './prompt'
import type { SystemPromptType } from './prompt'
import { extractContentFromChunk, parsePartialSlides } from './parseStream'
import { getAPIConfig, parseAPIError } from './utils'
import { API_CONFIG } from '../config/api'

const ENHANCE_ULTRA = `Enhance this slide. Output a single JSON object with: slide_number, title, content, visual_needs_image, visual_description, layout_suggestion, speaker_notes, estimated_duration. No markdown, no extra text.`

const ENHANCE_SHORT = `You are a slide enhancer. Rewrite the given slide to be more engaging and professional. Improve content and visual_description. Output ONLY one JSON object with fields: slide_number, title, content, visual_needs_image, visual_description, layout_suggestion, speaker_notes, estimated_duration. No markdown.`

const ENHANCE_MEDIUM = `You are a presentation content enhancer. You will receive a single slide object. Rewrite and improve its content to be more engaging, professional, and detailed. Also improve the visual_description to be more specific and creative.

Output ONLY a single valid JSON object (not an array) with the same fields: slide_number, title, content, visual_needs_image, visual_description, layout_suggestion, speaker_notes, estimated_duration. Do not wrap in markdown code blocks. Do not include any text before or after the JSON.`

const ENHANCE_FULL = `You are a presentation content enhancer. You will receive a single slide object.

**Task:** Rewrite and improve the slide to be more engaging, professional, and detailed. Enrich the main content (40–60 words, Markdown allowed). Make the visual_description more specific and creative for image generation. Refine speaker_notes and estimated_duration if needed.

**Output:** Exactly one valid JSON object. Same fields: slide_number, title, content, visual_needs_image, visual_description, layout_suggestion, speaker_notes, estimated_duration. No markdown code fences, no text before or after the JSON. Preserve slide_number.`

const ENHANCE_ADVANCED = `You are an expert presentation content enhancer. You will receive a single slide object.

**Task:** Rewrite and improve the slide so it is more engaging, professional, and detailed.
- **content:** 40–60 words, clear and impactful; use Markdown (bold, lists) where it helps.
- **visual_description:** Specific, creative, and suitable for image generation (e.g. "Professional speaker at podium, modern conference room, soft lighting").
- **speaker_notes:** Concise talking points or script hints.
- **estimated_duration:** Realistic (e.g. "1 min", "2 min").
Keep title, layout_suggestion, visual_needs_image consistent with intent. Preserve slide_number.

**Output:** Exactly one valid JSON object with fields: slide_number, title, content, visual_needs_image, visual_description, layout_suggestion, speaker_notes, estimated_duration. No markdown code blocks, no extra text.`

export function getEnhancePrompt(type: SystemPromptType): string {
  switch (type) {
    case 'ultra': return ENHANCE_ULTRA
    case 'short': return ENHANCE_SHORT
    case 'medium': return ENHANCE_MEDIUM
    case 'full': return ENHANCE_FULL
    case 'advanced': return ENHANCE_ADVANCED
    default: return ENHANCE_MEDIUM
  }
}

export function enhanceSlide(
  apiUrl: string,
  apiKey: string,
  model: string,
  apiType: 'ollama' | 'gemini' | 'openai',
  slide: Slide,
  onDone: (enhanced: Slide) => void,
  onError: (error: string) => void,
  systemPromptType: SystemPromptType = 'medium'
): AbortController {
  const controller = new AbortController()
  let processedLength = 0
  let fullContent = ''
  const enhancePrompt = getEnhancePrompt(systemPromptType)

  const config = getAPIConfig({ apiUrl, apiKey, model, apiType })
  const userMessage = JSON.stringify(slide)

  let url = config.endpoint
  let body: any = {
    model: config.model,
  }

  if (apiType === 'gemini') {
    url = `${url}:generateContent`

    body = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: `"""\nSYSTEM PROMPT: ${enhancePrompt}\n"""` },
            { text: userMessage }
          ]
        }
      ],
      generationConfig: {
        temperature: API_CONFIG.DEFAULT_TEMPERATURE,
        maxOutputTokens: API_CONFIG.MAX_TOKENS,
      }
    }
  } else {
    body.messages = [
      { role: 'system', content: enhancePrompt },
      { role: 'user', content: userMessage },
    ]
    body.temperature = API_CONFIG.DEFAULT_TEMPERATURE
    body.stream = true
    body.max_tokens = API_CONFIG.MAX_TOKENS
  }

  // Choose request config based on API type
  const requestConfig: any = {
      method: 'post',
      url,
      data: body,
      headers: config.headers,
      signal: controller.signal,
  }

  if (apiType !== 'gemini') {
    requestConfig.responseType = 'text'
    requestConfig.onDownloadProgress = (event: any) => {
      const raw = (event.event?.target as XMLHttpRequest)?.responseText
      if (!raw) return
      const { content, finishReason, newProcessedLength } = extractContentFromChunk(raw, processedLength)
      processedLength = newProcessedLength
      if (content) fullContent += content
      
      if (finishReason) {
        let errorMsg = ''
        if (finishReason === 'MAX_TOKENS' || finishReason === 'length' || finishReason === 'LENGTH') {
          errorMsg = 'Enhancement truncated: Max output tokens reached.'
        } else if (finishReason === 'SAFETY' || finishReason === 'content_filter') {
          errorMsg = 'Enhancement blocked by safety filters.'
        } else if (finishReason === 'RECITATION') {
          errorMsg = 'Enhancement stopped: Copyright protection (Recitation).'
        } else if (finishReason !== 'STOP') {
          errorMsg = `Generation stopped: ${finishReason}`
        }
        
        if (errorMsg) {
          onError(errorMsg)
        }
      }
    }
  }

  axios(requestConfig)
    .then((response) => {
        // Handle Gemini non-streaming
        if (apiType === 'gemini') {
            const candidate = response.data?.candidates?.[0]
             const finishReason = candidate?.finishReason
          
            if (finishReason && !['STOP', 'stop', 'null', null].includes(finishReason)) {
               let errorMsg = ''
               if (finishReason === 'MAX_TOKENS' || finishReason === 'LENGTH') {
                    errorMsg = 'Enhancement truncated.'
               } else if (finishReason === 'SAFETY') {
                    errorMsg = 'Enhancement blocked by safety filters.'
               } else {
                    errorMsg = `Stopped: ${finishReason}`
               }
               if (errorMsg) onError(errorMsg)
            }

            const content = candidate?.content?.parts?.[0]?.text || ''
            fullContent = content
        }
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
      const parsedError = parseAPIError(err)
      if (parsedError) {
        onError(parsedError)
        return
      }

      if (status === 401) onError(i18n.t('errors.invalidKey'))
      else if (status === 429) onError(i18n.t('errors.rateLimit'))
      else if (err.code === 'ERR_NETWORK') onError(i18n.t('errors.network'))
      else onError(err.message || i18n.t('workspace.enhanceFailed'))
    })

  return controller
}
