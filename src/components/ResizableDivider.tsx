import { useCallback, useState, useEffect, useRef } from 'react'
import { GripVertical } from 'lucide-react'

interface ResizableDividerProps {
  onResize: (percentage: number) => void
  minWidth?: number // Minimum width in pixels for left panel
  maxPercentage?: number // Maximum percentage (0-100) for left panel
}

export default function ResizableDivider({ onResize, minWidth = 320, maxPercentage = 70 }: ResizableDividerProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return

      // Get the container dimensions
      const container = containerRef.current.parentElement
      if (!container) return

      const containerRect = container.getBoundingClientRect()
      const mouseX = e.clientX - containerRect.left

      // Calculate percentage
      let percentage = (mouseX / containerRect.width) * 100

      // Apply constraints
      const minPercentage = (minWidth / containerRect.width) * 100

      percentage = Math.max(minPercentage, Math.min(maxPercentage, percentage))

      onResize(percentage)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, onResize, minWidth, maxPercentage])

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      className={`
        hidden md:flex
        relative items-center justify-center
        w-1 cursor-col-resize
        bg-neutral-200 dark:bg-neutral-800
        hover:bg-blue-400 dark:hover:bg-blue-600
        transition-all duration-200
        ${isDragging ? 'bg-blue-500 dark:bg-blue-500 w-1' : ''}
        ${isHovering && !isDragging ? 'w-1.5' : ''}
      `}
      style={{
        userSelect: 'none',
      }}
    >
      {/* Grip handle - visible on hover or drag */}
      <div
        className={`
          absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
          rounded-full
          bg-neutral-300 dark:bg-neutral-700
          shadow-sm
          transition-all duration-200
          ${isHovering || isDragging ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}
          ${isDragging ? 'bg-blue-500 dark:bg-blue-500' : ''}
        `}
        style={{
          padding: '6px',
        }}
      >
        <GripVertical 
          className={`
            w-3.5 h-3.5
            transition-colors duration-200
            ${isDragging ? 'text-white' : 'text-neutral-600 dark:text-neutral-300'}
          `}
        />
      </div>
    </div>
  )
}
