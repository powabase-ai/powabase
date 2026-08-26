import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MobileSheetProvider, useMobileSheet } from '../Navigation/NavigationBar/MobileSheetContext'
import { ProjectLayout } from './index'
import { STUDIO_PAGE_TITLE_SEPARATOR } from '@/lib/page-title'

const { mockRouter, mockSetSelectedDatabaseId, mockSetMobileMenuOpen } = vi.hoisted(() => ({
  mockRouter: {
    pathname: '/project/[ref]/observability/query-performance',
    asPath: '/project/default/observability/query-performance',
    push: vi.fn(),
    replace: vi.fn(),
  },
  mockSetSelectedDatabaseId: vi.fn(),
  mockSetMobileMenuOpen: vi.fn(),
}))

const {
  mockAddBanner,
  mockDismissBanner,
  mockProjectState,
  mockResourceWarningsState,
  mockBannerDismissedState,
} = vi.hoisted(() => ({
  mockAddBanner: vi.fn(),
  mockDismissBanner: vi.fn(),
  mockProjectState: {
    current: {
      ref: 'default',
      name: 'Project 1',
      status: 'ACTIVE_HEALTHY',
      postgrestStatus: 'ONLINE',
      infra_compute_size: undefined as string | undefined,
    },
    loading: false,
  },
  mockResourceWarningsState: { current: undefined as any[] | undefined },
  mockBannerDismissedState: { current: false },
}))

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

vi.mock('common', () => ({
  useParams: () => ({ ref: 'default' }),
  mergeRefs:
    (..._refs: any[]) =>
    (_value: unknown) => {},
  IS_PLATFORM: false,
  LOCAL_STORAGE_KEYS: {
    FREE_MICRO_UPGRADE_BANNER_DISMISSED: (ref: string) =>
      `free-micro-upgrade-banner-dismissed-${ref}`,
  },
  isFeatureEnabled: () => false,
}))

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    create: (Component: any) => Component,
  },
}))

vi.mock('ui', () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
  CommandInput_Shadcn_: { displayName: 'CommandInput' },
  Command_Shadcn_: { displayName: 'Command' },
  CommandGroup_Shadcn_: { displayName: 'CommandGroup' },
  CommandItem_Shadcn_: { displayName: 'CommandItem' },
  CommandList_Shadcn_: { displayName: 'CommandList' },
  LogoLoader: () => <div data-testid="logo-loader" />,
  // Strip the panel props that are not DOM attributes, or React warns on every render.
  ResizableHandle: ({ withHandle, ...props }: any) => <div {...props} />,
  ResizablePanel: ({ children, panelRef, minSize, maxSize, defaultSize, disabled, ...props }: any) => (
    <div {...props}>{children}</div>
  ),
  ResizablePanelGroup: ({ children, orientation, ...props }: any) => <div {...props}>{children}</div>,
  Sidebar: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  SidebarContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  SidebarFooter: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  SidebarGroup: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  SidebarMenu: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  SidebarMenuButton: (props: any) => <div {...props} />,
  SidebarMenuItem: (props: any) => <div {...props} />,
  useIsMobile: () => false,
  usePanelRef: () => undefined,
  useSidebar: () => ({ setOpen: vi.fn() }),
}))

