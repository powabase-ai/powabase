import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { mockProject } = vi.hoisted(() => ({
  mockProject: { current: { ref: 'default', status: 'COMING_UP' } as any },
}))

vi.mock('common', async (importOriginal) => ({
  ...(await importOriginal<typeof import('common')>()),
  useParams: () => ({ ref: 'default' }),
  getAccessToken: () => Promise.resolve('token'),
}))
vi.mock('@/data/projects/project-detail-query', () => ({
  useProjectDetailQuery: () => ({ data: mockProject.current, isLoading: false }),
}))
// Hold the auth axis constant so the assertions vary status only.
vi.mock('@/lib/ai-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai-api')>()),
  hasAiAuth: () => true,
}))

import { useProjectSupabaseClient } from './useProjectSupabaseClient'

describe('useProjectSupabaseClient.isReady', () => {
  it.each(['COMING_UP', 'UNKNOWN', 'INIT_FAILED', 'GOING_DOWN'])('is false while %s', (status) => {
    mockProject.current = { ref: 'default', status }
    const { result } = renderHook(() => useProjectSupabaseClient())
    expect(result.current.isReady).toBe(false)
  })

  it('is true once the project is ACTIVE_HEALTHY', () => {
    mockProject.current = { ref: 'default', status: 'ACTIVE_HEALTHY' }
    const { result } = renderHook(() => useProjectSupabaseClient())
    expect(result.current.isReady).toBe(true)
  })
})
