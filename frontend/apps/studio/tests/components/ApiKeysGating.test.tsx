import { screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render } from '@/tests/helpers'

type FeatureFlag = 'project_settings:new_api_key_format' | 'project_settings:legacy_api_keys_toggle'

const { mockReplace, mockUseIsFeatureEnabled, flagState } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockUseIsFeatureEnabled: vi.fn<(flag: FeatureFlag) => boolean>(),
  // Per-flag override map so a test can set different values for different flags.
  // mockImplementation reads from this map instead of returning a single value, so
  // adding a second useIsFeatureEnabled call in either page doesn't silently couple
  // the two flags' truth values.
  flagState: new Map<FeatureFlag, boolean>(),
}))

vi.mock('next/router', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
}))

vi.mock('common', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('common')
  return { ...actual, useParams: () => ({ ref: 'test-project' }) }
})

vi.mock('@/hooks/misc/useIsFeatureEnabled', () => ({
  useIsFeatureEnabled: mockUseIsFeatureEnabled,
}))

vi.mock('@/hooks/misc/useCheckPermissions', () => ({
  useAsyncCheckPermissions: () => ({ can: true, isSuccess: true }),
}))

const mockUseAPIKeysQuery = vi.fn()
vi.mock('@/data/api-keys/api-keys-query', () => ({
  useAPIKeysQuery: (...args: unknown[]) => mockUseAPIKeysQuery(...args),
}))

// Stub layouts/panels to keep tests focused on gating behavior.
vi.mock('@/components/layouts/APIKeys/APIKeysLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/layouts/DefaultLayout', () => ({
  DefaultLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/layouts/ProjectSettingsLayout/SettingsLayout', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/interfaces/APIKeys/ApiKeysIllustrations', () => ({
  ApiKeysCreateCallout: () => <div>ApiKeysCreateCallout</div>,
  ApiKeysFeedbackBanner: () => <div>ApiKeysFeedbackBanner</div>,
}))
vi.mock('@/components/interfaces/APIKeys/PublishableAPIKeys', () => ({
  PublishableAPIKeys: () => <div>PublishableAPIKeys</div>,
}))
vi.mock('@/components/interfaces/APIKeys/SecretAPIKeys', () => ({
  SecretAPIKeys: () => <div>SecretAPIKeys</div>,
}))
vi.mock('@/components/ui/DisableInteraction', () => ({
  DisableInteraction: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/ui/ProjectSettings/DisplayApiSettings', () => ({
  DisplayApiSettings: () => <div>DisplayApiSettings</div>,
}))
vi.mock('@/components/ui/ProjectSettings/ToggleLegacyApiKeys', () => ({
  ToggleLegacyApiKeysPanel: () => <div>ToggleLegacyApiKeysPanel</div>,
}))

import ApiKeysNewPage from '@/pages/project/[ref]/settings/api-keys'
import ApiKeysLegacyPage from '@/pages/project/[ref]/settings/api-keys/legacy'

describe('API Keys page gating — project_settings:new_api_key_format', () => {
  beforeEach(() => {
    mockReplace.mockClear()
    mockUseIsFeatureEnabled.mockReset()
    flagState.clear()
    mockUseIsFeatureEnabled.mockImplementation((flag) => flagState.get(flag) ?? false)
    mockUseAPIKeysQuery.mockReset()
    mockUseAPIKeysQuery.mockReturnValue({ data: [] })
  })

  it('renders null and redirects to /legacy when flag is off', () => {
    flagState.set('project_settings:new_api_key_format', false)
    flagState.set('project_settings:legacy_api_keys_toggle', false)

    const { container } = render(<ApiKeysNewPage />)

    expect(container.firstChild).toBeNull()
    expect(mockReplace).toHaveBeenCalledWith('/project/test-project/settings/api-keys/legacy')
  })

  it('disables the API keys query when flag is off (prevents calling the broken endpoint)', () => {
    flagState.set('project_settings:new_api_key_format', false)
    flagState.set('project_settings:legacy_api_keys_toggle', false)

    render(<ApiKeysNewPage />)

    // useAPIKeysQuery receives `enabled: canReadAPIKeys && newApiKeyFormatEnabled`.
    // canReadAPIKeys is mocked to true, flag is false, so enabled MUST be false.
    expect(mockUseAPIKeysQuery).toHaveBeenCalled()
    const [, options] = mockUseAPIKeysQuery.mock.calls[0] as [unknown, { enabled: boolean }]
    expect(options.enabled).toBe(false)
  })

  it('renders the page (no redirect) when flag is on', () => {
    flagState.set('project_settings:new_api_key_format', true)
    flagState.set('project_settings:legacy_api_keys_toggle', true)

    render(<ApiKeysNewPage />)

    expect(mockReplace).not.toHaveBeenCalled()
    expect(screen.getByText('PublishableAPIKeys')).toBeInTheDocument()
  })
})

describe('Legacy API Keys page gating — project_settings:legacy_api_keys_toggle', () => {
  beforeEach(() => {
    mockReplace.mockClear()
    mockUseIsFeatureEnabled.mockReset()
    flagState.clear()
    mockUseIsFeatureEnabled.mockImplementation((flag) => flagState.get(flag) ?? false)
  })

  it('renders DisplayApiSettings but hides ToggleLegacyApiKeysPanel when toggle flag is off', () => {
    flagState.set('project_settings:new_api_key_format', false)
    flagState.set('project_settings:legacy_api_keys_toggle', false)

    render(<ApiKeysLegacyPage />)

    expect(screen.getByText('DisplayApiSettings')).toBeInTheDocument()
    expect(screen.queryByText('ToggleLegacyApiKeysPanel')).not.toBeInTheDocument()
  })

  it('renders ToggleLegacyApiKeysPanel when toggle flag is on', () => {
    flagState.set('project_settings:new_api_key_format', true)
    flagState.set('project_settings:legacy_api_keys_toggle', true)

    render(<ApiKeysLegacyPage />)

    expect(screen.getByText('ToggleLegacyApiKeysPanel')).toBeInTheDocument()
  })
})
