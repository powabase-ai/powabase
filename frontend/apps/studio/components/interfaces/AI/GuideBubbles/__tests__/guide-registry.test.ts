import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { ONBOARDING_ANCHORS } from '../onboarding-anchors'
import { GUIDE_SEQUENCES, GUIDE_SEQUENCE_IDS } from '../guide-sequences'
import { ANCHOR_NOT_FOUND_TIMEOUT_MS } from '../useAnchorRect'

// Every anchor id value across all groups.
const anchorValues = new Set(
  Object.values(ONBOARDING_ANCHORS).flatMap((group) => Object.values(group))
)

// The 21 canonical ids (must match the Python GUIDE_SEQUENCE_IDS tuple).
const EXPECTED_IDS = [
  'connect', 'create-table', 'add-sources', 'create-knowledge-base', 'create-agent',
  'create-orchestration', 'create-workflow', 'sql-query', 'create-storage-bucket',
  'add-user', 'create-rls-policy', 'schema-visualizer', 'database-functions',
  'database-triggers', 'database-indexes', 'database-roles', 'enable-extension',
  'auth-providers', 'realtime-inspector', 'llm-provider-keys', 'manage-compute',
]

// Gate keys the useGuideFeatureGates hook maps. A sequence must not
// declare a gate the hook can't resolve, or it silently reads as enabled.
const SUPPORTED_GATES = new Set([
  'project_auth:all', 'project_storage:all', 'realtime:all', 'database:roles',
])

describe('guide registry', () => {
  it('exposes exactly the 21 canonical sequence ids', () => {
    expect(new Set(GUIDE_SEQUENCE_IDS)).toEqual(new Set(EXPECTED_IDS))
    expect(GUIDE_SEQUENCE_IDS.length).toBe(21)
  })

  it('keeps each sequence id equal to its map key', () => {
    for (const [key, seq] of Object.entries(GUIDE_SEQUENCES)) expect(seq.id).toBe(key)
  })

  it('gives every sequence at least one step', () => {
    for (const seq of Object.values(GUIDE_SEQUENCES)) expect(seq.steps.length).toBeGreaterThan(0)
  })

  it('points every step at a defined anchor id', () => {
    for (const seq of Object.values(GUIDE_SEQUENCES))
      for (const step of seq.steps) expect(anchorValues.has(step.anchor)).toBe(true)
  })

  it('only uses feature gates the hook can resolve', () => {
    for (const seq of Object.values(GUIDE_SEQUENCES))
      if (seq.featureGate) expect(SUPPORTED_GATES.has(seq.featureGate)).toBe(true)
  })

  it('exports a positive, bounded not-found timeout', () => {
    // useAnchorRect's not-found polling must give up eventually (FIX for the
    // old unbounded-rAF-forever busy-poll) — a zero/negative/absurdly large
    // value would defeat the point of bounding it.
    expect(ANCHOR_NOT_FOUND_TIMEOUT_MS).toBeGreaterThan(0)
    expect(ANCHOR_NOT_FOUND_TIMEOUT_MS).toBeLessThanOrEqual(30_000)
  })

  it('references every declared anchor constant in a component', () => {
    const root = join(__dirname, '..', '..', '..', '..', '..') // studio app root
    const sources = walk(join(root, 'components'))
      .concat(walk(join(root, 'pages')))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n')
    const missing: string[] = []
    for (const [group, ids] of Object.entries(ONBOARDING_ANCHORS)) {
      for (const key of Object.keys(ids)) {
        const ref = `ONBOARDING_ANCHORS.${group}.${key}`
        // Word-boundary match, not substring: otherwise `...database.newFunction`
        // would be satisfied by an unrelated `...database.newFunctionExtra` prefix.
        const pattern = new RegExp(ref.replace(/\./g, '\\.') + '\\b')
        if (!pattern.test(sources)) missing.push(ref)
      }
    }
    expect(missing).toEqual([])
  })
})

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === '__tests__') continue
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) walk(p, acc)
    else if (/\.(tsx|ts)$/.test(name) && !name.endsWith('onboarding-anchors.ts')) acc.push(p)
  }
  return acc
}
