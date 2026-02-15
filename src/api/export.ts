import PptxGenJS from 'pptxgenjs'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Slide } from './prompt'
import type {
  NDJSONDesignResult,
  NDJSONImagePlaceholder,
  NDJSONShape,
  NDJSONText,
} from './slideDesignerPrompt'
import { generateSlideDesign, validateDesign } from './slideDesigner'
import { useSettingsStore } from '../store/useSettingsStore'

// ============================================================================
// Layout Engine Types & Config
// ============================================================================

type LayoutType = 'intro' | 'left' | 'right' | 'center' | 'quote' | 'timeline' | 'grid' | 'bignumber'

const FONT_STACK = 'Montserrat, Segoe UI, Arial'

interface ColorPalette {
  primary: string
  secondary: string
  accent: string
}

interface TextConfig {
  x: number
  y: number
  w: number
  h: number
  fontSize: number
  align?: 'left' | 'center' | 'right'
  bold?: boolean
  italic?: boolean
  bullet?: boolean
}

interface LayoutConfig {
  title: TextConfig
  content: TextConfig
  visual?: { x: number; y: number; w: number; h: number }
}

const LAYOUT_CONFIGS: Record<LayoutType, LayoutConfig> = {
  intro: {
    title: { x: 1, y: 2, w: 8, h: 1.5, fontSize: 54, align: 'center', bold: true },
    content: { x: 1, y: 4, w: 8, h: 1, fontSize: 18, align: 'center' },
  },
  left: {
    title: { x: 0.6, y: 0.5, w: 5, h: 1, fontSize: 32, bold: true },
    content: { x: 0.6, y: 1.6, w: 5, h: 3.8, fontSize: 14, bullet: true },
    visual: { x: 6.2, y: 0.6, w: 3.5, h: 4.5 },
  },
  right: {
    title: { x: 4.4, y: 0.5, w: 5, h: 1, fontSize: 32, bold: true, align: 'right' },
    content: { x: 4.4, y: 1.6, w: 5, h: 3.8, fontSize: 14, bullet: true, align: 'right' },
    visual: { x: 0.3, y: 0.6, w: 3.5, h: 4.5 },
  },
  center: {
    title: { x: 1, y: 0.5, w: 8, h: 1, fontSize: 36, align: 'center', bold: true },
    content: { x: 1.5, y: 2, w: 7, h: 3.5, fontSize: 16, align: 'center' },
  },
  quote: {
    title: { x: 1, y: 1.5, w: 8, h: 2, fontSize: 36, align: 'center', italic: true },
    content: { x: 1, y: 3.8, w: 8, h: 0.8, fontSize: 14, align: 'right' },
  },
  timeline: {
    title: { x: 1, y: 0.5, w: 8, h: 0.8, fontSize: 32, align: 'center', bold: true },
    content: { x: 0, y: 0, w: 0, h: 0, fontSize: 0 },
  },
  grid: {
    title: { x: 1, y: 0.5, w: 8, h: 0.8, fontSize: 36, align: 'center', bold: true },
    content: { x: 1.5, y: 2, w: 7, h: 3.5, fontSize: 16, align: 'center' },
  },
  bignumber: {
    title: { x: 1, y: 1.5, w: 8, h: 1.5, fontSize: 80, align: 'center', bold: true },
    content: { x: 1, y: 3.5, w: 8, h: 1, fontSize: 20, align: 'center' },
  },
}

// ============================================================================
// Helpers
// ============================================================================

/** Map layout_suggestion from Slide interface to LayoutType (base; timeline/grid/bignumber applied via auto-detect). */
function mapLayout(suggestion: Slide['layout_suggestion']): LayoutType {
  const map: Record<string, LayoutType> = {
    intro: 'intro',
    'split-left': 'left',
    'split-right': 'right',
    centered: 'center',
    'full-image': 'center',
    quote: 'quote',
    timeline: 'timeline',
    grid: 'grid',
    'big-number': 'bignumber',
  }
  return map[suggestion] ?? 'center'
}

