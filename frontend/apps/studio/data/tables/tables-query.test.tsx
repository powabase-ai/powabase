import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGet, mockProject } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockProject: { current: { ref: 'default', status: 'COMING_UP' } as any },
}))

vi.mock('@/data/fetchers', () => ({
  get: mockGet,
  handleError: (e: unknown) => {
    throw e
  },
}))
vi.mock('@/hooks/misc/useSelectedProject', () => ({
  useSelectedProjectQuery: () => ({ data: mockProject.current }),
}))

import { useTablesQuery, usePrefetchTables } from './tables-query'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {children}
  </QueryClientProvider>
)

describe('useTablesQuery data-plane gate', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({ data: [], error: undefined })
  })

  it('fires no request while the project is COMING_UP', async () => {
    mockProject.current = { ref: 'default', status: 'COMING_UP' }
    const { result } = renderHook(
      () => useTablesQuery({ projectRef: 'default', connectionString: 'postgres://x' }),
      { wrapper }
    )
    await new Promise((r) => setTimeout(r, 50))
    expect(mockGet).not.toHaveBeenCalled()
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('fetches once the project is ACTIVE_HEALTHY', async () => {
    mockProject.current = { ref: 'default', status: 'ACTIVE_HEALTHY' }
    renderHook(
      () => useTablesQuery({ projectRef: 'default', connectionString: 'postgres://x' }),
      { wrapper }
    )
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1))
  })
})

describe('usePrefetchTables data-plane gate (the command menu calls it on every open)', () => {
  it('prefetches nothing while the project is COMING_UP, and does once ACTIVE_HEALTHY', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const prefetch = vi.spyOn(qc, 'prefetchQuery').mockResolvedValue(undefined)
    const w = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    )

    mockProject.current = { ref: 'default', status: 'COMING_UP' }
    const notActive = renderHook(
      () => usePrefetchTables({ projectRef: 'default', connectionString: '' }),
      { wrapper: w }
    )
    await notActive.result.current(undefined, true)
    expect(prefetch).not.toHaveBeenCalled()

    mockProject.current = { ref: 'default', status: 'ACTIVE_HEALTHY' }
    const active = renderHook(
      () => usePrefetchTables({ projectRef: 'default', connectionString: 'postgres://x' }),
      { wrapper: w }
    )
    await active.result.current(undefined, true)
    expect(prefetch).toHaveBeenCalledTimes(1)
  })
})
