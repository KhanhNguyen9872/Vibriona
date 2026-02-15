import axios from 'axios'
import { SYSTEM_PROMPT } from './prompt'
import type { Slide } from './prompt'
import { extractContentFromChunk, separateThinkingFromContent, parsePartialResponse, extractCompletionMessage, type DeltaResponse } from './parseStream'
import { getAPIConfig, getAPIErrorMessage } from './utils'
import { buildChatRequest, getFinishReasonError, parseNonStreamResponse } from './chat'
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
 * @param abortSignal - Optional external signal; when aborted, the request is cancelled.
 */
export function streamGenerate(
  apiUrl: string,
  apiKey: string,
  userPrompt: string,
  model: string,
  apiType: 'ollama' | 'gemini' | 'openai',
  callbacks: StreamCallbacks,
  history: HistoryMessage[] = [],
  systemPrompt: string = SYSTEM_PROMPT,
  temperatureOverride?: number,
  abortSignal?: AbortSignal,
  userImages?: { base64: string; mimeType: string }[]
): AbortController {
  const controller = new AbortController()
  let processedLength = 0
  let fullContent = ''
  let apiThinking = '' // reasoning_content from API field

  const config = getAPIConfig({ apiUrl, apiKey, model, apiType })
  const temperature = temperatureOverride ?? API_CONFIG.DEFAULT_TEMPERATURE

  const { url, body } = buildChatRequest(apiType, config, {
    systemPrompt,
    userPrompt,
    history,
    userImages: userImages ?? [],
    temperature,
    stream: true,
    maxTokens: API_CONFIG.MAX_TOKENS,
  })

  // Choose request config based on API type; use external abort signal when provided
  const requestConfig: any = {
      method: 'post',
      url,
      data: body,
      headers: config.headers,
      signal: abortSignal ?? controller.signal,
  }

  if (apiType !== 'gemini') {
      requestConfig.responseType = 'text'
      requestConfig.onDownloadProgress = (event: any) => {
          const raw = (event.event?.target as XMLHttpRequest)?.responseText
          if (!raw) return
    
          const { content, thinking, finishReason, newProcessedLength } = extractContentFromChunk(raw, processedLength)
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
    
          // Handle finishing errors (MAX_TOKENS, SAFETY, etc.)
          const errorMsg = getFinishReasonError(finishReason, 'generate')
          if (errorMsg) callbacks.onError(errorMsg)
        }
  }

  axios(requestConfig)
    .then((response) => {
      // Handle non-streaming response (Gemini)
      if (apiType === 'gemini') {
          const candidate = response.data?.candidates?.[0]
          const finishReason = candidate?.finishReason
          const errorMsg = getFinishReasonError(finishReason, 'generate')
          if (errorMsg) callbacks.onError(errorMsg)

          fullContent = parseNonStreamResponse(apiType, response.data)
          callbacks.onToken(fullContent)

          // IMPORTANT: Trigger response update for the full content so UI renders action/slides
          const separated = separateThinkingFromContent(fullContent)
          const parsedResponse = parsePartialResponse(separated.content)
            
          if (parsedResponse.slides.length > 0 || parsedResponse.action) {
              callbacks.onResponseUpdate(parsedResponse)
          }
      }

      const separated = separateThinkingFromContent(fullContent)
      const allThinking = [apiThinking, separated.thinking].filter(Boolean).join('\n')

      const { slides: finalSlides } = parsePartialResponse(separated.content)
      const completionMessage = extractCompletionMessage(separated.content)

      callbacks.onDone(fullContent, finalSlides, allThinking, completionMessage)
    })
    .catch((err) => {
      if (axios.isCancel(err)) {
        callbacks.onError('Cancelled')
        return
      }

      const status = err.response?.status
      const message = getAPIErrorMessage(err, 'Connection failed')
      callbacks.onError(message, status)
    })

  return controller
}
