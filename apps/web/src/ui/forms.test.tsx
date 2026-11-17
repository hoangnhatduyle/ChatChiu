// Step 3.2: Field, Select, DateField.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { EXPIRY_CHIPS } from '@chatchiu/domain'
import { DateField } from './DateField'
import { Field } from './Field'
import { Select } from './Select'

describe('Field', () => {
  it('CS-ACCESSIBLE-UI: the label names the input and help text describes it', async () => {
    const onChange = vi.fn()
    render(<Field label="Name" description="What it's called on the board" onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'Name' })
    expect(input).toHaveAccessibleDescription("What it's called on the board")
    expect(input).toHaveClass('min-h-touch')
    await userEvent.type(input, 'Milk')
    expect(onChange).toHaveBeenLastCalledWith('Milk')
  })

  it('CS-ACCESSIBLE-UI: a required field says so in words (WCAG 3.3.2)', () => {
    render(<Field label="Name" isRequired />)
    expect(screen.getByText('(required)')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Name/ })).toBeRequired()
  })

  it('NC-IF-NO-SNACKBAR-VALIDATION: an error shows inline, sets aria-invalid and is announced with the field', () => {
    render(<Field label="Name" isInvalid errorMessage="Give it a name" />)
    const input = screen.getByRole('textbox', { name: 'Name' })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription(/Give it a name/)
    expect(screen.getByText('Give it a name')).toHaveClass('text-error')
  })
})

describe('Select', () => {
  it('CS-ACCESSIBLE-UI: opens from the keyboard and picks an option', async () => {
    const onChange = vi.fn()
    render(
      <Select
        label="Stored in"
        options={[
          { id: 'fridge', label: 'Fridge' },
          { id: 'pantry', label: 'Pantry' },
        ]}
        value="fridge"
        onChange={onChange}
      />,
    )
    const trigger = screen.getByRole('button', { name: /Stored in/ })
    expect(trigger).toHaveTextContent('Fridge')
    expect(trigger).toHaveClass('min-h-touch')
    trigger.focus()
    await userEvent.keyboard('{ArrowDown}')
    const listbox = await screen.findByRole('listbox')
    await userEvent.click(within(listbox).getByRole('option', { name: 'Pantry' }))
    expect(onChange).toHaveBeenCalledWith('pantry')
  })
})

describe('DateField', () => {
  it('F-IF-06: quick chips 3d · 1w · 2w · 1m · 3m · 6m · 1y exist', () => {
    render(<DateField label="Expires" value={null} onChange={() => {}} quickFrom="2026-01-01" />)
    const group = screen.getByRole('group', { name: 'Quick expiry picks for Expires' })
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(EXPIRY_CHIPS.map((c) => c.label))
  })

  it('F-IF-06: from purchase 2026-01-01, "1m" gives 2026-01-31 and "1y" gives 2027-01-01', async () => {
    const onChange = vi.fn()
    render(<DateField label="Expires" value={null} onChange={onChange} quickFrom="2026-01-01" />)
    await userEvent.click(screen.getByRole('button', { name: 'In 1 month' }))
    expect(onChange).toHaveBeenLastCalledWith('2026-01-31')
    await userEvent.click(screen.getByRole('button', { name: 'In 1 year' }))
    expect(onChange).toHaveBeenLastCalledWith('2027-01-01')
  })

  it('a11y review H3: a quick pick says the date it set, in a status line', async () => {
    function Form() {
      const [value, setValue] = useState<string | null>(null)
      return <DateField label="Expires" value={value} onChange={setValue} quickFrom="2026-01-01" />
    }
    render(<Form />)
    const status = screen.getByRole('status')
    expect(status).toBeEmptyDOMElement()
    await userEvent.click(screen.getByRole('button', { name: 'In 1 month' }))
    expect(status).toHaveTextContent('Expires Sat 31 Jan 2026')
  })

  it('shows the value as a labelled date with a calendar button', () => {
    render(<DateField label="Expires" value="2026-11-20" onChange={() => {}} />)
    expect(screen.getAllByRole('group', { name: /Expires/ }).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /calendar/i })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: /day/i })).toHaveAttribute('aria-valuenow', '20')
  })

  it('a malformed date from the server shows an empty field instead of crashing', () => {
    render(<DateField label="Expires" value="2026-13-45" onChange={() => {}} />)
    expect(screen.getByRole('spinbutton', { name: /day/i })).not.toHaveAttribute('aria-valuenow')
  })

  it('F-IF-07: an error renders inline on the field', () => {
    render(
      <DateField
        label="Expires"
        value="2025-12-01"
        onChange={() => {}}
        isInvalid
        errorMessage="Expiry can't be before the purchase date"
      />,
    )
    expect(screen.getByText("Expiry can't be before the purchase date")).toHaveClass('text-error')
  })
})