/** Resolve effective layout with content-based overrides (timeline, grid, bignumber). */
function resolveLayout(slide: Slide, base: LayoutType): LayoutType {
  const timelineEvents = parseTimelineEvents(slide.content)
  if (timelineEvents.length >= 2) return 'timeline'

  if (base === 'center') {
    const items = parseListItems(slide.content)
    if (items.length >= 3 && items.every((i) => i.title || i.description.length > 10)) return 'grid'
  }

  const content = parseMarkdownContent(slide.content)
  const hasBigNumber = /[\d.,]+\s*[a-zA-Z\u00E0-\u1EF9\u1E00-\u1EFF]/.test(content) && content.length < 150
  if (hasBigNumber && (base === 'center' || base === 'intro')) return 'bignumber'

  return base
}

/** Strip markdown **bold** and convert - lists to plain text for PptxGenJS */
function parseMarkdownContent(text: string): string {
  return text.replace(/\*\*(.*?)\*\*/g, '$1').trim()
}

/** Draw professional image placeholder box (dashed border, icon, label). Caller appends description to notes. */
function renderImagePlaceholder(
  pptSlide: PptxGenJS.Slide,
  pptx: PptxGenJS,
  x: number,
  y: number,
  w: number,
  h: number,
  _description: string
): void {
  pptSlide.addShape(pptx.ShapeType.rect, {
    x,
    y,
    w,
    h,
    fill: { color: 'F1F1F1' },
    line: { color: 'D9D9D9', width: 1, dashType: 'dash' },
  })
  pptSlide.addShape(pptx.ShapeType.ellipse, {
    x: x + w / 2 - 0.4,
    y: y + h / 2 - 0.4,
    w: 0.8,
    h: 0.8,
    fill: { color: 'E1E1E1' },
  })
  pptSlide.addText('\u{1F4F8}', {
    x: x + w / 2 - 0.4,
    y: y + h / 2 - 0.25,
    w: 0.8,
    h: 0.5,
    fontSize: 28,
    align: 'center',
    color: 'AAAAAA',
    fontFace: FONT_STACK,
  })
  pptSlide.addText('IMAGE PLACEHOLDER', {
    x,
    y: y + h / 2 + 0.5,
    w,
    h: 0.4,
    fontSize: 9,
    align: 'center',
    color: '999999',
    bold: true,
    fontFace: FONT_STACK,
  })
}

interface ListItem {
  title: string
  description: string
}

/** Parse markdown list lines into title/description items (e.g. "- **Title**: Description"). */
function parseListItems(content: string): ListItem[] {
  return content
    .split('\n')
    .filter((line) => line.trim().startsWith('-'))
    .map((line) => {
      const cleanLine = line.replace(/^-\s*/, '')
      const match = cleanLine.match(/\*\*(.+?)\*\*:\s*(.+)|(.+?):\s*(.+)/)
      if (match) {
        return {
          title: (match[1] || match[3] || '').trim(),
          description: (match[2] || match[4] || '').trim(),
        }
      }
      return { title: '', description: cleanLine.trim() }
    })
}

/** Render 2x2 (or more) grid of cards from list items. */
function renderGridLayout(
  pptSlide: PptxGenJS.Slide,
  pptx: PptxGenJS,
  items: ListItem[],
  colors: ColorPalette,
  startY: number = 1.8
): void {
  const CARD_W = 4.5
  const CARD_H = 2.0
  const GAP = 0.5
  const START_X = 0.5

  items.forEach((item, idx) => {
    const col = idx % 2
    const row = Math.floor(idx / 2)
    const x = START_X + col * (CARD_W + GAP)
    const y = startY + row * (CARD_H + GAP)

    pptSlide.addShape(pptx.ShapeType.roundRect, {
      x,
      y,
      w: CARD_W,
      h: CARD_H,
      fill: { color: 'FFFFFF' },
      line: { color: 'E5E5E5', width: 1 },
      rectRadius: 0.1,
      shadow: { type: 'outer', blur: 3, offset: 2, angle: 90, opacity: 0.15, color: '000000' },
    })
    if (item.title) {
      pptSlide.addText(item.title, {
        x: x + 0.2,
        y: y + 0.2,
        w: CARD_W - 0.4,
        h: 0.5,
        fontSize: 15,
        bold: true,
        color: colors.primary,
        fontFace: FONT_STACK,
      })
    }
    pptSlide.addText(item.description, {
      x: x + 0.2,
      y: y + 0.75,
      w: CARD_W - 0.4,
      h: CARD_H - 0.95,
      fontSize: 11,
      color: '555555',
      fontFace: FONT_STACK,
      valign: 'top',
    })
  })
}