vi.mock('ui-patterns/MobileSheetNav/MobileSheetNav', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('../editors/EditorsLayout.hooks', () => ({
  useEditorType: () => undefined,
}))

vi.mock('../MainScrollContainerContext', () => ({
  useSetMainScrollContainer: () => () => {},
}))

vi.mock('./BuildingState', () => ({ default: () => null }))
vi.mock('./ConnectingState', () => ({ default: () => null }))
vi.mock('./LoadingState', () => ({ LoadingState: () => null }))
vi.mock('./PausedState/ProjectPausedState', () => ({ ProjectPausedState: () => null }))
vi.mock('./PauseFailedState', () => ({ PauseFailedState: () => null }))
vi.mock('./PausingState', () => ({ PausingState: () => null }))
vi.mock('./ProductMenuBar', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('./ResizingState', () => ({ ResizingState: () => null }))
vi.mock('./RestartingState', () => ({ default: () => null }))
vi.mock('./RestoreFailedState', () => ({ RestoreFailedState: () => null }))
vi.mock('./RestoringState', () => ({ RestoringState: () => null }))
vi.mock('./UpgradingState', () => ({ UpgradingState: () => null }))

vi.mock('@/components/interfaces/BranchManagement/CreateBranchModal', () => ({
  CreateBranchModal: () => null,
}))
vi.mock('@/components/ui/ResourceExhaustionWarningBanner/ResourceExhaustionWarningBanner', () => ({
  ResourceExhaustionWarningBanner: () => null,
}))

vi.mock('@/hooks/custom-content/useCustomContent', () => ({
  useCustomContent: () => ({ appTitle: 'Supabase' }),
}))

vi.mock('@/hooks/misc/useLocalStorage', () => ({
  useLocalStorageQuery: () => [mockBannerDismissedState.current, vi.fn()],
}))

vi.mock('@/components/ui/BannerStack/BannerStackProvider', () => ({
  BANNER_ID: { FREE_MICRO_UPGRADE: 'free-micro-upgrade-banner' },
  useBannerStack: () => ({
    addBanner: mockAddBanner,
    dismissBanner: mockDismissBanner,
    banners: [],
  }),
}))

vi.mock('@/components/ui/BannerStack/Banners/BannerFreeMicroUpgrade', () => ({
  BannerFreeMicroUpgrade: () => null,
}))

vi.mock('@/data/usage/resource-warnings-query', () => ({
  useResourceWarningsQuery: () => ({ data: mockResourceWarningsState.current }),
}))

vi.mock('./LayoutHeader/MobileMenuContent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./LayoutHeader/MobileMenuContent')>()),
  MobileMenuContent: ({ currentProductMenu }: { currentProductMenu: React.ReactNode }) => (
    <div data-testid="sheet-menu">{currentProductMenu}</div>
  ),
}))

vi.mock('@/hooks/misc/useSelectedOrganization', () => ({
  useSelectedOrganizationQuery: () => ({
    data: { name: 'Organization 1', slug: 'org-1' },
  }),
}))

vi.mock('@/hooks/misc/useSelectedProject', () => ({
  useSelectedProjectQuery: () => ({
    data: mockProjectState.loading ? undefined : mockProjectState.current,
    isLoading: mockProjectState.loading,
  }),
}))

vi.mock('@/hooks/misc/withAuth', () => ({
  withAuth: (Component: any) => Component,
}))

vi.mock('@/hooks/ui/useFlag', () => ({
  usePHFlag: () => undefined,
}))

vi.mock('@/state/app-state', () => ({
  useAppStateSnapshot: () => ({
    mobileMenuOpen: false,
    showSidebar: false,
    setMobileMenuOpen: mockSetMobileMenuOpen,
  }),
}))

vi.mock('@/state/database-selector', () => ({
  useDatabaseSelectorStateSnapshot: () => ({
    setSelectedDatabaseId: mockSetSelectedDatabaseId,
  }),
}))

const renderLayout = () =>
  render(
    <MobileSheetProvider>
      <ProjectLayout product="Database" isBlocking={false}>
        <div />
      </ProjectLayout>
    </MobileSheetProvider>
  )

describe('ProjectLayout title', () => {
  beforeEach(() => {
    mockRouter.pathname = '/project/[ref]/observability/query-performance'
    mockRouter.asPath = '/project/default/observability/query-performance'
    document.title = ''
  })

  afterEach(() => {
    vi.clearAllMocks()
    document.title = ''
  })

  it('sets a composed document title and deduplicates identical section/surface labels', async () => {
    render(
      <MobileSheetProvider>
        <ProjectLayout browserTitle={{ section: 'Settings' }} product="Settings" isBlocking={false}>
          <div>Page Content</div>
        </ProjectLayout>
      </MobileSheetProvider>
    )

    await waitFor(() => {
      expect(document.title).toBe(
        ['Settings', 'Project 1', 'Organization 1', 'Supabase'].join(STUDIO_PAGE_TITLE_SEPARATOR)
      )
    })
  })

  it('prefers entity-first browserTitle metadata when provided', async () => {
    render(
      <MobileSheetProvider>
        <ProjectLayout
          product="Database"
          browserTitle={{ entity: 'users', section: 'Tables' }}
          isBlocking={false}
        >
          <div>Page Content</div>
        </ProjectLayout>
      </MobileSheetProvider>
    )

    await waitFor(() => {
      expect(document.title).toBe(
        ['users', 'Tables', 'Database', 'Project 1', 'Organization 1', 'Supabase'].join(
          STUDIO_PAGE_TITLE_SEPARATOR
        )
      )
    })
  })
})

