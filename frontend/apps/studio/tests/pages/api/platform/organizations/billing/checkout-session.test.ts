import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createMocks } from 'node-mocks-http'

// Mock apiWrapper to pass through (we test the inner handler logic)
vi.mock('@/lib/api/apiWrapper', () => ({
  default: (req: any, res: any, handler: any) => handler(req, res),
}))

beforeEach(() => {
  global.fetch = vi.fn() as any
  process.env.API_URL = 'http://cp-backend.test/api'
})

describe('POST /api/platform/organizations/[slug]/billing/checkout-session proxy', () => {
  it('forwards POST body + slug to CP backend and returns the URL', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ url: 'https://checkout.stripe.com/c/cs_xyz' }),
    })
    const handler = (await import(
      '@/pages/api/platform/organizations/[slug]/billing/checkout-session'
    )).default
    const { req, res } = createMocks({
      method: 'POST',
      query: { slug: 'my-org' },
      body: { plan_id: 'self-serve', return_url: '/org/my-org/billing' },
      headers: { authorization: 'Bearer test-token' },
    })
    await handler(req as any, res as any)
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (global.fetch as any).mock.calls[0]
    expect(url).toContain('/platform/organizations/my-org/billing/checkout-session')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      plan_id: 'self-serve',
      return_url: '/org/my-org/billing',
    })
    expect(res._getStatusCode()).toBe(200)
    expect(JSON.parse(res._getData())).toEqual({ url: 'https://checkout.stripe.com/c/cs_xyz' })
  })

  it('returns 405 for non-POST methods', async () => {
    const handler = (await import(
      '@/pages/api/platform/organizations/[slug]/billing/checkout-session'
    )).default
    const { req, res } = createMocks({ method: 'GET', query: { slug: 'my-org' } })
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(405)
  })

  it('propagates CP error status when CP returns 4xx', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_plan' }),
    })
    const handler = (await import(
      '@/pages/api/platform/organizations/[slug]/billing/checkout-session'
    )).default
    const { req, res } = createMocks({
      method: 'POST',
      query: { slug: 'my-org' },
      body: { plan_id: 'bogus' },
      headers: { authorization: 'Bearer t' },
    })
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(400)
  })
})
