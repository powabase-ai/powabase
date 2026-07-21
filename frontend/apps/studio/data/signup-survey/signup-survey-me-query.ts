import { useQuery, UseQueryOptions } from '@tanstack/react-query'

import { get, handleError } from '@/data/fetchers'
import type { ResponseError } from '@/types'
import type { SignupSurveyMeResponse } from '@/types/signup-survey'
import { signupSurveyKeys } from './keys'

export async function getSignupSurveyMe({ signal }: { signal?: AbortSignal } = {}) {
  const { data, error } = await get('/platform/signup-survey/me', { signal })
  if (error) handleError(error)
  return data as SignupSurveyMeResponse
}

export type SignupSurveyMeData = Awaited<ReturnType<typeof getSignupSurveyMe>>
export type SignupSurveyMeError = ResponseError

export function useSignupSurveyMeQuery(
  options?: Omit<
    UseQueryOptions<SignupSurveyMeData, SignupSurveyMeError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery<SignupSurveyMeData, SignupSurveyMeError>({
    queryKey: signupSurveyKeys.me(),
    queryFn: ({ signal }) => getSignupSurveyMe({ signal }),
    refetchOnWindowFocus: true,
    ...options,
  })
}
