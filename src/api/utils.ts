import { useSettingsStore } from '../store/useSettingsStore'
import { API_CONFIG } from '../config/api'

export interface APIConfig {
    endpoint: string
    headers: Record<string, string>
    isOllama: boolean
    model: string
}

/**
 * Get API configuration from settings store
 * Detects endpoint type and returns appropriate config
 */
export function getAPIConfig(): APIConfig {
    const { apiUrl, apiKey, selectedModel } = useSettingsStore.getState()

    // Detect endpoint type from URL
    const isOllama = apiUrl.includes('11434') || apiUrl.includes('ollama')

    const endpoint = isOllama
        ? `${apiUrl.replace(/\/+$/, '')}/chat`
        : `${apiUrl.replace(/\/+$/, '')}/chat/completions`

    const model = selectedModel || (isOllama ? API_CONFIG.DEFAULT_MODEL_OLLAMA : API_CONFIG.DEFAULT_MODEL_OPENAI)

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    }

    // Only add Authorization header for non-Ollama endpoints
    if (!isOllama && apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`
    }

    return {
        endpoint,
        headers,
        isOllama,
        model,
    }
}

/**
 * Parse streaming response content from both Ollama and OpenAI formats
 */
export function parseStreamingContent(parsed: any): string {
    // Handle both Ollama (message.content) and OpenAI (choices[0].delta.content) formats
    return parsed.message?.content || parsed.choices?.[0]?.delta?.content || ''
}

/**
 * Parse non-streaming response content from both Ollama and OpenAI formats
 */
export function parseResponseContent(data: any): string {
    // Handle both Ollama (message.content) and OpenAI (choices[0].message.content) formats
    return data.message?.content || data.choices?.[0]?.message?.content || ''
}
