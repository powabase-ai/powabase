import { afterEach, describe, expect, it, vi } from 'vitest'

import { isGoogleAuthEnabled } from './google-auth'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isGoogleAuthEnabled', () => {
  it('returns true only when the flag is exactly "true"', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_AUTH_ENABLED', 'true')
    expect(isGoogleAuthEnabled()).toBe(true)
  })

  it('defaults to false when the flag is empty/unset', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_AUTH_ENABLED', '')
    expect(isGoogleAuthEnabled()).toBe(false)
  })

  it('returns false for any non-"true" value', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_AUTH_ENABLED', 'false')
    expect(isGoogleAuthEnabled()).toBe(false)
  })

  it('returns false for a truthy-looking but non-exact value', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_AUTH_ENABLED', 'TRUE')
    expect(isGoogleAuthEnabled()).toBe(false)
  })
})
