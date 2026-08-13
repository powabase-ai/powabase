/**
 * The welcome modal's own gate.
 *
 * Registering the copilot sidebar is not sufficient to keep the feature dark:
 * `showWelcome` (LayoutSidebarProvider) is computed independently of sidebar
 * registration, so an ungated modal would still render its promotional content
 * on a project's first visit — welcomeSeen is false by construction there, so
 * this is the default first-run experience, not an edge case — and then call
 * `openSidebar` on a dead id when dismissed. This file pins both directions of
 * that gate directly against LayoutSidebarProvider, the component that owns it.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from 'ui'

import { LayoutSidebarProvider } from '@/components/layouts/ProjectLayout/LayoutSidebar/LayoutSidebarProvider'
import { routerMock } from '@/tests/lib/route-mock'

const mockProfile = vi.fn()
vi.mock('@/lib/profile', () => ({ useProfile: () => mockProfile() }))

vi.mock('nuqs', () => ({
  useQueryState: () => [null, vi.fn()],
  parseAsString: () => {},
}))

const mockProject = {
  id: 1,
  ref: 'default',
  name: 'Project 1',
  status: 'ACTIVE_HEALTHY' as const,
  organization_id: 1,
  cloud_provider: 'AWS',
  region: 'us-east-1',
  inserted_at: new Date().toISOString(),
  subscription_id: 'subscription-1',
  db_host: 'db.supabase.co',
  is_branch_enabled: false,
  is_physical_backups_enabled: false,
  restUrl: 'https://project-1.supabase.co',
}

vi.mock('@/hooks/misc/useSelectedProject', () => ({
  useSelectedProjectQuery: () => ({ data: mockProject }),
}))

vi.mock('@/hooks/misc/useSelectedOrganization', () => ({
  useSelectedOrganizationQuery: () => ({
    data: {
      id: 1,
      name: 'Organization 1',
      slug: 'test-org',
      plan: { id: 'free', name: 'Free' },
      managed_by: 'supabase',
      is_owner: true,
      billing_email: 'billing@example.com',
      billing_partner: null,
      usage_billing_enabled: false,
      stripe_customer_id: 'stripe-1',
      subscription_id: 'subscription-1',
      organization_requires_mfa: false,
      opt_in_tags: [],
      restriction_status: null,
      restriction_data: null,
      organization_missing_address: false,
    },
  }),
}))

vi.mock('@/data/telemetry/send-event-mutation', () => ({
  useSendEventMutation: () => ({ mutate: vi.fn() }),
}))

// Same query key `useLocalStorageQuery` derives for the "welcome seen" flag —
// used as a settle signal so the "does not render" assertion isn't just true
// trivially at t=0, before the async localStorage read has had a chance to
// flip `showWelcome`.
const WELCOME_SEEN_QUERY_KEY = ['localStorage', `copilot-welcome-seen-${mockProject.ref}`]

describe('project copilot welcome modal gate', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    routerMock.setCurrentUrl('/projects/default')
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  afterEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  const renderProvider = () =>
    render(
      <TooltipProvider>
        <QueryClientProvider client={queryClient}>
          <LayoutSidebarProvider>
            <div />
          </LayoutSidebarProvider>
        </QueryClientProvider>
      </TooltipProvider>
    )

  it('does not render the welcome modal when ai:project_copilot is in disabled_features', async () => {
    mockProfile.mockReturnValue({ profile: { disabled_features: ['ai:project_copilot'] } })
    renderProvider()

    await waitFor(() => {
      expect(queryClient.getQueryState(WELCOME_SEEN_QUERY_KEY)?.status).toBe('success')
    })

    expect(
      screen.queryByRole('heading', { name: /Welcome to your Powabase project/i })
    ).not.toBeInTheDocument()
  })

  it('renders the welcome modal when the key is absent from disabled_features', async () => {
    mockProfile.mockReturnValue({ profile: { disabled_features: [] } })
    renderProvider()

    expect(
      await screen.findByRole('heading', { name: /Welcome to your Powabase project/i })
    ).toBeInTheDocument()
  })
})
