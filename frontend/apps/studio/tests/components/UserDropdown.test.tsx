import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render } from '@/tests/helpers'

const {
  mockPush,
  mockUseTheme,
  mockUseProfileNameAndPicture,
  mockUseIsFeatureEnabled,
} = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockUseTheme: vi.fn(() => ({ theme: 'dark', setTheme: vi.fn() })),
  mockUseProfileNameAndPicture: vi.fn(() => ({
    username: 'Test User',
    avatarUrl: '',
    primaryEmail: 'test@example.com',
    isLoading: false,
  })),
  mockUseIsFeatureEnabled: vi.fn(() => true),
}))

vi.mock('next/router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('next-themes', () => ({
  useTheme: mockUseTheme,
}))

vi.mock('@/lib/constants', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/constants')
  return { ...actual, IS_PLATFORM: true }
})

vi.mock('@/lib/profile', () => ({
  useProfileNameAndPicture: mockUseProfileNameAndPicture,
}))

vi.mock('@/hooks/misc/useIsFeatureEnabled', () => ({
  useIsFeatureEnabled: mockUseIsFeatureEnabled,
}))

import { UserDropdown } from '@/components/interfaces/UserDropdown'

describe('UserDropdown', () => {
  beforeEach(() => {
    mockPush.mockClear()
  })

  it('pushes to /account/me when Account preferences is clicked', async () => {
    const user = userEvent.setup()
    const { container } = render(<UserDropdown />)

    const trigger = container.querySelector('[aria-haspopup="menu"]') as HTMLElement
    expect(trigger).not.toBeNull()
    await user.click(trigger)

    const item = await screen.findByRole('menuitem', { name: /account preferences/i })
    await user.click(item)

    expect(mockPush).toHaveBeenCalledWith('/account/me')
  })
})
