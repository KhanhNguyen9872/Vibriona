import axios from 'axios'
import { API_CONFIG } from '../config/api'
import { getAPIConfig, parseAPIError } from './utils'
import type { ChatMessage } from '../store/useSessionStore'

export interface CompactCallbacks {
  onProgress?: (status: string) => void
  onComplete: (summary: string) => void
  onError: (error: string) => void
}

/**
 * Compact conversation history using AI to generate a concise summary.
 * This helps reduce token usage while preserving context.
 */
export async function compactConversation(
  messages: ChatMessage[],
  apiUrl: string,
  apiKey: string,
  model: string,
  apiType: 'ollama' | 'gemini' | 'openai',
  callbacks: CompactCallbacks
): Promise<void> {
  const config = getAPIConfig({ apiUrl, apiKey, model, apiType })

  // Prepare message content for compaction
  const conversationText = messages
    .map((msg, idx) => {
      const role = msg.role === 'user' ? 'User' : 'Assistant'
      let content = msg.content
      
      // Simplify slide references
      if (msg.slides && msg.slides.length > 0) {
        const slideList = msg.slides.map((s) => `${s.slide_number}. ${s.title}`).join(', ')
        content = `Generated ${msg.slides.length} slides: ${slideList}`
      }
      
      return `[${idx + 1}] ${role}: ${content}`
    })
    .join('\n\n')

  const systemPrompt = `You are a conversation summarizer for Vibriona, a presentation generation tool.

Your task: Create a brief, concise plain-text summary in 200-400 words maximum. Be strict about length.

What to preserve (only essentials):
1. Main presentation topic and key themes
2. Slides created/modified/deleted (numbers and titles only; no slide body text)
3. Important user decisions (e.g. "user wanted formal language")
4. Context needed to continue the conversation

What to omit: Layout choices, speaker notes, visual descriptions, and minor edits. One short sentence per slide or change is enough.

Output format: Plain text summary ONLY. No JSON, code blocks, or markdown. Write in short sentences.

Example (brief):
User created a 5-slide presentation on AI Ethics: Intro, Data Privacy, Algorithmic Bias, Accountability, Future Considerations. Slide 3 was enhanced with bias examples. User requested formal language.`

  const userPrompt = `Please summarize the following conversation history. Focus on the main topic, slides created/modified, and key decisions:\n\n${conversationText}`

  let url = config.endpoint
  let body: any = {
    model: config.model,
    stream: false,
  }

  if (apiType === 'gemini') {
    url = `${url}:generateContent`
    body = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: `"""\nSYSTEM: ${systemPrompt}\n"""` },
            { text: userPrompt }
          ]
        }
      ],
      generationConfig: {
        temperature: 0, // Lower temperature for more focused summaries
        maxOutputTokens: API_CONFIG.MAX_TOKENS,
      }
    }
  } else {
    body.messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]
    body.temperature = 0.3
    body.max_tokens = API_CONFIG.MAX_TOKENS
  }

  try {
    callbacks.onProgress?.('Compacting conversation...')

    const response = await axios({
      method: 'post',
      url,
      data: body,
      headers: config.headers,
      timeout: 60000, // 60 second timeout
    })

    let summary = ''

    if (apiType === 'gemini') {
      const candidate = response.data?.candidates?.[0]
      const finishReason = candidate?.finishReason
      
      if (finishReason && !['STOP', 'stop', 'null', null].includes(finishReason)) {
        throw new Error(`Generation stopped: ${finishReason}`)
      }

      summary = candidate?.content?.parts?.[0]?.text || ''
    } else {
      // OpenAI/Ollama format
      summary = response.data?.choices?.[0]?.message?.content || 
                response.data?.message?.content || ''
    }

    // Validate summary
    if (!summary || summary.trim().length < 50) {
      throw new Error('Generated summary is too short or empty')
    }

    callbacks.onComplete(summary.trim())
  } catch (err: any) {
    if (axios.isCancel(err)) {
      callbacks.onError('Compaction cancelled')
      return
    }

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
      } else if (err.code === 'ECONNABORTED') {
        message = 'Request timeout. Try again.'
      } else if (err.code === 'ERR_NETWORK') {
        message = 'Network error. Is the API server running?'
      } else {
        message = err.message || 'Failed to compact conversation'
      }
    }

    callbacks.onError(message)
  }
}