interface TimelineEvent {
  year: string
  description: string
}

/** Parse content for timeline events (e.g. "- **1886**: Description" or "- 1886: Description"). */
function parseTimelineEvents(content: string): TimelineEvent[] {
  return content
    .split('\n')
    .filter((line) => line.trim().startsWith('-'))
    .map((line) => {
      const cleanLine = line.replace(/^-\s*/, '')
      const match = cleanLine.match(/\*\*(\d{4}s?|\d{4})\*\*:\s*(.+)|(\d{4}s?|\d{4}):\s*(.+)/)
      if (match) {
        return {
          year: (match[1] || match[3] || '').trim(),
          description: (match[2] || match[4] || '').trim(),
        }
      }
      return null
    })
    .filter((evt): evt is TimelineEvent => evt != null)
}

/** Render timeline with horizontal line, nodes, year labels and descriptions. */
function renderTimelineLayout(
  pptSlide: PptxGenJS.Slide,
  pptx: PptxGenJS,
  events: TimelineEvent[],
  colors: ColorPalette
): void {
  const LINE_Y = 3
  const LINE_X_START = 1.5
  const LINE_WIDTH = 7
  const NODE_SIZE = 0.3

  pptSlide.addShape(pptx.ShapeType.line, {
    x: LINE_X_START,
    y: LINE_Y,
    w: LINE_WIDTH,
    h: 0,
    line: { color: colors.primary, width: 3 },
  })

  events.forEach((evt, idx) => {
    const step = events.length > 1 ? LINE_WIDTH / (events.length - 1) : 0
    const xPos = LINE_X_START + idx * step

    pptSlide.addShape(pptx.ShapeType.ellipse, {
      x: xPos - NODE_SIZE / 2,
      y: LINE_Y - NODE_SIZE / 2,
      w: NODE_SIZE,
      h: NODE_SIZE,
      fill: { color: 'FFFFFF' },
      line: { color: colors.primary, width: 3 },
    })
    pptSlide.addText(evt.year, {
      x: xPos - 0.6,
      y: LINE_Y - 0.8,
      w: 1.2,
      h: 0.4,
      fontSize: 14,
      bold: true,
      color: colors.primary,
      align: 'center',
      fontFace: FONT_STACK,
    })
    const descY = idx % 2 === 0 ? LINE_Y + 0.4 : LINE_Y + 1.2
    pptSlide.addText(evt.description, {
      x: xPos - 0.8,
      y: descY,
      w: 1.6,
      h: 1.2,
      fontSize: 10,
      color: '555555',
      align: 'center',
      fontFace: FONT_STACK,
      valign: 'top',
    })
  })
}

/** Render big-number slide: full brand background, giant number, context text. */
function renderBigNumberLayout(
  pptSlide: PptxGenJS.Slide,
  slide: Slide,
  colors: ColorPalette
): void {
  pptSlide.background = { color: colors.primary }
  const content = parseMarkdownContent(slide.content)
  const numberMatch = content.match(/[\d.,]+\s*[a-zA-Z\u00E0-\u1EF9\u1E00-\u1EFF]*/)
  const bigNumber = numberMatch ? numberMatch[0].trim() : content.slice(0, 30)
  const restText = (numberMatch ? content.replace(numberMatch[0], '').trim() : '').replace(/^[\s\-:]+/, '')

  pptSlide.addText(bigNumber, {
    x: 1,
    y: 1.5,
    w: 8,
    h: 1.8,
    fontSize: 80,
    bold: true,
    color: colors.secondary,
    align: 'center',
    fontFace: FONT_STACK,
  })
  if (restText) {
    pptSlide.addText(restText, {
      x: 1,
      y: 3.5,
      w: 8,
      h: 1,
      fontSize: 20,
      color: colors.secondary,
      align: 'center',
      fontFace: FONT_STACK,
    })
  }
}

