import PptxGenJS from 'pptxgenjs'
import type { Slide } from './prompt'

/**
 * Generate a PowerPoint (.pptx) file from slides and trigger download.
 */
export async function generatePPTX(slides: Slide[], filename = 'presentation'): Promise<void> {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE' // 13.33 x 7.5 inches
  pptx.author = 'Vibriona'
  pptx.title = filename

  for (const slide of slides) {
    const s = pptx.addSlide()

    // Title
    s.addText(slide.title, {
      x: 0.6,
      y: 0.4,
      w: '90%',
      h: 0.8,
      fontSize: 28,
      bold: true,
      color: '1a1a1a',
      fontFace: 'Arial',
    })

    // Layout-aware content positioning
    const isFullImage = slide.layout_suggestion === 'full-image'
    const contentOnLeft = slide.layout_suggestion !== 'split-right'
    const contentX = contentOnLeft ? 0.6 : 6.8
    const visualX = contentOnLeft ? 8.2 : 0.6

    // Content
    s.addText(slide.content, {
      x: isFullImage ? 0.6 : contentX,
      y: 1.4,
      w: isFullImage ? '90%' : '50%',
      h: 3.8,
      fontSize: 14,
      color: '333333',
      fontFace: 'Arial',
      valign: 'top',
      lineSpacingMultiple: 1.3,
    })

    // Visual description box (only if image needed)
    if (slide.visual_needs_image && !isFullImage) {
      s.addShape(pptx.ShapeType.roundRect, {
        x: visualX,
        y: 1.4,
        w: 4.5,
        h: 3.8,
        fill: { color: 'F5F5F5' },
        line: { color: 'E5E5E5', width: 1 },
        rectRadius: 0.15,
      })

      s.addText(slide.visual_description, {
        x: visualX + 0.2,
        y: 1.6,
        w: 4.1,
        h: 3.4,
        fontSize: 11,
        color: '737373',
        fontFace: 'Arial',
        valign: 'top',
        italic: true,
        lineSpacingMultiple: 1.2,
      })
    }

    // Speaker notes
    if (slide.speaker_notes) {
      s.addNotes(slide.speaker_notes)
    }

    // Footer: slide number + duration
    s.addText(`${slide.slide_number}`, {
      x: 0.6,
      y: 6.6,
      w: 0.5,
      h: 0.4,
      fontSize: 10,
      color: 'A3A3A3',
      fontFace: 'Arial',
    })

    if (slide.estimated_duration) {
      s.addText(slide.estimated_duration, {
        x: 12.0,
        y: 6.6,
        w: 1.0,
        h: 0.4,
        fontSize: 10,
        color: 'A3A3A3',
        fontFace: 'Arial',
        align: 'right',
      })
    }
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
