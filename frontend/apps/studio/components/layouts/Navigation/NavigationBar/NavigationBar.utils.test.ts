import { describe, expect, it } from 'vitest'

import { generateToolRoutes } from './NavigationBar.utils'

const linksOf = (status: string) =>
  generateToolRoutes('abc', { status } as any)
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
