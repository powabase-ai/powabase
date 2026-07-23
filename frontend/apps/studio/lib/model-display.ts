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
  'claude-sonnet-4-6': 'Claude Sonnet 4.6',
  'claude-opus-4-7': 'Claude Opus 4.7',
  'claude-haiku-4-5': 'Claude Haiku 4.5',
  // OpenAI
  'gpt-5': 'GPT-5',
  'gpt-5-mini': 'GPT-5 Mini',
  // Gemini — IDs mirror the project-service's `_LLM_MODEL_CHOICES` registry
  // with the `gemini/` prefix stripped by LiteLLM.
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-3-flash-preview': 'Gemini 3 Flash (preview)',
  'gemini-3.1-pro-preview': 'Gemini 3.1 Pro (preview)',
}

export const displayModelName = (m: string | undefined | null): string =>
  (m && MODEL_DISPLAY[m]) || m || 'Unknown model'
