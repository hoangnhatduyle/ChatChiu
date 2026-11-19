// The toast region (step 4.5, F-AP-03): persistent live regions, announcements that survive a
// modal panel, a keyboard route to the newest toast, and Ctrl/Cmd+Z.
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, vi } from 'vitest'
import { ANNOUNCE_GAP_MS } from './toast-store'
import { ToastProvider } from './toast'
import { useToast, useUndo } from './toast-context'

function Probe({
  onReady,
}: {
  onReady: (api: { toast: ReturnType<typeof useToast>; undo: ReturnType<typeof useUndo> }) => void
}) {
  const toast = useToast()
  const undo = useUndo()
  onReady({ toast, undo })
  return <input aria-label="note" />
}

function setup() {
  let api!: Parameters<Parameters<typeof Probe>[0]['onReady']>[0]
  render(
    <ToastProvider>
      <Probe onReady={(a) => (api = a)} />
    </ToastProvider>,
  )
  return () => api
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
afterEach(() => vi.useRealTimers())

describe('ToastProvider', () => {
  it('7.0.26d: the shortcut to the newest toast is announced, only while a toast is showing', () => {
    const get = setup()
    const region = screen.getByRole('region', { name: 'Notifications' })
    expect(region).toHaveAttribute('aria-keyshortcuts', 'Alt+Shift+T')
    expect(region).not.toHaveTextContent(/Alt\+Shift\+T/)
    act(() => void get().toast.show({ message: 'Moved to Pantry' }))
    expect(region).toHaveTextContent('Press Alt+Shift+T to move to the newest notification.')
  })

  it('F-AP-03: the status and alert live regions exist before anything is announced, and are filled afterwards', () => {
    const get = setup()
    const status = screen.getByRole('status')
    const alert = screen.getByRole('alert')
    expect(status).toHaveTextContent('')
    act(() => void get().toast.show({ message: 'Moved to Pantry' }))
    act(() => void get().toast.show({ message: "Couldn't save", tone: 'error' }))
    act(() => void vi.advanceTimersByTime(ANNOUNCE_GAP_MS))
    // the same nodes, text replaced (not new nodes)
    expect(screen.getByRole('status')).toBe(status)
    expect(screen.getByRole('alert')).toBe(alert)
    expect(status).toHaveTextContent('Moved to Pantry')
    expect(alert).toHaveTextContent("Couldn't save")
  })

  it('the visible toast does not announce itself a second time (live={false})', () => {
    const get = setup()
    act(() => void get().toast.show({ message: 'Saved' }))
    const visible = screen.getAllByText('Saved').find((el) => el.closest('[data-toast]'))
    expect(visible?.getAttribute('role')).toBeNull()
  })

  it('the region is exempt from react-aria hiding outside a modal panel (data-live-announcer)', () => {
    setup()
    expect(screen.getByRole('status').closest('[data-live-announcer="true"]')).not.toBeNull()
  })

  it('F-AP-03: a toast closes after the undo window', () => {
    const get = setup()
    act(() => void get().toast.show({ message: 'Saved' }))
    expect(screen.getAllByText('Saved').length).toBeGreaterThan(0)
    act(() => void vi.advanceTimersByTime(5100))
    expect(
      screen.queryByRole('region', { name: 'Notifications' })?.querySelector('[data-toast]'),
    ).toBeNull()
  })

  it("keyboard route: Alt+Shift+T focuses the newest toast's first button", async () => {
    const get = setup()
    act(
      () =>
        void get().toast.show({ message: 'old', actions: [{ label: 'One', onPress: () => {} }] }),
    )
    act(
      () =>
        void get().toast.show({ message: 'new', actions: [{ label: 'Two', onPress: () => {} }] }),
    )
    await userEvent
      .setup({ advanceTimers: vi.advanceTimersByTime })
      .keyboard('{Alt>}{Shift>}[KeyT]{/Shift}{/Alt}')
    expect(screen.getByRole('button', { name: 'Two' })).toHaveFocus()
  })

  it('Ctrl+Z undoes the newest change, without a time limit, but never while typing in a field', async () => {
    const get = setup()
    const reverse = vi.fn().mockResolvedValue(undefined)
    act(() => void get().undo.commit({ message: 'Moved', reverse }))
    act(() => void vi.advanceTimersByTime(60_000)) // the toast is long gone
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await user.click(screen.getByLabelText('note'))
    await user.keyboard('{Control>}z{/Control}')
    expect(reverse).not.toHaveBeenCalled() // the field keeps its own undo
    await user.click(document.body)
    await user.keyboard('{Control>}z{/Control}')
    expect(reverse).toHaveBeenCalledTimes(1)
  })

  it('unmounting the provider sends held actions (keepalive)', () => {
    const get = setup()
    const send = vi.fn()
    act(() => void get().undo.hold({ message: 'x', hide: () => {}, restore: () => {}, send }))
    expect(send).not.toHaveBeenCalled()
    document.body.innerHTML = ''
    act(() => void window.dispatchEvent(new Event('pagehide')))
    expect(send).toHaveBeenCalledWith({ keepalive: true })
  })
})
