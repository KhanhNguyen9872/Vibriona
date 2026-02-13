import { useSettingsStore } from '../store/useSettingsStore'
import i18n from '../i18n'
import { API_CONFIG } from '../config/api'

export type ApiType = 'ollama' | 'gemini' | 'openai'

export interface APIConfig {
    endpoint: string
    headers: Record<string, string>
    apiType: ApiType
    model: string
}

/**
 * Get API configuration from settings store
 * Detects endpoint type and returns appropriate config
 */
export function getAPIConfig(overrides?: { apiUrl?: string, apiKey?: string, model?: string, apiType?: ApiType }): APIConfig {
    const settings = useSettingsStore.getState()
    
    // Use overrides if provided, otherwise use settings from store
    const apiUrl = overrides?.apiUrl || settings.getApiUrl()
    const apiKey = overrides?.apiKey || settings.getApiKey()
    const selectedModel = overrides?.model || settings.getModel()
    const apiType = overrides?.apiType || settings.getApiType()

    const model = selectedModel || (
        apiType === 'ollama' ? API_CONFIG.DEFAULT_MODEL_OLLAMA : 
        apiType === 'gemini' ? API_CONFIG.DEFAULT_MODEL_GEMINI : 
        API_CONFIG.DEFAULT_MODEL_OPENAI
    )
    let endpoint = apiUrl.replace(/\/+$/, '')

    // Security: Only allow http and https protocols
    try {
      const parsed = new URL(endpoint)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error(`Unsupported protocol: ${parsed.protocol}`)
      }
    } catch (e) {
      if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
        endpoint = `https://${endpoint}`
      }
    }

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    }

    // Specialize based on apiType
    if (apiType === 'ollama') {
        if (!endpoint.endsWith('/api/chat')) {
            if (endpoint.endsWith('/api')) {
                endpoint = `${endpoint}/chat`
            } else if (!endpoint.includes('/api/')) {
                endpoint = `${endpoint}/api/chat`
            }
        }
    } else if (apiType === 'gemini') {
        // Native Gemini (Google AI API)
        // Ensure version is present (v1beta or v1)
        if (!endpoint.includes('/v1')) {
            endpoint = `${endpoint}/v1beta`
        }
        
        // Append model and action
        // Note: Caller might need to append :streamGenerateContent or :generateContent
        if (!endpoint.includes('/models/')) {
            endpoint = `${endpoint}/models/${model}`
        }

        if (apiKey) headers['x-goog-api-key'] = apiKey
    } else {
        // Default to OpenAI compatible
        if (!endpoint.includes('/chat/completions')) {
            if (!endpoint.includes('/v') || !/\/\s*v\d+/.test(endpoint)) {
                // No version (v1, v2, etc) found, usually OpenAI compatible needs /v1
                if (!endpoint.endsWith('/v1')) {
                    endpoint = endpoint.endsWith('/') ? `${endpoint}v1` : `${endpoint}/v1`
                }
            }
            endpoint = endpoint.endsWith('/') ? `${endpoint}chat/completions` : `${endpoint}/chat/completions`
        }
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
    }

    return {
        endpoint,
        headers,
        apiType,
        model,
    }
}

/**
 * Parse streaming response content from both Ollama and OpenAI formats
 */
export function parseAPIError(error: any): string {
    const status = error.response?.status || error.status
    let data = error.response?.data || error.data

    // If data is a string (e.g. from axios with responseType: 'text'), try to parse it
    if (typeof data === 'string' && data.includes('{')) {
        try {
            data = JSON.parse(data)
        } catch (e) {
            // Not JSON, continue
        }
    }

    if (status === 429) {
        // Try to extract retry time from Gemini/ChatGPT error format
        try {
            const errorObj = Array.isArray(data) ? data[0]?.error : data?.error
            const message = errorObj?.message || (typeof data === 'string' ? data : '')

            // Extract "Please retry in X.Xs" (Gemini) or "Please try again in Xms/s" (ChatGPT)
            const retryMatch = message.match(/Please (?:retry|try again) in ([\d.]+)\s*(s|ms)/i)
            if (retryMatch) {
                let seconds = parseFloat(retryMatch[1])
                if (retryMatch[2].toLowerCase() === 'ms') seconds = seconds / 1000
                return i18n.t('errors.rateLimitWithDuration', { seconds: Math.ceil(seconds) })
            }

            // Check RetryInfo details (Gemini)
            const retryInfo = errorObj?.details?.find((d: any) => d['@type']?.includes('RetryInfo'))
            if (retryInfo?.retryDelay) {
                const seconds = parseInt(retryInfo.retryDelay)
                return i18n.t('errors.rateLimitWithDuration', { seconds })
            }

            // --- ChatGPT Support ---
            const retryAfter = errorObj?.retry_after || error.response?.headers?.['retry-after'] || error.headers?.['retry-after']
            if (retryAfter) {
                const seconds = Math.ceil(parseFloat(retryAfter))
                return i18n.t('errors.rateLimitWithDuration', { seconds })
            }
        } catch (e) {
            console.warn('Failed to parse detailed 429 error:', e)
        }
    }

    if ((error.code === 'ERR_NETWORK' && !error.response) || error.message === 'Failed to fetch') {
        return 'CORS Error or Network Error. Check if your API server allows requests from this domain.'
    }

    if (error.message === 'No response body') return error.message
    if (error.message?.includes('No suggestions found')) return error.message

    return '' // Fallback to existing logic in callers if empty
}

/**
 * Check if an error is likely due to CORS restrictions
 */
export function isLikelyCorsError(error: any): boolean {
    return error.code === 'ERR_NETWORK' && !error.response
}

export function parseStreamingContent(parsed: any): string {
    // Handle Gemini (candidates[0].content.parts[0].text)
    if (parsed.candidates?.[0]?.content?.parts?.[0]?.text) {
        return parsed.candidates[0].content.parts[0].text
    }
    // Handle both Ollama (message.content) and OpenAI (choices[0].delta.content) formats
    return parsed.message?.content || parsed.choices?.[0]?.delta?.content || ''
}

/**
 * Parse non-streaming response content from both Ollama and OpenAI formats
 */
export function parseResponseContent(data: any): string {
    // Handle Gemini (candidates[0].content.parts[0].text)
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text
    }
    // Handle both Ollama (message.content) and OpenAI (choices[0].message.content) formats
    return data.message?.content || data.choices?.[0]?.message?.content || ''
}
