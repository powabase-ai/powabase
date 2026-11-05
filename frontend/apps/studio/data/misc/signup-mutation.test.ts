import { beforeEach, describe, expect, it, vi } from 'vitest'

import { signup } from './signup-mutation'
import { ResponseError } from '@/types'

const { signUpMock } = vi.hoisted(() => ({
  signUpMock: vi.fn(),
}))

vi.mock('@/lib/gotrue', () => ({
  auth: {
    signUp: signUpMock,
  },
}))

// error-reporting pulls in @sentry/nextjs — stub it out.
vi.mock('@/lib/error-reporting', () => ({
  captureCriticalError: vi.fn(),
}))

describe('signup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    signUpMock.mockResolvedValue({ data: { user: null, session: null }, error: null })
  })

  it('does not send any user metadata without an invite code', async () => {
    await signup({
      email: 'user@example.com',
      password: 'Secret123!',
      hcaptchaToken: 'captcha-123',
      redirectTo: 'https://example.com/sign-in',
    })

    expect(signUpMock).toHaveBeenCalledTimes(1)
    const args = signUpMock.mock.calls[0][0]
    expect(args).toEqual({
      email: 'user@example.com',
      password: 'Secret123!',
      options: {
        captchaToken: 'captcha-123',
        emailRedirectTo: 'https://example.com/sign-in',
      },
    })
    expect(args.options).not.toHaveProperty('data')
  })

  it('sends the trimmed invite code as user metadata, keeping the other options', async () => {
    await signup({
      email: 'user@example.com',
      password: 'Secret123!',
      hcaptchaToken: null,
      redirectTo: 'https://example.com/sign-in',
      inviteCode: '  ABC-123 ',
    })

    expect(signUpMock).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'Secret123!',
      options: {
        captchaToken: undefined,
        emailRedirectTo: 'https://example.com/sign-in',
        data: { invite_code: 'ABC-123' },
      },
    })
  })

  it('ignores a blank invite code', async () => {
    await signup({
      email: 'user@example.com',
      password: 'Secret123!',
      hcaptchaToken: null,
      inviteCode: '   ',
    })

    expect(signUpMock.mock.calls[0][0].options).not.toHaveProperty('data')
  })

  it('throws the server message as a ResponseError when sign-up is rejected', async () => {
    // e.g. the server refusing a sign-up without a valid invite code
    signUpMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Rejected by the server', status: 403 },
    })

    const promise = signup({
      email: 'user@example.com',
      password: 'Secret123!',
      hcaptchaToken: null,
      inviteCode: 'ABC-123',
    })

    await expect(promise).rejects.toBeInstanceOf(ResponseError)
    await expect(promise).rejects.toMatchObject({ message: 'Rejected by the server', code: 403 })
  })
})
