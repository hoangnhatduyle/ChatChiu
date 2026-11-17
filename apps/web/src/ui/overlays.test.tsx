// Step 3.2: ResponsivePanel and Toast.
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UNDO_WINDOW_MS } from '@chatchiu/domain'
import { ResponsivePanel } from './ResponsivePanel'
import { Toast } from './Toast'

describe('ResponsivePanel', () => {
  it('SPEC-QP-001: opens as a modal dialog named by its title, with focus inside', () => {
    render(
      <ResponsivePanel isOpen onOpenChange={() => {}} title="Whole milk">
        <button type="button">Used 10%</button>
      </ResponsivePanel>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Whole milk' })
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('SPEC-QP-001: the eyebrow line is read as the dialog description', () => {
    render(
      <ResponsivePanel
        isOpen
        onOpenChange={() => {}}
        title="Whole milk"
        eyebrow="Fridge · Expires in 6 days"
      >
        <p>Body</p>
      </ResponsivePanel>,
    )
    expect(screen.getByRole('dialog', { name: 'Whole milk' })).toHaveAccessibleDescription(
      'Fridge · Expires in 6 days',
    )
  })

  it('SPEC-QP-001: Escape and the close button both close it', async () => {
    const onOpenChange = vi.fn()
    render(
      <ResponsivePanel isOpen onOpenChange={onOpenChange} title="Whole milk">
        <p>Body</p>
      </ResponsivePanel>,
    )
    await userEvent.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    onOpenChange.mockClear()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  it('SPEC-QP-001: a bottom sheet on the phone, a side panel from 768 px', () => {
    render(
      <ResponsivePanel isOpen onOpenChange={() => {}} title="Whole milk">
        <p>Body</p>
      </ResponsivePanel>,
    )
    const modal = document.querySelector('[data-panel]') as HTMLElement
    expect(modal).toHaveClass(
      'bottom-0',
      'rounded-t-card',
      'md:top-0',
      'md:right-0',
      'md:rounded-none',
    )
  })
})

describe('Toast', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('F-AP-03: shows the message in a status region with Undo and other actions', async () => {
    const onUndo = vi.fn()
    const onAdd = vi.fn()
    render(
      <Toast
        message="Milk used up"
        actions={[
          { label: 'Add to shopping list', onPress: onAdd },
          { label: 'Undo', onPress: onUndo },
        ]}
        onClose={() => {}}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Milk used up')
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onUndo).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: 'Add to shopping list' }))
    expect(onAdd).toHaveBeenCalledOnce()
  })

  it(`F-AP-03: closes itself after ${UNDO_WINDOW_MS} ms`, () => {
    const onClose = vi.fn()
    render(<Toast message="Saved" onClose={onClose} />)
    act(() => vi.advanceTimersByTime(UNDO_WINDOW_MS - 1))
    expect(onClose).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('CS-ACCESSIBLE-UI: does not close while focus is inside it, then closes after focus leaves (WCAG 2.2.1)', () => {
    const onClose = vi.fn()
    render(
      <>
        <button type="button">Elsewhere</button>
        <Toast
          message="Milk 60% → 35%"
          actions={[{ label: 'Undo', onPress: () => {} }]}
          onClose={onClose}
        />
      </>,
    )
    act(() => screen.getByRole('button', { name: 'Undo' }).focus())
    act(() => vi.advanceTimersByTime(UNDO_WINDOW_MS * 3))
    expect(onClose).not.toHaveBeenCalled()
    act(() => screen.getByRole('button', { name: 'Elsewhere' }).focus())
    act(() => vi.advanceTimersByTime(UNDO_WINDOW_MS))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('F-AP-03: an error toast stays until dismissed and has a Dismiss button (a11y review H2)', async () => {
    const onClose = vi.fn()
    render(
      <Toast
        tone="error"
        message="Couldn't save"
        actions={[{ label: 'Retry', onPress: () => {} }]}
        onClose={onClose}
      />,
    )
    act(() => vi.advanceTimersByTime(UNDO_WINDOW_MS * 3))
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('a11y review C1: the focus ring inside the toast uses the toast ink', () => {
    render(<Toast message="Saved" onClose={() => {}} />)
    expect(screen.getByRole('status').closest('[data-toast]')).toHaveClass(
      '[--focus:var(--toast-ink)]',
    )
  })
})