describe('FREE_MICRO_UPGRADE banner', () => {
  beforeEach(() => {
    mockRouter.pathname = '/project/[ref]'
    mockRouter.asPath = '/project/default'
    mockProjectState.current = {
      ref: 'default',
      name: 'Project 1',
      status: 'ACTIVE_HEALTHY',
      postgrestStatus: 'ONLINE',
      infra_compute_size: 'nano',
    }
    mockResourceWarningsState.current = [
      {
        project: 'default',
        cpu_exhaustion: true,
        memory_and_swap_exhaustion: false,
        disk_space_exhaustion: false,
      },
    ]
    mockBannerDismissedState.current = false
  })

  afterEach(() => {
    vi.clearAllMocks()
    mockRouter.pathname = '/project/[ref]/observability/query-performance'
    mockRouter.asPath = '/project/default/observability/query-performance'
    mockProjectState.current = {
      ref: 'default',
      name: 'Project 1',
      status: 'ACTIVE_HEALTHY',
      postgrestStatus: 'ONLINE',
      infra_compute_size: undefined,
    }
    mockResourceWarningsState.current = undefined
    mockBannerDismissedState.current = false
  })

  it('calls addBanner when project is nano and compute is near exhaustion', async () => {
    renderLayout()

    await waitFor(() => {
      expect(mockAddBanner).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'free-micro-upgrade-banner' })
      )
    })
  })

  it('calls dismissBanner when banner was previously dismissed', async () => {
    mockBannerDismissedState.current = true

    renderLayout()

    await waitFor(() => {
      expect(mockDismissBanner).toHaveBeenCalledWith('free-micro-upgrade-banner')
    })
    expect(mockAddBanner).not.toHaveBeenCalled()
  })

  it('calls dismissBanner when compute warnings are cleared', async () => {
    mockResourceWarningsState.current = [
      {
        project: 'default',
        cpu_exhaustion: false,
        memory_and_swap_exhaustion: false,
        disk_space_exhaustion: false,
      },
    ]

    renderLayout()

    await waitFor(() => {
      expect(mockDismissBanner).toHaveBeenCalledWith('free-micro-upgrade-banner')
    })
    expect(mockAddBanner).not.toHaveBeenCalled()
  })

  it('calls dismissBanner when project is not nano compute', async () => {
    mockProjectState.current = { ...mockProjectState.current, infra_compute_size: 'micro' }

    renderLayout()

    await waitFor(() => {
      expect(mockDismissBanner).toHaveBeenCalledWith('free-micro-upgrade-banner')
    })
    expect(mockAddBanner).not.toHaveBeenCalled()
  })
})

const renderLayoutWithPage = () =>
  render(
    <MobileSheetProvider>
      <ProjectLayout product="Database" isBlocking={false}>
        <div data-testid="page-child" />
      </ProjectLayout>
    </MobileSheetProvider>
  )

describe('not-active bounce', () => {
  afterEach(() => {
    mockProjectState.current.status = 'ACTIVE_HEALTHY'
    mockRouter.pathname = '/project/[ref]/observability/query-performance'
    mockRouter.asPath = '/project/default/observability/query-performance'
    vi.clearAllMocks()
  })

  it.each(['COMING_UP', 'UNKNOWN', 'INIT_FAILED', 'GOING_DOWN'])(
    'sends a database page home while %s, without ever mounting the page',
    async (status) => {
      mockProjectState.current.status = status
      renderLayoutWithPage()
      await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/project/default'))
      expect(screen.queryByTestId('page-child')).toBeNull()
    }
  )

  it('sends a settings page home too while INIT_FAILED — no route is usable without a stack', async () => {
    mockRouter.pathname = '/project/[ref]/settings/general'
    mockRouter.asPath = '/project/default/settings/general'
    mockProjectState.current.status = 'INIT_FAILED'
    renderLayoutWithPage()
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/project/default'))
    expect(screen.queryByTestId('page-child')).toBeNull()
  })

  it('leaves an ACTIVE_HEALTHY project where it is and renders the page', async () => {
    mockProjectState.current.status = 'ACTIVE_HEALTHY'
    renderLayoutWithPage()
    await waitFor(() => expect(screen.getByTestId('page-child')).toBeInTheDocument())
    expect(mockRouter.replace).not.toHaveBeenCalledWith('/project/default')
  })
})

