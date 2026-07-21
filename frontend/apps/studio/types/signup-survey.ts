// Mirrors the API response shape from
// /api/platform/signup-survey/schema  and  /me
// (Python source of truth: agentic_control_plane/signup_survey/definition.py)

export interface SignupSurveyOption {
  id: string
  label: string
}

export interface SignupSurveyQuestion {
  id: string
  prompt: string
  type: 'single'
  options: SignupSurveyOption[]
}

export interface SignupSurveySchema {
  survey_version: string
  credit_incentive_usd: number
  questions: SignupSurveyQuestion[]
}

export type SignupSurveyMeResponse =
  | {
      completed: false
      is_pre_launch_exempt_candidate: boolean
      survey_version: string
    }
  | {
      completed: true
      survey_version: string
      completed_at: string
      credit_grant_status:
        | 'exempt'
        | 'pending'
        | 'pending_org_attached'
        | 'granted'
        | 'skipped'
    }

export interface SignupSurveySubmitRequest {
  survey_version: string
  responses: Record<string, string>
}

export interface SignupSurveySubmitResponse {
  completed: true
  survey_version: string
  credit_grant_status: string
}
