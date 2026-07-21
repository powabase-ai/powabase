import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const mockSendEvent = vi.fn()

vi.mock('common', () => ({
  useParams: () => ({ ref: 'test-ref' }),
}))

vi.mock('@/hooks/misc/useSelectedOrganization', () => ({
  useSelectedOrganizationQuery: () => ({ data: { slug: 'test-org' } }),
}))

vi.mock('@/data/telemetry/send-event-mutation', () => ({
  useSendEventMutation: () => ({ mutate: mockSendEvent }),
}))

vi.mock('./ButtonTooltip', () => ({
  ButtonTooltip: ({
    children,
    onClick,
  }: {
    children?: ReactNode
    onClick?: () => void
  }) => (
    <button onClick={onClick} aria-label="API Docs">
      {children}
    </button>
  ),
}))

import { APIDocsButton } from './APIDocsButton'

describe('APIDocsButton', () => {
  let openSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    openSpy = vi.fn()
    vi.stubGlobal('open', openSpy)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    mockSendEvent.mockReset()
  })

  it('opens docs.powabase.ai in a new tab with noopener+noreferrer on click', async () => {
    const user = userEvent.setup()
    render(<APIDocsButton source="table_editor" />)

    await user.click(screen.getByRole('button', { name: 'API Docs' }))

    expect(openSpy).toHaveBeenCalledTimes(1)
    expect(openSpy).toHaveBeenCalledWith(
      'https://docs.powabase.ai/concepts/platform-overview',
      '_blank',
      'noopener,noreferrer'
    )
  })

  it('fires api_docs_opened telemetry with the provided source on click', async () => {
    const user = userEvent.setup()
    render(<APIDocsButton source="table_editor" />)

    await user.click(screen.getByRole('button', { name: 'API Docs' }))

    expect(mockSendEvent).toHaveBeenCalledTimes(1)
    expect(mockSendEvent).toHaveBeenCalledWith({
      action: 'api_docs_opened',
      properties: { source: 'table_editor' },
      groups: { project: 'test-ref', organization: 'test-org' },
    })
  })
})
