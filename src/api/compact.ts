import axios from 'axios'
import { API_CONFIG } from '../config/api'
import { getAPIConfig, getAPIErrorMessage } from './utils'
import { buildChatRequest, parseNonStreamResponse, getFinishReasonError } from './chat'
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

  const { url, body } = buildChatRequest(apiType, config, {
    systemPrompt,
    userPrompt,
    stream: false,
    temperature: 0,
    maxTokens: API_CONFIG.MAX_TOKENS,
  })

  try {
    callbacks.onProgress?.('Compacting conversation...')

    const response = await axios({
      method: 'post',
      url,
      data: body,
      headers: config.headers,
      timeout: 60000, // 60 second timeout
    })

    const summary = parseNonStreamResponse(apiType, response.data)

    const candidate = response.data?.candidates?.[0]
    const finishReason = candidate?.finishReason
    const finishError = getFinishReasonError(finishReason, 'compact')
    if (finishError) throw new Error(finishError)

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

    const message = getAPIErrorMessage(err, 'Failed to compact conversation')
    callbacks.onError(message)
  }
}
