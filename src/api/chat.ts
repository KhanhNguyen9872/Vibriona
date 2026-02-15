import type { APIConfig, ApiType } from './utils'
import { API_CONFIG } from '../config/api'

export interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface BuildChatRequestOptions {
  systemPrompt: string
  userPrompt: string
  history?: HistoryMessage[]
  /** Images for the current user message (base64 without data URL prefix); only last message supports images */
  userImages?: { base64: string; mimeType: string }[]
  temperature?: number
  stream?: boolean
  maxTokens?: number
}

/** Get plain text from a message (content may be string or OpenAI-style array). */
function getMessageTextContent(msg: Record<string, unknown>): string {
  const c = msg.content
  if (typeof c === 'string') return c
  if (Array.isArray(c)) {
    const textPart = c.find((p: unknown) => (p as Record<string, unknown>)?.type === 'text')
    return typeof (textPart as Record<string, unknown>)?.text === 'string'
      ? (textPart as Record<string, string>).text
      : ''
  }
  return ''
}

/** Chỉ gộp khi có đúng 2 message user liền kề và nội dung giống nhau (giữ message sau). */
function dedupeConsecutiveUserMessages(messages: Record<string, unknown>[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  for (const msg of messages) {
    const role = msg.role as string
    const prev = out[out.length - 1]
    const prevIsUser = prev && (prev.role as string) === 'user'
    const currIsUser = role === 'user'
    if (prevIsUser && currIsUser && getMessageTextContent(prev) === getMessageTextContent(msg)) {
      out[out.length - 1] = msg
    } else {
      out.push(msg)
    }
  }
  return out
}

/**
 * Build URL and body for a chat request. Single place for gemini vs openai/ollama branching.
 */
export function buildChatRequest(
  apiType: ApiType,
  config: APIConfig,
  options: BuildChatRequestOptions
): { url: string; body: object } {
  const {
    systemPrompt,
    userPrompt,
    history = [],
    userImages = [],
    temperature = API_CONFIG.DEFAULT_TEMPERATURE,
    stream = true,
    maxTokens = API_CONFIG.MAX_TOKENS,
  } = options

  const url =
    apiType === 'gemini'
      ? `${config.endpoint}:generateContent`
      : config.endpoint

  if (apiType === 'gemini') {
    const systemPart = { text: `"""\nSYSTEM PROMPT: ${systemPrompt}\n"""` }
    type Part = { text?: string; inline_data?: { mime_type: string; data: string } }
    const contents: Array<{ role: string; parts: Part[] }> = []

    const lastUserParts: Part[] = [{ text: userPrompt }]
    if (userImages.length > 0) {
      userImages.forEach((img) => {
        lastUserParts.push({
          inline_data: { mime_type: img.mimeType, data: img.base64 },
        })
      })
    }

    if (history.length > 0) {
      history.forEach((m, idx) => {
        const parts: Part[] = [{ text: m.content }]
        if (idx === 0 && m.role === 'user') {
          parts.unshift(systemPart)
        }
        contents.push({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts,
        })
      })
      if (contents.length > 0 && contents[0].role !== 'user') {
        contents.unshift({
          role: 'user',
          parts: [systemPart],
        })
      }
      contents.push({
        role: 'user',
        parts: lastUserParts,
      })
    } else {
      contents.push({
        role: 'user',
        parts: [systemPart, ...lastUserParts],
      })
    }

    return {
      url,
      body: {
        contents,
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
        },
      },
    }
  }

  const lastUserMessage: Record<string, unknown> =
    userImages.length > 0 && (apiType === 'ollama' || apiType === 'openai')
      ? (        () => {
          if (apiType === 'ollama') {
            return {
              role: 'user',
              content: userPrompt,
              images: userImages.map((img) => img.base64),
            }
          }
          return {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              ...userImages.map((img) => ({
              type: 'image_url',
              image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
            })),
            ],
          }
        })()
      : { role: 'user', content: userPrompt }

  const rawMessages: Record<string, unknown>[] = [
    { role: 'system', content: systemPrompt },
    ...((history as unknown) as Record<string, unknown>[]),
    lastUserMessage,
  ]
  const body: Record<string, unknown> = {
    model: config.model,
    messages: dedupeConsecutiveUserMessages(rawMessages),
    temperature,
    stream,
    max_tokens: maxTokens,
  }

  return { url, body }
}

/**
 * Parse non-streaming response body to extract the assistant text.
 */
export function parseNonStreamResponse(apiType: ApiType, data: unknown): string {
  const d = data as Record<string, unknown>
  if (apiType === 'gemini') {
    const candidates = d?.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined
    return candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  }
  const choices = d?.choices as Array<{ message?: { content?: string } }> | undefined
  const message = d?.message as { content?: string } | undefined
  return choices?.[0]?.message?.content ?? message?.content ?? ''
}

/** Context for finish-reason error messages (generate vs enhance vs suggestion). */
export type FinishReasonContext = 'generate' | 'enhance' | 'suggestion' | 'compact'

const STOP_VALUES = ['STOP', 'stop', 'null', null]

/**
 * Returns true if finishReason indicates normal completion (no error).
 */
export function isStopReason(finishReason: string | null | undefined): boolean {
  return STOP_VALUES.includes(finishReason as string | null)
}

/**
 * Return user-facing error message for a non-stop finish reason, or null if no error.
 */
export function getFinishReasonError(
  finishReason: string | null | undefined,
  context: FinishReasonContext = 'generate'
): string | null {
  if (finishReason == null || isStopReason(finishReason)) return null

  const r = String(finishReason).toUpperCase()
  const isMaxTokens = r === 'MAX_TOKENS' || r === 'LENGTH'
  const isSafety = r === 'SAFETY' || r === 'CONTENT_FILTER' || r === 'PROHIBITED_CONTENT'
  const isRecitation = r === 'RECITATION'
  const isOther = r === 'OTHER'

  if (context === 'enhance') {
    if (isMaxTokens) return 'Enhancement truncated: Max output tokens reached.'
    if (isSafety) return 'Enhancement blocked by safety filters.'
    if (isRecitation) return 'Enhancement stopped: Copyright protection (Recitation).'
    return `Generation stopped: ${finishReason}`
  }
  if (context === 'suggestion') {
    if (isMaxTokens) return 'Suggestion limit reached.'
    if (isSafety) return 'Suggestions blocked by safety filters.'
    if (isRecitation) return 'Suggestions blocked (Recitation).'
    return `Suggestion generation stopped: ${finishReason}`
  }
  if (context === 'compact') {
    if (isMaxTokens) return 'Compaction truncated: Max output tokens reached.'
    if (isSafety) return 'Compaction blocked by safety filters.'
    if (isRecitation) return 'Compaction stopped (Recitation).'
    return `Compaction stopped: ${finishReason}`
  }
  // default: generate
  if (isMaxTokens) return 'Generation limit reached (Max Tokens). Response may be truncated.'
  if (isSafety) return 'Content blocked by safety filters.'
  if (isRecitation) return 'Generation stopped: Content matches existing data too closely (Recitation).'
  if (isOther) return 'Generation stopped due to an unknown miscellaneous reason.'
  return `Generation stopped early: ${finishReason}`
}
