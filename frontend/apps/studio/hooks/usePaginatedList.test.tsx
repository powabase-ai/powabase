import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

import { usePaginatedList } from './usePaginatedList'

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('usePaginatedList', () => {
  it('returns first page when enabled', async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      items: [{ id: '1' }, { id: '2' }],
      total: 2,
    })

    const { result } = renderHook(
      () =>
        usePaginatedList<{ id: string }>({
          enabled: true,
          queryKey: ['test', 'a'],
          fetchPage,
        }),
      { wrapper: makeWrapper() }
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.items).toEqual([{ id: '1' }, { id: '2' }])
    expect(result.current.total).toBe(2)
    expect(result.current.hasNextPage).toBe(false)
  })

  it('does not fetch when disabled', () => {
    const fetchPage = vi.fn()
    renderHook(
      () =>
        usePaginatedList<{ id: string }>({
          enabled: false,
          queryKey: ['test', 'b'],
          fetchPage,
        }),
      { wrapper: makeWrapper() }
    )
    expect(fetchPage).not.toHaveBeenCalled()
  })

  it('passes limit, offset, signal to fetchPage', async () => {
    const fetchPage = vi.fn().mockResolvedValue({ items: [], total: 0 })
    renderHook(
      () =>
        usePaginatedList<{ id: string }>({
          enabled: true,
          queryKey: ['test', 'c'],
          pageSize: 25,
          fetchPage,
        }),
      { wrapper: makeWrapper() }
    )
    await waitFor(() => expect(fetchPage).toHaveBeenCalled())
    const call = fetchPage.mock.calls[0][0]
    expect(call.limit).toBe(25)
    expect(call.offset).toBe(0)
    expect(call.signal).toBeInstanceOf(AbortSignal)
  })

  it('reports hasNextPage when more rows exist', async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      items: Array.from({ length: 50 }, (_, i) => ({ id: String(i) })),
      total: 200,
    })
    const { result } = renderHook(
      () =>
        usePaginatedList<{ id: string }>({
          enabled: true,
          queryKey: ['test', 'd'],
          fetchPage,
        }),
      { wrapper: makeWrapper() }
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.hasNextPage).toBe(true)
  })

  it('appends pages on fetchNextPage', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        items: Array.from({ length: 50 }, (_, i) => ({ id: `p1-${i}` })),
        total: 100,
      })
      .mockResolvedValueOnce({
        items: Array.from({ length: 50 }, (_, i) => ({ id: `p2-${i}` })),
        total: 100,
      })
    const { result } = renderHook(
      () =>
        usePaginatedList<{ id: string }>({
          enabled: true,
          queryKey: ['test', 'e'],
          fetchPage,
        }),
      { wrapper: makeWrapper() }
    )
    await waitFor(() => expect(result.current.items.length).toBe(50))
    result.current.fetchNextPage()
    await waitFor(() => expect(result.current.items.length).toBe(100))
    expect(result.current.hasNextPage).toBe(false)
  })

  it('surfaces fetch errors', async () => {
    const fetchPage = vi.fn().mockRejectedValue(new Error('boom'))
    const { result } = renderHook(
      () =>
        usePaginatedList<{ id: string }>({
          enabled: true,
          queryKey: ['test', 'f'],
          fetchPage,
        }),
      { wrapper: makeWrapper() }
    )
    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.error?.message).toBe('boom')
  })
})
