import { describe, expect, it } from 'vitest'
import { buildRuntimeKbEntries, MAX_RUNTIME_KBS } from './ai-api'

describe('MAX_RUNTIME_KBS', () => {
  it('mirrors the server cap of 10', () => {
    expect(MAX_RUNTIME_KBS).toBe(10)
  })
})

describe('buildRuntimeKbEntries', () => {
  it('returns undefined when nothing selected', () => {
    expect(buildRuntimeKbEntries([], {})).toBeUndefined()
  })

  it('maps selected ids and carries source filters', () => {
    expect(buildRuntimeKbEntries(['kb-1', 'kb-2'], { 'kb-1': ['s1'] })).toEqual([
      { id: 'kb-1', source_ids: ['s1'] },
      { id: 'kb-2' },
    ])
  })
})
