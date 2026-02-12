import { getAPIConfig, parseStreamingContent } from './utils'

import { API_CONFIG } from '../config/api'

interface DynamicSuggestion {
    suggestions: string[]
}

export interface SuggestionsCallbacks {
    onSuggestion: (suggestion: string, index: number) => void
    onComplete: (suggestions: string[]) => void
    onError: (error: string) => void
}


export async function generateDynamicSuggestions(
    language: 'en' | 'vi',
    callbacks?: SuggestionsCallbacks
): Promise<string[]> {
    const languagePrompt = language === 'vi'
        ? 'Tạo 4 mẫu chủ đề thuyết trình ngắn gọn bằng tiếng Việt. Mỗi mẫu tối đa 4-6 từ. Chỉ trả về JSON thuần: {"suggestions": ["...", "...", "...", "..."]}. Không thêm text giải thích.'
        : 'Generate 4 short presentation topic examples in English. Each should be 4-6 words max. Return ONLY pure JSON: {"suggestions": ["...", "...", "...", "..."]}. No explanatory text.'

    // Get API configuration from shared utility
    const config = getAPIConfig()

    const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: config.headers,
        body: JSON.stringify({
            model: config.model,
            messages: [
                {
                    role: 'system',
                    content: 'You are a helpful assistant that generates presentation topic suggestions. Always respond with ONLY valid JSON, nothing else.',
                },
                {
                    role: 'user',
                    content: languagePrompt,
                },
            ],
            temperature: API_CONFIG.DEFAULT_TEMPERATURE,
            stream: true,
            ...(config.isOllama ? {} : { max_tokens: API_CONFIG.MAX_TOKENS }),
        }),
    })

    if (!response.ok) {
        const error = `Failed to generate suggestions (${response.status})`
        callbacks?.onError(error)
        throw new Error(error)
    }

    // Stream the response
    const reader = response.body?.getReader()
    if (!reader) {
        const error = 'No response body'
        callbacks?.onError(error)
        throw new Error(error)
    }

    const decoder = new TextDecoder()
    let fullContent = ''
    const seenSuggestions = new Set<string>()
    let suggestionIndex = 0

    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value, { stream: true })
            const lines = chunk.split('\n')

            for (const line of lines) {
                if (!line.trim() || line.trim() === 'data: [DONE]') continue

                // Remove "data: " prefix if present
                const jsonStr = line.replace(/^data: /, '').trim()
                if (!jsonStr) continue

                try {
                    const parsed = JSON.parse(jsonStr)
                    const content = parseStreamingContent(parsed)

                    if (content) {
                        fullContent += content

                        // Try to extract and parse suggestions progressively
                        const suggestions = extractSuggestionsFromPartial(fullContent)

                        // Emit new suggestions as they appear
                        for (const suggestion of suggestions) {
                            if (!seenSuggestions.has(suggestion)) {
                                seenSuggestions.add(suggestion)
                                callbacks?.onSuggestion(suggestion, suggestionIndex++)
                            }
                        }
                    }
                } catch (e) {
                    // Ignore parse errors for incomplete chunks
                }
            }
        }

        // Final parse attempt
        const finalSuggestions = extractSuggestionsFromText(fullContent)

        if (finalSuggestions.length === 0) {
            throw new Error('No suggestions found in response')
        }

        callbacks?.onComplete(finalSuggestions)
        return finalSuggestions

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        callbacks?.onError(errorMsg)
        throw error
    }
}

// Helper function to extract suggestions from partial content
function extractSuggestionsFromPartial(text: string): string[] {
    try {
        // Try to find array pattern in the text
        const arrayMatch = text.match(/\["[^"]*"(?:,\s*"[^"]*")*\]/)
        if (arrayMatch) {
            const parsed = JSON.parse(arrayMatch[0])
            if (Array.isArray(parsed)) {
                return parsed.filter(s => typeof s === 'string' && s.length > 0)
            }
        }
    } catch {
        // Ignore
    }
    return []
}

// Helper function to extract suggestions from full text
function extractSuggestionsFromText(text: string): string[] {
    // Try direct JSON parse first
    try {
        const parsed: DynamicSuggestion = JSON.parse(text)
        if (Array.isArray(parsed.suggestions)) {
            return parsed.suggestions.filter(s => s && s.length > 0)
        }
    } catch {
        // Continue to other strategies
    }

    // Try to extract JSON object from text
    try {
        const jsonMatch = text.match(/\{[^{}]*"suggestions"\s*:\s*\[[^\]]*\][^{}]*\}/)
        if (jsonMatch) {
            const parsed: DynamicSuggestion = JSON.parse(jsonMatch[0])
            if (Array.isArray(parsed.suggestions)) {
                return parsed.suggestions.filter(s => s && s.length > 0)
            }
        }
    } catch {
        // Continue
    }

    // Try to extract just the array
    try {
        const arrayMatch = text.match(/\["[^"]*"(?:,\s*"[^"]*")*\]/)
        if (arrayMatch) {
            const parsed = JSON.parse(arrayMatch[0])
            if (Array.isArray(parsed)) {
                return parsed.filter(s => typeof s === 'string' && s.length > 0)
            }
        }
    } catch {
        // Continue
    }

    // Try to extract quoted strings as fallback
    const quotes = text.match(/"([^"]{5,})"/g)
    if (quotes && quotes.length >= 4) {
        return quotes.slice(0, 4).map(q => q.replace(/"/g, ''))
    }

    return []
}
