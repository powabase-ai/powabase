import { beforeEach, describe, expect, it, vi } from 'vitest'

import { validateSignUpInvite } from './signup-invite-validate-mutation'
import { API_URL } from '@/lib/constants'
import { ResponseError } from '@/types'

const { fetchPostMock } = vi.hoisted(() => ({
  fetchPostMock: vi.fn(),
}))

vi.mock('@/data/fetchers', () => ({
  fetchPost: fetchPostMock,
}))

describe('validateSignUpInvite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('POSTs the trimmed code to the platform API validate endpoint', async () => {
    fetchPostMock.mockResolvedValue({ valid: true, required: true })

    await expect(validateSignUpInvite({ code: '  ABC-123  ' })).resolves.toEqual({
      valid: true,
      required: true,
    })

    expect(fetchPostMock).toHaveBeenCalledWith(
      `${API_URL}/platform/signup/invite/validate`,
      { code: 'ABC-123' },
      { credentials: 'include' }
    )
  })

  it('passes a rejection through as valid: false', async () => {
    fetchPostMock.mockResolvedValue({ valid: false, required: true })

    await expect(validateSignUpInvite({ code: 'nope' })).resolves.toEqual({
      valid: false,
      required: true,
    })
  })

  it('reports required: false only when the platform API says so', async () => {
    fetchPostMock.mockResolvedValue({ valid: false, required: false })
    await expect(validateSignUpInvite({ code: 'x' })).resolves.toEqual({
      valid: false,
      required: false,
    })

    fetchPostMock.mockResolvedValue({ valid: false })
    await expect(validateSignUpInvite({ code: 'x' })).resolves.toEqual({
      valid: false,
      required: true,
    })
  })

  it('throws the ResponseError (keeping its 429 status) when rate limited', async () => {
    fetchPostMock.mockResolvedValue(new ResponseError('rate limited', 429))

    await expect(validateSignUpInvite({ code: 'x' })).rejects.toMatchObject({
      code: 429,
    })
  })
})
