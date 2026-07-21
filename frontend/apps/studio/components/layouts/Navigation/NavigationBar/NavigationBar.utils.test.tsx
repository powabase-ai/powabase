import { describe, expect, it } from 'vitest'

import {
  generateOtherRoutes,
  generateProductRoutes,
  generateSettingsRoutes,
  generateToolRoutes,
} from './NavigationBar.utils'
import type { Project } from '@/data/projects/project-detail-query'

const REF = 'test-project-ref'

const activeProject = { status: 'ACTIVE_HEALTHY' } as Project
const buildingProject = { status: 'COMING_UP' } as Project
const inactiveProject = { status: 'INACTIVE' } as Project

const keys = (routes: { key: string }[]) => routes.map((r) => r.key)

describe('generateToolRoutes', () => {
  it('always returns Table Editor and SQL Editor', () => {
    const routes = generateToolRoutes(REF, activeProject)
    expect(keys(routes)).toEqual(['editor', 'sql'])
  })

  it('marks routes as disabled when project is not active', () => {
    const routes = generateToolRoutes(REF, inactiveProject)
    expect(routes.every((r) => r.disabled)).toBe(true)
  })

  it('points links to the building URL when project is building', () => {
    const routes = generateToolRoutes(REF, buildingProject)
    expect(routes.every((r) => r.link === `/project/${REF}`)).toBe(true)
  })

  it('returns links as false when ref is undefined', () => {
    const routes = generateToolRoutes(undefined, activeProject)
    expect(routes.every((r) => r.link === undefined)).toBe(true)
  })
})

describe('generateProductRoutes', () => {
  it('includes all product routes when all features are enabled', () => {
    const routes = generateProductRoutes(REF, activeProject, {
      auth: true,
      storage: true,
      edgeFunctions: true,
      realtime: true,
    })
    expect(keys(routes)).toEqual(['database', 'auth', 'storage', 'functions', 'realtime'])
  })

  it('includes all product routes by default (features default to true)', () => {
    const routes = generateProductRoutes(REF, activeProject)
    expect(keys(routes)).toEqual(['database', 'auth', 'storage', 'functions', 'realtime'])
  })

  it('excludes auth when auth feature is disabled', () => {
    const routes = generateProductRoutes(REF, activeProject, { auth: false })
    expect(keys(routes)).not.toContain('auth')

    expect(keys(routes)).toContain('database')
    expect(keys(routes)).toContain('storage')
  })

  it('excludes storage when storage feature is disabled', () => {
    const routes = generateProductRoutes(REF, activeProject, { storage: false })
    expect(keys(routes)).not.toContain('storage')
  })

  it('excludes edge functions when edgeFunctions feature is disabled', () => {
    const routes = generateProductRoutes(REF, activeProject, { edgeFunctions: false })
    expect(keys(routes)).not.toContain('functions')
  })

  it('excludes realtime when realtime feature is disabled', () => {
    const routes = generateProductRoutes(REF, activeProject, { realtime: false })
    expect(keys(routes)).not.toContain('realtime')
  })

  it('links auth to overview page when authOverviewPage is enabled', () => {
    const routes = generateProductRoutes(REF, activeProject, { authOverviewPage: true })
    const authRoute = routes.find((r) => r.key === 'auth')
    expect(authRoute?.link).toBe(`/project/${REF}/auth/overview`)
  })

  it('links auth to users page by default', () => {
    const routes = generateProductRoutes(REF, activeProject)
    const authRoute = routes.find((r) => r.key === 'auth')
    expect(authRoute?.link).toBe(`/project/${REF}/auth/users`)
  })

  it('always includes database even when all optional features are disabled', () => {
    const routes = generateProductRoutes(REF, activeProject, {
      auth: false,
      storage: false,
      edgeFunctions: false,
      realtime: false,
    })
    expect(keys(routes)).toEqual(['database'])
  })
})

describe('generateOtherRoutes', () => {
  it('never includes advisors, logs, or integrations — no backend in either build', () => {
    // Bucket-2 (C3.3 follow-up): every pages/project/[ref]/{advisors,logs,integrations}/** route
    // is a dead RedirectToProject stub in both prod and OSS, and neither
    // infra/helm/project-stack nor templates/supabase-project runs a backend for them. The
    // stubs are retained (not deleted — live code still links into them; see
    // nav-no-cloud-only-corpses.spec.ts) but never emitted in the nav, regardless of isPlatform.
    const onPlatform = generateOtherRoutes(REF, activeProject, { isPlatform: true })
    const offPlatform = generateOtherRoutes(REF, activeProject, { isPlatform: false })
    for (const routes of [onPlatform, offPlatform]) {
      expect(keys(routes)).not.toContain('advisors')
      expect(keys(routes)).not.toContain('logs')
      expect(keys(routes)).not.toContain('integrations')
    }
  })

  it('excludes observability on platform when reports are enabled', () => {
    // Observability was deliberately hidden from nav in both prod and OSS
    // (commits a74fec7d4, 202275cff) — a real dashboard exists at
    // pages/project/[ref]/observability/index.tsx, but it stays nav-unlinked;
    // see nav-no-cloud-only-corpses.spec.ts.
    const routes = generateOtherRoutes(REF, activeProject, {
      isPlatform: true,
      showReports: true,
    })
    expect(keys(routes)).not.toContain('observability')
  })

  it('excludes observability on platform when reports are disabled', () => {
    const routes = generateOtherRoutes(REF, activeProject, {
      isPlatform: true,
      showReports: false,
    })
    expect(keys(routes)).not.toContain('observability')
  })

  it('excludes observability in self-hosted mode even when reports are enabled', () => {
    const routes = generateOtherRoutes(REF, activeProject, {
      isPlatform: false,
      showReports: true,
    })
    expect(keys(routes)).not.toContain('observability')
  })

  it('excludes observability in self-hosted mode when reports are disabled', () => {
    const routes = generateOtherRoutes(REF, activeProject, {
      isPlatform: false,
      showReports: false,
    })
    expect(keys(routes)).not.toContain('observability')
  })

  it('does not include API Docs nav item', () => {
    const routes = generateOtherRoutes(REF, activeProject, { isPlatform: true })
    expect(keys(routes)).not.toContain('api')
  })
})

describe('generateSettingsRoutes', () => {
  it('links to general settings on platform', () => {
    const routes = generateSettingsRoutes(REF, undefined, { isPlatform: true })
    const settingsRoute = routes.find((r) => r.key === 'settings')
    expect(settingsRoute?.link).toBe(`/project/${REF}/settings/general`)
  })

  it('links to log-drains settings in self-hosted mode', () => {
    const routes = generateSettingsRoutes(REF, undefined, { isPlatform: false })
    const settingsRoute = routes.find((r) => r.key === 'settings')
    expect(settingsRoute?.link).toBe(`/project/${REF}/settings/log-drains`)
  })

  it('returns a link as false when ref is undefined', () => {
    const routes = generateSettingsRoutes(undefined, undefined, { isPlatform: true })
    const settingsRoute = routes.find((r) => r.key === 'settings')
    expect(settingsRoute?.link).toBe(undefined)
  })
})
