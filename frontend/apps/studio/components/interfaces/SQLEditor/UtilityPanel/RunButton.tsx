import { Loader2 } from 'lucide-react'
import { Button, KeyboardShortcut } from 'ui'

import { onboardingAnchor, ONBOARDING_ANCHORS } from '@/components/interfaces/AI/GuideBubbles/onboarding-anchors'

interface SqlRunButtonProps {
  isDisabled?: boolean
  isExecuting?: boolean
  hasSelection?: boolean
  className?: string
  onClick: () => void
}

export const SqlRunButton = ({
  isDisabled = false,
  isExecuting = false,
  hasSelection = false,
  className,
  onClick,
}: SqlRunButtonProps) => {
  return (
    <Button
      onClick={onClick}
      disabled={isDisabled}
      type="primary"
      size="tiny"
      data-testid="sql-run-button"
      {...onboardingAnchor(ONBOARDING_ANCHORS.sql.run)}
      iconRight={
        isExecuting ? (
          <Loader2 className="animate-spin" size={10} strokeWidth={1.5} />
        ) : (
          <KeyboardShortcut keys={['Meta', 'Enter']} variant="inline" />
        )
      }
      className={className}
    >
      {hasSelection ? 'Run selected' : 'Run'}
    </Button>
  )
}
