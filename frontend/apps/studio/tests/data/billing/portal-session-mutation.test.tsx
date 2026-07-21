import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  PortalSessionError,
  useCreatePortalSessionMutation,
} from '@/data/billing/portal-session-mutation'

// PR #499 R1 #5a: mock constructHeaders to attach a Bearer header.
vi.mock('@/data/fetchers', async () => {
  const actual = await vi.importActual<any>('@/data/fetchers')
  return {
    ...actual,
    constructHeaders: vi.fn(async (init: HeadersInit | undefined) => {
      const headers = new Headers(init)
      headers.set('Authorization', 'Bearer test-token')
      return headers
    }),
  }
})

const ORIGINAL_LOCATION = window.location
beforeEach(() => {
  global.fetch = vi.fn()
  delete (window as any).location
  ;(window as any).location = { href: '' }
})

afterAll(() => {
  ;(window as any).location = ORIGINAL_LOCATION
})

function wrap(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

describe('useCreatePortalSessionMutation', () => {
  it('POSTs return_url to /billing/portal-session and returns the url (caller navigates)', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: 'https://billing.stripe.com/p/session/x' }),
    })
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const { result } = renderHook(() => useCreatePortalSessionMutation(), { wrapper: wrap(client) })

    result.current.mutate({ slug: 'test-org' })

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    const [url, init] = (global.fetch as any).mock.calls[0]
    // NODE_ENV=test pins API_URL to http://localhost:3000/api (lib/constants:14).
    expect(url).toBe(
      'http://localhost:3000/api/platform/organizations/test-org/billing/portal-session'
    )
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      // PR #499 R3: route is /org/<slug>/billing (top-level org page).
      return_url: '/org/test-org/billing',
    })
    // PR #499 R1 #5a: Authorization header attached via constructHeaders.
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer test-token')
    // Navigation moved to the caller (new-tab handoff); the mutation RETURNS the
    // url and must NOT self-navigate. Counterfactual: restoring
    // `window.location.href = data.url` in createPortalSession fails the
    // window.location assertion below.
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ url: 'https://billing.stripe.com/p/session/x' })
    expect(window.location.href).toBe('')
  })

  it('throws PortalSessionError with parsed error_hint on JSON error', async () => {
    // PR #499 R1 #5b: CP returns structured JSON; carry error_hint through.
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({
        error: 'no_stripe_customer',
        error_hint: 'no_stripe_customer',
        message: 'No Stripe customer for this org yet.',
      }),
    })
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const { result } = renderHook(() => useCreatePortalSessionMutation(), { wrapper: wrap(client) })
    let caught: PortalSessionError | null = null
    try {
      await result.current.mutateAsync({ slug: 'org' })
    } catch (err) {
      caught = err as PortalSessionError
    }
    expect(caught).toBeInstanceOf(PortalSessionError)
    expect(caught!.status).toBe(404)
    expect(caught!.errorHint).toBe('no_stripe_customer')
    expect(caught!.serverMessage).toBe('No Stripe customer for this org yet.')
  })

  it('falls back to text body when CP returns non-JSON error', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => {
        throw new Error('not json')
      },
      text: async () => 'no_stripe_customer',
      statusText: 'Bad Request',
    })
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const { result } = renderHook(() => useCreatePortalSessionMutation(), { wrapper: wrap(client) })
    let caught: PortalSessionError | null = null
    try {
      await result.current.mutateAsync({ slug: 'org' })
    } catch (err) {
      caught = err as PortalSessionError
    }
    expect(caught).toBeInstanceOf(PortalSessionError)
    expect(caught!.message).toContain('no_stripe_customer')
  })
})
