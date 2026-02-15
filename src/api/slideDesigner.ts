import type { Slide } from './prompt'
import {
  SLIDE_DESIGNER_SYSTEM_PROMPT,
  type NDJSONConfig,
  type NDJSONDesignResult,
  type NDJSONError,
  type NDJSONImagePlaceholder,
  type NDJSONLine,
  type NDJSONShape,
  type NDJSONText,
} from './slideDesignerPrompt'
import { streamGenerate } from './generate'
import type { ApiType } from './utils'

const DESIGN_TEMPERATURE = 0.2

const Z_INDEX_ORDER: Record<string, number> = {
  shape: 1,
  'image-placeholder': 2,
  text: 3,
}

/**
 * Sort elements by Z-order so shapes render first, then images, then text (always on top).
 */
export function enforceZIndex(
  elements: Array<NDJSONShape | NDJSONText | NDJSONImagePlaceholder>
): Array<NDJSONShape | NDJSONText | NDJSONImagePlaceholder> {
  return [...elements].sort((a, b) => {
    const scoreA = Z_INDEX_ORDER[a.type] ?? 99
    const scoreB = Z_INDEX_ORDER[b.type] ?? 99
    return scoreA - scoreB
  })
}

export interface ColorPalette {
  primary: string
  secondary: string
  accent: string
}

/**
 * Suggest layout based on content analysis to guide AI.
 */
function suggestLayoutForSlide(slide: Slide): string {
  const contentLength = slide.content.length
  const hasImage = !!slide.visual_description
  const listItemCount = (slide.content.match(/^-/gm) || []).length

  if (listItemCount >= 3) return 'grid_cards'
  if (hasImage && contentLength > 200) return 'split_left'
  if (hasImage && contentLength <= 200) return 'split_right'
  if (contentLength > 300) return 'hero_center'

  return 'hero_center'
}

/**
 * Build the user prompt for a single slide design request.
 */
function buildDesignUserPrompt(slide: Slide, brandColors: ColorPalette): string {
  const suggestedLayout = suggestLayoutForSlide(slide)

  return `
DESIGN THIS SLIDE:
- Title: "${slide.title}"
- Content Length: ${slide.content.length} chars
- RECOMMENDED LAYOUT: "${suggestedLayout}" (use this unless content requires different)
- Content: "${slide.content}"
- Visual Need: ${slide.visual_description || 'None'}
- Brand Colors: Primary=${brandColors.primary}, Secondary=${brandColors.secondary}, Accent=${brandColors.accent}

IMPORTANT: Ensure Text and Images DO NOT OVERLAP. Follow the coordinate templates strictly.
Return NDJSON only: one valid JSON object per line. First line = config, then shapes, image-placeholder, text (text last). No markdown. Start with {.`
}

/**
 * Parse NDJSON response: each line is a standalone JSON object.
 * Skips invalid lines. Detects safety error (type "error") and returns it in result.
 */
export function parseNDJSON(responseString: string): NDJSONLine[] {
  return responseString
    .trim()
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('{')) return null
      try {
        return JSON.parse(trimmed) as NDJSONLine
      } catch {
        return null
      }
    })
    .filter((item): item is NDJSONLine => item !== null)
}

/**
 * Convert parsed NDJSON lines into config + elements and check for Safety Guardrails error.
 */
export function interpretNDJSONDesign(lines: NDJSONLine[]): NDJSONDesignResult {
  const errorItem = lines.find((item): item is NDJSONError => item.type === 'error')
  if (errorItem) {
    return {
      config: null,
      elements: [],
      safetyError: errorItem.message || 'Content violates safety guidelines.',
    }
  }

  const config = (lines.find((item) => item.type === 'config') as NDJSONConfig | undefined) ?? null
  const rawElements = lines.filter(
    (item): item is NDJSONShape | NDJSONText | NDJSONImagePlaceholder =>
      item.type === 'shape' || item.type === 'text' || item.type === 'image-placeholder'
  )
  const elements = enforceZIndex(rawElements)

  return { config, elements, safetyError: null }
}

/**
 * Validate AI design before rendering. Returns false if dimensions are invalid or out of bounds.
 */
export function validateDesign(result: NDJSONDesignResult): boolean {
  if (!Array.isArray(result.elements)) return false

  for (const el of result.elements) {
    const opts = el.options
    if (!opts || typeof opts !== 'object') return false

    const w = opts.w
    const h = opts.h
    const x = opts.x
    const y = opts.y

    if (typeof w !== 'number' || typeof h !== 'number') return false

    const isLine = el.type === 'shape' && (el as NDJSONShape).shapeType === 'line'
    if (isLine) {
      if (w <= 0 && h <= 0) return false
    } else {
      if (w <= 0 || h <= 0) return false
    }

    if (typeof x === 'number' && (x < -1 || x > 11)) return false
    if (typeof y === 'number' && (y < -1 || y > 7)) return false
  }

  return true
}

/**
 * Call AI to generate a slide design (NDJSON stream). Parses response and returns config + elements.
 * Throws if Safety Guardrails refuse (type "error" in stream) or if abortSignal is aborted.
 */
export function generateSlideDesign(
  slide: Slide,
  brandColors: ColorPalette,
  apiUrl: string,
  apiKey: string,
  model: string,
  apiType: ApiType,
  abortSignal?: AbortSignal
): Promise<NDJSONDesignResult> {
  const userPrompt = buildDesignUserPrompt(slide, brandColors)

  return new Promise((resolve, reject) => {
    streamGenerate(
      apiUrl,
      apiKey,
      userPrompt,
      model,
      apiType,
      {
        onToken: () => {},
        onThinking: () => {},
        onResponseUpdate: () => {},
        onDone: (fullText) => {
          try {
            const lines = parseNDJSON(fullText)
            const result = interpretNDJSONDesign(lines)
            if (result.safetyError) {
              reject(new Error(result.safetyError))
              return
            }
            resolve(result)
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)))
          }
        },
        onError: (message) => reject(new Error(message)),
      },
      [],
      SLIDE_DESIGNER_SYSTEM_PROMPT,
      DESIGN_TEMPERATURE,
      abortSignal
    )
  })
}
