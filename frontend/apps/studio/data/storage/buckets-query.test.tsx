import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockExecuteSql, mockGet, mockProject } = vi.hoisted(() => ({
  mockExecuteSql: vi.fn(),
  mockGet: vi.fn(),
  mockProject: { current: { ref: 'default', status: 'COMING_UP', connectionString: '' } as any },
}))

vi.mock('@/data/fetchers', () => ({
  get: mockGet,
  handleError: (e: unknown) => {
    throw e
  },
}))
vi.mock('@/data/sql/execute-sql-query', () => ({
  executeSql: mockExecuteSql,
  ExecuteSqlError: class extends Error {},
}))
vi.mock('@/hooks/misc/useSelectedProject', () => ({
  useSelectedProjectQuery: () => ({ data: mockProject.current }),
}))

import { useBucketNumberEstimateQuery } from './buckets-query'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {children}
  </QueryClientProvider>
)

describe('useBucketNumberEstimateQuery data-plane gate (command-menu search mounts it)', () => {
  beforeEach(() => {
    mockExecuteSql.mockReset()
    mockGet.mockReset()
    mockExecuteSql.mockResolvedValue({ result: [{ count: 0 }] })
    mockGet.mockResolvedValue({ data: [], error: undefined })
  })

  it('fires nothing while the project is COMING_UP', async () => {
    mockProject.current = { ref: 'default', status: 'COMING_UP', connectionString: '' }
    const { result } = renderHook(() => useBucketNumberEstimateQuery({ projectRef: 'default' }), {
      wrapper,
    })
    await new Promise((r) => setTimeout(r, 50))
    expect(mockExecuteSql).not.toHaveBeenCalled()
    expect(mockGet).not.toHaveBeenCalled()
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('fires once the project is ACTIVE_HEALTHY', async () => {
    mockProject.current = { ref: 'default', status: 'ACTIVE_HEALTHY', connectionString: 'postgres://x' }
    renderHook(() => useBucketNumberEstimateQuery({ projectRef: 'default' }), { wrapper })
    await waitFor(() => expect(mockExecuteSql).toHaveBeenCalledTimes(1))
  })
})
