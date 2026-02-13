import axios from 'axios'
import { SYSTEM_PROMPT } from './prompt'
import type { Slide } from './prompt'
import { extractContentFromChunk, separateThinkingFromContent, parsePartialResponse, extractCompletionMessage, type DeltaResponse } from './parseStream'
import { getAPIConfig, parseAPIError } from './utils'
import { API_CONFIG } from '../config/api'

export interface StreamCallbacks {
  onToken: (content: string) => void
  onThinking: (thinking: string) => void
  onResponseUpdate: (response: DeltaResponse) => void
  onDone: (fullText: string, slides: Slide[], thinking: string, completionMessage: string) => void
  onError: (error: string, status?: number) => void
}

export interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Stream a chat completion from an OpenAI-compatible or Ollama endpoint.
 * Returns an AbortController so the caller can cancel.
 */
export function streamGenerate(
  apiUrl: string,
  apiKey: string,
  userPrompt: string,
  model: string,
  apiType: 'ollama' | 'gemini' | 'openai',
  callbacks: StreamCallbacks,
  history: HistoryMessage[] = []
): AbortController {
  const controller = new AbortController()
  let processedLength = 0
  let fullContent = ''
  let apiThinking = '' // reasoning_content from API field

  const config = getAPIConfig({ apiUrl, apiKey, model, apiType })

  let url = config.endpoint
  let body: any = {
    model: config.model,
    stream: true,
  }

  if (apiType === 'gemini') {
    url = `${url}:streamGenerateContent`
    
    const contents: any[] = []
    const systemPart = { text: `"""\nSYSTEM PROMPT: ${SYSTEM_PROMPT}\n"""` }

    if (history.length > 0) {
      // Find the first user message in history or handle the start
      // Gemini expects alternating user/model. We wrap system into the first item.
      history.forEach((m, idx) => {
        const parts = [{ text: m.content }]
        if (idx === 0 && m.role === 'user') {
          parts.unshift(systemPart)
        }
        contents.push({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts
        })
      })

      // If the first message was NOT user (unlikely), prepend a user message with system prompt
      if (contents.length > 0 && contents[0].role !== 'user') {
        contents.unshift({
          role: 'user',
          parts: [systemPart]
        })
      }

      contents.push({
        role: 'user',
        parts: [{ text: userPrompt }]
      })
    } else {
      contents.push({
        role: 'user',
        parts: [
          systemPart,
          { text: userPrompt }
        ]
      })
    }

    body = {
      contents,
      generationConfig: {
        temperature: API_CONFIG.DEFAULT_TEMPERATURE,
        maxOutputTokens: API_CONFIG.MAX_TOKENS,
      }
    }
  } else {
    body.messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: userPrompt },
    ]
  }

  axios({
    method: 'post',
    url,
    data: body,
    headers: config.headers,
    responseType: 'text',
    signal: controller.signal,
    onDownloadProgress: (event) => {
      const raw = (event.event?.target as XMLHttpRequest)?.responseText
      if (!raw) return

      const { content, thinking, newProcessedLength } = extractContentFromChunk(raw, processedLength)
      processedLength = newProcessedLength

      // Accumulate API-level thinking (reasoning_content field)
      if (thinking) {
        apiThinking += thinking
        callbacks.onThinking(apiThinking)
      }

      if (content) {
        fullContent += content

        // Separate <think> tags from content for display
        const separated = separateThinkingFromContent(fullContent)

        // Combine API thinking + tag thinking
        const allThinking = [apiThinking, separated.thinking].filter(Boolean).join('\n')
        if (allThinking) {
          callbacks.onThinking(allThinking)
        }

        callbacks.onToken(fullContent)

        // Parse slides from clean content (without think tags)
        // Now using Delta Protocol: { action, slides, content, question, options, allowCustom }
        const parsedResponse = parsePartialResponse(separated.content)

        if (parsedResponse.slides.length > 0 || parsedResponse.action) {
          callbacks.onResponseUpdate(parsedResponse)
        }
      }
    },
  })
    .then(() => {
      const separated = separateThinkingFromContent(fullContent)
      const allThinking = [apiThinking, separated.thinking].filter(Boolean).join('\n')

      const { slides: finalSlides } = parsePartialResponse(separated.content)
      const completionMessage = extractCompletionMessage(separated.content)

      callbacks.onDone(fullContent, finalSlides, allThinking, completionMessage)
    })
    .catch((err) => {
      if (axios.isCancel(err)) return

      const status = err.response?.status
      let message = parseAPIError(err)

      if (!message || message === 'Connection failed') {
        if (status === 401) {
          message = 'Invalid API key (401 Unauthorized)'
        } else if (status === 403) {
          message = 'Access denied (403 Forbidden)'
        } else if (status === 404) {
          message = 'Endpoint not found (404). Check your API URL.'
        } else if (status === 429) {
          message = 'Rate limited (429). Try again later.'
        } else if (status && status >= 500) {
          message = `Server error (${status})`
        } else if (err.code === 'ERR_NETWORK') {
          message = 'Network error. Is the API server running?'
        } else {
          message = err.message || 'Connection failed'
        }
      } else {
        message = message || err.message || 'Connection failed'
      }

      callbacks.onError(message, status)
    })

  return controller
}
