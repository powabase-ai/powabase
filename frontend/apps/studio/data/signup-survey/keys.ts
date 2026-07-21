export const signupSurveyKeys = {
  all: ['signup-survey'] as const,
  schema: () => [...signupSurveyKeys.all, 'schema'] as const,
  me: () => [...signupSurveyKeys.all, 'me'] as const,
}
