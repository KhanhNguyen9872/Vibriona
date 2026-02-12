import type { Slide } from './prompt'

/**
 * Result of extracting content from a stream chunk.
 * Separates reasoning/thinking content from the main response.
 */
export interface ChunkResult {
  content: string
  thinking: string
  newProcessedLength: number
}

/**
 * Parse SSE (Server-Sent Events) lines from an OpenAI-compatible stream.
 * Extracts content deltas from `data: {...}` lines.
 * Also handles Ollama's newline-delimited JSON format.
 * Detects reasoning_content from API fields (DeepSeek/OpenAI o1).
 */
export function extractContentFromChunk(raw: string, processedLength: number): ChunkResult {
  const newData = raw.slice(processedLength)
  const lines = newData.split('\n')

  let content = ''
  let thinking = ''

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // OpenAI SSE format: data: {"choices":[{"delta":{"content":"..."}}]}
    if (trimmed.startsWith('data:')) {
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') continue

      try {
        const parsed = JSON.parse(payload)
        const delta = parsed.choices?.[0]?.delta

        // Check for reasoning_content field (DeepSeek-R1, o1-style)
        if (delta?.reasoning_content) {
          thinking += delta.reasoning_content
        }
        if (delta?.content) {
          content += delta.content
        }
      } catch {
        // Incomplete JSON line — skip, will be completed in next chunk
      }
      continue
    }

    // Ollama format: {"message":{"content":"..."}} per line
    try {
      const parsed = JSON.parse(trimmed)
      const msg = parsed.message?.content ?? parsed.response
      if (msg) content += msg
    } catch {
      // Incomplete line — skip
    }
  }

  return { content, thinking, newProcessedLength: raw.length }
}

/**
 * Separate <think>...</think> tags from content.
 * Returns the thinking text extracted from tags and the remaining content.
 */
export function separateThinkingFromContent(fullText: string): { thinking: string; content: string } {
  // Extract all <think>...</think> blocks
  let thinking = ''
  let content = fullText

  // Handle complete <think>...</think> blocks
  const thinkRegex = /<think>([\s\S]*?)<\/think>/g
  let match: RegExpExecArray | null
  while ((match = thinkRegex.exec(fullText)) !== null) {
    thinking += match[1]
  }

  // Remove complete think blocks from content
  content = content.replace(/<think>[\s\S]*?<\/think>/g, '')

  // Handle unclosed <think> tag (still streaming thinking)
  const unclosedIdx = content.lastIndexOf('<think>')
  if (unclosedIdx !== -1) {
    // Everything after <think> is still thinking content
    thinking += content.slice(unclosedIdx + 7) // 7 = '<think>'.length
    content = content.slice(0, unclosedIdx)
  }

  return { thinking: thinking.trim(), content: content.trim() }
}

/**
 * Check if content is currently inside an unclosed <think> tag.
 */
export function isInsideThinkTag(fullText: string): boolean {
  const openCount = (fullText.match(/<think>/g) || []).length
  const closeCount = (fullText.match(/<\/think>/g) || []).length
  return openCount > closeCount
}

/**
 * Extract any text that appears after the JSON object's closing `}`.
 * This is the AI's conversational completion message.
 */
export function extractCompletionMessage(content: string): string {
  const trimmed = content.trim()
  const successJsonEnd = trimmed.lastIndexOf('}')

  if (successJsonEnd === -1) return ''

  // Look for the end of the MAIN object, not just any object
  // Heuristic: The main object starts typically at char 0 or near it.
  // We can also try to parse what's before various '}' to see if it's the full JSON.

  // Simple heuristic: If the text continues significantly after the last '}', it's likely the message.
  // A robust way is to rely on the fact that the JSON is valid (or almost valid).

  // For now, let's assume the JSON object is the first major block.
  // finding the matching closing brace for the first opening brace.
  const openIdx = trimmed.indexOf('{')
  if (openIdx === -1) return ''

  let depth = 0
  let closeIdx = -1

  for (let i = openIdx; i < trimmed.length; i++) {
    if (trimmed[i] === '{') depth++
    else if (trimmed[i] === '}') {
      depth--
      if (depth === 0) {
        closeIdx = i
        break
      }
    }
  }

  if (closeIdx !== -1 && closeIdx < trimmed.length - 1) {
    return trimmed.slice(closeIdx + 1).trim()
  }

  return ''
}

