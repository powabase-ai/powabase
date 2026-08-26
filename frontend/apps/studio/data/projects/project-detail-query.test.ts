import { describe, expect, it, vi } from 'vitest'

vi.mock('@/data/fetchers', () => ({
  get: vi.fn(),
  handleError: vi.fn(),
  // Platform semantics: a connection string is valid when non-empty.
  isValidConnString: (s: string | null | undefined) => Boolean(s),
}))

import { shouldPollProjectDetail } from './project-detail-query'

describe('shouldPollProjectDetail', () => {
  it.each([
    ['COMING_UP', 'postgres://x', true],
    ['UNKNOWN', 'postgres://x', true],
    ['GOING_DOWN', 'postgres://x', true],
    ['GOING_DOWN', undefined, true],
    // Terminal: a failed set-up has no connection string, and must NOT poll forever.
    ['INIT_FAILED', 'postgres://x', false],
    ['INIT_FAILED', undefined, false],
    ['INIT_FAILED', '', false],
    ['ACTIVE_HEALTHY', 'postgres://x', false],
    ['ACTIVE_HEALTHY', '', true],
    [undefined, undefined, true],
  ])('status=%s connectionString=%j → %s', (status, connectionString, expected) => {
    expect(shouldPollProjectDetail(status, connectionString)).toBe(expected)
  })
})
