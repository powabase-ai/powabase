import { AuthClient, AuthImplicitGrantRedirectError } from '@supabase/auth-js'
import { waitFor } from '@testing-library/react'
import mockRouter from 'next-router-mock'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import SignInMfaPage from '@/pages/sign-in-mfa'
import { customRender } from '@/tests/lib/custom-render'

const { initializeMock, toastErrorMock } = vi.hoisted(() => ({
  initializeMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))

vi.mock('@/lib/gotrue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/gotrue')>()),
  auth: { initialize: initializeMock },
}))

vi.mock('sonner', () => ({
  toast: { error: toastErrorMock, success: vi.fn() },
}))

vi.mock('@/components/interfaces/SignIn/SignInMfaForm', () => ({
  SignInMfaForm: () => <div>SignInMfaForm</div>,
}))

vi.mock('@/components/layouts/SignInLayout/SignInLayout', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

// What the auth server appends to the redirect when it refuses a provider sign-in:
// form-encoded query ('+' for spaces), repeated in the fragment.
const PROVIDER_ERROR_SEARCH =
  '?error=access_denied&error_code=&error_description=Not+allowed%2C+sorry.&method=google'
const PROVIDER_ERROR_HASH =
  '#error=access_denied&error_code=&error_description=Not+allowed%2C+sorry.'

describe('/sign-in-mfa after a failed provider sign-in', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('the auth client reads the error description from the URL as readable text', async () => {
    window.history.replaceState(
      null,
      '',
      `/sign-in-mfa${PROVIDER_ERROR_SEARCH}${PROVIDER_ERROR_HASH}`
    )
    const client = new AuthClient({
      url: 'http://localhost:9999',
      storageKey: 'sign-in-mfa-test',
      detectSessionInUrl: true,
      autoRefreshToken: false,
      persistSession: false,
    })

    const { error } = await client.initialize()

    expect(error?.message).toBe('Not allowed, sorry.')
  })

  it('shows the error, offers sign-up, and returns to /sign-in without the stale error params', async () => {
    mockRouter.setCurrentUrl(`/sign-in-mfa${PROVIDER_ERROR_SEARCH}`)
    initializeMock.mockResolvedValue({
      error: new AuthImplicitGrantRedirectError('Not allowed, sorry.', {
        error: 'access_denied',
        code: 'unspecified_code',
      }),
    })

    customRender(<SignInMfaPage dehydratedState={{}} />)

    await waitFor(() => expect(mockRouter.pathname).toBe('/sign-in'))
    expect(mockRouter.query).toEqual({ method: 'google' })

    expect(toastErrorMock).toHaveBeenCalledTimes(1)
    const [message, options] = toastErrorMock.mock.calls[0]
    expect(message).toBe('Failed to sign in: Not allowed, sorry.')
    expect(options.action.label).toBe('Go to sign up')

    options.action.onClick()
    await waitFor(() => expect(mockRouter.pathname).toBe('/sign-up'))
  })

  it('does not offer sign-up for other sign-in errors', async () => {
    mockRouter.setCurrentUrl('/sign-in-mfa?error=server_error&error_description=Boom&method=google')
    initializeMock.mockResolvedValue({
      error: new AuthImplicitGrantRedirectError('Boom', {
        error: 'server_error',
        code: 'unspecified_code',
      }),
    })

    customRender(<SignInMfaPage dehydratedState={{}} />)

    await waitFor(() => expect(mockRouter.pathname).toBe('/sign-in'))
    expect(toastErrorMock).toHaveBeenCalledWith('Failed to sign in: Boom', undefined)
  })
})
