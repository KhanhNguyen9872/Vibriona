import type { Slide } from './prompt'

/**
 * Result of extracting content from a stream chunk.
 * Separates reasoning/thinking content from the main response.
 */
export interface ChunkResult {
  content: string
  thinking: string
  finishReason?: string
  newProcessedLength: number
}

/**
 * Parse SSE (Server-Sent Events) lines from an OpenAI-compatible stream.
 * Extracts content deltas from `data: {...}` lines.
 * Also handles Ollama's newline-delimited JSON format.
 * Detects reasoning_content from API fields (DeepSeek/OpenAI o1).
 */
export function extractContentFromChunk(raw: string, processedLength: number): ChunkResult {
  // Only process complete lines to ensure we don't lose data from partial JSON chunks.
  // We look for the last newline character in the NEW data.
  const lastNewlineIndex = raw.lastIndexOf('\n')
  
  // If no new complete line since last process, return early
  if (lastNewlineIndex < processedLength) {
    return { 
      content: '', 
      thinking: '', 
      finishReason: undefined, 
      newProcessedLength: processedLength 
    }
  }

  // Extract only the valid complete text block
  const validChunk = raw.slice(processedLength, lastNewlineIndex + 1)
  const lines = validChunk.split('\n')

  let content = ''
  let thinking = ''
  let finishReason: string | undefined

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // OpenAI SSE format: data: {"choices":[{"delta":{"content":"..."}}]}
    if (trimmed.startsWith('data:')) {
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') continue

      try {
        const parsed = JSON.parse(payload)
        
        // 1. OpenAI format
        const choice = parsed.choices?.[0]
        const delta = choice?.delta

        // Check for reasoning_content field (DeepSeek-R1, o1-style)
        if (delta?.reasoning_content) {
          thinking += delta.reasoning_content
        }
        if (delta?.content) {
          content += delta.content
        }
        // OpenAI finish_reason
        if (choice?.finish_reason && !['stop', 'null', null].includes(choice.finish_reason)) {
          finishReason = choice.finish_reason
        }

        // 2. Ollama format (sometimes wrapped in SSE data:)
        if (!delta && parsed.message?.content) {
             content += parsed.message.content
        }
        if (parsed.done === true) {
             finishReason = 'stop'
        }
      } catch {
        // Incomplete JSON line — skip, will be completed in next chunk
      }
      continue
    }

    // Generic JSON per line (Ollama or Gemini)
    try {
      // 🛡️ Gemini-specific: Support stream format that wraps objects in array [{},{},...]
      // Strip leading/trailing brackets and commas that cause JSON.parse to fail
      let cleanLine = trimmed
        .replace(/^\[/, '')
        .replace(/^,/, '')
        .replace(/\]$/, '')
        .trim()
        
      if (!cleanLine) continue

      const parsed = JSON.parse(cleanLine)
      
      // Handle Gemini (candidates[0].content.parts[0].text)
      const candidate = parsed.candidates?.[0]
      if (candidate?.content?.parts?.[0]?.text) {
        content += candidate.content.parts[0].text
      }

      // Gemini finishReason
      if (candidate?.finishReason && !['STOP', 'null', null].includes(candidate.finishReason)) {
        finishReason = candidate.finishReason
      }

      // Handle Ollama format: {"message":{"content":"..."}} per line
      const msg = parsed.message?.content ?? parsed.response
      if (msg) content += msg
    } catch {
      // Incomplete line — skip
    }
  }

  return { content, thinking, finishReason, newProcessedLength: lastNewlineIndex + 1 }
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
 * Extract any text that appears after the JSON data.
 * Supports both NDJSON (multiple lines) and legacy single-object format.
 * This is the AI's conversational completion message.
 */
export function extractCompletionMessage(content: string): string {
  const trimmed = content.trim()
  if (!trimmed) return ''

  // Find the last '}' in the content (end of last JSON object/line)
  const lastJsonEnd = trimmed.lastIndexOf('}')
  if (lastJsonEnd === -1) return ''

  // Check if there's meaningful text after the last '}'
  const afterJson = trimmed.slice(lastJsonEnd + 1).trim()
  
  // Filter out common artifacts (empty strings, markdown backticks, etc.)
  if (!afterJson || afterJson === '```' || afterJson === '```json') {
    return ''
  }

  return afterJson
}

export interface BatchOperation {
  type: 'update' | 'delete'
  slide_number: number
  title?: string
  content?: string
  visual_needs_image?: boolean
  visual_description?: string
  layout_suggestion?: string
  speaker_notes?: string
  estimated_duration?: string
}

export interface DeltaResponse {
  action?: 'create' | 'update' | 'append' | 'delete' | 'ask' | 'response' | 'info' | 'batch'
  slides: Slide[]
  // Fields for ask action
  question?: string
  options?: string[]
  allowCustom?: boolean
  // Field for response action
  content?: string
  // Fields for info action
  slide_numbers?: number[]
  // Fields for batch action
  operations?: BatchOperation[]
}

