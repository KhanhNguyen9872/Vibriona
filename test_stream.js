
// Mock of parseStream.ts logic for testing

function parsePartialSlides(text) {
  const trimmed = text.trim()
  if (!trimmed) return []

  const arrStart = trimmed.indexOf('[')
  if (arrStart === -1) return []

  let json = trimmed.slice(arrStart)

  const lastCloseBrace = json.lastIndexOf('}')
  if (lastCloseBrace === -1) return []

  let repaired = json.slice(0, lastCloseBrace + 1)
  
  if (!repaired.endsWith(']')) {
    repaired += ']'
  }
  
  repaired = repaired.replace(/,\s*\]$/, ']')

  try {
    const parsed = JSON.parse(repaired)
    if (Array.isArray(parsed)) return parsed
  } catch (e) {
    // console.log("JSON parse failed:", e.message)
    // console.log("Repaired string:", repaired)
  }

  // Regex fallback
  const objects = []
  const objectRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g
  let match
  while ((match = objectRegex.exec(json)) !== null) {
    try {
      const obj = JSON.parse(match[0])
      if (obj.slide_number || obj.title) objects.push(obj)
    } catch {}
  }
  return objects
}

function parsePartialResponse(text) {
  const trimmed = text.trim()
  if (!trimmed) return { slides: [] }

  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && Array.isArray(parsed.slides)) {
      return { action: parsed.action, slides: parsed.slides }
    }
  } catch {}

  const result = { slides: [] }

  const actionMatch = /"action"\s*:\s*"([^"]+)"/.exec(trimmed)
  if (actionMatch) {
    result.action = actionMatch[1]
  }

  const slidesStartMatch = /"slides"\s*:\s*\[/.exec(trimmed)
  if (slidesStartMatch) {
    const slidesStartIndex = slidesStartMatch.index + slidesStartMatch[0].length - 1
    const slidesString = trimmed.slice(slidesStartIndex)
    result.slides = parsePartialSlides(slidesString)
  }

  return result
}

// Simulation
const fullResponse = `{
  "action": "create",
  "slides": [
    {
      "slide_number": 1,
      "title": "Slide 1",
      "content": "Content of slide 1"
    },
    {
      "slide_number": 2,
      "title": "Slide 2",
      "content": "Content of slide 2"
    }
  ]
}`

console.log("--- Starting Stream Simulation ---")
let buffer = ""
for (let i = 0; i < fullResponse.length; i++) {
  buffer += fullResponse[i]
  // Simulate chunk processing every few characters or specific points
  if (i % 5 === 0 || i === fullResponse.length - 1) {
    const result = parsePartialResponse(buffer)
    if (result.slides.length > 0) {
      console.log(`Length: ${i}, Slides found: ${result.slides.length}`)
      // console.log(JSON.stringify(result.slides[result.slides.length-1]))
    }
  }
}
