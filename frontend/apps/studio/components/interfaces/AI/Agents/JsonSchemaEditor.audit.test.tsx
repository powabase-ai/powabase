import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { JsonSchemaEditor } from './JsonSchemaEditor'

// Regression pin: on a JSON parse error the editor kept the last VALID value in
// the parent (onChange not called) and gave the parent no signal, so a Save that
// wasn't gated on validity silently persisted the stale schema and reported
// success — discarding the user's on-screen edit. The fix adds onValidityChange.

describe('JsonSchemaEditor — onValidityChange', () => {
  it('reports invalid on a parse error and valid again once fixed', () => {
    const onChange = vi.fn()
    const onValidity = vi.fn()
    render(
      <JsonSchemaEditor
        value={{ type: 'object' }}
        onChange={onChange}
        onValidityChange={onValidity}
      />
    )
    const ta = screen.getByRole('textbox')

    // type invalid JSON
    fireEvent.change(ta, { target: { value: '{ "type": "array", ' } })
    expect(onValidity).toHaveBeenLastCalledWith(false)
    // an error message is shown
    expect(screen.getByText(/./, { selector: 'p' })).toBeTruthy()

    // fix it
    fireEvent.change(ta, { target: { value: '{ "type": "array" }' } })
    expect(onValidity).toHaveBeenLastCalledWith(true)
    expect(onChange).toHaveBeenLastCalledWith({ type: 'array' })
  })

  it('does NOT push the invalid text through onChange (parent keeps last valid, but is told it is invalid)', () => {
    const onChange = vi.fn()
    const onValidity = vi.fn()
    render(<JsonSchemaEditor value={{ a: 1 }} onChange={onChange} onValidityChange={onValidity} />)
    onChange.mockClear()

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'not json' } })

    // onChange must NOT be called with garbage...
    expect(onChange).not.toHaveBeenCalled()
    // ...but the parent IS signalled invalid so it can block Save.
    expect(onValidity).toHaveBeenLastCalledWith(false)
  })

  it('treats empty as valid (schema cleared)', () => {
    const onChange = vi.fn()
    const onValidity = vi.fn()
    render(<JsonSchemaEditor value={{ a: 1 }} onChange={onChange} onValidityChange={onValidity} />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } })

    expect(onValidity).toHaveBeenLastCalledWith(true)
    expect(onChange).toHaveBeenLastCalledWith(null)
  })
})
