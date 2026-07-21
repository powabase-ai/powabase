import { describe, it, expect, vi } from 'vitest'

import { handle402Response } from '@/lib/credits/402-handler'

describe('handle402Response', () => {
  it('renders detailed copy when 402 body has renews_at', () => {
    const showToast = vi.fn()
    handle402Response(
      {
        status: 402,
        json: () => Promise.resolve({
          error: 'insufficient_credits',
          balance: 0,
          estimated_cost: 5,
          renews_at: '2026-06-01T00:00:00+00:00',
        }),
      } as unknown as Response,
      showToast,
    )
    return Promise.resolve().then(() => {
      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Free tier resets on 2026-06-01'),
        }),
      )
    })
  })

  it('falls back to generic copy when body is non-JSON (deploy-ordering window)', async () => {
    const showToast = vi.fn()
    await handle402Response(
      {
        status: 402,
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
      } as unknown as Response,
      showToast,
    )
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Free tier resets at the start of each month'),
      }),
    )
  })

  it('falls back to generic copy when body lacks renews_at', async () => {
    const showToast = vi.fn()
    await handle402Response(
      {
        status: 402,
        json: () => Promise.resolve({ error: 'insufficient_credits' }),
      } as unknown as Response,
      showToast,
    )
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('resets at the start of each month'),
      }),
    )
  })
})
