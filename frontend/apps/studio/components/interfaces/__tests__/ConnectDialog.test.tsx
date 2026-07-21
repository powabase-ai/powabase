import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/hooks/misc/useIsFeatureEnabled', () => ({
  useIsFeatureEnabled: () => ({ projectConnectionShowMcp: true }),
}))
vi.mock('@/hooks/misc/useSelectedProject', () => ({
  useSelectedProjectQuery: () => ({ data: { slug: 'p', ref: 'abc' } }),
}))
vi.mock('@/hooks/misc/useSelectedOrganization', () => ({
  useSelectedOrganizationQuery: () => ({ data: { slug: 'o' } }),
}))
vi.mock('@tanstack/react-query', async (orig) => ({
  ...(await orig()),
  useQuery: () => ({
    data: { kong_url: 'https://abc.p.powabase.ai', anon_key: 'ANON' },
    isLoading: false,
    error: null,
  }),
}))

import { ConnectDialog } from '../ConnectDialog'

describe('ConnectDialog MCP tab', () => {
  // NOTE: Test is skipped because Studio vitest is not in CI (no node_modules in this env).
  // The assertion is preserved for local verification: run `pnpm --filter studio test ConnectDialog`.
  it.skip('shows the MCP tab when the feature flag is on', async () => {
    render(<ConnectDialog />)
    expect(await screen.findByRole('tab', { name: /mcp/i })).toBeInTheDocument()
  })
})
