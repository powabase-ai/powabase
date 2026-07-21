import { afterEach, describe, expect, it, vi } from 'vitest'

import { executeCaptcha, isHCaptchaEnabled } from './hcaptcha'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('isHCaptchaEnabled', () => {
  it('returns true only when the flag is exactly "true"', () => {
    vi.stubEnv('NEXT_PUBLIC_HCAPTCHA_ENABLED', 'true')
    expect(isHCaptchaEnabled()).toBe(true)
  })

  it('defaults to false when the flag is empty/unset', () => {
    vi.stubEnv('NEXT_PUBLIC_HCAPTCHA_ENABLED', '')
    expect(isHCaptchaEnabled()).toBe(false)
  })

  it('returns false for any non-"true" value', () => {
    vi.stubEnv('NEXT_PUBLIC_HCAPTCHA_ENABLED', 'false')
    expect(isHCaptchaEnabled()).toBe(false)
  })
})

describe('executeCaptcha', () => {
  it('skips .execute() and returns null when captcha is disabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_HCAPTCHA_ENABLED', 'false')
    const execute = vi.fn()

    const token = await executeCaptcha({ current: { execute } as any })

    expect(token).toBeNull()
    expect(execute).not.toHaveBeenCalled()
  })

  it('runs the invisible challenge and returns its token when enabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_HCAPTCHA_ENABLED', 'true')
    const execute = vi.fn().mockResolvedValue({ response: 'tok-123' })

    const token = await executeCaptcha({ current: { execute } as any })

    expect(execute).toHaveBeenCalledWith({ async: true })
    expect(token).toBe('tok-123')
  })

  it('returns null when enabled but the widget ref is not mounted', async () => {
    vi.stubEnv('NEXT_PUBLIC_HCAPTCHA_ENABLED', 'true')

    const token = await executeCaptcha({ current: null })

    expect(token).toBeNull()
  })
})