export interface DeltaResponse {
  action?: 'create' | 'update' | 'append' | 'delete' | 'ask' | 'response' | 'info' | 'sort'
  slides: Slide[]
  // Fields for ask action
  question?: string
  options?: string[]
  allowCustom?: boolean
  // Field for response action
  content?: string
  // Fields for info action
  slide_ids?: string[]
  // Fields for sort action
  new_order?: string[]
}

/**
 * Attempt to parse a partial JSON response following the Delta Protocol.
 * Expected format: { "action": "...", "slides": [ ... ] }
 */
export function parsePartialResponse(text: string): DeltaResponse {
  let trimmed = text.trim()
  if (!trimmed) return { slides: [] }

  // 🛡️ SAFETY: Strip markdown code blocks if AI wrapped the JSON
  // Remove ```json at start and ``` at end (common LLM behavior)
  trimmed = trimmed.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/```\s*$/, '')
  trimmed = trimmed.trim()

  // Strategy: Try to find "action" and "slides" even in partial JSON

  // 1. Try full parse first
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && (Array.isArray(parsed.slides) || parsed.action === 'ask' || parsed.action === 'response')) {
      const response = {
        action: parsed.action,
        slides: parsed.slides || [],
        question: parsed.question,
        options: parsed.options,
        allowCustom: parsed.allow_custom_input,
        content: parsed.content,
        slide_ids: parsed.slide_ids,
        new_order: parsed.new_order
      }

      // 🐛 DEBUG: Log parsed response
      // console.log('📦 [Parsed Bot Response]', {
      //   action: response.action,
      //   slidesCount: response.slides?.length ?? 0,
      //   hasQuestion: !!response.question,
      //   hasContent: !!response.content,
      //   slide_ids: response.slide_ids,
      //   new_order: response.new_order,
      //   rawParsed: parsed
      // })

      return response
    }
  } catch {
    // Partial parse
  }

  const result: DeltaResponse = { slides: [] }

  // 2. Extract Action (Regex)
  const actionMatch = /"action"\s*:\s*"([^"]+)"/.exec(trimmed)
  if (actionMatch) {
    result.action = actionMatch[1] as any
  }

  // 3. Extract Slides Array
  // Look for "slides": [ ...
  const slidesStartMatch = /"slides"\s*:\s*\[/.exec(trimmed)
  if (slidesStartMatch) {
    const slidesStartIndex = slidesStartMatch.index + slidesStartMatch[0].length - 1 // points to [
    const slidesString = trimmed.slice(slidesStartIndex)
    result.slides = parsePartialSlides(slidesString)
  }

  return result
}

/**
 * Legacy/Helper: Parse just the array part (reused from before, but adapted)
 */
export function parsePartialSlides(text: string): Slide[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  // If it starts with [, it's an array. If it starts with {, it might be the object wrapper (handled above), 
  // but this function expects the ARRAY string specifically.

  const arrStart = trimmed.indexOf('[')
  if (arrStart === -1) return []

  let json = trimmed.slice(arrStart)

  // Quick fix for the common case where stream ends mid-object
  // Strategy: Find the last valid object ending '}'
  const lastCloseBrace = json.lastIndexOf('}')
  if (lastCloseBrace === -1) return []

  // Truncate to the last complete object and close the array
  // This is a naive repair but works well for streaming lists
  let repaired = json.slice(0, lastCloseBrace + 1)

  // Check if we need to add a closing bracket
  if (!repaired.endsWith(']')) {
    repaired += ']'
  }

  // Fix trailing command if any: "[{...}, ]" -> "[{...}]"
  repaired = repaired.replace(/,\s*\]$/, ']')

  try {
    const parsed = JSON.parse(repaired)
    if (Array.isArray(parsed)) return parsed
  } catch {
    // Fallback: Regex extraction
    const objects: Slide[] = []
    // Match balanced braces is hard with regex, assuming no nested objects for now or simple structure
    // Actually, Prompt ensures flat structure mostly.

    // Improved Regex to capture top-level objects in the array
    // This is still fragile but better than nothing for a broken stream
    const objectRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g
    let match
    while ((match = objectRegex.exec(json)) !== null) {
      try {
        const obj = JSON.parse(match[0])
        if (obj.slide_number || obj.title) objects.push(obj)
      } catch { }
    }
    return objects
  }

  return []
}
