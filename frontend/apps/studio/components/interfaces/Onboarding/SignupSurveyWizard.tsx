import { useCallback, useEffect, useState } from 'react'

import { useSignupSurveySchemaQuery } from '@/data/signup-survey/signup-survey-schema-query'
import {
  SurveyVersionStaleError,
  useSignupSurveySubmitMutation,
} from '@/data/signup-survey/signup-survey-submit-mutation'
import type { SignupSurveySchema } from '@/types/signup-survey'

import { CreditIncentiveBanner } from './CreditIncentiveBanner'
import { SignupSurveyStep } from './SignupSurveyStep'

interface Props {
  schema: SignupSurveySchema
  onComplete: () => void
}

export function SignupSurveyWizard({ schema, onComplete }: Props) {
  const [step, setStep] = useState(0) // 0-based index into schema.questions
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined)

  const submit = useSignupSurveySubmitMutation()
  const schemaQuery = useSignupSurveySchemaQuery({ enabled: false })

  const totalSteps = schema.questions.length
  const currentQuestion = schema.questions[step]
  const selected = answers[currentQuestion.id]
  const isLastStep = step === totalSteps - 1

  const handleSelect = useCallback(
    (optionId: string) => {
      setAnswers((prev) => ({ ...prev, [currentQuestion.id]: optionId }))
      setErrorMessage(undefined)
    },
    [currentQuestion.id]
  )

  const handleBack =
    step === 0
      ? undefined
      : () => {
          setErrorMessage(undefined)
          setStep((s) => Math.max(0, s - 1))
        }

  const handleNext = useCallback(() => {
    if (!selected) return
    setErrorMessage(undefined)
    if (!isLastStep) {
      setStep((s) => Math.min(totalSteps - 1, s + 1))
      return
    }
    // Final step: submit.
    submit.mutate(
      { survey_version: schema.survey_version, responses: answers },
      {
        onSuccess: () => {
          // Hook-level onSuccess on the mutation already invalidates
          // signupSurveyKeys.me(); we just signal completion to the page.
          onComplete()
        },
        onError: (err) => {
          if (err instanceof SurveyVersionStaleError) {
            // Newer survey shipped while user had the tab open. Refetch + reset.
            schemaQuery.refetch()
            setStep(0)
            setAnswers({})
            setErrorMessage(
              "We've updated the questions. Please answer the new version."
            )
            return
          }
          setErrorMessage('Could not save your response. Please try again.')
        },
      }
    )
  }, [
    selected,
    isLastStep,
    totalSteps,
    submit,
    schema.survey_version,
    answers,
    schemaQuery,
    onComplete,
  ])

  // Keyboard shortcuts: Enter advances, ← goes back, digits pick options.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const isFormElement = target && /^(input|textarea|select)$/i.test(target.tagName)
      if (isFormElement) return

      if (e.key === 'Enter') {
        e.preventDefault()
        handleNext()
      } else if (e.key === 'ArrowLeft' && handleBack) {
        e.preventDefault()
        handleBack()
      } else if (/^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1
        const opt = currentQuestion.options[idx]
        if (opt) handleSelect(opt.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleNext, handleBack, currentQuestion.options, handleSelect])

  // TanStack v5 uses `isPending` instead of `isLoading` for mutations.
  const submitting = submit.isPending

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <CreditIncentiveBanner amountUsd={schema.credit_incentive_usd} />
      <SignupSurveyStep
        question={currentQuestion}
        stepNumber={step + 1}
        totalSteps={totalSteps}
        selectedOptionId={selected}
        onSelect={handleSelect}
        onBack={handleBack}
        onNext={handleNext}
        isLastStep={isLastStep}
        isSubmitting={submitting}
        errorMessage={errorMessage}
      />
    </div>
  )
}
