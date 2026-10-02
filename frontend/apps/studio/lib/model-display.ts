/**
 * Friendly display names for LiteLLM model identifiers surfaced in the
 * activity log (`llm_call` ledger rows carry the model id in their
 * metadata blob).
 *
 * Keys are the STRIPPED form — LiteLLM removes the `<provider>/` prefix
 * before dispatching to async_log_success_event, so the metadata.model
 * field is e.g. `claude-sonnet-4-6`, NOT `anthropic/claude-sonnet-4-6`.
 * Verified by the backend's billing integration tests against
 * litellm==1.83.14. Previously the keys were prefixed and every lookup
 * fell through to the raw string (PR 416 C5).
 *
 * Unknown identifiers fall through to the raw string — better to show
 * `claude-some-future-model` than `Unknown model` while the mapping
 * catches up to provider releases.
 */
const MODEL_DISPLAY: Record<string, string> = {
  // Anthropic
  'claude-fable-5-1': 'Claude Fable 5.1',
  'claude-opus-5-5': 'Claude Opus 5.5',
  'claude-sonnet-5-5': 'Claude Sonnet 5.5',
  'claude-sonnet-4-6': 'Claude Sonnet 4.6',
  'claude-opus-4-7': 'Claude Opus 4.7',
  'claude-haiku-4-5': 'Claude Haiku 4.5',
  // OpenAI
  'gpt-6-astra': 'GPT-6 Astra',
  'gpt-6.1-sol': 'GPT-6.1 Sol',
  'gpt-6-luna': 'GPT-6 Luna',
  'gpt-5.6': 'GPT-5.6',
  'gpt-5': 'GPT-5',
  'gpt-5-mini': 'GPT-5 Mini',
  // Gemini — IDs mirror the project-service's `_LLM_MODEL_CHOICES` registry
  // with the `gemini/` prefix stripped by LiteLLM.
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-3-flash-preview': 'Gemini 3 Flash (preview)',
  'gemini-3.1-pro-preview': 'Gemini 3.1 Pro (preview)',
  'gemini-3.8-flash': 'Gemini 3.8 Flash',
  // OpenRouter — only the `openrouter/` prefix is stripped, so the vendor
  // segment stays in the logged id.
  'moonshotai/kimi-k3': 'Kimi K3',
}

export const displayModelName = (m: string | undefined | null): string =>
  (m && MODEL_DISPLAY[m]) || m || 'Unknown model'
