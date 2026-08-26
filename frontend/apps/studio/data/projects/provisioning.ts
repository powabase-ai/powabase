/**
 * The platform's asynchronous-provisioning status, as attached to the project
 * detail, list item, /status and create responses.
 *
 * `phase` is the public vocabulary: five fixed keys in fixed order, monotonic
 * over execution. `step` and `failed_step` are opaque server names — never
 * branch on them. Display strings live with the surfaces that render them.
 */
export const PROVISIONING_PHASES = [
  'credentials',
  'environment',
  'database',
  'services',
  'verifying',
] as const

export type ProvisioningPhase = (typeof PROVISIONING_PHASES)[number]

export type ProvisioningStatus = 'pending' | 'running' | 'succeeded' | 'failed'

export interface ProjectProvisioning {
  status: ProvisioningStatus
  step: string | null
  failed_step: string | null
  phase: ProvisioningPhase
  error: string | null
  attempts: number
  retryable: boolean
  updated_at: string | null
}
