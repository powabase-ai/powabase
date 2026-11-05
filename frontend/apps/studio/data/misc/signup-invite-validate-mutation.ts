import { useMutation, type UseMutationOptions } from '@tanstack/react-query'

import { fetchPost } from '@/data/fetchers'
import { API_URL } from '@/lib/constants'
import { ResponseError } from '@/types'

export type SignUpInviteValidateVariables = {
  code: string
}

export type SignUpInviteValidateResponse = {
  /** Whether the code was accepted. A rejection deliberately carries no reason. */
  valid: boolean
  /** Whether sign-up currently needs an invite code at all. */
  required: boolean
}

/**
 * Checks an invite code with the platform API. Unauthenticated, and not part of
 * the generated OpenAPI types. Rate limiting surfaces as a thrown ResponseError
 * with code 429.
 */
export async function validateSignUpInvite({
  code,
}: SignUpInviteValidateVariables): Promise<SignUpInviteValidateResponse> {
  const result = await fetchPost<SignUpInviteValidateResponse>(
    `${API_URL}/platform/signup/invite/validate`,
    { code: code.trim() },
    // An accepted code also lets a provider (e.g. Google) sign-up from this browser
    // through for a short while; the server decides that, nothing is stored here.
    // Same credentials mode as the shared platform API client.
    { credentials: 'include' }
  )

  if (result instanceof ResponseError) throw result
  return { valid: result?.valid === true, required: result?.required !== false }
}

type SignUpInviteValidateData = Awaited<ReturnType<typeof validateSignUpInvite>>

export const useSignUpInviteValidateMutation = (
  options: Omit<
    UseMutationOptions<SignUpInviteValidateData, ResponseError, SignUpInviteValidateVariables>,
    'mutationFn'
  > = {}
) =>
  useMutation<SignUpInviteValidateData, ResponseError, SignUpInviteValidateVariables>({
    mutationFn: (vars) => validateSignUpInvite(vars),
    ...options,
  })
