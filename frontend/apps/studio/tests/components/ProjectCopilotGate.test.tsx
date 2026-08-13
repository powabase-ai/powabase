/**
 * The copilot gate, in both directions plus the self-host lever.
 *
 * "Off" means NO ENTRY POINT, not "no route" — the backend blueprints register
 * unconditionally by design. A test asserting the routes 404 when gated would
 * fail, and would pin a promise the code does not make.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from 'ui'

import { addAPIMock } from '@/tests/lib/msw'

const mockProfile = vi.fn()
vi.mock('@/lib/profile', () => ({ useProfile: () => mockProfile() }))

import { ProjectCopilotButton } from '@/components/layouts/Navigation/LayoutHeader/ProjectCopilotButton'

describe('ai:project_copilot gate', () => {
  it('renders nothing when the key is in profile.disabled_features', () => {
    mockProfile.mockReturnValue({ profile: { disabled_features: ['ai:project_copilot'] } })
    const { container } = render(
      <TooltipProvider>
        <ProjectCopilotButton />
      </TooltipProvider>
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders when the key is absent from every list', () => {
    mockProfile.mockReturnValue({ profile: { disabled_features: [] } })
    render(
      <TooltipProvider>
        <ProjectCopilotButton />
      </TooltipProvider>
    )
    expect(screen.getByRole('button', { name: /copilot/i })).toBeInTheDocument()
  })
})

describe('self-host lever', () => {
  it('NEXT_PUBLIC_DISABLED_FEATURES is merged into disabled_features when !IS_PLATFORM', async () => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_DISABLED_FEATURES', 'ai:project_copilot')
    vi.doMock('@/lib/constants', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/constants')>()
      return { ...actual, IS_PLATFORM: false }
    })
    addAPIMock({
      method: 'get',
      path: '/platform/profile',
      response: {
        auth0_id: 'auth0|test',
        disabled_features: [],
        first_name: null,
        free_project_limit: 2,
        gotrue_id: 'gotrue-test',
        id: 1,
        is_alpha_user: false,
        is_sso_user: false,
        last_name: null,
        mobile: null,
        primary_email: 'test@example.com',
        username: 'test',
      },
    })
    const { getProfile } = await import('@/data/profile/profile-query')
    const profile = await getProfile(new AbortController().signal)
    expect(profile.disabled_features).toContain('ai:project_copilot')
    vi.unstubAllEnvs()
  })
})

describe('static declaration', () => {
  it('declares the key TRUE — a static false is unrecoverable at runtime', async () => {
    const json = (await import('common/enabled-features/enabled-features.json'))
      .default as unknown as Record<string, boolean>
    expect(json['ai:project_copilot']).toBe(true)
  })
})
