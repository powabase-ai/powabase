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

import { useAPIKeysQuery } from './api-keys-query'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {children}
  </QueryClientProvider>
)

describe('useAPIKeysQuery data-plane gate (the command menu mounts it on every page)', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({ data: [], error: undefined })
  })

  it('fires no request while the project is COMING_UP', async () => {
    mockProject.current = { ref: 'default', status: 'COMING_UP' }
    const { result } = renderHook(() => useAPIKeysQuery({ projectRef: 'default' }), { wrapper })
    await new Promise((r) => setTimeout(r, 50))
    expect(mockGet).not.toHaveBeenCalled()
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('fetches once the project is ACTIVE_HEALTHY', async () => {
    mockProject.current = { ref: 'default', status: 'ACTIVE_HEALTHY' }
    renderHook(() => useAPIKeysQuery({ projectRef: 'default' }), { wrapper })
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1))
  })
})
