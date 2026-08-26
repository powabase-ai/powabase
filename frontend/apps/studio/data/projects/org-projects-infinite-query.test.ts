import { describe, expect, it, vi } from 'vitest'

vi.mock('@/data/fetchers', () => ({ get: vi.fn(), handleError: vi.fn() }))
vi.mock('@/lib/profile', () => ({ useProfile: () => ({ profile: {} }) }))

import { orgProjectsRefetchInterval } from './org-projects-infinite-query'

const page = (...statuses: string[]) => ({ projects: statuses.map((status) => ({ status })) })

describe('orgProjectsRefetchInterval', () => {
  it('polls every 10 s while any listed project is still being set up', () => {
    expect(orgProjectsRefetchInterval({ pages: [page('ACTIVE_HEALTHY'), page('COMING_UP')] })).toBe(10_000)
    expect(orgProjectsRefetchInterval({ pages: [page('UNKNOWN')] })).toBe(10_000)
  })

  it('does not poll for failed or active projects', () => {
    expect(orgProjectsRefetchInterval({ pages: [page('ACTIVE_HEALTHY', 'INIT_FAILED')] })).toBe(false)
    expect(orgProjectsRefetchInterval(undefined)).toBe(false)
  })
})
