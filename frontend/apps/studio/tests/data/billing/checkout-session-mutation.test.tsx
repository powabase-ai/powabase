import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  CheckoutSessionError,
  useCreateCheckoutSessionMutation,
} from '@/data/billing/checkout-session-mutation'

// PR #499 R1 #5a: the mutation now attaches Authorization via constructHeaders.
// Mock the helper so tests don't need a real Supabase session.
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

describe('useCreateCheckoutSessionMutation', () => {
  it('POSTs plan_id + return_url to /billing/checkout-session and returns the url (caller navigates)', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_abc' }),
    })
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const { result } = renderHook(() => useCreateCheckoutSessionMutation(), { wrapper: wrap(client) })

    result.current.mutate({ slug: 'test-org', planId: 'self-serve' })

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    const [url, init] = (global.fetch as any).mock.calls[0]
    // NODE_ENV=test pins API_URL to http://localhost:3000/api (lib/constants:14),
    // so the mutation POSTs to that absolute URL — not the bare /api path the
    // browser build resolves to.
    expect(url).toBe(
      'http://localhost:3000/api/platform/organizations/test-org/billing/checkout-session'
    )
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      plan_id: 'self-serve',
      // CP-2 single owner: FE sends BARE PATH; CP appends ?checkout=success.
      // PR #499 R3: route is /org/<slug>/billing (top-level org page).
      return_url: '/org/test-org/billing',
    })
    // PR #499 R1 #5a counterfactual: revert constructHeaders -> the
    // Authorization header is absent -> CP returns 401 -> mutation throws.
    // With the fix in place, the Headers object carries Authorization.
    const headers = init.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer test-token')
    // Navigation moved to the caller (popup-blocker-safe new-tab handoff); the
    // mutation now RETURNS the url and must NOT touch window.location.
    // Counterfactual: restoring `window.location.href = data.url` in
    // createCheckoutSession fails the window.location assertion below.
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test_abc' })
    expect(window.location.href).toBe('')
  })

  it('honors caller-provided returnUrl', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_x' }),
    })
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const { result } = renderHook(() => useCreateCheckoutSessionMutation(), { wrapper: wrap(client) })
    result.current.mutate({ slug: 'org2', planId: 'scale', returnUrl: '/custom-return' })
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    const [, init] = (global.fetch as any).mock.calls[0]
    expect(JSON.parse(init.body).return_url).toBe('/custom-return')
  })

  it('throws CheckoutSessionError with parsed error_hint on JSON 409', async () => {
    // PR #499 R1 #5b: CP returns structured JSON with error/error_hint/message;
    // mutation must parse these onto the thrown error so onError mapping works.
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({
        error: 'downgrade_via_portal',
        error_hint: 'use_portal_for_downgrade',
        message: 'Use Customer Portal to downgrade.',
      }),
    })
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const { result } = renderHook(() => useCreateCheckoutSessionMutation(), { wrapper: wrap(client) })
    let caught: CheckoutSessionError | null = null
    try {
      await result.current.mutateAsync({ slug: 'org', planId: 'self-serve' })
    } catch (err) {
      caught = err as CheckoutSessionError
    }
    expect(caught).toBeInstanceOf(CheckoutSessionError)
    expect(caught!.status).toBe(409)
    expect(caught!.errorHint).toBe('use_portal_for_downgrade')
    expect(caught!.serverMessage).toBe('Use Customer Portal to downgrade.')
  })

  it('falls back to text body when CP returns non-JSON error', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => {
        throw new Error('not json')
      },
      text: async () => 'invalid plan_id',
      statusText: 'Bad Request',
    })
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const { result } = renderHook(() => useCreateCheckoutSessionMutation(), { wrapper: wrap(client) })
    let caught: CheckoutSessionError | null = null
    try {
      await result.current.mutateAsync({ slug: 'org', planId: 'self-serve' })
    } catch (err) {
      caught = err as CheckoutSessionError
    }
    expect(caught).toBeInstanceOf(CheckoutSessionError)
    expect(caught!.message).toContain('invalid plan_id')
  })
})
