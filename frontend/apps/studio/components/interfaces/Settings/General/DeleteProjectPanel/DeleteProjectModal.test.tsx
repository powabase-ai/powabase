import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockUseDelete, mockPush, mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockUseDelete: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  mockPush: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}))

vi.mock('next/router', () => ({
  useRouter: () => ({ asPath: '/project/abc', push: mockPush }),
}))
vi.mock('sonner', () => ({ toast: { success: mockToastSuccess, error: mockToastError } }))
vi.mock('ui', () => ({ Input: () => null }))
vi.mock('@/components/ui/TextConfirmModalWrapper', () => ({ TextConfirmModal: () => null }))
vi.mock('@/data/feedback/exit-survey-send', () => ({
  useSendDowngradeFeedbackMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/data/projects/project-delete-mutation', () => ({
  useProjectDeleteMutation: mockUseDelete,
}))
vi.mock('@/data/subscriptions/org-subscription-query', () => ({
  useOrgSubscriptionQuery: () => ({ data: { plan: { id: 'free' } } }),
}))
vi.mock('@/hooks/misc/useLocalStorage', () => ({ useLocalStorageQuery: () => ['org-1'] }))
vi.mock('@/hooks/misc/useSelectedOrganization', () => ({
  useSelectedOrganizationQuery: () => ({ data: { slug: 'org-1', name: 'Org' } }),
}))
vi.mock('@/hooks/misc/useSelectedProject', () => ({
  useSelectedProjectQuery: () => ({ data: { id: 'p-1', ref: 'abc', name: 'demo' } }),
}))

import { DeleteProjectModal } from './DeleteProjectModal'

describe('DeleteProjectModal success handling', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockToastSuccess.mockReset()
    mockToastError.mockReset()
    mockUseDelete.mockClear()
  })

  it('announces the removal neutrally and finishes navigating before it returns', async () => {
    let releasePush!: () => void
    mockPush.mockImplementation(() => new Promise<void>((resolve) => (releasePush = resolve)))
    render(<DeleteProjectModal visible onClose={() => {}} />)

    const { onSuccess } = (mockUseDelete.mock.calls[0] as any)[0]
    let settled = false
    const pending = onSuccess().then(() => {
      settled = true
    })
    await new Promise((r) => setTimeout(r, 0))

    expect(mockToastSuccess).toHaveBeenCalledWith('demo has been removed')
    expect(mockPush).toHaveBeenCalledWith('/org/org-1')
    // The mutation clears the project's caches as soon as this resolves; it
    // must not resolve while the project page is still the current route.
    expect(settled).toBe(false)

    releasePush()
    await pending
    expect(settled).toBe(true)
  })

  it('still returns normally when the navigation is rejected — the cache cleanup that follows must run', async () => {
    mockPush.mockRejectedValue(new Error('Route Cancelled'))
    render(<DeleteProjectModal visible onClose={() => {}} />)

    const { onSuccess } = (mockUseDelete.mock.calls[0] as any)[0]
    await expect(onSuccess()).resolves.toBeUndefined()

    expect(mockPush).toHaveBeenCalledWith('/org/org-1')
    expect(mockToastSuccess).toHaveBeenCalledTimes(1)
    expect(mockToastError).not.toHaveBeenCalled()
  })

  it('still returns normally when the navigation resolves false — a cancelled route change', async () => {
    mockPush.mockResolvedValue(false)
    render(<DeleteProjectModal visible onClose={() => {}} />)

    const { onSuccess } = (mockUseDelete.mock.calls[0] as any)[0]
    await expect(onSuccess()).resolves.toBeUndefined()
    expect(mockToastSuccess).toHaveBeenCalledTimes(1)
  })
})
