import { describe, expect, it } from 'vitest'

import { DISPOSABLE_EMAIL_DOMAINS, isDisposableEmail } from './disposable-email'

describe('isDisposableEmail', () => {
  it('rejects a known disposable domain', () => {
    expect(isDisposableEmail('user@mailinator.com')).toBe(true)
  })

  it('is case-insensitive on the domain', () => {
    expect(isDisposableEmail('user@Mailinator.COM')).toBe(true)
  })

  it('allows legitimate providers (gmail)', () => {
    expect(isDisposableEmail('user@gmail.com')).toBe(false)
  })

  it('allows protonmail (intentionally not in the list)', () => {
    expect(isDisposableEmail('user@protonmail.com')).toBe(false)
  })

  it('returns false on non-email input', () => {
    expect(isDisposableEmail('not-an-email')).toBe(false)
  })

  it('returns false on email with empty domain', () => {
    expect(isDisposableEmail('user@')).toBe(false)
  })

  it('trims surrounding whitespace on the domain', () => {
    expect(isDisposableEmail('user@mailinator.com  ')).toBe(true)
  })

  it('loads the generated blocklist with the expected canaries', () => {
    // The blocklist is generated from scripts/disposable-email/blocklist.txt
    // and embedded server-side in migration 0011 via the same source. We
    // don't pin the size here — it grows on every quarterly refresh — but
    // a few well-known entries pin that the codegen actually ran.
    expect(DISPOSABLE_EMAIL_DOMAINS.size).toBeGreaterThan(1000)
    expect(DISPOSABLE_EMAIL_DOMAINS.has('mailinator.com')).toBe(true)
    expect(DISPOSABLE_EMAIL_DOMAINS.has('guerrillamail.com')).toBe(true)
    expect(DISPOSABLE_EMAIL_DOMAINS.has('yopmail.com')).toBe(true)
  })

  it('blocks a free-subdomain root itself (eu.org)', () => {
    expect(isDisposableEmail('user@eu.org')).toBe(true)
  })

  it('blocks a subdomain of a free root (007.hzeg.eu.org)', () => {
    expect(isDisposableEmail('kiss888@007.hzeg.eu.org')).toBe(true)
  })

  it('does NOT block a substring-lookalike (noteu.org)', () => {
    expect(isDisposableEmail('user@noteu.org')).toBe(false)
  })

  it('does NOT block a bare public suffix (example.org)', () => {
    // Locks the roots-list invariant: the suffix walk reaches the bare TLD,
    // so a public suffix must never be added to FREE_SUBDOMAIN_ROOTS.
    expect(isDisposableEmail('someone@example.org')).toBe(false)
  })

  it('normalizes a trailing dot (user@eu.org.)', () => {
    expect(isDisposableEmail('user@eu.org.')).toBe(true)
    expect(isDisposableEmail('user@mailinator.com.')).toBe(true)
  })
})
