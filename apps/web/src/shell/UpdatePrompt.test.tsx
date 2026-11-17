// Step 3.3: the "New version — Reload" prompt (SPEC-SE-001 F-SE-05).
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SW_UPDATE_CHECK_MS, scheduleUpdateChecks } from './sw-updates'
import { UpdatePrompt } from './UpdatePrompt'

describe('UpdatePrompt', () => {
  it('F-SE-05: shows nothing while there is no new version, but its live region is already there', () => {
    render(<UpdatePrompt needRefresh={false} onReload={() => {}} onDismiss={() => {}} />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('a11y review M2: Escape dismisses the prompt and focus returns to the page', async () => {
    const onDismiss = vi.fn()
    render(
      <>
        <main id="main" tabIndex={-1} />
        <UpdatePrompt needRefresh onReload={() => {}} onDismiss={onDismiss} />
      </>,
    )
    screen.getByRole('button', { name: 'Reload' }).focus()
    await userEvent.keyboard('{Escape}')
    expect(onDismiss).toHaveBeenCalledOnce()
    expect(screen.getByRole('main')).toHaveFocus()
  })

  it('F-SE-05: a new version shows "New version" with Reload, and stays until handled', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const onReload = vi.fn()
    const onDismiss = vi.fn()
    render(<UpdatePrompt needRefresh onReload={onReload} onDismiss={onDismiss} />)
    expect(screen.getByRole('status')).toHaveTextContent('New version available')
    vi.advanceTimersByTime(60_000)
    expect(onDismiss).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(onReload).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })
})

describe('scheduleUpdateChecks', () => {
  it('F-SE-05: checks for a new version every hour and when the app comes back to the front (react review)', () => {
    vi.useFakeTimers()
    const update = vi.fn(async () => {})
    const stop = scheduleUpdateChecks({
      update,
      installing: null,
    } as unknown as ServiceWorkerRegistration)
    vi.advanceTimersByTime(SW_UPDATE_CHECK_MS)
    expect(update).toHaveBeenCalledTimes(1)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(update).toHaveBeenCalledTimes(2)
    stop()
    vi.advanceTimersByTime(SW_UPDATE_CHECK_MS)
    expect(update).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})
