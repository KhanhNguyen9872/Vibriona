import axios from 'axios'
import { SYSTEM_PROMPT, type Slide } from './prompt'
import { extractContentFromChunk, separateThinkingFromContent, parsePartialResponse, extractCompletionMessage } from './parseStream'

export interface StreamCallbacks {
  onToken: (fullText: string) => void
  onThinking: (thinkingText: string) => void
  onResponseUpdate: (action: string | undefined, slides: Slide[]) => void
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
  callbacks: StreamCallbacks,
  history: HistoryMessage[] = []
): AbortController {
  const controller = new AbortController()
  let processedLength = 0
  let fullContent = ''
  let apiThinking = '' // reasoning_content from API field

  // Detect endpoint type from URL
  const isOllama = apiUrl.includes('11434') || apiUrl.includes('ollama')
  const endpoint = isOllama
    ? `${apiUrl.replace(/\/+$/, '')}/chat`
    : `${apiUrl.replace(/\/+$/, '')}/chat/completions`

  const resolvedModel = model || (isOllama ? 'llama3' : 'gpt-4o-mini')

  const messages: { role: string; content: string }[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: userPrompt },
  ]

  const body = {
    model: resolvedModel,
    messages,
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
        // Now using Delta Protocol: { action, slides }
        const { action, slides } = parsePartialResponse(separated.content)
        
        if (slides.length > 0 || action) {
          callbacks.onResponseUpdate(action, slides)
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
      let message = 'Connection failed'

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
      } else if (err.message) {
        message = err.message
      }

      callbacks.onError(message, status)
    })

  return controller
}
