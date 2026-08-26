import { describe, expect, it } from 'vitest'

import { uuidv4 } from '@/lib/helpers'
import { createIntentFingerprint, resolveCreateIntentKey } from './create-intent-key'

const counter = () => {
  let n = 0
  return () => `key-${++n}`
}

describe('resolveCreateIntentKey', () => {
  it('reuses the key for the same contents — a retry of the same intent', () => {
    const generate = counter()
    const first = resolveCreateIntentKey(null, 'fp-a', generate)
    expect(resolveCreateIntentKey(first, 'fp-a', generate)).toBe(first)
  })

  it('issues a new key when the contents change', () => {
    const generate = counter()
    const first = resolveCreateIntentKey(null, 'fp-a', generate)
    const second = resolveCreateIntentKey(first, 'fp-b', generate)
    expect(second.key).not.toBe(first.key)
    expect(second.fingerprint).toBe('fp-b')
  })
})

describe('createIntentFingerprint', () => {
  const base = {
    name: 'demo',
    organizationSlug: 'org',
    dbPass: 'unused',
    computeSizeId: 'nano',
    aiProviderKeys: { openai: '', anthropic: '', google: '', openrouter: '' },
  }

  it('is stable for equal contents and differs for any changed field', () => {
    expect(createIntentFingerprint({ ...base })).toBe(createIntentFingerprint({ ...base }))
    expect(createIntentFingerprint({ ...base, name: 'demo2' })).not.toBe(createIntentFingerprint(base))
    expect(createIntentFingerprint({ ...base, dbPass: 'other' })).not.toBe(createIntentFingerprint(base))
    expect(
      createIntentFingerprint({ ...base, aiProviderKeys: { ...base.aiProviderKeys, openai: 'sk' } })
    ).not.toBe(createIntentFingerprint(base))
  })
})

describe('the generated key', () => {
  it('fits the platform grammar: 1–128 chars of [A-Za-z0-9._:-]', () => {
    expect(uuidv4()).toMatch(/^[A-Za-z0-9._:-]{1,128}$/)
  })
})
