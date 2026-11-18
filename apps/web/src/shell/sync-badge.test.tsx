// Step 6.3 (SPEC-AP-001 F-AP-01, NC-AP-NO-LOST-WRITES): the shell says when the device is offline and how many changes
// are waiting, and when a change needs attention or could not be kept. Silent when everything is saved and reachable.
// The announcer (role=status) stays mounted and says only the state, never the count, so counting up is not re-read.
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { SyncBadgeView, type SyncBadgeSummary } from './SyncBadge'

const base: SyncBadgeSummary = {
  state: 'ONLINE_IDLE',
  reachable: true,
  pending: 0,
  unresolved: 0,
  failed: 0,
  persistence: 'ok',
}

const show = (summary: Partial<SyncBadgeSummary>) =>
  render(
    <MemoryRouter>
      <SyncBadgeView summary={{ ...base, ...summary }} />
    </MemoryRouter>,
  )

const bar = () => document.querySelector('[data-sync-badge]')

describe('SyncBadgeView', () => {
  it('draws no bar when everything is saved and the API is reachable, but keeps its announcer mounted and empty', () => {
    show({})
    expect(bar()).toBeNull()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('F-AP-01: offline with one waiting change reads "1 change waiting to sync"', () => {
    show({ state: 'OFFLINE_QUEUED', reachable: false, pending: 1 })
    expect(bar()).toHaveTextContent('Offline · 1 change waiting to sync')
  })

  it('F-AP-01: the count is plural for several changes', () => {
    show({ state: 'OFFLINE_QUEUED', reachable: false, pending: 3 })
    expect(bar()).toHaveTextContent('3 changes waiting to sync')
  })

  it('counts changes still being sent as waiting while the device is unreachable', () => {
    show({ state: 'ONLINE_SYNCING', reachable: false, pending: 2 })
    expect(bar()).toHaveTextContent('Offline · 2 changes waiting to sync')
  })

  it('says only "Offline" when nothing is waiting', () => {
    show({ reachable: false })
    expect(bar()).toHaveTextContent(/^Offline$/)
  })

  it('the announcer says the state without the count, so 1 -> 2 -> 3 changes is not re-read', () => {
    const { rerender } = show({ state: 'OFFLINE_QUEUED', reachable: false, pending: 1 })
    const first = screen.getByRole('status').textContent
    expect(first).toMatch(/offline/i)
    expect(first).not.toMatch(/\d/)
    rerender(
      <MemoryRouter>
        <SyncBadgeView
          summary={{ ...base, state: 'OFFLINE_QUEUED', reachable: false, pending: 3 }}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('status').textContent).toBe(first)
  })

  it('the visible bar is not itself a live region (it would be announced twice)', () => {
    show({ state: 'OFFLINE_QUEUED', reachable: false, pending: 1 })
    expect(bar()).not.toHaveAttribute('role')
  })

  it('NC-AP-NO-LOST-WRITES: warns when this browser cannot keep queued changes across a reload', () => {
    show({ state: 'OFFLINE_QUEUED', reachable: false, pending: 2, persistence: 'unavailable' })
    expect(bar()).toHaveTextContent(/lost if you close the app/i)
  })

  it('NC-AP-NO-LOST-WRITES: says so, in any state, when this browser cannot keep changes offline', () => {
    show({ persistence: 'unavailable' })
    expect(bar()).toHaveTextContent(/won't survive closing the app/i)
  })

  it('NC-AP-NO-LOST-WRITES: says so when queued changes had to be discarded, even while online and idle', () => {
    show({ persistence: 'queue-discarded' })
    expect(bar()).toHaveTextContent(/couldn't be restored/i)
    expect(screen.getByRole('link', { name: /review/i })).toHaveAttribute('href', '/settings')
  })

  it('writes restored from an older version that can never be sent are shown, not hidden as "saving"', () => {
    show({ state: 'ONLINE_SYNCING', unresolved: 2 })
    expect(bar()).toHaveTextContent("2 changes from an earlier version can't be sent")
    expect(screen.getByRole('link', { name: /review/i })).toBeInTheDocument()
  })

  it('a refused change links to Settings → Data, and the count follows the failed writes', () => {
    show({ state: 'SYNC_FAILED', failed: 2 })
    expect(bar()).toHaveTextContent('2 changes need attention')
    expect(screen.getByRole('link', { name: /review/i })).toHaveAttribute('href', '/settings')
  })

  it('a refused change while offline still says the device is offline', () => {
    show({ state: 'SYNC_FAILED', failed: 1, reachable: false, pending: 2 })
    expect(bar()).toHaveTextContent('Offline · 1 change needs attention')
  })

  it('stays quiet while changes are only being sent (the rows show Saving…)', () => {
    show({ state: 'ONLINE_SYNCING', pending: 1 })
    expect(bar()).toBeNull()
  })

  it('the Review link is a full-size touch target', () => {
    show({ state: 'SYNC_FAILED', failed: 1 })
    expect(screen.getByRole('link', { name: /review/i })).toHaveClass('min-h-touch')
  })
})
