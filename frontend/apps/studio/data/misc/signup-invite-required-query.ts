import { useQuery } from '@tanstack/react-query'

import { miscKeys } from './keys'
import { fetchGet } from '@/data/fetchers'
import { API_URL, IS_PLATFORM } from '@/lib/constants'
import { ResponseError, type UseCustomQueryOptions } from '@/types'

// The sign-up page waits on this answer before showing anything, so a slow or
// hanging platform API must not hold it hostage: give up after this long and
// fall back to the regular sign-up page (the server still enforces invites).
export const SIGN_UP_INVITE_REQUIRED_TIMEOUT_MS = 8_000

export type SignUpInviteRequiredResponse = { required: boolean }

/**
 * Asks the platform API whether new accounts currently need an invite code.
 * Unauthenticated, and not part of the generated OpenAPI types.
 */
export async function getSignUpInviteRequired(): Promise<SignUpInviteRequiredResponse> {
  const result = await fetchGet<SignUpInviteRequiredResponse>(
    `${API_URL}/platform/signup/invite/required`,
    { abortSignal: AbortSignal.timeout(SIGN_UP_INVITE_REQUIRED_TIMEOUT_MS) }
  )

  if (result instanceof ResponseError) throw result
  return { required: result?.required === true }
}

export type SignUpInviteRequiredData = Awaited<ReturnType<typeof getSignUpInviteRequired>>
export type SignUpInviteRequiredError = ResponseError

export const useSignUpInviteRequiredQuery = <TData = SignUpInviteRequiredData>({
  enabled = true,
  ...options
}: UseCustomQueryOptions<SignUpInviteRequiredData, SignUpInviteRequiredError, TData> = {}) =>
  useQuery<SignUpInviteRequiredData, SignUpInviteRequiredError, TData>({
    queryKey: miscKeys.signUpInviteRequired(),
    queryFn: () => getSignUpInviteRequired(),
    // Only the hosted platform has invite-gated sign-up.
    enabled: enabled && IS_PLATFORM,
    // A failure falls back to the regular sign-up page, so fail fast rather than
    // keeping the page in its loading state through several retries.
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
    ...options,
  })
