import axios from 'axios'

/**
 * Fetch available models from an OpenAI-compatible or Ollama endpoint.
 * OpenAI: GET /v1/models  → { data: [{ id: "gpt-4" }, ...] }
 * Ollama: GET /api/tags    → { models: [{ name: "llama3" }, ...] }
 */
export async function fetchModels(apiUrl: string, apiKey: string): Promise<string[]> {
  const isOllama = apiUrl.includes('11434') || apiUrl.includes('ollama')

  if (isOllama) {
    const base = apiUrl.replace(/\/+$/, '').replace(/\/api$/, '')
    const { data } = await axios.get(`${base}/api/tags`, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    })
    // Ollama returns { models: [{ name: "llama3:latest", ... }] }
    const models: string[] = (data.models || []).map((m: { name: string }) => m.name)
    return models.sort()
  }

  // OpenAI-compatible
  const base = apiUrl.replace(/\/+$/, '').replace(/\/chat\/completions$/, '').replace(/\/v1$/, '')
  const { data } = await axios.get(`${base}/v1/models`, {
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    timeout: 10000,
  })
  // OpenAI returns { data: [{ id: "gpt-4o-mini", ... }] }
  const models: string[] = (data.data || []).map((m: { id: string }) => m.id)
  return models.sort()
}
