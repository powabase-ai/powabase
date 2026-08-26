import { describe, expect, it } from 'vitest'

import { handleError } from '@/data/fetchers'
import { getQueryClient } from './query-client'
import { ResponseError } from '@/types'

const retry = getQueryClient().getDefaultOptions().queries?.retry as (
  failureCount: number,
  error: unknown
) => boolean

// The body openapi-fetch hands to callers for a gated 503, after the
// fetchers.ts onResponse middleware has folded code/requestId/retryAfter in.
const gated503 = {
  error: 'project_provisioning',
  status: 'COMING_UP',
  provisioning: {
    status: 'running',
    step: 'helm',
    failed_step: null,
    phase: 'services',
    error: null,
    attempts: 1,
    retryable: false,
    updated_at: null,
  },
  code: 503,
  requestId: 'r-1',
  retryAfter: 5,
  // A gated route the retry policy does not already skip: query-client.ts:14-19
  // pre-skips /platform/pg-meta/:ref/query, and that pathname would make the
  // classifier's red arm green before the classifier exists.
  requestPathname: '/platform/auth/abc/config',
}

function thrownBy(body: unknown): unknown {
  try {
    handleError(body)
  } catch (e) {
    return e
  }
  return undefined
}

describe('503 project_provisioning normalization (fetchers.handleError)', () => {
  it('becomes ResponseError{message: project_provisioning, code: 503, retryAfter: 5}', () => {
    const e = thrownBy(gated503) as ResponseError
    expect(e).toBeInstanceOf(ResponseError)
    expect(e.message).toBe('project_provisioning')
    expect(e.code).toBe(503)
    expect(e.retryAfter).toBe(5)
  })

  it('would be masked by a body carrying a message key — the platform body has none', () => {
    const e = thrownBy({ ...gated503, message: 'boom' }) as ResponseError
    expect(e.message).toBe('boom')
  })
})

describe('query retry policy', () => {
  it('does not retry the normalized 503 project_provisioning — the status poll moves it on', () => {
    expect(retry(0, thrownBy(gated503))).toBe(false)
  })

  it('still retries any other 503 on the same pathname — only the message differs', () => {
    expect(
      retry(0, new ResponseError('upstream unavailable', 503, undefined, 5, '/platform/auth/abc/config'))
    ).toBe(true)
  })

  it('still does not retry a 4xx', () => {
    expect(retry(0, new ResponseError('not found', 404))).toBe(false)
  })
})
