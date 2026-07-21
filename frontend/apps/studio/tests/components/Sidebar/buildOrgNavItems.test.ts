import { describe, expect, test } from 'vitest'

import { buildOrgNavItems } from '@/components/interfaces/Sidebar'

describe('buildOrgNavItems', () => {
  test('includes Billing & Plans only when both gates are true', () => {
    const on = buildOrgNavItems({ organizationSlug: 'acme', showBilling: true, billingUiEnabled: true })
    expect(on.map((i) => i.key)).toEqual(['projects', 'billing', 'settings'])
    expect(on.find((i) => i.key === 'billing')?.href).toBe('/org/acme/billing')
  })

  test('omits Billing when billing UI is off', () => {
    const off = buildOrgNavItems({ organizationSlug: 'acme', showBilling: true, billingUiEnabled: false })
    expect(off.map((i) => i.key)).toEqual(['projects', 'settings'])
  })

  test('omits Billing when billing:all is off', () => {
    const off = buildOrgNavItems({ organizationSlug: 'acme', showBilling: false, billingUiEnabled: true })
    expect(off.map((i) => i.key)).toEqual(['projects', 'settings'])
  })
})
