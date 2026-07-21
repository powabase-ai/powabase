import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import { captureCriticalError } from '@/lib/error-reporting'
import { auth } from '@/lib/gotrue'
import { ResponseError, type UseCustomMutationOptions } from '@/types'

export type SignUpVariables = {
  email: string
  password: string
  hcaptchaToken: string | null
  redirectTo?: string
}

export async function signup({ email, password, hcaptchaToken, redirectTo }: SignUpVariables) {
  const { data, error } = await auth.signUp({
    email,
    password,
    options: {
      captchaToken: hcaptchaToken ?? undefined,
      emailRedirectTo: redirectTo,
    },
  })

  if (error) throw new ResponseError(error.message, error.status ?? 400)
  return data
}

type SignUpData = Awaited<ReturnType<typeof signup>>

export const useSignUpMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<SignUpData, ResponseError, SignUpVariables>,
  'mutationFn'
> = {}) => {
  return useMutation<SignUpData, ResponseError, SignUpVariables>({
    mutationFn: (vars) => signup(vars),
    async onSuccess(data, variables, context) {
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to sign up: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
      captureCriticalError(data, 'sign up')
    },
    ...options,
  })
}
