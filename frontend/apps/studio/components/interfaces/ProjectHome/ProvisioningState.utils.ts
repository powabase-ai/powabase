import { PROVISIONING_PHASES, type ProvisioningPhase } from '@/data/projects/provisioning'
import { PROJECT_STATUS } from '@/lib/constants'

export type ProvisioningSurface = 'building' | 'failed' | 'deleting' | 'normal'

/**
 * Which home surface a project's status selects. The platform derives
 * `status` from its lifecycle columns, so the decision keys on status alone;
 * `provisioning` only supplies the phase and error the surfaces display.
 * `GOING_DOWN` is only ever seen on the project page itself (the lists hide
 * a project being deleted); it ends in a 404 the layout turns into a redirect.
 */
export function getProvisioningSurface(
  project: { status?: string } | undefined
): ProvisioningSurface {
  switch (project?.status) {
    case PROJECT_STATUS.COMING_UP:
    case PROJECT_STATUS.UNKNOWN:
      return 'building'
    case PROJECT_STATUS.INIT_FAILED:
      return 'failed'
    case PROJECT_STATUS.GOING_DOWN:
      return 'deleting'
    default:
      return 'normal'
  }
}

/** Display strings are owned here; the keys are the platform's contract. */
export const PROVISIONING_PHASE_LABELS: Record<ProvisioningPhase, string> = {
  credentials: 'Creating credentials',
  environment: 'Preparing the environment',
  database: 'Setting up the database',
  services: 'Starting services',
  verifying: 'Verifying the stack',
}

export type PhaseRowState = 'done' | 'current' | 'pending'

export interface PhaseRow {
  key: ProvisioningPhase
  label: string
  state: PhaseRowState
}

/** The five phases as done/current/pending rows around `current`; all pending while unknown. */
export function getPhaseRows(current: ProvisioningPhase | null | undefined): PhaseRow[] {
  const idx = current ? PROVISIONING_PHASES.indexOf(current) : -1
  return PROVISIONING_PHASES.map((key, i) => ({
    key,
    label: PROVISIONING_PHASE_LABELS[key],
    state: i < idx ? 'done' : i === idx ? 'current' : 'pending',
  }))
}

export function getPhaseLabel(phase: ProvisioningPhase | null | undefined): string {
  const label = phase ? (PROVISIONING_PHASE_LABELS[phase] as string | undefined) : undefined
  return label ?? 'Setting up project'
}

export function getFailedTitle(phase: ProvisioningPhase | null | undefined): string {
  const label = phase ? (PROVISIONING_PHASE_LABELS[phase] as string | undefined) : undefined
  if (!label) return 'Project setup failed'
  return `Setup failed while ${label.charAt(0).toLowerCase()}${label.slice(1)}`
}
