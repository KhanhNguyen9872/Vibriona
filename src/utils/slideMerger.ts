
import type { Slide } from '../api/prompt'
import type { BatchOperation } from '../api/parseStream'

export interface DeltaResponse {
  action?: 'create' | 'update' | 'append' | 'delete' | 'ask' | 'response' | 'info' | 'batch'
  slides: Slide[]
  operations?: BatchOperation[]
}

/**
 * Applies a delta update to the current slides based on the action.
 */
export const applyDelta = (
  currentSlides: Slide[],
  delta: DeltaResponse,
  options: { markActions?: boolean } = {}
): Slide[] => {
  const { action, slides: incomingSlides } = delta

  // CASE 0: ASK or RESPONSE (No slide modifications)
  if (action === 'ask' || action === 'response') {
    // These actions are for clarification or conversation - don't modify slides
    return currentSlides
  }

  // CASE 1: CREATE (Replace All)
  if (action === 'create') {
    return options.markActions
      ? incomingSlides.map(s => ({ ...s, _actionMarker: 'create' as const }))
      : incomingSlides
  }

  // CASE 2: DELETE (Remove specific)
  if (action === 'delete') {
    const idsToDelete = new Set(incomingSlides.map(s => s.slide_number))

    if (options.markActions) {
      // Mark slides for deletion instead of removing
      return currentSlides.map(s =>
        idsToDelete.has(s.slide_number)
          ? { ...s, _actionMarker: 'delete' as const }
          : s
      )
    }

    return currentSlides
      .filter(s => !idsToDelete.has(s.slide_number))
      .map((s, index) => ({ ...s, slide_number: index + 1 }))
  }

  // CASE 3: APPEND (Add to end)
  if (action === 'append') {
    // Filter out incoming slides that already exist in current (by slide_number)
    // to prevent duplication during streaming partials
    const currentNumbers = new Set(currentSlides.map(s => s.slide_number))
    const newUnique = incomingSlides.filter(s => !currentNumbers.has(s.slide_number))
    const markedNew = options.markActions
      ? newUnique.map(s => ({ ...s, _actionMarker: 'append' as const }))
      : newUnique
    return [...currentSlides, ...markedNew].sort((a, b) => a.slide_number - b.slide_number)
  }

  // CASE 4: UPDATE (Modify specific)
  if (action === 'update') {
    return currentSlides.map(existingSlide => {
      const match = incomingSlides.find(s => s.slide_number === existingSlide.slide_number)
      if (match) {
        return options.markActions
          ? { ...match, _actionMarker: 'update' as const }
          : match
      }
      return existingSlide
    })
  }

  // CASE 5: BATCH (Multiple operations)
  if (action === 'batch' && delta.operations && delta.operations.length > 0) {
    let result = [...currentSlides]
    
    for (const op of delta.operations) {
      if (op.type === 'delete') {
        // Remove the slide
        const deleteIndex = result.findIndex(s => s.slide_number === op.slide_number)
        if (deleteIndex !== -1) {
          if (options.markActions) {
            result[deleteIndex] = { ...result[deleteIndex], _actionMarker: 'delete' as const }
          } else {
            result.splice(deleteIndex, 1)
          }
        }
      } else if (op.type === 'update') {
        // Update the slide
        const updateIndex = result.findIndex(s => s.slide_number === op.slide_number)
        if (updateIndex !== -1) {
          const updatedSlide: Slide = {
            ...result[updateIndex],
            ...(op.title !== undefined && { title: op.title }),
            ...(op.content !== undefined && { content: op.content }),
            ...(op.visual_needs_image !== undefined && { visual_needs_image: op.visual_needs_image }),
            ...(op.visual_description !== undefined && { visual_description: op.visual_description }),
            ...(op.layout_suggestion !== undefined && { layout_suggestion: op.layout_suggestion as any }),
            ...(op.speaker_notes !== undefined && { speaker_notes: op.speaker_notes }),
            ...(op.estimated_duration !== undefined && { estimated_duration: op.estimated_duration })
          }
          
          result[updateIndex] = options.markActions
            ? { ...updatedSlide, _actionMarker: 'batch' as const }
            : updatedSlide
        }
      }
    }
    
    // Renumber if not marking actions and we deleted slides
    if (!options.markActions) {
      result = result
        .filter(s => !s._actionMarker || s._actionMarker !== 'delete')
        .map((s, index) => ({ ...s, slide_number: index + 1 }))
    }
    
    return result
  }

  // Fallback: If no action (e.g. legacy or start of stream), prefer "Create/Replace" behavior
  // or return current if incoming is empty
  if (incomingSlides.length > 0) {
    if (currentSlides.length === 0) return incomingSlides
    return mergeSlides(currentSlides, incomingSlides) // Use the smart merger as fallback
  }

  return currentSlides
}

/**
 * Merges incoming slides (from stream or update) into the current slides.
 * REUSED from previous phase, but now acts as a fallback or specific "merge" utility.
 * 
 * Strategy:
 * 1. Overlay incoming slides onto current slides by matching `slide_number`.
 * 2. Preserve object equality (reference) if content hasn't changed (prevents React re-renders).
 * 3. Append new slides that appear in incoming but not in current.
 * 4. Maintain slides from 'current' that haven't been seen in 'incoming' yet (supporting incremental stream).
 * 
 * @param currentSlides - The existing slides in the session
 * @param incomingSlides - The new batch of slides (potentially partial stream)
 * @returns A new array containing the merged state
 */
export const mergeSlides = (currentSlides: Slide[], incomingSlides: Slide[]): Slide[] => {
  // Create a map of current slides for fast lookup
  const currentMap = new Map(currentSlides.map(s => [s.slide_number, s]))
  const incomingMap = new Map(incomingSlides.map(s => [s.slide_number, s]))

  // We want the result to cover the range of ALL known slides.
  // Since we are usually appending or updating, we want the union of keys.
  const maxCurrent = currentSlides.length > 0 ? Math.max(...currentSlides.map(s => s.slide_number)) : 0
  const maxIncoming = incomingSlides.length > 0 ? Math.max(...incomingSlides.map(s => s.slide_number)) : 0
  const maxSlideNum = Math.max(maxCurrent, maxIncoming)

  const result: Slide[] = []

  for (let i = 1; i <= maxSlideNum; i++) {
    const existing = currentMap.get(i)
    const incoming = incomingMap.get(i)

    if (incoming) {
      // We have a new version or a confirmed slide from the stream.
      // Check if it's identical to the existing one to preserve ref.
      if (existing && JSON.stringify(existing) === JSON.stringify(incoming)) {
        result.push(existing)
      } else {
        result.push(incoming)
      }
    } else if (existing) {
      // Not yet in the stream (or stream is partial), keep the old one for now.
      // This enables "incremental" loading without shrinking the list.
      result.push(existing)
    }
  }

  return result
}