/** Extract brand colors from slide content (rule-based detection). */
function extractBrandColors(slides: Slide[]): ColorPalette {
  const allText = slides
    .map((s) => s.title + ' ' + s.content)
    .join(' ')
    .toLowerCase()

  const rules: { keywords: string[]; palette: ColorPalette }[] = [
    { keywords: ['coca', 'cola', 'red', 'tet', 'sale'], palette: { primary: 'E60012', secondary: 'F9F9F9', accent: '000000' } },
    { keywords: ['bank', 'trust', 'finance', 'investment'], palette: { primary: '1E3A5F', secondary: 'E8EEF4', accent: '2E7D32' } },
    { keywords: ['tech', 'ai', 'software', 'digital'], palette: { primary: '0066CC', secondary: 'F0F4F8', accent: '1A1A1A' } },
    { keywords: ['eco', 'green', 'food', 'organic'], palette: { primary: '2E7D32', secondary: 'E8F5E9', accent: '1B5E20' } },
    { keywords: ['health', 'medical', 'wellness'], palette: { primary: '0277BD', secondary: 'E3F2FD', accent: '004D40' } },
  ]
  for (const rule of rules) {
    if (rule.keywords.some((kw) => allText.includes(kw))) return rule.palette
  }
  return { primary: '2C2C2C', secondary: 'F9F9F9', accent: '666666' }
}