/**
 * Map short layout keys to long layout keys.
 * Short format: "intro", "left", "right", "center", "quote"
 * Long format: "intro", "split-left", "split-right", "centered", "quote", "full-image"
 */
function mapLayoutShortToLong(shortLayout: string): string {
  const layoutMap: Record<string, string> = {
    'left': 'split-left',
    'right': 'split-right',
    'center': 'centered',
    'intro': 'intro',
    'quote': 'quote',
    // Also handle if long keys are passed (backward compatibility)
    'split-left': 'split-left',
    'split-right': 'split-right',
    'centered': 'centered',
    'full-image': 'full-image'
  }
  return layoutMap[shortLayout] || shortLayout
}

/**
 * Transform AI's short-key format to internal long-key format.
 * Supports both new short keys (i, t, c, v, d, l, n) and old long keys (backward compatible).
 * 
 * Short Keys:
 * - i: slide_number
 * - t: title
 * - c: content
 * - v: visual_needs_image
 * - d: visual_description
 * - l: layout_suggestion
 * - n: speaker_notes
 */
function mapShortKeysToLongKeys(obj: any): Slide {
  // If object already has long keys, return as-is (backward compatibility)
  if (obj.slide_number !== undefined || obj.title !== undefined) {
    return obj as Slide
  }

  // Map short keys to long keys
  const mapped: any = {}

  // Required fields
  if (obj.i !== undefined) mapped.slide_number = obj.i
  if (obj.t !== undefined) mapped.title = obj.t
  if (obj.c !== undefined) mapped.content = obj.c
  if (obj.v !== undefined) mapped.visual_needs_image = obj.v

  // Optional fields
  if (obj.d !== undefined) mapped.visual_description = obj.d
  if (obj.l !== undefined) mapped.layout_suggestion = mapLayoutShortToLong(obj.l)
  if (obj.n !== undefined) mapped.speaker_notes = obj.n

  // Preserve any other fields (like _actionMarker, isEnhancing, estimated_duration)
  for (const key in obj) {
    if (!['i', 't', 'c', 'v', 'd', 'l', 'n'].includes(key)) {
      mapped[key] = obj[key]
    }
  }

  return mapped as Slide
}

/**
 * Transform short-key batch operation to long-key format.
 * 
 * Short format from Advanced prompt:
 * { type: "upd"|"del", i: number, data?: Partial<Slide with short keys> }
 * Example: { type: "upd", i: 5, data: { t: "New Title", c: "New content" } }
 * 
 * Long internal format:
 * { type: "update"|"delete", slide_number: number, title?: string, content?: string, ... }
 */
function mapBatchOperationShortToLong(op: any): BatchOperation {
  // If already in long format, return as-is
  if (op.slide_number !== undefined) {
    return op as BatchOperation
  }

  const mapped: any = {
    type: op.type === 'upd' ? 'update' : op.type === 'del' ? 'delete' : op.type,
    slide_number: op.i
  }

  // Map short keys in nested data object (Partial<Slide>)
  // The data object uses the same short keys as Slide: i, t, c, v, d, l, n
  if (op.data) {
    // Note: 'i' in data is not used as we already have slide_number from op.i
    if (op.data.t !== undefined) mapped.title = op.data.t
    if (op.data.c !== undefined) mapped.content = op.data.c
    if (op.data.v !== undefined) mapped.visual_needs_image = op.data.v
    if (op.data.d !== undefined) mapped.visual_description = op.data.d
    if (op.data.l !== undefined) mapped.layout_suggestion = mapLayoutShortToLong(op.data.l)
    if (op.data.n !== undefined) mapped.speaker_notes = op.data.n
  }

  return mapped as BatchOperation
}

/**
 * Attempt to parse a partial JSON response following the Delta Protocol.
 * Supports both NDJSON short-key format and legacy long-key format.
 * 
 * NDJSON format (line-by-line):
 * Line 1: Header - { a: "create"|"append"|"update"|"del"|"ask"|"chat"|"info"|"batch", ... }
 * Line 2+: Data - { i: 1, t: "...", c: "...", v: true, d: "...", l: "intro", n: "..." }
 * 
 * Legacy format (single object):
 * { "action": "...", "slides": [ ... ] }
 */
