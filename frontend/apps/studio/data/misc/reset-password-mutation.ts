import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import { captureCriticalError } from '@/lib/error-reporting'
import { auth } from '@/lib/gotrue'
import { ResponseError, type UseCustomMutationOptions } from '@/types'

export type ResetPasswordVariables = {
  email: string
  hcaptchaToken: string | null
  redirectTo: string
}

export async function resetPassword({ email, hcaptchaToken, redirectTo }: ResetPasswordVariables) {
  // Mirror signup-mutation: talk to GoTrue directly rather than a backend route.
  // GoTrue sends the recovery email (6-digit OTP, verified by ForgotPasswordWizard)
  // using the same SMTP relay as signup confirmation.
  const { data, error } = await auth.resetPasswordForEmail(email, {
    captchaToken: hcaptchaToken ?? undefined,
    redirectTo,
  })

  if (error) throw new ResponseError(error.message, error.status ?? 400)
  return data
}

type ResetPasswordData = Awaited<ReturnType<typeof resetPassword>>

export const useResetPasswordMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<ResetPasswordData, ResponseError, ResetPasswordVariables>,
  'mutationFn'
> = {}) => {
  return useMutation<ResetPasswordData, ResponseError, ResetPasswordVariables>({
    mutationFn: (vars) => resetPassword(vars),
    async onSuccess(data, variables, context) {
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to reset password: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
      captureCriticalError(data, 'send reset password email')
    },
    ...options,
  })
}
