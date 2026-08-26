import { describe, expect, it } from 'vitest'

import { generateSettingsRoutes, generateToolRoutes } from './NavigationBar.utils'

const linksOf = (status: string) =>
  generateToolRoutes('abc', { status } as any)
    .map((route) => route.link)
    .filter((link): link is string => typeof link === 'string')

// The group also carries an external docs link and an infrastructure route,
// neither of which the project's status moves; only Project Settings does.
const settingsLinksOf = (status: string) =>
  generateSettingsRoutes('abc', { status } as any)
    .filter((route) => route.key === 'settings')
    .map((route) => route.link)
    .filter((link): link is string => typeof link === 'string')

describe('tool routes while the project is not active', () => {
  it.each(['COMING_UP', 'UNKNOWN', 'INIT_FAILED', 'GOING_DOWN'])(
    'all point at the project home while %s',
    (status) => {
      const links = linksOf(status)
      expect(links.length).toBeGreaterThan(0)
      expect(links.every((link) => link === '/project/abc')).toBe(true)
    }
  )

  it('point at the tools once ACTIVE_HEALTHY', () => {
    expect(linksOf('ACTIVE_HEALTHY').some((link) => link.startsWith('/project/abc/'))).toBe(true)
  })
})

describe('settings routes while the project is not active', () => {
  it.each(['COMING_UP', 'UNKNOWN', 'INIT_FAILED', 'GOING_DOWN'])(
    'all point at the project home while %s',
    (status) => {
      const links = settingsLinksOf(status)
      expect(links.length).toBeGreaterThan(0)
      expect(links.every((link) => link === '/project/abc')).toBe(true)
    }
  )

  it('point at the settings pages once ACTIVE_HEALTHY', () => {
    expect(
      settingsLinksOf('ACTIVE_HEALTHY').some((link) => link.startsWith('/project/abc/settings'))
    ).toBe(true)
  })
})
