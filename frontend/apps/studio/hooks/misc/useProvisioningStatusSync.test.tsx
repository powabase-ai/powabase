import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockStatus, mockUseProjectStatusQuery, mockInvalidateDetail, mockInvalidateList } =
  vi.hoisted(() => {
    const mockStatus = { current: undefined as { status: string } | undefined, isError: false }
    return {
      mockStatus,
      mockUseProjectStatusQuery: vi.fn(() => ({
        data: mockStatus.current,
        isError: mockStatus.isError,
      })),
      mockInvalidateDetail: vi.fn(),
      mockInvalidateList: vi.fn(),
    }
  })

vi.mock('@/data/projects/project-status-query', () => ({
  useProjectStatusQuery: mockUseProjectStatusQuery,
}))
vi.mock('@/data/projects/project-detail-query', () => ({
  useInvalidateProjectDetailsQuery: () => ({ invalidateProjectDetailsQuery: mockInvalidateDetail }),
}))
vi.mock('@/data/projects/org-projects-infinite-query', () => ({
  useInvalidateProjectsInfiniteQuery: () => ({ invalidateProjectsQuery: mockInvalidateList }),
}))

import { useProvisioningStatusSync } from './useProvisioningStatusSync'

/** The refetchInterval function the hook handed to useProjectStatusQuery on its last render. */
const lastInterval = () =>
  (mockUseProjectStatusQuery.mock.calls.at(-1) as any)[1].refetchInterval as (
    query: any
  ) => number | false

describe('useProvisioningStatusSync', () => {
  beforeEach(() => {
    mockInvalidateDetail.mockReset()
    mockInvalidateList.mockReset()
    mockUseProjectStatusQuery.mockClear()
    mockStatus.current = undefined
    mockStatus.isError = false
  })

  it('pulls the detail forward when /status is ahead of it', () => {
    mockStatus.current = { status: 'INIT_FAILED' }
    renderHook(() => useProvisioningStatusSync('abc', 'COMING_UP', true, true))
    expect(mockInvalidateDetail).toHaveBeenCalledWith('abc')
  })

  it('leaves the detail alone when /status agrees with it', () => {
    mockStatus.current = { status: 'COMING_UP' }
    renderHook(() => useProvisioningStatusSync('abc', 'COMING_UP', true, true))
    expect(mockInvalidateDetail).not.toHaveBeenCalled()
  })

  it('invalidates the list once when it starts watching a not-active project', () => {
    const { rerender } = renderHook(() => useProvisioningStatusSync('abc', 'INIT_FAILED', true, true))
    expect(mockInvalidateList).toHaveBeenCalledTimes(1)
    rerender()
    expect(mockInvalidateList).toHaveBeenCalledTimes(1)
  })

  it('reconciles the list once for an active project with provisioning history — its card may be stale', () => {
    const { rerender } = renderHook(() =>
      useProvisioningStatusSync('abc', 'ACTIVE_HEALTHY', false, true)
    )
    expect(mockInvalidateList).toHaveBeenCalledTimes(1)
    rerender()
    expect(mockInvalidateList).toHaveBeenCalledTimes(1)
    expect((mockUseProjectStatusQuery.mock.calls.at(-1) as any)?.[1].enabled).toBe(false)
  })

  it('does nothing for an active project without provisioning history — flag-off and legacy rows', () => {
    renderHook(() => useProvisioningStatusSync('abc', 'ACTIVE_HEALTHY', false, false))
    expect(mockInvalidateList).not.toHaveBeenCalled()
    expect(mockInvalidateDetail).not.toHaveBeenCalled()
  })

  it('invalidates the list again on every change of the detail status, and not otherwise', () => {
    const { rerender } = renderHook(
      ({ s }: { s: string | undefined }) => useProvisioningStatusSync('abc', s, true, true),
      { initialProps: { s: 'COMING_UP' as string | undefined } }
    )
    expect(mockInvalidateList).toHaveBeenCalledTimes(1) // the mount reconciliation
    rerender({ s: 'COMING_UP' })
    expect(mockInvalidateList).toHaveBeenCalledTimes(1)
    rerender({ s: 'INIT_FAILED' })
    expect(mockInvalidateList).toHaveBeenCalledTimes(2)
    rerender({ s: 'COMING_UP' })
    expect(mockInvalidateList).toHaveBeenCalledTimes(3)
    rerender({ s: 'ACTIVE_HEALTHY' })
    expect(mockInvalidateList).toHaveBeenCalledTimes(4)
  })

  it('polls every 4 s while moving and stops on a settled status', () => {
    renderHook(() => useProvisioningStatusSync('abc', 'COMING_UP', true, true))
    const interval = lastInterval()
    expect(interval({ state: { status: 'success', data: { status: 'COMING_UP' } } })).toBe(4000)
    expect(interval({ state: { status: 'success', data: { status: 'ACTIVE_HEALTHY' } } })).toBe(false)
    expect(interval({ state: { status: 'success', data: { status: 'INIT_FAILED' } } })).toBe(false)
  })

  it('stops only when the project is gone; any other error backs off and keeps retrying', () => {
    renderHook(() => useProvisioningStatusSync('abc', 'COMING_UP', true, true))
    const interval = lastInterval()
    expect(interval({ state: { status: 'error', error: { code: 404 }, data: undefined } })).toBe(false)
    expect(interval({ state: { status: 'error', error: { code: 503 }, data: undefined } })).toBe(15_000)
    expect(interval({ state: { status: 'error', error: {}, data: undefined } })).toBe(15_000)
  })

  it('reports a poll error so the surface can say the platform is unreachable', () => {
    mockStatus.isError = true
    const { result } = renderHook(() => useProvisioningStatusSync('abc', 'COMING_UP', true, true))
    expect(result.current.isPollError).toBe(true)
  })
})
