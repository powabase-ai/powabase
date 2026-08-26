import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrefetchSchemas, mockPrefetchEntityTypes, mockProject, mockRouterPrefetch } =
  vi.hoisted(() => ({
    mockPrefetchSchemas: vi.fn().mockResolvedValue(undefined),
    mockPrefetchEntityTypes: vi.fn().mockResolvedValue(undefined),
    mockProject: { current: { ref: 'abc', status: 'COMING_UP', connectionString: '' } as any },
    mockRouterPrefetch: vi.fn(),
  }))

vi.mock('next/router', () => ({ useRouter: () => ({ prefetch: mockRouterPrefetch }) }))
vi.mock('@/data/database/schemas-query', () => ({ prefetchSchemas: mockPrefetchSchemas }))
vi.mock('@/data/entity-types/entity-types-infinite-query', () => ({
  prefetchEntityTypes: mockPrefetchEntityTypes,
}))
vi.mock('@/hooks/misc/useLocalStorage', () => ({ useLocalStorage: () => ['alphabetical'] }))
vi.mock('@/hooks/misc/useSelectedProject', () => ({
  useSelectedProjectQuery: () => ({ data: mockProject.current }),
}))

import { usePrefetchEditorIndexPage } from './project.$ref.editor'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
)

describe('usePrefetchEditorIndexPage', () => {
  beforeEach(() => {
    mockPrefetchSchemas.mockClear()
    mockPrefetchEntityTypes.mockClear()
  })

  it('prefetches nothing from the data plane while the project is COMING_UP', () => {
    mockProject.current = { ref: 'abc', status: 'COMING_UP', connectionString: '' }
    const { result } = renderHook(() => usePrefetchEditorIndexPage(), { wrapper })
    act(() => result.current())
    expect(mockPrefetchSchemas).not.toHaveBeenCalled()
    expect(mockPrefetchEntityTypes).not.toHaveBeenCalled()
  })

  it('prefetches once the project is ACTIVE_HEALTHY', () => {
    mockProject.current = { ref: 'abc', status: 'ACTIVE_HEALTHY', connectionString: 'postgres://x' }
    const { result } = renderHook(() => usePrefetchEditorIndexPage(), { wrapper })
    act(() => result.current())
    expect(mockPrefetchSchemas).toHaveBeenCalledTimes(1)
    expect(mockPrefetchEntityTypes).toHaveBeenCalledTimes(1)
  })
})
