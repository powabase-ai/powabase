import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createMocks } from 'node-mocks-http'

vi.mock('@/lib/api/apiWrapper', () => ({
  default: (req: any, res: any, handler: any) => handler(req, res),
}))

beforeEach(() => {
  global.fetch = vi.fn() as any
  process.env.API_URL = 'http://cp-backend.test/api'
})

describe('POST /api/platform/organizations/[slug]/billing/portal-session proxy', () => {
  it('forwards POST body + slug to CP backend and returns the Portal URL', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ url: 'https://billing.stripe.com/p/session/xyz' }),
    })
    const handler = (await import(
      '@/pages/api/platform/organizations/[slug]/billing/portal-session'
    )).default
    const { req, res } = createMocks({
      method: 'POST',
      query: { slug: 'my-org' },
      body: { return_url: '/org/my-org/billing' },
      headers: { authorization: 'Bearer test-token' },
    })
    await handler(req as any, res as any)
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (global.fetch as any).mock.calls[0]
    expect(url).toContain('/platform/organizations/my-org/billing/portal-session')
    expect(init.method).toBe('POST')
    expect(res._getStatusCode()).toBe(200)
    expect(JSON.parse(res._getData())).toEqual({ url: 'https://billing.stripe.com/p/session/xyz' })
  })

  it('returns 405 for non-POST methods', async () => {
    const handler = (await import(
      '@/pages/api/platform/organizations/[slug]/billing/portal-session'
    )).default
    const { req, res } = createMocks({ method: 'GET', query: { slug: 'my-org' } })
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(405)
  })
})
