import { type ApiType } from '../store/useSettingsStore'
import axios from 'axios'

export interface ModelInfo {
  id: string;
  thinking?: boolean;
  /** OpenAI: total context window (input+output). Used to warn if MAX_TOKENS > this. */
  contextWindow?: number;
  /** Gemini: max output tokens. Used to warn if MAX_TOKENS > this. */
  outputTokenLimit?: number;
}

/**
 * Fetch available models from an OpenAI-compatible or Ollama endpoint.
 */
export async function fetchModels(apiUrl: string, apiKey: string, apiType: ApiType = 'openai'): Promise<ModelInfo[]> {
  if (apiType === 'ollama') {
    const base = apiUrl.replace(/\/+$/, '').replace(/\/api\/chat$/, '').replace(/\/api$/, '')
    const { data } = await axios.get(`${base}/api/tags`, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    })
    // Ollama returns { models: [{ name: "llama3:latest", ... }] }
    const models: ModelInfo[] = (data.models || []).map((m: { name: string }) => ({
      id: m.name,
      thinking: false
    }))
    return models.sort((a, b) => a.id.localeCompare(b.id))
  }

  if (apiType === 'gemini') {
    const base = apiUrl.replace(/\/+$/, '').replace(/\/v\d+$/, '').replace(/\/v\d+beta$/, '')
    const { data } = await axios.get(`${base}/v1beta/models`, {
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      timeout: 10000,
    })
    // Gemini: name, thinking; optional supportedGenerationMethodConfigs[].generationConfig.maxOutputTokens
    const models: ModelInfo[] = (data.models || []).map((m: Record<string, unknown>) => {
      const rawId = (m.name as string) || ''
      const id = rawId.replace(/^models\//, '')
      const configs = (m.supportedGenerationMethodConfigs as Array<{ generationConfig?: { maxOutputTokens?: number } }>) || []
      const maxOut = configs[0]?.generationConfig?.maxOutputTokens
      return {
        id,
        thinking: !!(m.thinking as boolean),
        ...(typeof maxOut === 'number' && maxOut > 0 ? { outputTokenLimit: maxOut } : {}),
      }
    })
    return models.sort((a, b) => a.id.localeCompare(b.id))
  }

  // OpenAI-compatible: list may include context_window (e.g. some proxies or future API)
  const base = apiUrl.replace(/\/+$/, '').replace(/\/chat\/completions$/, '').replace(/\/v\d+$/, '')
  const { data } = await axios.get(`${base}/v1/models`, {
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    timeout: 10000,
  })
  const list = data.data || []
  let models: ModelInfo[] = list.map((m: { id: string; context_window?: number }) => ({
    id: m.id,
    thinking: false,
    ...(typeof m.context_window === 'number' && m.context_window > 0 ? { contextWindow: m.context_window } : {}),
  }))

  // If list has no context_window, try per-model GET /v1/models/{id} (some backends expose it there)
  const withoutLimit = models.filter(m => m.contextWindow == null)
  if (withoutLimit.length > 0 && withoutLimit.length <= 25) {
    const CONCURRENCY = 5
    const enriched: ModelInfo[] = []
    for (let i = 0; i < withoutLimit.length; i += CONCURRENCY) {
      const chunk = withoutLimit.slice(i, i + CONCURRENCY)
      const results = await Promise.all(
        chunk.map(async (model): Promise<ModelInfo> => {
          try {
            const { data: single } = await axios.get(`${base}/v1/models/${encodeURIComponent(model.id)}`, {
              headers: {
                'Content-Type': 'application/json',
                ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
              },
              timeout: 5000,
            })
            const ctx = (single as { context_window?: number }).context_window
            if (typeof ctx === 'number' && ctx > 0) {
              return { ...model, contextWindow: ctx }
            }
          } catch {
            // ignore
          }
          return model
        })
      )
      enriched.push(...results)
    }
    const byId = new Map(enriched.map(e => [e.id, e]))
    models = models.map(m => (m.contextWindow != null ? m : byId.get(m.id) ?? m))
  }

  return models.sort((a, b) => a.id.localeCompare(b.id))
}
