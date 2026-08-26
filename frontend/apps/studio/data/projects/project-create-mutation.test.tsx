import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPost } = vi.hoisted(() => ({ mockPost: vi.fn() }))

vi.mock('@/data/fetchers', () => ({
  post: mockPost,
  handleError: (e: unknown) => {
    throw e
  },
}))
vi.mock('common', async (importOriginal) => ({
  ...(await importOriginal<typeof import('common')>()),
  hasConsented: () => false,
}))
vi.mock('./org-projects-infinite-query', () => ({
  useInvalidateProjectsInfiniteQuery: () => ({ invalidateProjectsQuery: vi.fn() }),
}))
// The hook toasts and reports on error; neither matters here.
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/lib/error-reporting', () => ({ captureCriticalError: vi.fn() }))

import { createProject, useProjectCreateMutation } from './project-create-mutation'

const vars = {
  name: 'demo',
  organizationSlug: 'org',
  dbPass: 'unused',
  aiProviderKeys: { openai: '', anthropic: '', google: '', openrouter: '' },
  computeSizeId: 'nano',
} as any

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
)

const sentKey = (call: number) => mockPost.mock.calls[call][1].headers['Idempotency-Key']

describe('createProject', () => {
  beforeEach(() => {
    mockPost.mockReset()
    mockPost.mockResolvedValue({ data: { ref: 'abc' }, error: undefined })
  })

  it('always sends the Idempotency-Key header it is given', async () => {
    await createProject(vars, 'k-1')
    expect(mockPost).toHaveBeenCalledWith(
      '/platform/projects',
      expect.objectContaining({ headers: { 'Idempotency-Key': 'k-1' } })
    )
  })
})

describe('useProjectCreateMutation intent key', () => {
  beforeEach(() => {
    mockPost.mockReset()
    mockPost.mockResolvedValue({ data: { ref: 'abc' }, error: undefined })
  })

  it('reuses one key across resubmits of the same contents, and rotates it when they change', async () => {
    const { result } = renderHook(() => useProjectCreateMutation(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(vars)
    })
    await act(async () => {
      await result.current.mutateAsync({ ...vars })
    })
    await act(async () => {
      await result.current.mutateAsync({ ...vars, name: 'demo2' })
    })

    expect(mockPost).toHaveBeenCalledTimes(3)
    expect(sentKey(0)).toMatch(/^[A-Za-z0-9._:-]{1,128}$/)
    expect(sentKey(1)).toBe(sentKey(0))
    expect(sentKey(2)).not.toBe(sentKey(0))
  })

  it('gives each mounted form its own key', async () => {
    const a = renderHook(() => useProjectCreateMutation(), { wrapper })
    const b = renderHook(() => useProjectCreateMutation(), { wrapper })
    await act(async () => {
      await a.result.current.mutateAsync(vars)
    })
    await act(async () => {
      await b.result.current.mutateAsync(vars)
    })
    expect(sentKey(1)).not.toBe(sentKey(0))
  })

  it('reuses the key when the previous attempt failed in transport — the case the key exists for', async () => {
    mockPost.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useProjectCreateMutation(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(vars).catch(() => undefined)
    })
    await act(async () => {
      await result.current.mutateAsync(vars)
    })
    expect(mockPost).toHaveBeenCalledTimes(2)
    expect(sentKey(1)).toBe(sentKey(0))
  })

  it('remembers only the latest submitted body: A → B → A issues three keys', async () => {
    const { result } = renderHook(() => useProjectCreateMutation(), { wrapper })
    for (const body of [vars, { ...vars, name: 'other' }, vars]) {
      await act(async () => {
        await result.current.mutateAsync(body)
      })
    }
    expect(sentKey(1)).not.toBe(sentKey(0))
    expect(sentKey(2)).not.toBe(sentKey(0))
  })
})
