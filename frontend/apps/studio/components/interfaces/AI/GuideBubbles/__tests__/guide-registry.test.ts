import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { ONBOARDING_ANCHORS } from '../onboarding-anchors'

describe('guide registry', () => {
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
