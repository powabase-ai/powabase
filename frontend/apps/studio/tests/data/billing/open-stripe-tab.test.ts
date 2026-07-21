import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { navigateStripeTab, openStripeTab } from '@/data/billing/open-stripe-tab'

describe('openStripeTab', () => {
  let openSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    openSpy = vi.fn()
    vi.stubGlobal('open', openSpy) // window.open === globalThis.open in jsdom
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opens a blank _blank tab WITHOUT the noopener feature', () => {
    const fakeTab = { opener: {}, location: { href: '' } } as unknown as Window
    openSpy.mockReturnValue(fakeTab)

    const tab = openStripeTab()

    // Counterfactual pin: the original bug passed a third 'noopener,noreferrer'
    // feature arg, which makes the real window.open() return null and discards
    // the handle. Forbid ANY third arg so that regression fails this test.
    expect(openSpy).toHaveBeenCalledWith('about:blank', '_blank')
    expect(openSpy.mock.calls[0]).toHaveLength(2)
    expect(tab).toBe(fakeTab)
    // opener severed (reverse-tabnabbing protection without losing the handle)
    expect((fakeTab as unknown as { opener: unknown }).opener).toBeNull()
  })

  it('returns null when the popup is blocked', () => {
    openSpy.mockReturnValue(null)
    expect(openStripeTab()).toBeNull()
  })
})

describe('navigateStripeTab', () => {
  const ORIGINAL_LOCATION = window.location

  afterEach(() => {
    ;(window as any).location = ORIGINAL_LOCATION
  })

  it('navigates the pre-opened tab when present', () => {
    const fakeTab = { location: { href: '' } } as unknown as Window
    navigateStripeTab(fakeTab, 'https://checkout.stripe.com/c/pay/cs_x')
    expect(fakeTab.location.href).toBe('https://checkout.stripe.com/c/pay/cs_x')
  })

  it('falls back to same-tab navigation when tab is null (popup blocked)', () => {
    delete (window as any).location
    ;(window as any).location = { href: '' }
    navigateStripeTab(null, 'https://billing.stripe.com/p/session/y')
    expect(window.location.href).toBe('https://billing.stripe.com/p/session/y')
  })
})
