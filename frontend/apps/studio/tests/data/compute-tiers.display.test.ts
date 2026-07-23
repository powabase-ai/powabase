import { expect, test } from 'vitest'

import { COMPUTE_TIERS } from '@/data/billing/compute-tiers.display'

test('five tiers in order with code+display', () => {
  expect(COMPUTE_TIERS.map((t) => t.id)).toEqual(['nano', 'micro', 'small', 'medium', 'large'])
  expect(COMPUTE_TIERS[0].displayName).toBe('Sandbox')
})

test('nano ram is 1.5 GiB (post-0027: pg 512MiB + AI 1GiB)', () => {
  const nano = COMPUTE_TIERS.find((t) => t.id === 'nano')!
  expect(nano.ram).toBe('1.5 GiB')
})

// Pricing (hourlyRate) moved server-side in C0 — see compute-sizes-query.ts's
// prices_by_plan and the backend's compute pricing tests. COMPUTE_TIERS
// is now display-only metadata (specs/tagline), so there's no rate to pin here.