export function parsePartialResponse(text: string): DeltaResponse {
  let trimmed = text.trim()
  if (!trimmed) return { slides: [] }

  // 🛡️ SAFETY: Strip markdown code blocks if AI wrapped the JSON
  // Remove ```json at start and ``` at end (common LLM behavior)
  trimmed = trimmed.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/```\s*$/, '')
  trimmed = trimmed.trim()

  // 🆕 NDJSON Support: Parse line-by-line format
  // Check if this is NDJSON (multiple lines with separate JSON objects)
  const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean)
  
  if (lines.length > 0) {
    try {
      const firstLine = JSON.parse(lines[0])
      
      // Check if first line is a header (has 'a' field for action or 'action' field)
      const shortAction = firstLine.a // Short key: a
      const longAction = firstLine.action // Long key: action
      
      if (shortAction || longAction) {
        const result: DeltaResponse = { slides: [] }
        
        // Map short action keys to long action keys
        const actionMap: Record<string, string> = {
          'create': 'create',
          'append': 'append',
          'update': 'update',
          'del': 'delete',
          'ask': 'ask',
          'chat': 'response',
          'info': 'info',
          'batch': 'batch'
        }
        
        const action = shortAction ? actionMap[shortAction] || shortAction : longAction
        result.action = action as any
        
        // Handle specific action fields
        if (action === 'ask') {
          // Short: { a: "ask", q: string, o: string[], cust: boolean }
          // Long: { action: "ask", question: string, options: string[], allow_custom_input: boolean }
          result.question = firstLine.q || firstLine.question
          result.options = firstLine.o || firstLine.options
          result.allowCustom = firstLine.cust !== undefined ? firstLine.cust : firstLine.allow_custom_input
        } else if (action === 'response') {
          // Short: { a: "chat", c: string }
          // Long: { action: "response", content: string }
          result.content = firstLine.c || firstLine.content
        } else if (action === 'delete') {
          // Short: { a: "del", ids: number[] }
          // Long: { action: "delete", slide_numbers: number[] }
          result.slide_numbers = firstLine.ids || firstLine.slide_numbers
        } else if (action === 'info') {
          // Short: { a: "info", ids: number[] }
          // Long: { action: "info", slide_numbers: number[] }
          result.slide_numbers = firstLine.ids || firstLine.slide_numbers
        } else if (action === 'batch') {
          // Short: { a: "batch", ops: BatchOp[] }
          // Long: { action: "batch", operations: BatchOperation[] }
          const ops = firstLine.ops || firstLine.operations || []
          result.operations = ops.map(mapBatchOperationShortToLong)
        }
        
        // Parse remaining lines as slide data
        if (lines.length > 1) {
          const slideLines = lines.slice(1)
          const slides: Slide[] = []
          
          for (const line of slideLines) {
            try {
              const slideObj = JSON.parse(line)
              // Transform short keys to long keys
              slides.push(mapShortKeysToLongKeys(slideObj))
            } catch {
              // Skip malformed lines
            }
          }
          
          result.slides = slides
        }
        
        return result
      }
    } catch {
      // Not valid NDJSON, fall through to legacy parsing
    }
  }

  // Legacy format parsing (single object with action and slides array)
  // Strategy: Try to find "action" and "slides" even in partial JSON

  // 1. Try full parse first
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && (Array.isArray(parsed.slides) || parsed.action === 'ask' || parsed.action === 'response' || parsed.action === 'batch')) {
      const response: DeltaResponse = {
        action: parsed.action,
        slides: (parsed.slides || []).map(mapShortKeysToLongKeys),
        question: parsed.question,
        options: parsed.options,
        allowCustom: parsed.allow_custom_input,
        content: parsed.content,
        slide_numbers: parsed.slide_numbers,
        operations: parsed.operations ? parsed.operations.map(mapBatchOperationShortToLong) : undefined
      }

      return response
    }
  } catch {
    // Partial parse
  }

  const result: DeltaResponse = { slides: [] }

  // 2. Extract Action (Regex) - support both short and long keys
  const actionMatchShort = /"a"\s*:\s*"([^"]+)"/.exec(trimmed)
  const actionMatchLong = /"action"\s*:\s*"([^"]+)"/.exec(trimmed)
  
  if (actionMatchShort || actionMatchLong) {
    const actionValue = actionMatchShort ? actionMatchShort[1] : actionMatchLong ? actionMatchLong[1] : undefined
    if (actionValue) {
      const actionMap: Record<string, string> = {
        'create': 'create',
        'append': 'append',
        'update': 'update',
        'del': 'delete',
        'ask': 'ask',
        'chat': 'response',
        'info': 'info',
        'batch': 'batch'
      }
      result.action = (actionMap[actionValue] || actionValue) as any
    }
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
 * Parse slide array from streaming JSON.
 * Supports both short-key format (i, t, c, v, d, l, n) and long-key format (backward compatible).
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

  // Fix trailing comma if any: "[{...}, ]" -> "[{...}]"
  repaired = repaired.replace(/,\s*\]$/, ']')

  try {
    const parsed = JSON.parse(repaired)
    if (Array.isArray(parsed)) {
      // Transform all slides from short keys to long keys
      return parsed.map(mapShortKeysToLongKeys)
    }
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
        // Check for both short keys (i, t) and long keys (slide_number, title)
        if (obj.i !== undefined || obj.slide_number !== undefined || obj.t !== undefined || obj.title !== undefined) {
          objects.push(mapShortKeysToLongKeys(obj))
        }
      } catch { }
    }
    return objects
  }

  return []
}
