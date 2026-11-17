// Step 3.2: Icon, Button, IconButton, EmptyState, Skeleton.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'
import { EmptyState } from './EmptyState'
import { Icon } from './Icon'
import { IconButton } from './IconButton'
import { Skeleton } from './Skeleton'

describe('Icon', () => {
  it('CS-ACCESSIBLE-UI: a decorative icon is hidden from assistive tech', () => {
    const { container } = render(<Icon name="fridge" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('focusable', 'false')
  })

  it('CS-ACCESSIBLE-UI: a labelled icon is an image with that name', () => {
    render(<Icon name="alert" label="Expired" />)
    expect(screen.getByRole('img', { name: 'Expired' })).toBeInTheDocument()
  })
})

describe('Button', () => {
  it('CS-ACCESSIBLE-UI: fires onPress from a click, Enter and Space', async () => {
    const onPress = vi.fn()
    render(<Button onPress={onPress}>Add item</Button>)
    const button = screen.getByRole('button', { name: 'Add item' })
    await userEvent.click(button)
    button.focus()
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard(' ')
    expect(onPress).toHaveBeenCalledTimes(3)
  })

  it('CS-ACCESSIBLE-UI: is at least 44 px tall', () => {
    render(<Button>Scan receipt</Button>)
    expect(screen.getByRole('button')).toHaveClass('min-h-touch')
  })

  it('a disabled button does not fire and says so', async () => {
    const onPress = vi.fn()
    render(
      <Button isDisabled onPress={onPress}>
        Save
      </Button>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onPress).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('draws each variant from tokens', () => {
    render(
      <>
        <Button variant="primary">P</Button>
        <Button variant="secondary">S</Button>
        <Button variant="danger">D</Button>
      </>,
    )
    expect(screen.getByRole('button', { name: 'P' })).toHaveClass('bg-accent', 'text-accent-ink')
    expect(screen.getByRole('button', { name: 'S' })).toHaveClass('border-field-line')
    expect(screen.getByRole('button', { name: 'D' })).toHaveClass('bg-status-expired-bg')
  })
})

describe('IconButton', () => {
  it('CS-ACCESSIBLE-UI: is named by its label and is a 44 px square', async () => {
    const onPress = vi.fn()
    render(<IconButton icon="plus" label="Add item to Pantry" onPress={onPress} />)
    const button = screen.getByRole('button', { name: 'Add item to Pantry' })
    expect(button).toHaveClass('size-touch')
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    await userEvent.click(button)
    expect(onPress).toHaveBeenCalledOnce()
  })
})

describe('EmptyState', () => {
  it('F-KB-14: shows a heading, a line of help and the primary action', async () => {
    const onPress = vi.fn()
    render(
      <EmptyState
        icon="box"
        title="Your kitchen is empty"
        action={{ label: 'Add first item', onPress }}
      >
        Add what's in the fridge and pantry to start tracking it.
      </EmptyState>,
    )
    expect(screen.getByRole('heading', { name: 'Your kitchen is empty' })).toBeInTheDocument()
    expect(screen.getByText(/Add what's in the fridge/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add first item' }))
    expect(onPress).toHaveBeenCalledOnce()
  })
})

describe('Skeleton', () => {
  it('NC-AP-NO-LAYOUT-SHIFT: is hidden from assistive tech and keeps the size it is given', () => {
    const { container } = render(<Skeleton className="h-11 w-full" />)
    const el = container.firstElementChild
    expect(el).toHaveAttribute('aria-hidden', 'true')
    expect(el).toHaveClass('h-11', 'w-full')
    expect(el?.textContent).toBe('')
  })
})
