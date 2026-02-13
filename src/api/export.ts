import PptxGenJS from 'pptxgenjs'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
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
