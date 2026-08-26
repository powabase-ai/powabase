import { describe, expect, it } from 'vitest'

import { PROVISIONING_PHASES } from './provisioning'

describe('PROVISIONING_PHASES', () => {
  it('is the platform vocabulary: five keys, in execution order', () => {
    expect(PROVISIONING_PHASES).toEqual([
      'credentials',
      'environment',
      'database',
      'services',
      'verifying',
    ])
  })
})
