import { render, screen } from '@testing-library/react'
import type { HTMLAttributes, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('common', () => ({
  LOCAL_STORAGE_KEYS: { SIDEBAR_BEHAVIOR: 'sidebar-behavior' },
  useParams: () => ({ ref: 'test-ref' }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href} data-testid="fallback-link">
      {children}
    </a>
  ),
}))

vi.mock('@/hooks/misc/useLocalStorage', () => ({
  useLocalStorageQuery: () => ['expandable', vi.fn()],
}))

const { mockProjectIndexPageLink } = vi.hoisted(() => ({
  mockProjectIndexPageLink: vi.fn(),
}))

vi.mock('@/data/prefetchers/project.$ref', () => ({
  ProjectIndexPageLink: (props: Record<string, unknown> & { children?: ReactNode }) => {
    mockProjectIndexPageLink(props)
    const { children, ...rest } = props
    return (
      <a data-testid="project-index-page-link" {...(rest as object)}>
        {children as ReactNode}
      </a>
    )
  },
}))

vi.mock('framer-motion', () => {
  type Props = HTMLAttributes<HTMLElement>
  const Passthrough = ({ children, ...props }: Props & { children?: ReactNode }) => (
    <div {...props}>{children}</div>
  )
  return {
    AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
    motion: {
      div: Passthrough,
      create: <P,>(Component: P): P => Component,
    },
  }
})

vi.mock('ui', () => {
  type Props = HTMLAttributes<HTMLElement> & { children?: ReactNode }
  const Passthrough = ({ children, ...props }: Props) => <div {...props}>{children}</div>
  return {
    cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
    Button: ({ children, ...props }: Props) => <button {...props}>{children}</button>,
    Separator: () => <hr />,
    Sidebar: Passthrough,
    SidebarContent: Passthrough,
    SidebarFooter: Passthrough,
    SidebarGroup: Passthrough,
    SidebarMenu: Passthrough,
    SidebarMenuButton: ({
      children,
      asChild,
      // Drop SidebarMenuButton-specific props so React doesn't warn about unknown DOM attributes.
      disabled: _disabled,
      tooltip: _tooltip,
      isActive: _isActive,
      size: _size,
      ...rest
    }: Props & {
      asChild?: boolean
      disabled?: boolean
      tooltip?: string
      isActive?: boolean
      size?: string
    }) => (asChild ? <>{children}</> : <button {...rest}>{children}</button>),
    SidebarMenuItem: ({ children }: { children: ReactNode }) => <li>{children}</li>,
    DropdownMenu: Passthrough,
    DropdownMenuContent: Passthrough,
    DropdownMenuLabel: Passthrough,
    DropdownMenuRadioGroup: Passthrough,
    DropdownMenuRadioItem: Passthrough,
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuTrigger: Passthrough,
    useSidebar: () => ({ setOpen: vi.fn() }),
  }
})

import { SideBarNavLink } from './Sidebar'
import { ProjectIndexPageLink } from '@/data/prefetchers/project.$ref'

describe('SideBarNavLink', () => {
  beforeEach(() => {
    mockProjectIndexPageLink.mockClear()
  })

  it('renders the linkElement wrapper with route.link as href and icon+label as content', () => {
    render(
      <SideBarNavLink
        route={{
          key: 'api-docs',
          label: 'API Docs',
          icon: <span data-testid="route-icon" />,
          link: 'https://docs.powabase.ai/concepts/platform-overview',
          linkElement: <a target="_blank" rel="noreferrer" data-testid="link-element" />,
        }}
      />
    )

    const anchor = screen.getByTestId('link-element')
    expect(anchor.tagName).toBe('A')
    expect(anchor).toHaveAttribute('href', 'https://docs.powabase.ai/concepts/platform-overview')
    expect(anchor).toHaveAttribute('target', '_blank')
    expect(anchor).toHaveAttribute('rel', 'noreferrer')
    expect(anchor).toHaveTextContent('API Docs')
    expect(screen.getByTestId('route-icon')).toBeInTheDocument()
    expect(screen.queryByTestId('fallback-link')).not.toBeInTheDocument()
  })

  it('falls back to next/link when linkElement is not provided', () => {
    render(
      <SideBarNavLink
        route={{
          key: 'home',
          label: 'Home',
          icon: <span data-testid="route-icon" />,
          link: '/project/test-ref',
        }}
      />
    )

    const fallback = screen.getByTestId('fallback-link')
    expect(fallback.tagName).toBe('A')
    expect(fallback).toHaveAttribute('href', '/project/test-ref')
    expect(fallback).toHaveTextContent('Home')
    expect(screen.queryByTestId('link-element')).not.toBeInTheDocument()
  })

  it('renders icon+label inline (no anchor) when route has no link', () => {
    render(
      <SideBarNavLink
        route={{
          key: 'no-link',
          label: 'Unlinked Item',
          icon: <span data-testid="route-icon" />,
        }}
      />
    )

    expect(screen.getByText('Unlinked Item')).toBeInTheDocument()
    expect(screen.getByTestId('route-icon')).toBeInTheDocument()
    expect(screen.queryByTestId('fallback-link')).not.toBeInTheDocument()
    expect(screen.queryByTestId('link-element')).not.toBeInTheDocument()
  })

  it('passes route.link as href to ProjectIndexPageLink (pinning prefetcher wiring)', () => {
    render(
      <SideBarNavLink
        route={{
          key: 'home',
          label: 'Project Overview',
          icon: <span data-testid="route-icon" />,
          link: '/project/test-ref',
          linkElement: <ProjectIndexPageLink projectRef="test-ref" />,
        }}
      />
    )

    expect(mockProjectIndexPageLink).toHaveBeenCalled()
    const anchor = screen.getByTestId('project-index-page-link')
    expect(anchor).toHaveAttribute('href', '/project/test-ref')
    expect(anchor).toHaveTextContent('Project Overview')
  })

  it('renders icon+label inline (no anchor) when route is disabled even if link is present', () => {
    render(
      <SideBarNavLink
        route={{
          key: 'disabled-link',
          label: 'MFA Required',
          icon: <span data-testid="route-icon" />,
          link: '/org/example',
          disabled: true,
        }}
      />
    )

    expect(screen.getByText('MFA Required')).toBeInTheDocument()
    expect(screen.queryByTestId('fallback-link')).not.toBeInTheDocument()
    expect(screen.queryByTestId('link-element')).not.toBeInTheDocument()
  })
})
