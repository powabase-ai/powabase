import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { render } from '@/tests/helpers'

import { LLMProviderKeysSettings } from './LLMProviderKeysSettings'

/**
 * Task 11.5 — Set (B): Two-factor AI-on-us badges (gated under
 * ``billing:ai_on_us``).
 *
 * Per-provider status rule:
 *   - userKeys[P] exists  → "BYOK active"
 *   - flag off            → no badge
 *   - flag on AND platformProviders has P → "AI-on-us active"
 *   - flag on AND platformProviders does NOT have P → "BYOK required"
 */

const PROVIDERS = ['openai', 'anthropic', 'google', 'openrouter']

describe('LLMProviderKeysSettings — two-factor badges (Set B)', () => {
  it('shows "AI-on-us active" badge when user has no key AND platform has env key', () => {
    render(
      <LLMProviderKeysSettings
        providers={PROVIDERS}
        userKeys={{}}
        platformProviders={new Set(['openai', 'anthropic'])}
        isAiOnUsEnabled={true}
      />
    )
    const openaiRow = screen.getByText('openai').closest('[data-testid="provider-row"]')
    expect(openaiRow).toHaveTextContent('AI-on-us active')
  })

  it('shows "BYOK active" badge when user has a key', () => {
    render(
      <LLMProviderKeysSettings
        providers={PROVIDERS}
        userKeys={{ openai: 'sk-xxx' }}
        platformProviders={new Set(['openai', 'anthropic'])}
        isAiOnUsEnabled={true}
      />
    )
    const openaiRow = screen.getByText('openai').closest('[data-testid="provider-row"]')
    expect(openaiRow).toHaveTextContent('BYOK active')
  })

  it('shows "BYOK required" badge when no user key AND no platform key', () => {
    render(
      <LLMProviderKeysSettings
        providers={PROVIDERS}
        userKeys={{}}
        platformProviders={new Set(['openai', 'anthropic'])}
        isAiOnUsEnabled={true}
      />
    )
    const googleRow = screen.getByText('google').closest('[data-testid="provider-row"]')
    expect(googleRow).toHaveTextContent('BYOK required')
  })

  it('shows no AI-on-us badge when feature flag is off', () => {
    render(
      <LLMProviderKeysSettings
        providers={PROVIDERS}
        userKeys={{}}
        platformProviders={new Set(['openai', 'anthropic'])}
        isAiOnUsEnabled={false}
      />
    )
    expect(screen.queryByText(/AI-on-us active/)).toBeNull()
  })
})
