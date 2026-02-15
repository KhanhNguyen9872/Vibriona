import { getAPIConfig, parseStreamingContent, parseAPIError } from './utils'
import { buildChatRequest, parseNonStreamResponse, getFinishReasonError } from './chat'
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
    apiType: 'ollama' | 'gemini' | 'openai',
    callbacks?: SuggestionsCallbacks,
    signal?: AbortSignal
): Promise<string[]> {
    const languagePrompt = language === 'vi'
        ? 'Tạo 4 mẫu chủ đề thuyết trình ngắn gọn bằng tiếng Việt. Mỗi mẫu tối đa 4-6 từ. Chỉ trả về JSON thuần: {"suggestions": ["...", "...", "...", "..."]}. Không thêm text giải thích.'
        : 'Generate 4 short presentation topic examples in English. Each should be 4-6 words max. Return ONLY pure JSON: {"suggestions": ["...", "...", "...", "..."]}. No explanatory text.'

    const systemPrompt = 'You are a helpful assistant that generates presentation topic suggestions. Always respond with ONLY valid JSON, nothing else.'
    const config = getAPIConfig({ apiType })
    const { url, body } = buildChatRequest(apiType, config, {
        systemPrompt,
        userPrompt: languagePrompt,
        stream: apiType !== 'gemini',
        temperature: API_CONFIG.DEFAULT_TEMPERATURE,
        maxTokens: API_CONFIG.MAX_TOKENS,
    })

    const response = await fetch(url, {
        method: 'POST',
        headers: config.headers,
        body: JSON.stringify(body),
        signal,
    })

    if (!response.ok) {
        let errorData = ''
        try {
            errorData = await response.text()
        } catch (e) {}

        // Handle 503 specifically
        if (response.status === 503) {
             const busyError = 'Service busy. Please try again later.'
             callbacks?.onError(busyError)
             throw new Error(busyError)
        }
        
        const error = new Error(`Failed to generate suggestions (${response.status})`) as any
        error.status = response.status
        error.data = errorData
        const errorMsg = parseAPIError(error) || error.message
        callbacks?.onError(errorMsg)
        throw error
    }

    // Handle Gemini non-streaming response directly
    if (apiType === 'gemini') {
        const data = await response.json()
        const candidate = data.candidates?.[0]
        const finishReason = candidate?.finishReason
        const errorMsg = getFinishReasonError(finishReason, 'suggestion')
        if (errorMsg) callbacks?.onError(errorMsg)

        const content = parseNonStreamResponse(apiType, data)
        if (!content) {
             throw new Error('No content in Gemini response')
        }

        const finalSuggestions = extractSuggestionsFromText(content)
        if (finalSuggestions.length === 0) {
            throw new Error('No suggestions found in Gemini response')
        }

        // Emit all at once since it's not streaming
        finalSuggestions.forEach((s, i) => callbacks?.onSuggestion(s, i))
        callbacks?.onComplete(finalSuggestions)
        return finalSuggestions
    }

    // Stream the response for others (Ollama/OpenAI)
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

                try {
                    let parsed
                    const jsonStr = line.replace(/^data: /, '').trim()
                    if (!jsonStr) continue
                    
                    parsed = JSON.parse(jsonStr)
                    const content = parseStreamingContent(parsed)

                    const choice = parsed.choices?.[0]
                    const finishReason = choice?.finish_reason
                    const errorMsg = getFinishReasonError(finishReason, 'suggestion')
                    if (errorMsg) callbacks?.onError(errorMsg)

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

    } catch (error: any) {
        const errorMsg = parseAPIError(error) || (error instanceof Error ? error.message : 'Unknown error')
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
