// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { detectPriorConsent, readSharedConsent, writeSharedConsent } from './consent-state'

// jsdom's localStorage can be flaky in vitest, so ensure it's available
const storage = new Map<string, string>()
const mockLocalStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
  get length() {
    return storage.size
  },
  key: (index: number) => Array.from(storage.keys())[index] ?? null,
}

beforeEach(() => {
  storage.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  storage.clear()
})

describe('detectPriorConsent', () => {
  describe('scenario 1: GTM compressed format (ucData)', () => {
    it('returns true when ucData has all services consented', () => {
      storage.set(
        'ucData',
        JSON.stringify({
          gcm: { adStorage: 'granted', analyticsStorage: 'granted' },
          consent: {
            services: {
              svc1: { name: 'Google Analytics', consent: true },
              svc2: { name: 'Stripe', consent: true },
              svc3: { name: 'Sentry', consent: true },
            },
          },
        })
      )

      expect(detectPriorConsent()).toBe(true)
    })

    it('returns false when any service has consent: false', () => {
      storage.set(
        'ucData',
        JSON.stringify({
          consent: {
            services: {
              svc1: { name: 'Google Analytics', consent: true },
              svc2: { name: 'Stripe', consent: false },
            },
          },
        })
      )

      expect(detectPriorConsent()).toBe(false)
    })

    it('returns false when services object is empty', () => {
      storage.set('ucData', JSON.stringify({ consent: { services: {} } }))
      expect(detectPriorConsent()).toBe(false)
    })

    it('returns false when ucData is malformed JSON', () => {
      storage.set('ucData', 'not-json')
      expect(detectPriorConsent()).toBe(false)
    })

    it('returns false when ucData has no consent.services', () => {
      storage.set('ucData', JSON.stringify({ gcm: {} }))
      expect(detectPriorConsent()).toBe(false)
    })

    it('returns false when services contains non-object values', () => {
      storage.set('ucData', JSON.stringify({ consent: { services: { svc1: 'not-an-object' } } }))
      expect(detectPriorConsent()).toBe(false)
    })
  })

  describe('scenario 2: fast cross-app navigation (uc_user_interaction)', () => {
    it('returns true when uc_user_interaction is "true"', () => {
      storage.set('uc_user_interaction', 'true')
      expect(detectPriorConsent()).toBe(true)
    })

    it('returns false when uc_user_interaction is "false"', () => {
      storage.set('uc_user_interaction', 'false')
      expect(detectPriorConsent()).toBe(false)
    })

    it('returns false when uc_user_interaction is absent', () => {
      expect(detectPriorConsent()).toBe(false)
    })
  })

  describe('combined scenarios', () => {
    it('returns true when both ucData and uc_user_interaction indicate consent', () => {
      storage.set(
        'ucData',
        JSON.stringify({
          consent: { services: { svc1: { name: 'GA', consent: true } } },
        })
      )
      storage.set('uc_user_interaction', 'true')
      expect(detectPriorConsent()).toBe(true)
    })

    it('returns true when ucData has consent but uc_user_interaction is false', () => {
      storage.set(
        'ucData',
        JSON.stringify({
          consent: { services: { svc1: { name: 'GA', consent: true } } },
        })
      )
      storage.set('uc_user_interaction', 'false')
      expect(detectPriorConsent()).toBe(true)
    })

    it('returns true when ucData is absent but uc_user_interaction is true', () => {
      storage.set('uc_user_interaction', 'true')
      expect(detectPriorConsent()).toBe(true)
    })

    it('returns false when localStorage is completely empty', () => {
      expect(detectPriorConsent()).toBe(false)
    })
  })
})

// Clears every cookie on the default path so tests don't leak into each other
// (jsdom persists document.cookie across tests in a file).
const clearAllCookies = () => {
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0].trim()
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  })
}

describe('readSharedConsent', () => {
  beforeEach(clearAllCookies)
  afterEach(clearAllCookies)

  it('returns true when pb_consent=granted', () => {
    document.cookie = 'pb_consent=granted'
    expect(readSharedConsent()).toBe(true)
  })

  it('returns false when pb_consent=denied', () => {
    document.cookie = 'pb_consent=denied'
    expect(readSharedConsent()).toBe(false)
  })

  it('returns null when the cookie is absent', () => {
    expect(readSharedConsent()).toBeNull()
  })

  it('returns null when the cookie has an unexpected value', () => {
    document.cookie = 'pb_consent=maybe'
    expect(readSharedConsent()).toBeNull()
  })

  it('returns null for a value that only prefixes a valid one (end-anchored)', () => {
    document.cookie = 'pb_consent=grantedX'
    expect(readSharedConsent()).toBeNull()
  })

  it('finds pb_consent among other cookies', () => {
    document.cookie = 'foo=bar'
    document.cookie = 'pb_consent=granted'
    document.cookie = 'baz=qux'
    expect(readSharedConsent()).toBe(true)
  })
})

describe('writeSharedConsent', () => {
  beforeEach(clearAllCookies)
  afterEach(clearAllCookies)

  it('round-trips granted through readSharedConsent', () => {
    writeSharedConsent(true)
    expect(readSharedConsent()).toBe(true)
  })

  it('round-trips denied through readSharedConsent', () => {
    writeSharedConsent(false)
    expect(readSharedConsent()).toBe(false)
  })

  it('overwrites a prior decision', () => {
    writeSharedConsent(true)
    writeSharedConsent(false)
    expect(readSharedConsent()).toBe(false)
  })
})
