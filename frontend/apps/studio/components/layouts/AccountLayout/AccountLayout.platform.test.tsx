import { render, screen, waitFor } from '@testing-library/react'
import type { PropsWithChildren, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AccountLayout from './AccountLayout'

const { mockRouter, mockRegisterOpenMenu, mockSetMobileSheetContent } = vi.hoisted(() => ({
  mockRouter: {
    pathname: '/account/me',
    push: vi.fn(),
    replace: vi.fn(),
  },
  mockRegisterOpenMenu: vi.fn(),
  mockSetMobileSheetContent: vi.fn(),
}))

vi.mock('@/lib/constants', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/constants')
  return {
    ...actual,
    IS_PLATFORM: true,
  }
})

vi.mock('next/router', () => ({
  useRouter: () => mockRouter,
}))

vi.mock('next/head', async () => {
  const React = await import('react')

  const Head = ({ children }: { children?: ReactNode }) => {
    React.useEffect(() => {
      const titleElement = React.Children.toArray(children).find(
        (child) => React.isValidElement(child) && child.type === 'title'
      )

      if (!React.isValidElement(titleElement)) return

      const titleText = React.Children.toArray(titleElement.props.children).join('')
      document.title = titleText
    }, [children])

    return null
  }

  return { default: Head }
})

vi.mock('@/hooks/custom-content/useCustomContent', () => ({
  useCustomContent: () => ({ appTitle: 'Powabase' }),
}))

vi.mock('@/hooks/misc/useIsFeatureEnabled', () => ({
  useIsFeatureEnabled: () => false,
}))

vi.mock('@/hooks/misc/useLocalStorage', () => ({
  useLocalStorageQuery: () => [''],
}))

vi.mock('@/hooks/misc/withAuth', () => ({
  withAuth: <T,>(Component: T) => Component,
}))

vi.mock('@/state/app-state', () => ({
  useAppStateSnapshot: () => ({
    lastRouteBeforeVisitingAccountPage: '',
  }),
}))

vi.mock('../Navigation/NavigationBar/MobileSheetContext', () => ({
  useMobileSheet: () => ({
    setContent: mockSetMobileSheetContent,
    registerOpenMenu: (callback: () => void) => {
      mockRegisterOpenMenu(callback)
      return () => {}
    },
  }),
}))

vi.mock('./WithSidebar', () => ({
  WithSidebar: ({
    sections,
    children,
  }: PropsWithChildren<{
    sections: Array<{
      key: string
      heading?: string
      links: Array<{ key: string; label: string }>
    }>
  }>) => (
    <div>
      <nav>
        {sections.map((section) => (
          <div key={section.key}>
            {section.heading ? <span>{section.heading}</span> : null}
            {section.links.map((link) => (
              <span key={link.key}>{link.label}</span>
            ))}
          </div>
        ))}
      </nav>
      {children}
    </div>
  ),
}))

vi.mock('ui', () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
}))

describe('AccountLayout (platform)', () => {
  beforeEach(() => {
    mockRouter.pathname = '/account/me'
    mockRouter.push.mockReset()
    mockRouter.replace.mockReset()
    mockRegisterOpenMenu.mockReset()
    mockSetMobileSheetContent.mockReset()
    document.title = ''
  })

  // Access Tokens is hidden on Powabase: the control plane implements no
  // /platform/profile/access-tokens endpoints, so the upstream page is a
  // dead-end (issue #681). The sidebar must not link to it.
  it('does not show the Access Tokens link in the account sidebar', () => {
    render(
      <AccountLayout title="Preferences">
        <div>Preferences page</div>
      </AccountLayout>
    )

    // Sanity: we are rendering the platform variant of the sidebar
    expect(screen.getByText('Account Settings')).toBeInTheDocument()
    expect(screen.getByText('Preferences')).toBeInTheDocument()
    expect(screen.getByText('Audit Logs')).toBeInTheDocument()

    expect(screen.queryByText('Access Tokens')).not.toBeInTheDocument()
    expect(mockRouter.push).not.toHaveBeenCalled()
    expect(mockRouter.replace).not.toHaveBeenCalled()
  })

  // router.replace (not push) so the dead URL is swapped out of history —
  // Back must exit to where the visitor came from, not bounce forward again.
  it('redirects /account/tokens to /account/me, replacing the history entry', async () => {
    mockRouter.pathname = '/account/tokens'

    render(
      <AccountLayout title="Access Tokens">
        <div>Tokens page</div>
      </AccountLayout>
    )

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith('/account/me')
    })
    expect(mockRouter.push).not.toHaveBeenCalled()
  })

  it('redirects /account/tokens/scoped to /account/me, replacing the history entry', async () => {
    mockRouter.pathname = '/account/tokens/scoped'

    render(
      <AccountLayout title="Access Tokens">
        <div>Scoped tokens page</div>
      </AccountLayout>
    )

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith('/account/me')
    })
    expect(mockRouter.push).not.toHaveBeenCalled()
  })
})
