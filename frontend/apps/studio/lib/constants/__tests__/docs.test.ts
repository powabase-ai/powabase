import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('constants/docs', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('getDocsLandingUrl', () => {
    it('returns the Powabase platform-overview URL when NEXT_PUBLIC_DOCS_URL is not set', async () => {
      vi.stubEnv('NEXT_PUBLIC_DOCS_URL', '')
      const { getDocsLandingUrl } = await import('../docs')
      expect(getDocsLandingUrl()).toBe('https://docs.powabase.ai/concepts/platform-overview')
    })

    it('respects NEXT_PUBLIC_DOCS_URL override', async () => {
      vi.stubEnv('NEXT_PUBLIC_DOCS_URL', 'https://my-docs.example.com')
      const { getDocsLandingUrl } = await import('../docs')
      expect(getDocsLandingUrl()).toBe('https://my-docs.example.com/concepts/platform-overview')
    })

    it('ignores any path argument (Powabase docs do not mirror Supabase paths)', async () => {
      vi.stubEnv('NEXT_PUBLIC_DOCS_URL', '')
      const { getDocsLandingUrl } = await import('../docs')
      expect(getDocsLandingUrl('/guides/auth/social-login')).toBe(
        'https://docs.powabase.ai/concepts/platform-overview'
      )
    })

    // Bug pin: helper does not strip a trailing slash from NEXT_PUBLIC_DOCS_URL before
    // concatenating, producing a double-slash. Acceptable today because production env
    // is set without a trailing slash, but if a deploy ever sets it with one, every
    // docs link 404s. When fixed, flip this to `it()` with the corrected expectation
    // (no double slash) — keeping it `it.todo` here prevents the broken behavior from
    // being silently re-pinned.
    it.todo('should normalize trailing slashes in NEXT_PUBLIC_DOCS_URL')
  })

  describe('DOCS_LANDING_PATH', () => {
    it('exports the landing path constant', async () => {
      const { DOCS_LANDING_PATH } = await import('../docs')
      expect(DOCS_LANDING_PATH).toBe('/concepts/platform-overview')
    })
  })
})