/** Render a single slide by layout type */
function renderSlideByLayout(
  pptSlide: PptxGenJS.Slide,
  slide: Slide,
  layout: LayoutType,
  colors: ColorPalette,
  pptx: PptxGenJS
): void {
  const config = LAYOUT_CONFIGS[layout]
  const slideH = 5.625
  let notesToAdd = slide.speaker_notes ?? ''

  // --- Big Number: full layout handled by helper ---
  if (layout === 'bignumber') {
    renderBigNumberLayout(pptSlide, slide, colors)
    if (slide.visual_description) notesToAdd += `\n\n[VISUAL PROMPT]: ${slide.visual_description}`
    pptSlide.addNotes(notesToAdd)
    addFooter(pptSlide, slide, slideH)
    return
  }

  // --- Timeline: title + timeline only ---
  if (layout === 'timeline') {
    pptSlide.background = { color: colors.secondary }
    pptSlide.addText(slide.title, {
      x: config.title.x,
      y: config.title.y,
      w: config.title.w,
      h: config.title.h,
      fontSize: config.title.fontSize,
      bold: true,
      color: colors.primary,
      fontFace: FONT_STACK,
      align: 'center',
    })
    const events = parseTimelineEvents(slide.content)
    renderTimelineLayout(pptSlide, pptx, events, colors)
    pptSlide.addNotes(notesToAdd)
    addFooter(pptSlide, slide, slideH)
    return
  }

  // --- Grid: title + grid only ---
  if (layout === 'grid') {
    pptSlide.background = { color: colors.secondary }
    pptSlide.addText(slide.title, {
      x: config.title.x,
      y: config.title.y,
      w: config.title.w,
      h: config.title.h,
      fontSize: config.title.fontSize,
      bold: true,
      color: colors.primary,
      fontFace: FONT_STACK,
      align: 'center',
    })
    const items = parseListItems(slide.content)
    renderGridLayout(pptSlide, pptx, items, colors, 1.8)
    pptSlide.addNotes(notesToAdd)
    addFooter(pptSlide, slide, slideH)
    return
  }

  // --- Standard layouts: intro, left, right, center, quote ---
  if (layout === 'intro') {
    pptSlide.background = { color: colors.primary }
    pptSlide.addShape(pptx.ShapeType.rect, {
      x: 1,
      y: 1.5,
      w: 1.5,
      h: 0.05,
      fill: { color: colors.secondary },
    })
  } else {
    pptSlide.background = { color: colors.secondary }
  }

  const titleColor = layout === 'intro' ? colors.secondary : colors.primary
  pptSlide.addText(layout === 'quote' ? slide.title : slide.title.toUpperCase(), {
    x: config.title.x,
    y: config.title.y,
    w: config.title.w,
    h: config.title.h,
    fontSize: config.title.fontSize,
    bold: config.title.bold ?? false,
    italic: config.title.italic ?? false,
    color: titleColor,
    fontFace: FONT_STACK,
    align: config.title.align ?? 'left',
  })

  const contentText = parseMarkdownContent(slide.content)
  const contentColor = layout === 'intro' ? 'FFCCCC' : '333333'
  const contentOpts: PptxGenJS.TextPropsOptions = {
    x: config.content.x,
    y: config.content.y,
    w: config.content.w,
    h: config.content.h,
    fontSize: config.content.fontSize,
    color: contentColor,
    fontFace: FONT_STACK,
    align: config.content.align ?? 'left',
    valign: 'top',
    lineSpacingMultiple: 1.3,
  }
  if (config.content.bullet) {
    contentOpts.bullet = { characterCode: '2022' }
  }

  // Center: smart grid vs plain text
  if (layout === 'center') {
    const items = parseListItems(slide.content)
    if (items.length >= 3 && items.every((i) => i.title || i.description.length > 10)) {
      renderGridLayout(pptSlide, pptx, items, colors, 1.8)
    } else {
      pptSlide.addText(contentText, contentOpts)
      if (slide.visual_needs_image && slide.visual_description) {
        renderImagePlaceholder(pptSlide, pptx, 3, 3.5, 4, 2, slide.visual_description)
        notesToAdd += `\n\n[VISUAL PROMPT]: ${slide.visual_description}`
      }
    }
    pptSlide.addShape(pptx.ShapeType.line, {
      x: 4,
      y: 1.5,
      w: 2,
      h: 0,
      line: { color: colors.primary, width: 2 },
    })
  } else {
    pptSlide.addText(contentText, contentOpts)
    // Visual area: placeholder instead of description text (left/right)
    if (config.visual && (slide.visual_needs_image || slide.visual_description)) {
      const v = config.visual
      renderImagePlaceholder(pptSlide, pptx, v.x, v.y, v.w, v.h, slide.visual_description ?? '')
      notesToAdd += `\n\n[VISUAL PROMPT]: ${slide.visual_description ?? ''}`
    }
  }

  pptSlide.addNotes(notesToAdd)
  addFooter(pptSlide, slide, slideH)
}

function addFooter(
  pptSlide: PptxGenJS.Slide,
  slide: Slide,
  slideH: number
): void {
  pptSlide.addText(`${slide.slide_number}`, {
    x: 0.5,
    y: slideH - 0.5,
    w: 0.5,
    h: 0.4,
    fontSize: 10,
    color: 'AAAAAA',
    fontFace: FONT_STACK,
  })
  if (slide.estimated_duration) {
    pptSlide.addText(slide.estimated_duration, {
      x: 9,
      y: slideH - 0.5,
      w: 1,
      h: 0.4,
      fontSize: 10,
      color: 'AAAAAA',
      fontFace: FONT_STACK,
      align: 'right',
    })
  }
}

const SLIDE_H = 5.625
const MAX_W = 10.0
const MAX_H = 5.625
const SAFE_MARGIN = 0.2

type DesignElement = NDJSONShape | NDJSONText | NDJSONImagePlaceholder

