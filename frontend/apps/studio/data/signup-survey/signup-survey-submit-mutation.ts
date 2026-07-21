import { useMutation, useQueryClient } from '@tanstack/react-query'

import { handleError, post } from '@/data/fetchers'
import type { ResponseError, UseCustomMutationOptions } from '@/types'
import type {
  SignupSurveySubmitRequest,
  SignupSurveySubmitResponse,
} from '@/types/signup-survey'
import { signupSurveyKeys } from './keys'

export class SurveyVersionStaleError extends Error {
  expected: string
  constructor(expected: string) {
    super(`Survey version stale; expected ${expected}`)
    this.expected = expected
    this.name = 'SurveyVersionStaleError'
  }
}

export async function submitSignupSurvey(body: SignupSurveySubmitRequest) {
  const { data, error } = await post('/platform/signup-survey/responses', { body })
  if (error) {
    // The CP returns 409 with body { error: 'survey_version_stale', expected: '...' }
    // when the client's cached schema is out of date. Inspect the error before
    // delegating to handleError (which throws a generic ResponseError).
    const errAny = error as unknown as Record<string, unknown>
    if (errAny?.error === 'survey_version_stale') {
      const expected = (errAny?.expected as string) ?? ''
      throw new SurveyVersionStaleError(expected)
    }
    handleError(error)
  }
  return data as SignupSurveySubmitResponse
}

type SignupSurveySubmitData = Awaited<ReturnType<typeof submitSignupSurvey>>

export const useSignupSurveySubmitMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<
    SignupSurveySubmitData,
    ResponseError | SurveyVersionStaleError,
    SignupSurveySubmitRequest
  >,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: submitSignupSurvey,
    ...options,
    onSuccess(data, vars, ctx) {
      queryClient.invalidateQueries({ queryKey: signupSurveyKeys.me() })
      onSuccess?.(data, vars, ctx)
    },
    onError(error, vars, ctx) {
      onError?.(error, vars, ctx)
    },
  })
}
