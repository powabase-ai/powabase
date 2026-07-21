import { useSignupSurveyMeQuery } from '@/data/signup-survey/signup-survey-me-query'

export type SignupSurveyGateState =
  | { state: 'loading' }
  | { state: 'pass' } // survey completed or already exempt
  | { state: 'auto-exempt' } // pre-launch user; caller should fire exempt mutation
  | { state: 'redirect-to-onboarding' }

/**
 * Derive the studio gate state from the /signup-survey/me query.
 *
 * Used by:
 *   - pages/organizations.tsx (block first-time users before they see the org list)
 *   - pages/new/index.tsx     (block deep-link bypass to the org-create form)
 *   - pages/onboarding.tsx    (redirect away if already completed)
 *
 * Pure derivation — no side effects. Callers decide what to do with the state
 * (router.replace / fire exempt mutation / render children).
 */
export function useSignupSurveyGate(): SignupSurveyGateState {
  const { data, isPending } = useSignupSurveyMeQuery()

  if (isPending) return { state: 'loading' }
  if (!data) return { state: 'loading' } // first render before data lands
  if (data.completed) return { state: 'pass' }
  if (data.is_pre_launch_exempt_candidate) return { state: 'auto-exempt' }
  return { state: 'redirect-to-onboarding' }
}
