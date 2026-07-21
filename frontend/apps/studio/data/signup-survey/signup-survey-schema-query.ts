import { useQuery, UseQueryOptions } from '@tanstack/react-query'

import { get, handleError } from '@/data/fetchers'
import type { ResponseError } from '@/types'
import type { SignupSurveySchema } from '@/types/signup-survey'
import { signupSurveyKeys } from './keys'

export async function getSignupSurveySchema({ signal }: { signal?: AbortSignal } = {}) {
  const { data, error } = await get('/platform/signup-survey/schema', { signal })
  if (error) handleError(error)
  return data as SignupSurveySchema
}

export type SignupSurveySchemaData = Awaited<ReturnType<typeof getSignupSurveySchema>>
export type SignupSurveySchemaError = ResponseError

export function useSignupSurveySchemaQuery(
  options?: Omit<
    UseQueryOptions<SignupSurveySchemaData, SignupSurveySchemaError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery<SignupSurveySchemaData, SignupSurveySchemaError>({
    queryKey: signupSurveyKeys.schema(),
    queryFn: ({ signal }) => getSignupSurveySchema({ signal }),
    // Schema is static between deploys. The wizard's stale-version (409)
    // path handles the across-deploy case; we don't want a silent refetch
    // mid-flow to swap the question set under the user.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    ...options,
  })
}
