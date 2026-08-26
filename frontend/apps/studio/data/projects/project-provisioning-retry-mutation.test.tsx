import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockInvalidateList } = vi.hoisted(() => ({ mockInvalidateList: vi.fn() }))

vi.mock('@/data/fetchers', () => ({
  constructHeaders: async (init?: HeadersInit) => new Headers(init),
}))
vi.mock('@/data/projects/org-projects-infinite-query', () => ({
  useInvalidateProjectsInfiniteQuery: () => ({ invalidateProjectsQuery: mockInvalidateList }),
}))

import {
  ProvisioningRetryError,
  useProjectProvisioningRetryMutation,
} from './project-provisioning-retry-mutation'

function setup(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  )
  vi.stubGlobal('fetch', fetchMock)
  const qc = new QueryClient()
  const invalidate = vi.spyOn(qc, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return { fetchMock, invalidate, wrapper }
}

afterEach(() => {
  vi.unstubAllGlobals()
  mockInvalidateList.mockReset()
})

describe('useProjectProvisioningRetryMutation', () => {
  it('posts an empty JSON body and refetches detail, status and list on 202', async () => {
    const { fetchMock, invalidate, wrapper } = setup(202, { ref: 'abc', status: 'COMING_UP' })
    const { result } = renderHook(() => useProjectProvisioningRetryMutation(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ ref: 'abc' })
    })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/platform\/projects\/abc\/provisioning\/retry$/),
      expect.objectContaining({ method: 'POST', body: '{}' })
    )
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['project', 'abc', 'detail'] })
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['project', 'abc', 'status'] })
      expect(mockInvalidateList).toHaveBeenCalledTimes(1)
    })
  })

  it('surfaces 409 not_retryable with the status code, and still refetches everything', async () => {
    const { invalidate, wrapper } = setup(409, { error: 'not_retryable', status: 'ACTIVE_HEALTHY' })
    const { result } = renderHook(() => useProjectProvisioningRetryMutation(), { wrapper })

    let caught: unknown
    await act(async () => {
      try {
        await result.current.mutateAsync({ ref: 'abc' })
      } catch (e) {
        caught = e
      }
    })

    expect(caught).toBeInstanceOf(ProvisioningRetryError)
    expect(caught).toMatchObject({ code: 409, message: 'not_retryable' })
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['project', 'abc', 'detail'] })
      expect(mockInvalidateList).toHaveBeenCalledTimes(1)
    })
  })

  it('stays pending until the refetches and invalidations it triggers have completed', async () => {
    const { invalidate, wrapper } = setup(202, { ref: 'abc', status: 'COMING_UP' })
    const releases: Array<() => void> = []
    invalidate.mockImplementation(() => new Promise<void>((resolve) => releases.push(resolve)))
    const { result } = renderHook(() => useProjectProvisioningRetryMutation(), { wrapper })

    act(() => {
      result.current.mutate({ ref: 'abc' })
    })
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2))
    expect(result.current.isPending).toBe(true)

    await act(async () => {
      releases.forEach((release) => release())
    })
    await waitFor(() => expect(result.current.isPending).toBe(false))
  })
})
