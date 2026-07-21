import { fireEvent, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { NewProjectForm } from '@/components/interfaces/ProjectCreation/NewProjectForm'
import { render } from '@/tests/helpers'

const baseProps = {
  isAdmin: true,
  isOrganizationsSuccess: true,
  isSubmitting: false,
  onCancel: () => {},
  // Keep the AI-on-us copy deterministic; unrelated to compute-tier.
  isAiOnUsEnabled: false,
}

test('renders the compute-tier picker when the feature is enabled', () => {
  render(<NewProjectForm {...baseProps} onCreate={() => {}} isComputeTierEnabled />)
  // Five tier cards from ComputeTierPicker.
  expect(screen.getByText('Sandbox')).toBeInTheDocument()
  expect(screen.getByText('Foundry')).toBeInTheDocument()
})

test('does not render the compute-tier picker when the feature is disabled', () => {
  render(<NewProjectForm {...baseProps} onCreate={() => {}} isComputeTierEnabled={false} />)
  expect(screen.queryByText('Sandbox')).not.toBeInTheDocument()
})

test('threads the selected compute tier into the create payload', () => {
  const onCreate = vi.fn()
  render(<NewProjectForm {...baseProps} onCreate={onCreate} isComputeTierEnabled />)

  fireEvent.change(screen.getByPlaceholderText('My project'), {
    target: { value: 'My new project' },
  })
  // Pick a non-default tier so we prove selection flows through (default is nano).
  fireEvent.click(screen.getByText('Workshop'))
  fireEvent.click(screen.getByRole('button', { name: /create new project/i }))

  expect(onCreate).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'My new project', computeSizeId: 'small' })
  )
})

test('defaults the compute tier to nano when none is picked', () => {
  const onCreate = vi.fn()
  render(<NewProjectForm {...baseProps} onCreate={onCreate} isComputeTierEnabled />)

  fireEvent.change(screen.getByPlaceholderText('My project'), {
    target: { value: 'My new project' },
  })
  fireEvent.click(screen.getByRole('button', { name: /create new project/i }))

  expect(onCreate).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'My new project', computeSizeId: 'nano' })
  )
})
