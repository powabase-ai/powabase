import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { render } from '@/tests/helpers'

// Mock the feature-flag hook so the tests don't pull in the @/lib/profile
// supabase-client chain (which fires a spurious "storage.getItem is not a
// function" auto-refresh warning in jsdom). The `isAiOnUsEnabled` prop is
// the contract under test; the hook fallback path is exercised in the
// page-level integration via pricing.test.tsx's identical pattern.
vi.mock('@/hooks/misc/useIsFeatureEnabled', () => ({
  useIsFeatureEnabled: vi.fn(() => false),
}))

import { NewProjectForm } from './NewProjectForm'

/**
 * After the v1.5 key-gate removal: LLM keys are ALWAYS optional. The Create
 * button is gated only on name validity, isAdmin, and !isSubmitting.
 * `isAiOnUsEnabled` still toggles the explanatory subtext (AI-on-us-aware
 * vs neutral "add later in Settings"), but it no longer affects whether
 * the Create button is enabled. The "Skip — use AI-on-us" CTA was removed
 * since Create now does the same thing with zero keys.
 */

describe('NewProjectForm — keys always optional after v1.5 gate removal', () => {
  it('renders the optional header in both flag states', () => {
    const { rerender } = render(
      <NewProjectForm
        isAiOnUsEnabled={false}
        isAdmin
        isOrganizationsSuccess
        isSubmitting={false}
        onCreate={() => {}}
        onCancel={() => {}}
      />
    )
    expect(screen.getByText(/Bring your own LLM keys \(optional\)/i)).toBeInTheDocument()

    rerender(
      <NewProjectForm
        isAiOnUsEnabled
        isAdmin
        isOrganizationsSuccess
        isSubmitting={false}
        onCreate={() => {}}
        onCancel={() => {}}
      />
    )
    expect(screen.getByText(/Bring your own LLM keys \(optional\)/i)).toBeInTheDocument()
  })

  it('shows AI-on-us-aware subtext when flag is on', () => {
    render(
      <NewProjectForm
        isAiOnUsEnabled
        isAdmin
        isOrganizationsSuccess
        isSubmitting={false}
        onCreate={() => {}}
        onCancel={() => {}}
      />
    )
    expect(screen.getByText(/Leave blank to use your platform balance/i)).toBeInTheDocument()
  })

  it('shows neutral subtext when flag is off', () => {
    render(
      <NewProjectForm
        isAiOnUsEnabled={false}
        isAdmin
        isOrganizationsSuccess
        isSubmitting={false}
        onCreate={() => {}}
        onCancel={() => {}}
      />
    )
    expect(screen.getByText(/add them later in Settings/i)).toBeInTheDocument()
  })

  it('Create button is enabled with no keys, regardless of flag', () => {
    const { rerender } = render(
      <NewProjectForm
        isAiOnUsEnabled={false}
        isAdmin
        isOrganizationsSuccess
        isSubmitting={false}
        onCreate={() => {}}
        onCancel={() => {}}
      />
    )
    fireEvent.change(screen.getByLabelText(/project name/i), {
      target: { value: 'my project' },
    })
    expect(screen.getByRole('button', { name: /create new project/i })).toBeEnabled()

    rerender(
      <NewProjectForm
        isAiOnUsEnabled
        isAdmin
        isOrganizationsSuccess
        isSubmitting={false}
        onCreate={() => {}}
        onCancel={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: /create new project/i })).toBeEnabled()
  })

  it('Create button stays disabled until name is at least 3 chars', () => {
    render(
      <NewProjectForm
        isAiOnUsEnabled
        isAdmin
        isOrganizationsSuccess
        isSubmitting={false}
        onCreate={() => {}}
        onCancel={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: /create new project/i })).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: 'ab' } })
    expect(screen.getByRole('button', { name: /create new project/i })).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: 'abc' } })
    expect(screen.getByRole('button', { name: /create new project/i })).toBeEnabled()
  })

  it('Create with no keys submits empty-key payload', () => {
    const onCreate = vi.fn()
    render(
      <NewProjectForm
        isAiOnUsEnabled
        isAdmin
        isOrganizationsSuccess
        isSubmitting={false}
        onCreate={onCreate}
        onCancel={() => {}}
      />
    )
    fireEvent.change(screen.getByLabelText(/project name/i), {
      target: { value: 'my project' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create new project/i }))
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'my project',
        aiProviderKeys: { openai: '', anthropic: '', google: '', openrouter: '' },
      })
    )
  })

  it('Skip button is removed', () => {
    render(
      <NewProjectForm
        isAiOnUsEnabled
        isAdmin
        isOrganizationsSuccess
        isSubmitting={false}
        onCreate={() => {}}
        onCancel={() => {}}
      />
    )
    expect(screen.queryByRole('button', { name: /skip — use ai-on-us/i })).toBeNull()
  })
})
