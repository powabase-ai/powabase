import { describe, expect, it } from 'vitest'

import { displayModelName } from './model-display'

// Ground truth: agentic-platform/packages/agentic-project-service/tests/
//   integration/test_billing_e2e_ai_on_us.py asserts
//   `metadata["model"] == "claude-haiku-4-5"` (stripped form). LiteLLM
//   strips the `<provider>/` prefix before the callback dispatch — see
//   billing_litellm.py:120 — so the ledger row carries the stripped
//   model id. Lookups MUST use the stripped form. PR 416 C5.

describe('displayModelName — stripped-key lookup (PR 416 C5)', () => {
  it('returns "Claude Sonnet 4.6" for "claude-sonnet-4-6"', () => {
    expect(displayModelName('claude-sonnet-4-6')).toBe('Claude Sonnet 4.6')
  })

  it('returns "Claude Opus 4.7" for "claude-opus-4-7"', () => {
    expect(displayModelName('claude-opus-4-7')).toBe('Claude Opus 4.7')
  })

  it('returns "Claude Haiku 4.5" for "claude-haiku-4-5"', () => {
    expect(displayModelName('claude-haiku-4-5')).toBe('Claude Haiku 4.5')
  })

  it('returns "GPT-5" for "gpt-5"', () => {
    expect(displayModelName('gpt-5')).toBe('GPT-5')
  })

  it('returns "GPT-5 Mini" for "gpt-5-mini"', () => {
    expect(displayModelName('gpt-5-mini')).toBe('GPT-5 Mini')
  })

  // Gemini models PS actually offers (settings_registry._LLM_MODEL_CHOICES).
  // LiteLLM strips the `gemini/` prefix the same way it strips `anthropic/`,
  // so the metadata model field is the bare id below.
  it('returns "Gemini 2.5 Pro" for "gemini-2.5-pro"', () => {
    expect(displayModelName('gemini-2.5-pro')).toBe('Gemini 2.5 Pro')
  })

  it('returns "Gemini 2.5 Flash" for "gemini-2.5-flash"', () => {
    expect(displayModelName('gemini-2.5-flash')).toBe('Gemini 2.5 Flash')
  })

  it('returns "Gemini 3 Flash (preview)" for "gemini-3-flash-preview"', () => {
    expect(displayModelName('gemini-3-flash-preview')).toBe('Gemini 3 Flash (preview)')
  })

  it('returns "Gemini 3.1 Pro (preview)" for "gemini-3.1-pro-preview"', () => {
    expect(displayModelName('gemini-3.1-pro-preview')).toBe('Gemini 3.1 Pro (preview)')
  })

  it('falls through to raw string for unknown identifiers', () => {
    expect(displayModelName('claude-some-future-model')).toBe('claude-some-future-model')
  })

  it('returns "Unknown model" for null/undefined', () => {
    expect(displayModelName(null)).toBe('Unknown model')
    expect(displayModelName(undefined)).toBe('Unknown model')
  })
})
