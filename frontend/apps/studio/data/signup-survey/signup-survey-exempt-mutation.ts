import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { handleError, post } from '@/data/fetchers'
import type { ResponseError, UseCustomMutationOptions } from '@/types'
import { signupSurveyKeys } from './keys'

export async function markSignupSurveyExempt() {
  const { data, error } = await post('/platform/signup-survey/exempt', { body: {} })
  if (error) handleError(error)
  return data
}

type SignupSurveyExemptData = Awaited<ReturnType<typeof markSignupSurveyExempt>>

export const useSignupSurveyExemptMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<SignupSurveyExemptData, ResponseError, void>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: markSignupSurveyExempt,
    ...options,
    onSuccess(data, vars, ctx) {
      queryClient.invalidateQueries({ queryKey: signupSurveyKeys.me() })
      onSuccess?.(data, vars, ctx)
    },
    onError(error, vars, ctx) {
      if (onError) {
        onError(error, vars, ctx)
      } else {
        toast.error(
          `Failed to mark survey as exempt: ${error?.message ?? 'unknown error'}. Please reload.`
        )
      }
    },
  })
}
