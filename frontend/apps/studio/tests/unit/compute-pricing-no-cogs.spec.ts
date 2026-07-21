import fs from 'fs'
import path from 'path'

import { expect, test } from 'vitest'

test('no COGS/margin constant ships in the compute billing bundle', () => {
  const dir = path.join(__dirname, '../../data/billing')
  const files = fs.readdirSync(dir)
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8')
    // cogsMillicents / DRAIN_MULTIPLIER_BP: the raw constants themselves.
    // \$\d+(?:\.\d+)?\/hr: a computed per-hour price literal (e.g. the nano
    // tagline's old "$0.0346/hr") — the price/margin *value* baked into
    // display copy, even without the constant name. Flat, non-computed
    // prices (monthlyPriceLabel, creditLabel — "$25/mo", "$10 ... credit")
    // don't match: no `/hr` suffix.
    expect(src).not.toMatch(/cogsMillicents|DRAIN_MULTIPLIER_BP|\$\d+(?:\.\d+)?\/hr/)
  }
  expect(fs.existsSync(path.join(dir, 'compute-tiers.constants.ts'))).toBe(false)
})
