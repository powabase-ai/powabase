import { afterEach, describe, expect, it, vi } from 'vitest'

import { topUpCredits } from './organization-credit-top-up-mutation'

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }))

vi.mock('@/data/fetchers', () => ({
  post: postMock,
  handleError: (error: unknown) => {
    throw error
  },
}))

const baseVars = { payment_method_id: 'pm_test', amount: 300, slug: 'acme' }

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('topUpCredits captcha gate', () => {
  it('throws on a missing token when captcha is enabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_HCAPTCHA_ENABLED', 'true')

    await expect(topUpCredits({ ...baseVars, hcaptchaToken: null })).rejects.toThrow(
      'Captcha not submitted'
    )
    expect(postMock).not.toHaveBeenCalled()
  })

  it('proceeds without a token when captcha is disabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_HCAPTCHA_ENABLED', 'false')
    postMock.mockResolvedValue({ data: { status: 'succeeded' }, error: null })

    await topUpCredits({ ...baseVars, hcaptchaToken: null })

    expect(postMock).toHaveBeenCalledOnce()
  })
})
