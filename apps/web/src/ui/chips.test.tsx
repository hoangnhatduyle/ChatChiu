// Step 3.2: Chip (filter toggle), ExpiryChip (status), Segmented.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Chip } from './Chip'
import { ExpiryChip } from './ExpiryChip'
import { Segmented } from './Segmented'

const TODAY = '2026-11-16'

describe('Chip', () => {
  it('F-KB-12: a filter chip is a toggle button with aria-pressed and a count', async () => {
    const onChange = vi.fn()
    render(<Chip label="Use soon" count={6} isSelected={false} onChange={onChange} />)
    const chip = screen.getByRole('button', { name: /Use soon/ })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    expect(chip).toHaveTextContent('6')
    await userEvent.click(chip)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('CS-ACCESSIBLE-UI: the selected chip has a non-colour cue (check glyph)', () => {
    const { rerender } = render(<Chip label="All" isSelected={false} onChange={() => {}} />)
    expect(screen.getByRole('button').querySelector('[data-icon="check"]')).toBeNull()
    rerender(<Chip label="All" isSelected onChange={() => {}} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button').querySelector('[data-icon="check"]')).not.toBeNull()
  })
})

describe('ExpiryChip', () => {
  const cases = [
    { date: '2026-11-15', text: 'Expired', words: 'Expired 1 day ago', status: 'expired' },
    { date: '2026-11-16', text: 'Today', words: 'Expires today', status: 'today' },
    { date: '2026-11-18', text: '2d', words: 'Expires in 2 days', status: 'soon' },
    { date: '2027-02-14', text: '3 mo', words: 'Expires in 90 days', status: 'ok' },
  ] as const

  it.each(cases)(
    'F-KB-03: $status reads "$text" with a text label, not colour alone',
    ({ date, text, words, status }) => {
      const { container } = render(<ExpiryChip expirationDate={date} today={TODAY} />)
      const chip = container.firstElementChild as HTMLElement
      expect(chip).toHaveAttribute('data-status', status)
      expect(chip).toHaveTextContent(text)
      expect(screen.getByText(words)).toHaveClass('sr-only')
    },
  )

  it('NC-KB-NO-COLOUR-ONLY: alert glyph for expired, clock for today and soon, none when fresh', () => {
    const glyph = (date: string) => {
      const { container, unmount } = render(<ExpiryChip expirationDate={date} today={TODAY} />)
      const name = container.querySelector('[data-icon]')?.getAttribute('data-icon') ?? null
      unmount()
      return name
    }
    expect(glyph('2026-11-10')).toBe('alert')
    expect(glyph('2026-11-16')).toBe('clock')
    expect(glyph('2026-11-19')).toBe('clock')
    expect(glyph('2026-12-30')).toBeNull()
  })

  it('a tag, not a pill, so it never looks like a pressed filter (decision bda297d4)', () => {
    const { container } = render(<ExpiryChip expirationDate="2026-11-16" today={TODAY} />)
    expect(container.firstElementChild).toHaveClass('rounded-control')
    expect(container.firstElementChild).not.toHaveClass('rounded-pill')
  })

  it('no expiry date: keeps its width for alignment and announces nothing', () => {
    const { container } = render(<ExpiryChip expirationDate={null} today={TODAY} />)
    const chip = container.firstElementChild as HTMLElement
    expect(chip).toHaveAttribute('aria-hidden', 'true')
    expect(chip).toHaveClass('invisible')
  })
})

describe('Segmented', () => {
  function Harness({
    onChange,
    initial = 'week',
  }: {
    onChange: (v: string) => void
    initial?: string
  }) {
    const [value, setValue] = useState(initial)
    return (
      <Segmented
        label="View"
        options={[
          { id: 'week', label: 'Week' },
          { id: 'month', label: 'Month' },
        ]}
        value={value}
        onChange={(v) => {
          setValue(v)
          onChange(v)
        }}
      />
    )
  }

  it('CS-ACCESSIBLE-UI: one option is selected; clicking and arrow keys change it', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    expect(screen.getByRole('radiogroup', { name: 'View' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Week' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: 'Month' }))
    expect(onChange).toHaveBeenLastCalledWith('month')
    expect(screen.getByRole('radio', { name: 'Month' })).toBeChecked()
    await userEvent.keyboard('{ArrowLeft}')
    expect(screen.getByRole('radio', { name: 'Week' })).toHaveFocus()
    // Selection follows focus, as with native radios (a11y review M5).
    expect(screen.getByRole('radio', { name: 'Week' })).toBeChecked()
    expect(onChange).toHaveBeenLastCalledWith('week')
  })

  it('7.0.33b: tabbing into the group does not change the selection; the arrows still move focus', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Harness onChange={onChange} initial="month" />)
    await user.tab() // into the group: focus alone must not select anything
    expect(screen.getByRole('radio', { name: 'Week' })).toHaveFocus() // the first option, not the selected one
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('radio', { name: 'Month' })).toBeChecked()
    await user.keyboard('{ArrowRight}') // arrows still pick (Month is already selected: no change)
    expect(screen.getByRole('radio', { name: 'Month' })).toHaveFocus()
    expect(onChange).not.toHaveBeenCalled()
  })
})
