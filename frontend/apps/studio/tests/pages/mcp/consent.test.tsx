import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import McpConsentPage from '@/pages/mcp/consent'

const replace = vi.fn()
vi.mock('next/router', () => ({
  useRouter: () => ({ isReady: true, query: { authorization_id: 'auth-123' }, replace }),
}))
const getAccessToken = vi.fn()
vi.mock('common', () => ({ getAccessToken: () => getAccessToken() }))

const DETAILS = {
  authorization_id: 'auth-123',
  redirect_uri: 'cursor://callback',
  client: { id: 'c1', name: 'Cursor', uri: '', logo_uri: '' },
  user: { id: 'u1', email: 'dev@example.com' },
  scope: 'openid email',
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_GOTRUE_URL', 'https://app.powabase.ai/auth/v1')
  replace.mockReset(); getAccessToken.mockReset()
  ;(globalThis as any).fetch = vi.fn()
  ;(window as any).location = { href: '' }
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('McpConsentPage', () => {
  it('redirects to sign-in when not authenticated', async () => {
    getAccessToken.mockResolvedValue(undefined)
    render(<McpConsentPage />)
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/sign-in?returnTo=%2Fmcp%2Fconsent%3Fauthorization_id%3Dauth-123')
    )
  })

  it('shows the client name + scope, then POSTs the exact approve contract', async () => {
    getAccessToken.mockResolvedValue('tok-abc')
    ;(globalThis.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => DETAILS })               // GET details
      .mockResolvedValueOnce({ ok: true, json: async () => ({ redirect_url: 'cursor://callback?code=xyz&state=s' }) }) // POST consent
    render(<McpConsentPage />)
    await screen.findByText('Cursor')
    expect(screen.getByText(/openid email/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /approve/i }))

    await waitFor(() => {
      const [url, opts] = (globalThis.fetch as any).mock.calls[1]
      expect(url).toBe('https://app.powabase.ai/auth/v1/oauth/authorizations/auth-123/consent')
      expect(opts.method).toBe('POST')
      expect(JSON.parse(opts.body)).toEqual({ action: 'approve' })
      expect(opts.headers.Authorization).toBe('Bearer tok-abc')
      expect(window.location.href).toBe('cursor://callback?code=xyz&state=s')
    })
  })

  it('POSTs deny when the Deny button is clicked', async () => {
    getAccessToken.mockResolvedValue('tok-abc')
    ;(globalThis.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => DETAILS })               // GET details
      .mockResolvedValueOnce({ ok: true, json: async () => ({ redirect_url: 'cursor://callback?error=access_denied' }) }) // POST consent
    render(<McpConsentPage />)
    await screen.findByText('Cursor')

    fireEvent.click(screen.getByRole('button', { name: /deny/i }))

    await waitFor(() => {
      const [url, opts] = (globalThis.fetch as any).mock.calls[1]
      expect(url).toBe('https://app.powabase.ai/auth/v1/oauth/authorizations/auth-123/consent')
      expect(opts.method).toBe('POST')
      expect(JSON.parse(opts.body)).toEqual({ action: 'deny' })
    })
  })

  it('surfaces an error instead of wedging on "Loading…" when the details fetch throws', async () => {
    getAccessToken.mockResolvedValue('tok-abc')
    ;(globalThis.fetch as any).mockRejectedValueOnce(new TypeError('Failed to fetch')) // GET details rejects (network/CORS)
    render(<McpConsentPage />)
    expect(await screen.findByText(/could not reach Powabase/i)).toBeInTheDocument()
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
  })

  // GET /oauth/authorizations/:id is polymorphic. When a stored consent already
  // covers the requested scopes the server approves the request itself and answers
  // with { redirect_url } — HTTP 200, no `client` key — rather than the details
  // body. The decision is already made by then, so the only correct move is to
  // follow the redirect; rendering a consent screen would be asking about
  // something that has already happened.
  it('follows redirect_url when the server auto-approves instead of returning details', async () => {
    getAccessToken.mockResolvedValue('tok-abc')
    ;(globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ redirect_url: 'cursor://callback?code=xyz&state=s' }),
    })
    render(<McpConsentPage />)
    await waitFor(() => expect(window.location.href).toBe('cursor://callback?code=xyz&state=s'))
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument()
    // Exactly one call: no consent POST, because the server already decided.
    expect((globalThis.fetch as any).mock.calls).toHaveLength(1)
  })

  it('surfaces an error instead of crashing when the details body matches neither shape', async () => {
    getAccessToken.mockResolvedValue('tok-abc')
    ;(globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ authorization_id: 'auth-123' }), // no `client`, no `redirect_url`
    })
    render(<McpConsentPage />)
    expect(await screen.findByText(/could not be displayed/i)).toBeInTheDocument()
  })
})