/** Clamp element coordinates to stay within canvas bounds. */
function clampCoordinates<T extends DesignElement>(element: T): T {
  const opts = element.options as { x: number; y: number; w: number; h: number; [k: string]: unknown }

  let x = Math.max(SAFE_MARGIN, Number(opts.x) || SAFE_MARGIN)
  let y = Math.max(SAFE_MARGIN, Number(opts.y) || SAFE_MARGIN)
  let w = Math.max(0.1, Number(opts.w) || 1)
  let h = Math.max(0.1, Number(opts.h) || 1)

  if (x + w > MAX_W - SAFE_MARGIN) {
    w = MAX_W - SAFE_MARGIN - x
  }
  if (y + h > MAX_H - SAFE_MARGIN) {
    h = MAX_H - SAFE_MARGIN - y
  }

  return {
    ...element,
    options: { ...opts, x, y, w, h },
  } as T
}

/** Calculate safe font size based on text length and box dimensions to prevent overflow. */
function calculateSafeFontSize(
  textLength: number,
  boxWidth: number,
  boxHeight: number,
  suggestedSize: number
): number {
  const capacity = (boxWidth * boxHeight) * 8

  if (textLength > capacity * 2) return Math.max(10, Math.min(suggestedSize, 12))
  if (textLength > capacity * 1.5) return Math.max(12, Math.min(suggestedSize, 14))
  if (textLength > capacity) return Math.min(suggestedSize, 16)

  return suggestedSize
}

/** Render one slide from NDJSON design result (config + elements in Z-order). */
function renderDesignedSlide(
  pptSlide: PptxGenJS.Slide,
  design: NDJSONDesignResult,
  originalSlide: Slide,
  pptx: PptxGenJS
): void {
  const bgColor = design.config?.background?.color
  if (typeof bgColor === 'string' && bgColor) {
    pptSlide.background = { color: bgColor }
  }

  for (const el of design.elements) {
    const clamped = clampCoordinates(el)

    if (clamped.type === 'shape') {
      const shapeEnum =
        clamped.shapeType === 'line'
          ? pptx.ShapeType.line
          : clamped.shapeType === 'ellipse'
            ? pptx.ShapeType.ellipse
            : pptx.ShapeType.rect
      pptSlide.addShape(shapeEnum, clamped.options as PptxGenJS.ShapeProps)
    } else if (clamped.type === 'text') {
      const suggestedSize = clamped.options.fontSize ?? 18
      const safeSize = calculateSafeFontSize(
        (clamped.text ?? '').length,
        clamped.options.w,
        clamped.options.h,
        suggestedSize
      )
      const textOpts = {
        ...clamped.options,
        fontSize: safeSize,
        fontFace: clamped.options.fontFace || FONT_STACK,
        shrinkText: true,
        wrap: true,
      }
      pptSlide.addText(clamped.text ?? '', textOpts as PptxGenJS.TextPropsOptions)
    } else if (clamped.type === 'image-placeholder') {
      const { x, y, w, h } = clamped.options
      const altText = clamped.altText ?? originalSlide.visual_description ?? ''
      renderImagePlaceholder(pptSlide, pptx, x, y, w, h, altText)
    }
  }

  let notesToAdd = originalSlide.speaker_notes ?? ''
  if (originalSlide.visual_description) {
    notesToAdd += `\n\n[VISUAL PROMPT]: ${originalSlide.visual_description}`
  }
  pptSlide.addNotes(notesToAdd)
  addFooter(pptSlide, originalSlide, SLIDE_H)
}

/** Fallback: simple layout when AI design fails. */
function renderFallbackSlide(pptSlide: PptxGenJS.Slide, slide: Slide): void {
  pptSlide.background = { color: 'FFFFFF' }
  pptSlide.addText(slide.title, { x: 1, y: 1, w: 8, h: 0.8, fontSize: 24, bold: true, fontFace: FONT_STACK })
  pptSlide.addText(parseMarkdownContent(slide.content), {
    x: 1,
    y: 2,
    w: 8,
    h: 3,
    fontSize: 14,
    fontFace: FONT_STACK,
    valign: 'top',
  })
  pptSlide.addNotes(slide.speaker_notes ?? '')
  addFooter(pptSlide, slide, SLIDE_H)
}

