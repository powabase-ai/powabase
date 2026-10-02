import { describe, expect, it } from 'vitest'

import { displayModelName } from './model-display'

// Ground truth: the backend billing integration tests assert
//   `metadata["model"] == "claude-haiku-4-5"` (stripped form). LiteLLM
//   strips the `<provider>/` prefix before the callback dispatch, so the
//   ledger row carries the stripped model id. Lookups MUST use the
//   stripped form. PR 416 C5.

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

  // Newer catalog models, keyed by the stripped form LiteLLM logs.
  // OpenRouter ids keep their vendor segment once `openrouter/` is stripped.
  it.each([
    ['gpt-6-astra', 'GPT-6 Astra'],
    ['gpt-6.1-sol', 'GPT-6.1 Sol'],
    ['gpt-6-luna', 'GPT-6 Luna'],
    ['gpt-5.6', 'GPT-5.6'],
    ['claude-fable-5-1', 'Claude Fable 5.1'],
    ['claude-opus-5-5', 'Claude Opus 5.5'],
    ['claude-sonnet-5-5', 'Claude Sonnet 5.5'],
    ['gemini-3.8-flash', 'Gemini 3.8 Flash'],
    ['moonshotai/kimi-k3', 'Kimi K3'],
  ])('returns the display name for "%s"', (id, name) => {
    expect(displayModelName(id)).toBe(name)
  })

  it('falls through to raw string for unknown identifiers', () => {
    expect(displayModelName('claude-some-future-model')).toBe('claude-some-future-model')
  })

  it('returns "Unknown model" for null/undefined', () => {
    expect(displayModelName(null)).toBe('Unknown model')
    expect(displayModelName(undefined)).toBe('Unknown model')
  })
})
