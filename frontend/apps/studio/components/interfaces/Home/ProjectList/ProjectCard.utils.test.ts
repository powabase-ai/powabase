import { describe, expect, it } from 'vitest'

import { inferProjectStatus } from './ProjectCard.utils'

describe('inferProjectStatus', () => {
  it.each([
    ['ACTIVE_HEALTHY', 'isHealthy'],
    ['COMING_UP', 'isComingUp'],
    ['UNKNOWN', 'isComingUp'],
    ['INIT_FAILED', 'isInitFailed'],
    ['PAUSING', 'isPausing'],
    ['INACTIVE', 'isPaused'],
  ])('%s → %s', (status, expected) => {
    expect(inferProjectStatus(status)).toBe(expected)
  })
})
