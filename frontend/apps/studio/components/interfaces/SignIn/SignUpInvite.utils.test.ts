import { describe, expect, it } from 'vitest'

import {
  getInviteCodeErrorMessage,
  getSignUpInviteStep,
  INVITE_CODE_CHECK_FAILED_MESSAGE,
  INVITE_CODE_RATE_LIMITED_MESSAGE,
} from './SignUpInvite.utils'

describe('getSignUpInviteStep', () => {
  const base = { isPlatform: true, isLoading: false, required: undefined, acceptance: null }

  it('always shows the regular page outside the hosted platform', () => {
    expect(getSignUpInviteStep({ ...base, isPlatform: false, required: true })).toBe('sign-up')
    expect(getSignUpInviteStep({ ...base, isPlatform: false, isLoading: true })).toBe('sign-up')
  })

  it('waits while the platform API is being asked', () => {
    expect(getSignUpInviteStep({ ...base, isLoading: true })).toBe('loading')
  })

  it('asks for an invite code only when the platform API requires one', () => {
    expect(getSignUpInviteStep({ ...base, required: true })).toBe('invite-code')
    expect(getSignUpInviteStep({ ...base, required: false })).toBe('sign-up')
  })

  it('falls back to the regular page when the check failed', () => {
    expect(getSignUpInviteStep({ ...base, required: undefined })).toBe('sign-up')
  })

  it('shows the regular page once the invite step is done', () => {
    expect(getSignUpInviteStep({ ...base, required: true, acceptance: { code: 'ABC' } })).toBe(
      'sign-up'
    )
    expect(getSignUpInviteStep({ ...base, required: true, acceptance: {} })).toBe('sign-up')
  })
})

describe('getInviteCodeErrorMessage', () => {
  it('tells the user to wait when rate limited', () => {
    expect(getInviteCodeErrorMessage({ code: 429 })).toBe(INVITE_CODE_RATE_LIMITED_MESSAGE)
  })

  it('falls back to a generic message otherwise', () => {
    expect(getInviteCodeErrorMessage({ code: 500 })).toBe(INVITE_CODE_CHECK_FAILED_MESSAGE)
    expect(getInviteCodeErrorMessage(undefined)).toBe(INVITE_CODE_CHECK_FAILED_MESSAGE)
  })
})