describe('deep link before the project detail has landed', () => {
  afterEach(() => {
    mockProjectState.loading = false
    mockProjectState.current = {
      ref: 'default',
      name: 'Project 1',
      status: 'ACTIVE_HEALTHY',
      postgrestStatus: 'ONLINE',
      infra_compute_size: undefined,
    }
    vi.clearAllMocks()
  })

  it('holds a non-home page while the detail is loading, and does not bounce it', async () => {
    mockProjectState.loading = true
    renderLayoutWithPage()
    await waitFor(() => expect(screen.getByTestId('logo-loader')).toBeInTheDocument())
    expect(screen.queryByTestId('page-child')).toBeNull()
    expect(mockRouter.replace).not.toHaveBeenCalled()
  })

  it('lets the page through when the detail settled without data — a failed or skipped request', async () => {
    mockProjectState.current = undefined as any
    renderLayoutWithPage()
    await waitFor(() => expect(screen.getByTestId('page-child')).toBeInTheDocument())
  })
})

/** Opens the mobile sheet through the context and renders what the layout registered for it. */
const SheetProbe = () => {
  const { content, openMenu } = useMobileSheet()
  return (
    <>
      <button onClick={openMenu}>open-sheet</button>
      <div data-testid="sheet">{content as React.ReactNode}</div>
    </>
  )
}

const renderLayoutWithMenu = () =>
  render(
    <MobileSheetProvider>
      <ProjectLayout
        product="Database"
        isBlocking={false}
        productMenu={<div data-testid="product-menu" />}
      >
        <div data-testid="page-child" />
      </ProjectLayout>
    </MobileSheetProvider>
  )

describe('route-supplied product menu while not active', () => {
  afterEach(() => {
    mockProjectState.current.status = 'ACTIVE_HEALTHY'
    vi.clearAllMocks()
  })

  it.each(['COMING_UP', 'UNKNOWN', 'INIT_FAILED', 'GOING_DOWN'])(
    'is withheld while %s — it would mount its data queries before the bounce',
    async (status) => {
      mockProjectState.current.status = status
      renderLayoutWithMenu()
      await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/project/default'))
      expect(screen.queryByTestId('product-menu')).toBeNull()
    }
  )

  it('is withheld while the detail is still loading — desktop and the mobile sheet alike', async () => {
    mockProjectState.loading = true
    render(
      <MobileSheetProvider>
        <ProjectLayout
          product="Database"
          isBlocking={false}
          productMenu={<div data-testid="product-menu" />}
        >
          <div data-testid="page-child" />
        </ProjectLayout>
        <SheetProbe />
      </MobileSheetProvider>
    )
    await waitFor(() => expect(screen.getByTestId('logo-loader')).toBeInTheDocument())
    expect(screen.queryByTestId('product-menu')).toBeNull()
    fireEvent.click(screen.getByText('open-sheet'))
    expect(screen.getByTestId('sheet-menu')).toBeInTheDocument()
    expect(screen.queryByTestId('product-menu')).toBeNull()
    mockProjectState.loading = false
  })

  it('reaches the mobile sheet once ACTIVE_HEALTHY', async () => {
    mockProjectState.current.status = 'ACTIVE_HEALTHY'
    render(
      <MobileSheetProvider>
        <ProjectLayout
          product="Database"
          isBlocking={false}
          productMenu={<div data-testid="product-menu" />}
        >
          <div data-testid="page-child" />
        </ProjectLayout>
        <SheetProbe />
      </MobileSheetProvider>
    )
    fireEvent.click(screen.getByText('open-sheet'))
    await waitFor(() =>
      expect(screen.getByTestId('sheet-menu').querySelector('[data-testid="product-menu"]')).not.toBeNull()
    )
  })

  it('renders once ACTIVE_HEALTHY', async () => {
    // This file's mocks open the sidebar: useEditorType() → undefined makes
    // forceShowProductMenu true, and useIsMobile() → false.
    mockProjectState.current.status = 'ACTIVE_HEALTHY'
    renderLayoutWithMenu()
    await waitFor(() => expect(screen.getByTestId('product-menu')).toBeInTheDocument())
  })
})
