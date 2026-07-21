import { afterEach, describe, expect, it, vi } from 'vitest'

import { redeemCode } from './organization-credit-code-redemption-mutation'

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }))

vi.mock('@/data/fetchers', () => ({
  post: postMock,
  handleError: (error: unknown) => {
    throw error
  },
}))

const baseVars = { code: 'CREDITS50', slug: 'acme' }

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('redeemCode captcha gate', () => {
  it('throws on a missing token when captcha is enabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_HCAPTCHA_ENABLED', 'true')

    await expect(redeemCode({ ...baseVars, hcaptchaToken: null })).rejects.toThrow(
      'Captcha not submitted'
    )
    expect(postMock).not.toHaveBeenCalled()
  })

  it('proceeds without a token when captcha is disabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_HCAPTCHA_ENABLED', 'false')
    postMock.mockResolvedValue({ data: {}, error: null })

    await redeemCode({ ...baseVars, hcaptchaToken: null })

    expect(postMock).toHaveBeenCalledOnce()
  })
})
