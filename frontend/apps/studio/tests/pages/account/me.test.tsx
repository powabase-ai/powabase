import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import PreferencesPage from '@/pages/account/me'

const { mockIsPlatform } = vi.hoisted(() => ({
  mockIsPlatform: { value: true },
}))

vi.mock('@/lib/constants', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/constants')
  return {
    ...actual,
    get IS_PLATFORM() {
      return mockIsPlatform.value
    },
  }
})

vi.mock('@/components/layouts/AccountLayout/AccountLayout', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/layouts/AppLayout/AppLayout', () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/layouts/DefaultLayout', () => ({
  DefaultLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/interfaces/Account/Preferences/AccountIdentities', () => ({
  AccountIdentities: () => <div>AccountIdentities</div>,
}))

vi.mock('@/components/interfaces/Account/Preferences/ThemeSettings', () => ({
  ThemeSettings: () => <div>ThemeSettings</div>,
}))

vi.mock('@/components/interfaces/Account/Preferences/HotkeySettings', () => ({
  HotkeySettings: () => <div>HotkeySettings</div>,
}))

vi.mock('@/components/interfaces/Account/Preferences/DashboardSettings', () => ({
  DashboardSettings: () => <div>DashboardSettings</div>,
}))

describe('/account/me', () => {
  it('on platform, renders only AccountIdentities and the identities-focused description', () => {
    mockIsPlatform.value = true

    render(<PreferencesPage dehydratedState={{}} />)

    expect(screen.getByText('AccountIdentities')).toBeInTheDocument()
    expect(
      screen.getByText('Manage your account identities and password.')
    ).toBeInTheDocument()

    // Hidden sections must not render on platform mode
    expect(screen.queryByText('ProfileInformation')).not.toBeInTheDocument()
    expect(screen.queryByText('AccountConnections')).not.toBeInTheDocument()
    expect(screen.queryByText('ThemeSettings')).not.toBeInTheDocument()
    expect(screen.queryByText('HotkeySettings')).not.toBeInTheDocument()
    expect(screen.queryByText('DashboardSettings')).not.toBeInTheDocument()
    expect(screen.queryByText('AnalyticsSettings')).not.toBeInTheDocument()
    expect(screen.queryByText('AccountDeletion')).not.toBeInTheDocument()
  })

  it('renders only local preferences on self-hosted', () => {
    mockIsPlatform.value = false

    render(<PreferencesPage dehydratedState={{}} />)

    expect(screen.getByText('ThemeSettings')).toBeInTheDocument()
    expect(screen.getByText('HotkeySettings')).toBeInTheDocument()
    expect(screen.getByText('DashboardSettings')).toBeInTheDocument()
    expect(screen.queryByText('AccountIdentities')).not.toBeInTheDocument()
  })
})
