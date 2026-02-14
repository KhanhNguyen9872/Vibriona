import { useCallback, useState, useRef } from 'react'
import { GripVertical } from 'lucide-react'
import { useUIStore } from '../store/useUIStore'

interface ResizableDividerProps {
  onResize: (percentage: number) => void
  minWidth?: number // Minimum width in pixels for left panel
  maxPercentage?: number // Maximum percentage (0-100) for left panel
}

export default function ResizableDivider({ onResize, minWidth = 320, maxPercentage = 70 }: ResizableDividerProps) {
  const setResizing = useUIStore((s) => s.setResizing)
  const setResizeJustEnded = useUIStore((s) => s.setResizeJustEnded)
  const [isDragging, setIsDragging] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const propsRef = useRef({ onResize, minWidth, maxPercentage })
  propsRef.current = { onResize, minWidth, maxPercentage }

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const dividerEl = containerRef.current
    if (!dividerEl?.parentElement) return

    const chatPanel = dividerEl.previousElementSibling as HTMLElement | null
    if (!chatPanel) return

    setIsDragging(true)
    setResizing(true)
    const container = dividerEl.parentElement
    const originalCursor = document.body.style.cursor
    const originalUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    // Lock panel to direct DOM control so React doesn't lag during fast drag
    const rect0 = container.getBoundingClientRect()
    const chatRect0 = chatPanel.getBoundingClientRect()
    let lastPercentage = rect0.width > 0 ? (chatRect0.width / rect0.width) * 100 : 40

    const applyPercentage = (pct: number) => {
      chatPanel.style.flex = `0 0 ${pct}%`
      chatPanel.style.width = `${pct}%`
    }
    applyPercentage(lastPercentage)

    const handleMouseMove = (ev: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      if (rect.width <= 0) return
      const mouseX = ev.clientX - rect.left
      let percentage = (mouseX / rect.width) * 100
      const minPct = (propsRef.current.minWidth / rect.width) * 100
      const lo = Math.min(minPct, propsRef.current.maxPercentage)
      const hi = Math.max(minPct, propsRef.current.maxPercentage)
      percentage = Math.max(lo, Math.min(hi, percentage))
      lastPercentage = percentage
      applyPercentage(percentage)
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove, true)
      document.removeEventListener('mouseup', handleMouseUp, true)
      document.body.style.cursor = originalCursor
      document.body.style.userSelect = originalUserSelect
      chatPanel.style.flex = ''
      chatPanel.style.width = ''
      propsRef.current.onResize(lastPercentage)
      setResizing(false)
      setResizeJustEnded(true)
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove, true)
    document.addEventListener('mouseup', handleMouseUp, true)
  }, [])

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      className={`
        hidden md:flex shrink-0
        relative items-center justify-center
        cursor-col-resize
        bg-neutral-200 dark:bg-neutral-800
        hover:bg-blue-400 dark:hover:bg-blue-600
        transition-all duration-200
        ${isDragging ? 'bg-blue-500 dark:bg-blue-500' : ''}
        ${isHovering && !isDragging ? 'bg-neutral-300 dark:bg-neutral-700' : ''}
      `}
      style={{
        userSelect: 'none',
        minWidth: 6,
        width: 6,
      }}
    >
      {/* Grip handle - visible on hover or drag */}
      <div
        className={`
          absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
          rounded-full
          bg-neutral-300 dark:bg-neutral-700
          transition-all duration-200
          ${isHovering || isDragging ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}
          ${isDragging ? 'bg-blue-500 dark:bg-blue-500' : ''}
        `}
        style={{
          padding: '4px',
        }}
      >
        <GripVertical
          className={`
            w-3 h-3
            transition-colors duration-200
            ${isDragging ? 'text-white' : 'text-neutral-600 dark:text-neutral-300'}
          `}
        />
      </div>
    </div>
  )
}
