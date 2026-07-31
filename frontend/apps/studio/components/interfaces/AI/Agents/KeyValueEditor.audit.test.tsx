import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'

import { KeyValueEditor } from './KeyValueEditor'

// Regression pin: "+ Add pair" was a permanent no-op because rows were derived
// purely from the `value` prop and a blank {key:'',value:''} row is filtered out
// (empty key) before it can render — so the Headers editor in custom-tool / MCP
// config could never gain a row, and no header/token could be entered.

// A controlled host mirroring the real callers (setNewTool({...,headers})).
function Host() {
  const [value, setValue] = useState<Record<string, string>>({})
  return (
    <div>
      <KeyValueEditor value={value} onChange={setValue} />
      <output data-testid="obj">{JSON.stringify(value)}</output>
    </div>
  )
}

describe('KeyValueEditor', () => {
  it('renders a new editable row when "+ Add pair" is clicked', () => {
    render(<Host />)
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)

    fireEvent.click(screen.getByText('+ Add pair'))

    // a blank key/value row must now exist to type into
    expect(screen.queryAllByRole('textbox')).toHaveLength(2)
  })

  it('commits a header once the key is typed', () => {
    render(<Host />)
    fireEvent.click(screen.getByText('+ Add pair'))
    const [keyInput, valInput] = screen.getAllByRole('textbox')

    fireEvent.change(keyInput, { target: { value: 'X-Api-Key' } })
    fireEvent.change(valInput, { target: { value: 'secret' } })

    expect(JSON.parse(screen.getByTestId('obj').textContent!)).toEqual({ 'X-Api-Key': 'secret' })
    // and the row is still present (not collapsed away)
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
  })

  it('still renders seeded rows and resyncs on external value changes', () => {
    function ExternalHost() {
      const [value, setValue] = useState<Record<string, string>>({ A: '1' })
      return (
        <div>
          <KeyValueEditor value={value} onChange={setValue} />
          <button onClick={() => setValue({ B: '2', C: '3' })}>external</button>
        </div>
      )
    }
    render(<ExternalHost />)
    expect(screen.getAllByRole('textbox')).toHaveLength(2) // A/1

    fireEvent.click(screen.getByText('external'))
    expect(screen.getAllByRole('textbox')).toHaveLength(4) // B/2 + C/3
  })
})
