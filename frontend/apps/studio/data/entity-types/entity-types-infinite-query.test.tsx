import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockExecuteSql, mockProject } = vi.hoisted(() => ({
  mockExecuteSql: vi.fn(),
  mockProject: { current: { ref: 'default', status: 'COMING_UP' } as any },
}))

vi.mock('@/data/sql/execute-sql-query', () => ({
  executeSql: mockExecuteSql,
  ExecuteSqlError: class extends Error {},
}))
vi.mock('@/hooks/misc/useSelectedProject', () => ({
  useSelectedProjectQuery: () => ({ data: mockProject.current }),
}))

import { useEntityTypesQuery } from './entity-types-infinite-query'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {children}
  </QueryClientProvider>
)

describe('useEntityTypesQuery data-plane gate (the editor product menu mounts it before the bounce)', () => {
  beforeEach(() => {
    mockExecuteSql.mockReset()
    mockExecuteSql.mockResolvedValue({ result: [{ data: { entities: [], count: 0 } }] })
  })

  it('runs no SQL while the project is COMING_UP', async () => {
    mockProject.current = { ref: 'default', status: 'COMING_UP' }
    const { result } = renderHook(
      () => useEntityTypesQuery({ projectRef: 'default', connectionString: 'postgres://x' }),
      { wrapper }
    )
    await new Promise((r) => setTimeout(r, 50))
    expect(mockExecuteSql).not.toHaveBeenCalled()
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('runs once the project is ACTIVE_HEALTHY', async () => {
    mockProject.current = { ref: 'default', status: 'ACTIVE_HEALTHY' }
    renderHook(
      () => useEntityTypesQuery({ projectRef: 'default', connectionString: 'postgres://x' }),
      { wrapper }
    )
    await waitFor(() => expect(mockExecuteSql).toHaveBeenCalledTimes(1))
  })
})
