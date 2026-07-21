import { Button, Label_Shadcn_, RadioGroup_Shadcn_, RadioGroupItem_Shadcn_ } from 'ui'

import type { SignupSurveyQuestion } from '@/types/signup-survey'

interface Props {
  question: SignupSurveyQuestion
  stepNumber: number // 1-based
  totalSteps: number
  selectedOptionId: string | undefined
  onSelect: (optionId: string) => void
  onBack?: () => void // undefined disables/hides the Back button
  onNext: () => void // also doubles as Submit on last step
  isLastStep: boolean
  isSubmitting: boolean
  errorMessage?: string
}

export function SignupSurveyStep({
  question,
  stepNumber,
  totalSteps,
  selectedOptionId,
  onSelect,
  onBack,
  onNext,
  isLastStep,
  isSubmitting,
  errorMessage,
}: Props) {
  const nextLabel = isLastStep ? 'Submit' : 'Next →'
  const canAdvance = Boolean(selectedOptionId) && !isSubmitting

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between text-xs text-foreground-light">
        <ProgressDots current={stepNumber} total={totalSteps} />
        <span>
          Question {stepNumber} of {totalSteps}
        </span>
      </div>

      <h2 className="text-base font-medium">{question.prompt}</h2>

      <RadioGroup_Shadcn_
        value={selectedOptionId ?? ''}
        onValueChange={onSelect}
        className="flex flex-col gap-3"
      >
        {question.options.map((opt) => (
          <div key={opt.id} className="flex items-start gap-3">
            <RadioGroupItem_Shadcn_ value={opt.id} id={`${question.id}__${opt.id}`} />
            <Label_Shadcn_
              htmlFor={`${question.id}__${opt.id}`}
              className="cursor-pointer"
            >
              {opt.label}
            </Label_Shadcn_>
          </div>
        ))}
      </RadioGroup_Shadcn_>

      {errorMessage && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      <div className="flex items-center justify-between">
        {onBack ? (
          <Button type="default" htmlType="button" onClick={onBack} disabled={isSubmitting}>
            Back
          </Button>
        ) : (
          <span />
        )}
        <Button
          htmlType="button"
          onClick={onNext}
          disabled={!canAdvance}
          loading={isSubmitting && isLastStep}
        >
          {nextLabel}
        </Button>
      </div>
    </div>
  )
}

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden={true}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={
            i + 1 <= current
              ? 'h-2 w-2 rounded-full bg-foreground'
              : 'h-2 w-2 rounded-full bg-foreground-muted/40'
          }
        />
      ))}
    </div>
  )
}
