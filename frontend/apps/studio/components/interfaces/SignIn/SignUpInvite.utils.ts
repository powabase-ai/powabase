/**
 * What the sign-up page shows:
 * - `loading`: still asking the platform API whether an invite code is needed
 * - `invite-code`: only the invite code step (no email form, no Google button)
 * - `sign-up`: the regular sign-up page
 */
export type SignUpInviteStep = 'loading' | 'invite-code' | 'sign-up'

/**
 * Set once the invite code step is done. `code` is the accepted code, or
 * undefined when the platform API said no code is needed after all.
 */
export type SignUpInviteAcceptance = { code?: string }

export const INVITE_CODE_INVALID_MESSAGE =
  "That invite code isn't valid. Please check it and try again."
export const INVITE_CODE_RATE_LIMITED_MESSAGE =
  'Too many attempts. Please wait a few minutes and try again.'
export const INVITE_CODE_CHECK_FAILED_MESSAGE =
  "We couldn't check your invite code right now. Please try again."

export function getSignUpInviteStep({
  isPlatform,
  isLoading,
  required,
  acceptance,
}: {
  isPlatform: boolean
  isLoading: boolean
  /** `required` from the platform API; undefined while loading or when the check failed. */
  required: boolean | undefined
  acceptance: SignUpInviteAcceptance | null
}): SignUpInviteStep {
  if (!isPlatform) return 'sign-up'
  if (acceptance !== null) return 'sign-up'
  if (isLoading) return 'loading'
  // Fail open: anything but an explicit `required: true` shows the regular page.
  // The server enforces invite codes on its own.
  return required === true ? 'invite-code' : 'sign-up'
}

export function getInviteCodeErrorMessage(error: { code?: number } | null | undefined): string {
  return error?.code === 429 ? INVITE_CODE_RATE_LIMITED_MESSAGE : INVITE_CODE_CHECK_FAILED_MESSAGE
}
