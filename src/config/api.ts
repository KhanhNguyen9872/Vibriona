export const API_CONFIG = {
  DEFAULT_TEMPERATURE: 0,
  MAX_TOKENS: 65535,
  SUGGESTION_COUNT: 4,
  DEFAULT_MODEL_OLLAMA: 'llama3.2',
  DEFAULT_MODEL_GEMINI: 'gemini-2.5-flash',
  DEFAULT_MODEL_OPENAI: 'gpt-4o-mini',
  DEFAULT_ENDPOINTS: {
    ollama: 'http://127.0.0.1:11434',
    gemini: 'https://generativelanguage.googleapis.com',
    openai: 'https://api.openai.com/v1',
  },
  // Conversation context management
  COMPACTION_THRESHOLD: 20, // Trigger compaction every 20 uncompacted messages
  CONTEXT_WARNING_THRESHOLD: 60, // Show warning when messages >= this count
}
