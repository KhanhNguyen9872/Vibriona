
import type { Slide } from '../api/prompt'

export interface DeltaResponse {
  action?: 'create' | 'update' | 'append'
  slides: Slide[]
}

/**
 * Applies a delta update to the current slides based on the action.
 */
export const applyDelta = (
  currentSlides: Slide[],
  delta: DeltaResponse
): Slide[] => {
  const { action, slides: incomingSlides } = delta

  // CASE 1: CREATE (Replace All) - or default if no action yet (inference starting)
  // If action is 'create', we replace. 
  // If no action is set yet but we have slides, we might assume 'create' or wait.
  // The system prompt now enforces an action.
  if (action === 'create') {
    return incomingSlides
  }

  // CASE 2: APPEND (Add to end)
  if (action === 'append') {
    // Filter out incoming slides that already exist in current (by slide_number)
    // to prevent duplication during streaming partials
    const currentNumbers = new Set(currentSlides.map(s => s.slide_number))
    const newUnique = incomingSlides.filter(s => !currentNumbers.has(s.slide_number))
    return [...currentSlides, ...newUnique].sort((a, b) => a.slide_number - b.slide_number)
  }

  // CASE 3: UPDATE (Modify specific)
  if (action === 'update') {
    return currentSlides.map(existingSlide => {
      const match = incomingSlides.find(s => s.slide_number === existingSlide.slide_number)
      // If there is a matching update, replace the existing slide with the new one
      // Checking content equality could be an optimization but React does that too.
      return match ? match : existingSlide
    })
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
