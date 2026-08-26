import { Check, Loader2 } from 'lucide-react'
import { Badge } from 'ui'

import { DeleteProjectButton } from '@/components/interfaces/Settings/General/DeleteProjectPanel/DeleteProjectButton'
import { useSelectedProjectQuery } from '@/hooks/misc/useSelectedProject'
import { getPhaseLabel, getPhaseRows } from './ProvisioningState.utils'

const ROW_STATE_TEXT = { done: 'done', current: 'in progress', pending: 'pending' } as const

/**
 * The project home while the platform is still building the project. The
 * phase comes from the project detail, which the detail query re-reads every
 * 5 s while COMING_UP; cache hand-offs are owned by useProvisioningStatusSync
 * (mounted by the home), not here.
 */
export const ProvisioningState = ({ degraded = false }: { degraded?: boolean }) => {
  const { data: project } = useSelectedProjectQuery()

  const phase = project?.provisioning?.phase
  const rows = getPhaseRows(phase)

  return (
    <div className="flex flex-col gap-8 pb-16" data-testid="provisioning-state">
      <div className="flex flex-col gap-1">
        <div className="flex flex-col md:flex-row md:items-center gap-x-3 gap-y-2">
          <h1 className="text-3xl text-foreground">{project?.name ?? 'Project'}</h1>
          <Badge aria-live="polite">
            <span className="flex items-center gap-2">
              <Loader2 className="animate-spin" size={12} aria-hidden="true" />
              <span>{getPhaseLabel(phase)}</span>
            </span>
          </Badge>
        </div>
        <p className="text-sm text-foreground-light">
          We are setting up your project. This usually takes a few minutes, and this page
          updates on its own.
        </p>
        {degraded ? (
          <p className="text-sm text-warning" role="status" data-testid="provisioning-degraded">
            We can't reach the platform right now — retrying. Your project is still being set up.
          </p>
        ) : null}
      </div>

      <ol
        aria-label="Setup progress"
        className="border rounded-lg p-6 bg-surface-100 flex flex-col gap-3"
      >
        {rows.map((row) => (
          <li
            key={row.key}
            data-phase={row.key}
            data-state={row.state}
            aria-current={row.state === 'current' ? 'step' : undefined}
            className="flex items-center gap-3 text-sm"
          >
            {row.state === 'done' ? (
              <Check size={14} className="text-brand" aria-hidden="true" />
            ) : row.state === 'current' ? (
              <Loader2 size={14} className="animate-spin text-foreground" aria-hidden="true" />
            ) : (
              <span className="w-3.5 h-3.5 rounded-full border border-strong" aria-hidden="true" />
            )}
            <span className={row.state === 'pending' ? 'text-foreground-lighter' : 'text-foreground'}>
              {row.label}
            </span>
            <span className="sr-only">{ROW_STATE_TEXT[row.state]}</span>
          </li>
        ))}
      </ol>

      <div>
        {/* The settings page's button: disabled, with a tooltip, for members
            who may not update the project; it owns the confirmation modal. */}
        <DeleteProjectButton type="default" />
      </div>
    </div>
  )
}
