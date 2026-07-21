import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resetPassword } from './reset-password-mutation'
import { ResponseError } from '@/types'

const { resetPasswordForEmailMock } = vi.hoisted(() => ({
  resetPasswordForEmailMock: vi.fn(),
}))

vi.mock('@/lib/gotrue', () => ({
  auth: {
    resetPasswordForEmail: resetPasswordForEmailMock,
  },
}))

// error-reporting pulls in @sentry/nextjs — stub it out.
vi.mock('@/lib/error-reporting', () => ({
  captureCriticalError: vi.fn(),
}))

describe('resetPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls GoTrue resetPasswordForEmail with the captcha token and redirect, not a backend route', async () => {
    resetPasswordForEmailMock.mockResolvedValue({ data: {}, error: null })

    await resetPassword({
      email: 'user@example.com',
      hcaptchaToken: 'captcha-123',
      redirectTo: 'https://app.powabase.ai/reset-password',
    })

    expect(resetPasswordForEmailMock).toHaveBeenCalledWith('user@example.com', {
      captchaToken: 'captcha-123',
      redirectTo: 'https://app.powabase.ai/reset-password',
    })
  })

  it('passes undefined captchaToken when none is provided', async () => {
    resetPasswordForEmailMock.mockResolvedValue({ data: {}, error: null })

    await resetPassword({
      email: 'user@example.com',
      hcaptchaToken: null,
      redirectTo: 'https://app.powabase.ai/reset-password',
    })

    expect(resetPasswordForEmailMock).toHaveBeenCalledWith('user@example.com', {
      captchaToken: undefined,
      redirectTo: 'https://app.powabase.ai/reset-password',
    })
  })

  it('throws a ResponseError when GoTrue returns an error', async () => {
    resetPasswordForEmailMock.mockResolvedValue({
      data: null,
      error: { message: 'rate limit exceeded', status: 429 },
    })

    await expect(
      resetPassword({
        email: 'user@example.com',
        hcaptchaToken: null,
        redirectTo: 'https://app.powabase.ai/reset-password',
      })
    ).rejects.toBeInstanceOf(ResponseError)
  })
})
