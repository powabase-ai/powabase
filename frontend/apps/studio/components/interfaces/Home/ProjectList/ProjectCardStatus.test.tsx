import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('ui', () => ({
  Badge: ({ children, variant }: any) => <span data-variant={variant}>{children}</span>,
  cn: (...c: any[]) => c.filter(Boolean).join(' '),
  Tooltip: ({ children }: any) => <>{children}</>,
  TooltipContent: ({ children }: any) => <div data-testid="tooltip">{children}</div>,
  TooltipTrigger: ({ children }: any) => <>{children}</>,
}))

import { ProjectCardStatus } from './ProjectCardStatus'

describe('ProjectCardStatus', () => {
  it('badges a failed set-up as a warning with a hint to open the project', () => {
    render(<ProjectCardStatus projectStatus="isInitFailed" renderMode="badge" />)
    expect(screen.getByText('Setup failed')).toHaveAttribute('data-variant', 'warning')
    expect(screen.getByTestId('tooltip')).toHaveTextContent('Open the project to retry the setup or delete it')
  })

  it('badges a project being set up as "Setting up"', () => {
    render(<ProjectCardStatus projectStatus="isComingUp" renderMode="badge" />)
    expect(screen.getByText('Setting up')).toBeInTheDocument()
  })

  it('renders the alert form with the failed title', () => {
    render(<ProjectCardStatus projectStatus="isInitFailed" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Project setup failed')
  })
})
