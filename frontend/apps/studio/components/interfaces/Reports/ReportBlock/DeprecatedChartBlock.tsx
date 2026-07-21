import { ReactNode } from 'react'

import { ReportBlockContainer } from './ReportBlockContainer'
import { METRICS } from '@/lib/constants/metrics'

interface DeprecatedChartBlockProps {
  label: string
  attribute: string
  actions?: ReactNode
}

export const DeprecatedChartBlock = ({ label, attribute, actions }: DeprecatedChartBlockProps) => {
  const metric = METRICS.find((x) => x.key === attribute)

  return (
    <ReportBlockContainer
      draggable
      showDragHandle
      loading={false}
      icon={metric?.category?.icon('text-foreground-muted')}
      label={label}
      actions={actions}
    >
      <div className="flex flex-col justify-center flex-1">
        <p className="text-xs text-foreground-lightr">
          This chart is not longer available, and can be removed from your report
        </p>
      </div>
    </ReportBlockContainer>
  )
}