/** Error message thrown when export is cancelled by user (abort signal). */
export const EXPORT_CANCELLED_MESSAGE = 'Export cancelled'

/** Optional i18n: (key, opts) => translated string for progress status. */
export type ExportTranslateFn = (key: string, opts?: Record<string, string | number>) => string

/**
 * Generate a PowerPoint (.pptx) file using AI-designed layouts per slide.
 * @param onProgress - Callback (current, total, status) for progress UI.
 * @param abortSignal - When aborted, stops the loop and cancels the current AI request; throws with EXPORT_CANCELLED_MESSAGE.
 * @param t - Optional i18n function for status messages (workspace.exportDesigningSlide, workspace.exportSaving).
 */
export async function generatePPTX_AI(
  slides: Slide[],
  filename = 'presentation',
  onProgress?: (current: number, total: number, status: string) => void,
  abortSignal?: AbortSignal,
  t?: ExportTranslateFn
): Promise<void> {
  if (slides.length === 0) {
    throw new Error('No slides to export')
  }

  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_16x9'
  pptx.author = 'Vibriona'
  pptx.title = filename
  pptx.company = 'Vibriona'

  const colors = extractBrandColors(slides)
  const brandColors = { primary: colors.primary, secondary: colors.secondary, accent: colors.accent }
  const settings = useSettingsStore.getState()
  const apiUrl = settings.getApiUrl()
  const apiKey = settings.getApiKey()
  const model = settings.getModel()
  const apiType = settings.getApiType()

  const total = slides.length

  for (let i = 0; i < total; i++) {
    if (abortSignal?.aborted) {
      throw new Error(EXPORT_CANCELLED_MESSAGE)
    }
    const slide = slides[i]
    if (onProgress) {
      const status = t
        ? t('workspace.exportDesigningSlide', { number: i + 1, title: slide.title })
        : `Designing slide ${i + 1}: ${slide.title}...`
      onProgress(i + 1, total, status)
    }

    try {
      const design = await generateSlideDesign(
        slide,
        brandColors,
        apiUrl,
        apiKey,
        model ?? '',
        apiType,
        abortSignal
      )
      if (abortSignal?.aborted) {
        throw new Error(EXPORT_CANCELLED_MESSAGE)
      }
      const pptSlide = pptx.addSlide()
      if (!validateDesign(design)) {
        console.warn(`AI design invalid for slide ${i + 1} -> using fallback layout`)
        renderFallbackSlide(pptSlide, slide)
      } else {
        renderDesignedSlide(pptSlide, design, slide, pptx)
      }
    } catch (err) {
      if (err instanceof Error && err.message === EXPORT_CANCELLED_MESSAGE) {
        throw err
      }
      console.error(`Failed to generate design for slide ${i + 1}`, err)
      const pptSlide = pptx.addSlide()
      renderFallbackSlide(pptSlide, slide)
    }
  }

  if (abortSignal?.aborted) {
    throw new Error(EXPORT_CANCELLED_MESSAGE)
  }
  if (onProgress) {
    const savingStatus = t ? t('workspace.exportSaving') : 'Saving file...'
    onProgress(total, total, savingStatus)
  }
  await pptx.writeFile({ fileName: `${filename}.pptx` })
}

/**
 * Generate a PowerPoint (.pptx) file from slides using the legacy layout engine (no AI).
 */
export async function generatePPTX_Legacy(slides: Slide[], filename = 'presentation'): Promise<void> {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_16x9'
  pptx.author = 'Vibriona'
  pptx.title = filename
  pptx.company = 'Vibriona'

  const colors = extractBrandColors(slides)

  for (const slide of slides) {
    const baseLayout = mapLayout(slide.layout_suggestion)
    const layout = resolveLayout(slide, baseLayout)
    const pptSlide = pptx.addSlide()
    renderSlideByLayout(pptSlide, slide, layout, colors, pptx)
  }

  await pptx.writeFile({ fileName: `${filename}.pptx` })
}

