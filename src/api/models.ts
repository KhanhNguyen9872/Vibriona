import { type ApiType } from '../store/useSettingsStore'
import axios from 'axios'

export interface ModelInfo {
  id: string;
  thinking?: boolean;
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
    // Gemini returns { models: [{ name: "models/gemini-1.5-flash", thinking: true, ... }] }
    const models: ModelInfo[] = (data.models || []).map((m: { name: string, thinking?: boolean }) => ({
      id: m.name.replace(/^models\//, ''),
      thinking: !!m.thinking
    }))
    return models.sort((a, b) => a.id.localeCompare(b.id))
  }

  // OpenAI-compatible / Gemini Proxy
  const base = apiUrl.replace(/\/+$/, '').replace(/\/chat\/completions$/, '').replace(/\/v\d+$/, '')
  const { data } = await axios.get(`${base}/v1/models`, {
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    timeout: 10000,
  })
  // OpenAI returns { data: [{ id: "gpt-4o-mini", ... }] }
  const models: ModelInfo[] = (data.data || []).map((m: { id: string }) => ({
    id: m.id,
    thinking: false
  }))
  return models.sort((a, b) => a.id.localeCompare(b.id))
}
