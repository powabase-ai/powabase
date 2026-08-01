#!/usr/bin/env node
/**
 * Fail CI when the Studio suite gets worse; stay quiet while it gets better.
 *
 * This fork carries upstream Supabase tests that assert surfaces the fork
 * removed, so the suite is not green and will not be green for a while.
 * Requiring green would mean no gate at all until every one of those is
 * retired — which is the state this repo has been in.
 *
 * A ceiling gives regression protection today: the count may fall freely, and
 * any rise fails the build.
 *
 * Reads vitest's JSON reporter rather than its human output. The summary text
 * ("Tests  27 failed | 2815 passed") is a display format and has changed shape
 * between vitest majors; numFailedTests is part of the reporter contract.
 *
 * Usage:  node scripts/vitest-ratchet.mjs <results.json> [ceiling.json]
 */
import { readFileSync, existsSync } from 'node:fs'

const [, , resultsPath, ceilingPath = 'tests/failure-ceiling.json'] = process.argv

if (!resultsPath || !existsSync(resultsPath)) {
  console.error(`ratchet: no vitest results at ${resultsPath ?? '<unset>'}`)
  console.error('ratchet: this means the run did not finish, which is a failure in itself.')
  process.exit(1)
}

const results = JSON.parse(readFileSync(resultsPath, 'utf8'))
const failed = results.numFailedTests
const total = results.numTotalTests

// A run that collected nothing is not a pass. Without this, a config mistake
// that stops vitest finding any test files reports 0 failures and goes green.
if (!Number.isInteger(total) || total === 0) {
  console.error(`ratchet: vitest reported ${total} total tests — nothing ran.`)
  process.exit(1)
}
if (!Number.isInteger(failed)) {
  console.error('ratchet: vitest results contained no numFailedTests field.')
  process.exit(1)
}

console.log(`ratchet: ${failed} failed / ${total} total`)

if (!existsSync(ceilingPath)) {
  console.log(`ratchet: no ceiling file at ${ceilingPath} — nothing to compare against.`)
  console.log(`ratchet: record this run as the baseline by committing:`)
  console.log(`  {"maxFailedTests": ${failed}, "minTotalTests": ${total}}`)
  process.exit(0)
}

const ceiling = JSON.parse(readFileSync(ceilingPath, 'utf8'))
const max = ceiling.maxFailedTests
const minTotal = ceiling.minTotalTests ?? 0

// Guard the denominator too. Deleting or accidentally excluding a batch of
// tests lowers the failure count, which would otherwise read as an improvement.
if (total < minTotal) {
  console.error(`ratchet: FAIL — only ${total} tests collected, expected at least ${minTotal}.`)
  console.error('ratchet: tests disappeared. A smaller suite is not a better suite.')
  process.exit(1)
}

if (failed > max) {
  console.error(`ratchet: FAIL — ${failed} failing, ceiling is ${max}.`)
  console.error('ratchet: this change adds failing tests. Fix them, or say why the ceiling should rise.')
  process.exit(1)
}

if (failed < max) {
  console.log(`ratchet: ${max - failed} fewer failures than the ceiling.`)
  console.log(`ratchet: lower maxFailedTests to ${failed} in ${ceilingPath} to lock the improvement in.`)
}

console.log('ratchet: OK')