/**
 * Convert slides to Markdown text.
 */
export function slidesToMarkdown(slides: Slide[]): string {
  return slides
    .map((s) => {
      const lines = [
        `## Slide ${s.slide_number}: ${s.title}`,
        '',
        s.content,
        '',
      ]

      if (s.visual_needs_image && s.visual_description) {
        lines.push(`> **Visual:** ${s.visual_description}`)
        lines.push('')
      }

      if (s.speaker_notes) {
        lines.push(`> **Speaker notes:** ${s.speaker_notes}`)
        lines.push('')
      }

      const meta: string[] = []
      if (s.layout_suggestion) meta.push(`Layout: ${s.layout_suggestion}`)
      if (s.estimated_duration) meta.push(`Duration: ${s.estimated_duration}`)
      if (meta.length > 0) {
        lines.push(`*${meta.join(' | ')}*`)
        lines.push('')
      }

      lines.push('---')
      return lines.join('\n')
    })
    .join('\n\n')
}

/**
 * Download slides as a JSON file.
 */
export function downloadJSON(slides: Slide[], filename = 'presentation'): void {
  const json = JSON.stringify(slides, null, 2)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  downloadBlob(blob, `${filename}.json`)
}

/**
 * Copy Markdown to clipboard. Returns true on success.
 */
export async function copyMarkdown(slides: Slide[]): Promise<boolean> {
  const md = slidesToMarkdown(slides)
  try {
    await navigator.clipboard.writeText(md)
    return true
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea')
    textarea.value = md
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Generate a two-column script PDF (Visuals | Audio) and trigger download.
 */
export async function generatePDF(slides: Slide[], filename = 'presentation'): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  // Header
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(filename.replace(/_/g, ' '), 14, 18)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120, 120, 120)
  doc.text(`Generated by Vibriona — ${new Date().toLocaleDateString()}`, 14, 25)
  doc.setTextColor(0, 0, 0)

  // Table data
  const tableBody = slides.map((slide) => {
    // Left column: Visual
    const visualLines: string[] = [
      `SLIDE ${slide.slide_number}: ${slide.title}`,
    ]
    if (slide.layout_suggestion) {
      visualLines.push(`[Layout: ${slide.layout_suggestion}]`)
    }
    if (slide.estimated_duration) {
      visualLines.push(`[Duration: ${slide.estimated_duration}]`)
    }
    if (slide.visual_description) {
      visualLines.push('')
      visualLines.push(`Visual: ${slide.visual_description}`)
    }

    // Right column: Audio
    const audioLines: string[] = []
    if (slide.content) {
      audioLines.push(slide.content)
    }
    if (slide.speaker_notes) {
      audioLines.push('')
      audioLines.push(`[Speaker Notes]`)
      audioLines.push(slide.speaker_notes)
    }

    return [visualLines.join('\n'), audioLines.join('\n')]
  })

  autoTable(doc, {
    startY: 30,
    head: [['VISUALS', 'AUDIO / SCRIPT']],
    body: tableBody,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 30, 30],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 9,
      cellPadding: 4,
    },
    bodyStyles: {
      fontSize: 8.5,
      cellPadding: 5,
      lineColor: [220, 220, 220],
      lineWidth: 0.3,
      valign: 'top',
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { cellWidth: 110, fontStyle: 'bold' },
      1: { cellWidth: 165 },
    },
    alternateRowStyles: {
      fillColor: [248, 248, 248],
    },
    margin: { left: 14, right: 14 },
    didDrawPage: (data) => {
      // Page number footer
      const pageCount = doc.getNumberOfPages()
      doc.setFontSize(8)
      doc.setTextColor(160, 160, 160)
      doc.text(
        `Page ${data.pageNumber} of ${pageCount}`,
        doc.internal.pageSize.getWidth() - 14,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'right' }
      )
    },
  })

  doc.save(`${filename}_script.pdf`)
}
