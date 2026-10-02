import { describe, expect, it } from 'vitest'

import { isReasoningModel } from './token-tracking-info'

describe('isReasoningModel', () => {
  it.each([
    // existing families keep matching
    'gpt-5',
    'gpt-5.4-mini',
    'o3',
    'claude-opus-4-7',
    'claude-sonnet-4-6',
    'gemini-2.5-pro',
    // newer families
    'gpt-6-astra',
    'gpt-6.1-sol',
    'gpt-6-luna',
    'gpt-5.6',
    'claude-opus-5-5',
    'claude-sonnet-5-5',
    'claude-fable-5-1',
    'anthropic/claude-opus-5-5',
    'gemini-3.8-flash',
    'gemini/gemini-3.8-flash',
    'gemini-3-flash-preview',
    'gemini-3.1-pro-preview',
    'kimi-k3',
    'moonshotai/kimi-k3',
    'openrouter/moonshotai/kimi-k3',
  ])('recognizes %s as a reasoning model', (model) => {
    expect(isReasoningModel(model)).toBe(true)
  })

  it.each([
    'gpt-4o',
    'gpt-4.1-mini',
    'gpt-60', // not a gpt-6 family id
    'claude-3-5-sonnet',
    'gemini-30-flash', // not a gemini-3.x id
    'kimi-k2',
    'kimi-k30',
    'mistral-large',
  ])('does not flag %s', (model) => {
    expect(isReasoningModel(model)).toBe(false)
  })

  it('returns false for empty input', () => {
    expect(isReasoningModel(null)).toBe(false)
    expect(isReasoningModel(undefined)).toBe(false)
    expect(isReasoningModel('')).toBe(false)
  })
})
