import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type FeatureFlag = 'project_settings:new_api_key_format'

const { mockUseIsFeatureEnabled, capturedPageLayoutProps } = vi.hoisted(() => ({
  mockUseIsFeatureEnabled: vi.fn<(flag: FeatureFlag) => boolean>(),
  capturedPageLayoutProps: { current: null as unknown },
}))

vi.mock('common', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('common')
  return { ...actual, useParams: () => ({ ref: 'test-project' }) }
})

vi.mock('@/hooks/misc/useIsFeatureEnabled', () => ({
  useIsFeatureEnabled: mockUseIsFeatureEnabled,
}))

// Stub PageLayout to capture the navigationItems prop without rendering the full chrome.
vi.mock('@/components/layouts/PageLayout/PageLayout', () => ({
  PageLayout: (props: Record<string, unknown>) => {
    capturedPageLayoutProps.current = props
    return <div data-testid="page-layout">{props.children as ReactNode}</div>
  },
}))

vi.mock('@/components/layouts/Scaffold', () => ({
  ScaffoldContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/DocsButton', () => ({
  DocsButton: () => <button>Docs</button>,
}))

import ApiKeysLayout from '@/components/layouts/APIKeys/APIKeysLayout'

interface NavigationItem {
  label: string
  href: string
  id: string
}

const captureNavItems = (): NavigationItem[] => {
  const props = capturedPageLayoutProps.current as { navigationItems?: NavigationItem[] } | null
  return props?.navigationItems ?? []
}

describe('APIKeysLayout — project_settings:new_api_key_format gating', () => {
  beforeEach(() => {
    capturedPageLayoutProps.current = null
    mockUseIsFeatureEnabled.mockReset()
  })

  it('flag off: renders exactly one nav item labelled "Project API keys" pointing at /legacy', () => {
    mockUseIsFeatureEnabled.mockReturnValue(false)

    render(
      <ApiKeysLayout>
        <div>child</div>
      </ApiKeysLayout>
    )

    const items = captureNavItems()
    expect(items).toHaveLength(1)
    expect(items[0]).toEqual({
      label: 'Project API keys',
      href: '/project/test-project/settings/api-keys/legacy',
      id: 'legacy-keys',
    })
  })

  it('flag on: renders two nav items, "Publishable and secret API keys" + flipped legacy label', () => {
    mockUseIsFeatureEnabled.mockReturnValue(true)

    render(
      <ApiKeysLayout>
        <div>child</div>
      </ApiKeysLayout>
    )

    const items = captureNavItems()
    expect(items).toHaveLength(2)
    expect(items[0]).toEqual({
      label: 'Publishable and secret API keys',
      href: '/project/test-project/settings/api-keys',
      id: 'new-keys',
    })
    expect(items[1]).toEqual({
      label: 'Legacy anon, service_role API keys',
      href: '/project/test-project/settings/api-keys/legacy',
      id: 'legacy-keys',
    })
  })
})
