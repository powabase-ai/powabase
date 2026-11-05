import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  INVITE_CODE_INVALID_MESSAGE,
  INVITE_CODE_RATE_LIMITED_MESSAGE,
} from '@/components/interfaces/SignIn/SignUpInvite.utils'
import SignUpPage from '@/pages/sign-up'
import { customRender } from '@/tests/lib/custom-render'
import { ResponseError } from '@/types'

const { fetchGetMock, fetchPostMock, mockIsPlatform, mockGoogleEnabled } = vi.hoisted(() => ({
  fetchGetMock: vi.fn(),
  fetchPostMock: vi.fn(),
  mockIsPlatform: { value: true },
  mockGoogleEnabled: { value: true },
}))

vi.mock('@/data/fetchers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/fetchers')>()),
  fetchGet: fetchGetMock,
  fetchPost: fetchPostMock,
}))

vi.mock('@/lib/constants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/constants')>()
  return {
    ...actual,
    get IS_PLATFORM() {
      return mockIsPlatform.value
    },
  }
})

vi.mock('@/lib/google-auth', () => ({
  isGoogleAuthEnabled: () => mockGoogleEnabled.value,
}))

vi.mock('@/hooks/misc/useIsFeatureEnabled', () => ({
  useIsFeatureEnabled: () => ({
    dashboardAuthSignUp: true,
    dashboardAuthSignInWithGithub: false,
  }),
}))

vi.mock('@/components/interfaces/SignIn/SignInWithGoogle', () => ({
  SignInWithGoogle: () => <button>Continue with Google</button>,
}))

vi.mock('@/components/interfaces/SignIn/SignUpForm', () => ({
  SignUpForm: ({ inviteCode }: { inviteCode?: string }) => (
    <div data-testid="sign-up-form">{inviteCode ?? 'no invite code'}</div>
  ),
}))

const renderPage = (search = '') =>
  customRender(<SignUpPage dehydratedState={{}} />, { nuqs: { searchParams: search } })

const expectRegularPage = async () => {
  expect(await screen.findByTestId('sign-up-form')).toHaveTextContent('no invite code')
  expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
  expect(screen.queryByLabelText('Invite code')).not.toBeInTheDocument()
}

// The shared Button does not trigger an implicit submit under jsdom, so submit the
// form directly (same approach as other form tests in this app).
const submitInviteCode = async () => {
  const input = await screen.findByLabelText('Invite code')
  fireEvent.submit(input.closest('form') as HTMLFormElement)
}

const expectOnlyInviteStep = () => {
  expect(screen.getByLabelText('Invite code')).toBeInTheDocument()
  expect(screen.queryByTestId('sign-up-form')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument()
}

describe('/sign-up invite code step', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsPlatform.value = true
    mockGoogleEnabled.value = true
  })

  it('outside the hosted platform, shows the regular page without asking the platform API', async () => {
    mockIsPlatform.value = false

    renderPage()

    await expectRegularPage()
    expect(fetchGetMock).not.toHaveBeenCalled()
  })

  it('shows the regular page when invite codes are not required', async () => {
    fetchGetMock.mockResolvedValue({ required: false })

    renderPage()

    await expectRegularPage()
  })

  it('falls back to the regular page when the check fails', async () => {
    fetchGetMock.mockResolvedValue(new ResponseError('unavailable', 503))

    renderPage()

    await expectRegularPage()
  })

  it('shows neither the form nor the Google button while checking', async () => {
    fetchGetMock.mockReturnValue(new Promise(() => {}))

    renderPage()

    await waitFor(() => expect(fetchGetMock).toHaveBeenCalled())
    expect(screen.queryByTestId('sign-up-form')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Invite code')).not.toBeInTheDocument()
  })

  it('in invite mode, shows only the invite code step until a code is accepted', async () => {
    fetchGetMock.mockResolvedValue({ required: true })
    fetchPostMock.mockResolvedValue({ valid: true, required: true })
    const user = userEvent.setup()

    renderPage()

    await screen.findByLabelText('Invite code')
    expectOnlyInviteStep()

    await user.type(screen.getByLabelText('Invite code'), '  ABC-123 ')
    await submitInviteCode()

    expect(await screen.findByTestId('sign-up-form')).toHaveTextContent('ABC-123')
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Invite code')).not.toBeInTheDocument()
    expect(fetchPostMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/platform\/signup\/invite\/validate$/),
      { code: 'ABC-123' },
      expect.anything()
    )
  })

  it('prefills the code from the ?invite= link', async () => {
    fetchGetMock.mockResolvedValue({ required: true })

    renderPage('?invite=FROM-LINK')

    expect(await screen.findByLabelText('Invite code')).toHaveValue('FROM-LINK')
  })

  it('keeps the Google button hidden after acceptance when Google sign-in is off', async () => {
    mockGoogleEnabled.value = false
    fetchGetMock.mockResolvedValue({ required: true })
    fetchPostMock.mockResolvedValue({ valid: true, required: true })

    renderPage('?invite=ABC')

    await submitInviteCode()

    expect(await screen.findByTestId('sign-up-form')).toHaveTextContent('ABC')
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument()
  })

  it('shows a generic message for a rejected code and stays on the invite step', async () => {
    fetchGetMock.mockResolvedValue({ required: true })
    fetchPostMock.mockResolvedValue({ valid: false, required: true })

    renderPage('?invite=WRONG')

    await submitInviteCode()

    expect(await screen.findByText(INVITE_CODE_INVALID_MESSAGE)).toBeInTheDocument()
    expectOnlyInviteStep()
  })

  it('asks the user to wait when rate limited', async () => {
    fetchGetMock.mockResolvedValue({ required: true })
    fetchPostMock.mockResolvedValue(new ResponseError('rate limited', 429))

    renderPage('?invite=ABC')

    await submitInviteCode()

    expect(await screen.findByText(INVITE_CODE_RATE_LIMITED_MESSAGE)).toBeInTheDocument()
    expectOnlyInviteStep()
  })

  it('reveals the regular page without a code when the platform API no longer requires one', async () => {
    fetchGetMock.mockResolvedValue({ required: true })
    fetchPostMock.mockResolvedValue({ valid: false, required: false })

    renderPage('?invite=ABC')

    await submitInviteCode()

    await expectRegularPage()
  })

  it('lets the user go back and use a different code', async () => {
    fetchGetMock.mockResolvedValue({ required: true })
    fetchPostMock.mockResolvedValue({ valid: true, required: true })
    const user = userEvent.setup()

    renderPage('?invite=ABC')

    await submitInviteCode()
    await user.click(await screen.findByRole('button', { name: 'Use a different invite code' }))

    expect(await screen.findByLabelText('Invite code')).toBeInTheDocument()
    expectOnlyInviteStep()
  })
})
