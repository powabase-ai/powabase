import fs from 'fs'
import path from 'path'

import { expect, test } from 'vitest'

import { generateOtherRoutes } from '@/components/layouts/Navigation/NavigationBar/NavigationBar.utils'

const REF = 'test-ref'
const ACTIVE_PROJECT = { status: 'ACTIVE_HEALTHY' } as never

test('NavigationBar.utils source has no commented-out nav corpse for Advisors/Observability/Logs/Integrations', () => {
  // C3.3: the old blanket `// Advisors, Observability, Logs, Integrations hidden —
  // cloud-only infrastructure` comment (with the route objects commented out beneath it)
  // must not come back. Each of the four is now either deleted outright (no route ever
  // emitted) or gated behind a real, live conditional — never a dead comment block.
  const filePath = path.join(
    __dirname,
    '../../components/layouts/Navigation/NavigationBar/NavigationBar.utils.tsx'
  )
  const source = fs.readFileSync(filePath, 'utf-8')

  expect(source).not.toMatch(/hidden.*cloud-only/i)
  expect(source).not.toMatch(/\/\*[\s\S]*?\*\//) // no block comments at all in this file
})

test('nav never emits advisors, logs, or integrations regardless of platform', () => {
  for (const isPlatform of [true, false]) {
    const routes = generateOtherRoutes(REF, ACTIVE_PROJECT, { isPlatform })
    const keys = routes.map((r) => r.key)
    expect(keys).not.toContain('advisors')
    expect(keys).not.toContain('logs')
    expect(keys).not.toContain('integrations')
  }
})

test('nav never emits observability, regardless of platform or reports flag', () => {
  // Observability was deliberately hidden from nav in both prod and OSS
  // (commits a74fec7d4, 202275cff — deliberate cloud-only scoping). A real,
  // self-contained AI-observability dashboard was later built at
  // pages/project/[ref]/observability/index.tsx, but re-linking it into nav
  // is a separate product decision — the page, its data/observability/*
  // hooks, and the backend's observability routes stay in place, unlinked.
  for (const isPlatform of [true, false]) {
    for (const showReports of [true, false]) {
      const routes = generateOtherRoutes(REF, ACTIVE_PROJECT, { isPlatform, showReports })
      expect(routes.map((r) => r.key)).not.toContain('observability')
    }
  }
})

test('Advisors and Logs source trees are fully deleted (proper Bucket-1 deletion, not a stub)', () => {
  // C3.3 follow-up, take two: the original Bucket-1 deletion (delete outright) was reverted
  // because live code still linked into these routes (e.g. Home/AdvisorWidget, ProjectHome's
  // ServiceStatus/ProjectUsageSection, GridHeaderActions, UserLogs, ChartHeader, the
  // next.config.js legacy redirects), so deleting the pages/[ref]/{advisors,logs}/** trees
  // turned those inbound links into hard 404s and it got reclassified Bucket-2 (stub retained).
  // This time every inbound link (the ones above, plus several more found by re-auditing live
  // code for /advisors and /logs route strings) was removed alongside the page trees, so the
  // stubs — and their never-imported layouts/interfaces — are gone for good. The nav-emission
  // tests above confirm neither ever showed up in nav either way.
  const studioRoot = path.join(__dirname, '../..')

  expect(fs.existsSync(path.join(studioRoot, 'pages/project/[ref]/advisors'))).toBe(false)
  expect(fs.existsSync(path.join(studioRoot, 'components/layouts/AdvisorsLayout'))).toBe(false)
  expect(fs.existsSync(path.join(studioRoot, 'components/interfaces/Advisors'))).toBe(false)
  expect(fs.existsSync(path.join(studioRoot, 'pages/project/[ref]/logs'))).toBe(false)
  expect(fs.existsSync(path.join(studioRoot, 'components/layouts/LogsLayout'))).toBe(false)
})

test('Observability page and data hooks stay retained (built, nav-unlinked — not a Bucket-1 delete)', () => {
  // Unlike Advisors/Logs/Integrations (dead stubs, no backend), Observability
  // is a real, self-contained AI-observability dashboard with a live backend
  // (the project-service's observability routes) — removing it from nav
  // is a nav-only decision, not a reason to delete the feature.
  const studioRoot = path.join(__dirname, '../..')

  expect(fs.existsSync(path.join(studioRoot, 'pages/project/[ref]/observability'))).toBe(true)
  expect(fs.existsSync(path.join(studioRoot, 'data/observability'))).toBe(true)
})
