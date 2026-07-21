import { screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

import { ConvictedAccountBanner } from '@/components/interfaces/Organization/ConvictedAccountBanner'
import { render } from '@/tests/helpers'

// Verifies the farm-defense "account under review" banner (Task 10a). It renders
// proactively whenever the selected org's trust_state === 'convicted' (matching
// the T6 403 `account_under_review` provisioning gate), and is absent for
// trusted/gated orgs. The ticket link renders only when ticket_url is non-empty.

let org:
  | { slug: string; trust_state?: string; ticket_url?: string }
  | undefined

vi.mock('@/hooks/misc/useSelectedOrganization', () => ({
  useSelectedOrganizationQuery: () => ({ data: org }),
}))

beforeEach(() => {
  org = { slug: 'acme', trust_state: 'convicted', ticket_url: 'https://help.powabase.ai/review' }
})

test('convicted org: shows the account-under-review banner', () => {
  render(<ConvictedAccountBanner />)
  expect(screen.getByTestId('convicted-account-banner')).toHaveTextContent(/under review/i)
})

test('convicted org with ticket_url: renders the contact link to that url', () => {
  const link = (() => {
    render(<ConvictedAccountBanner />)
    return screen.getByRole('link', { name: /contact/i })
  })()
  expect(link).toHaveAttribute('href', 'https://help.powabase.ai/review')
})

test('convicted org without ticket_url: link falls back to the in-app support form', () => {
  org = { slug: 'acme', trust_state: 'convicted', ticket_url: '' }
  render(<ConvictedAccountBanner />)
  // The contact link is never omitted now — with no external ticket_url it points at the
  // in-app /support/new form, prefilled with this org's slug (admin-only recovery needs it).
  const href = screen.getByRole('link', { name: /contact/i }).getAttribute('href') ?? ''
  expect(href).toContain('/support/new')
  expect(href).toContain('orgSlug=acme')
})

test('trusted org: renders nothing', () => {
  org = { slug: 'acme', trust_state: 'trusted', ticket_url: 'https://help.powabase.ai/review' }
  const { container } = render(<ConvictedAccountBanner />)
  expect(container).toBeEmptyDOMElement()
})

test('gated org: renders nothing', () => {
  org = { slug: 'acme', trust_state: 'gated' }
  const { container } = render(<ConvictedAccountBanner />)
  expect(container).toBeEmptyDOMElement()
})

test('no org loaded yet: renders nothing', () => {
  org = undefined
  const { container } = render(<ConvictedAccountBanner />)
  expect(container).toBeEmptyDOMElement()
})
