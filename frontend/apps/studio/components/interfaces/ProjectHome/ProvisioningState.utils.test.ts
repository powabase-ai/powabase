import { describe, expect, it } from 'vitest'

import type { ProjectProvisioning } from '@/data/projects/provisioning'
import {
  getFailedTitle,
  getPhaseLabel,
  getPhaseRows,
  getProvisioningSurface,
} from './ProvisioningState.utils'

const running: ProjectProvisioning = {
  status: 'running',
  step: 'step-3',
  failed_step: null,
  phase: 'services',
  error: null,
  attempts: 1,
  retryable: false,
  updated_at: null,
}
const failed: ProjectProvisioning = {
  ...running,
  status: 'failed',
  failed_step: 'step-3',
  error: 'The services did not become ready in time.',
  retryable: true,
}
const succeeded: ProjectProvisioning = { ...running, status: 'succeeded', phase: 'verifying' }

describe('getProvisioningSurface', () => {
  it.each([
    [{ status: 'COMING_UP', provisioning: running }, 'building'],
    [{ status: 'UNKNOWN', provisioning: null }, 'building'],
    [{ status: 'INIT_FAILED', provisioning: failed }, 'failed'],
    [{ status: 'GOING_DOWN', provisioning: running }, 'deleting'],
    [{ status: 'GOING_DOWN', provisioning: null }, 'deleting'],
    [{ status: 'ACTIVE_HEALTHY', provisioning: succeeded }, 'normal'],
    [{ status: 'INACTIVE', provisioning: null }, 'normal'],
    // Legacy rows and paused rows: provisioning null, status ACTIVE_HEALTHY.
    [{ status: 'ACTIVE_HEALTHY', provisioning: null }, 'normal'],
    [undefined, 'normal'],
  ])('%j → %s', (project, expected) => {
    expect(getProvisioningSurface(project)).toBe(expected)
  })
})

describe('getPhaseRows', () => {
  it('marks phases before the current one done and those after it pending', () => {
    expect(getPhaseRows('database').map((r) => [r.key, r.state])).toEqual([
      ['credentials', 'done'],
      ['environment', 'done'],
      ['database', 'current'],
      ['services', 'pending'],
      ['verifying', 'pending'],
    ])
  })

  it('renders every phase pending when the phase is not known yet', () => {
    expect(getPhaseRows(undefined).every((r) => r.state === 'pending')).toBe(true)
    expect(getPhaseRows(undefined)).toHaveLength(5)
  })

  it('renders every phase pending for a phase key it does not know', () => {
    expect(getPhaseRows('nope' as any).every((r) => r.state === 'pending')).toBe(true)
    expect(getPhaseRows('nope' as any)).toHaveLength(5)
  })
})

describe('labels', () => {
  it('names the current phase, with a generic label before the first phase is reported', () => {
    expect(getPhaseLabel('credentials')).toBe('Creating credentials')
    expect(getPhaseLabel(undefined)).toBe('Setting up project')
    expect(getPhaseLabel(null)).toBe('Setting up project')
    expect(getPhaseLabel('nope' as any)).toBe('Setting up project')
  })

  it('builds the failed title from the phase, lower-cased', () => {
    expect(getFailedTitle('services')).toBe('Setup failed while starting services')
    expect(getFailedTitle(null)).toBe('Project setup failed')
    expect(getFailedTitle(undefined)).toBe('Project setup failed')
    expect(getFailedTitle('nope' as any)).toBe('Project setup failed')
  })
})
