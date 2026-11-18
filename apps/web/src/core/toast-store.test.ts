// F-AP-03: one toast system. Announcements go through live regions that stay mounted, so their text
// is cleared and set again after mount.
import { afterEach, beforeEach, vi } from 'vitest'
import { ANNOUNCE_GAP_MS, createToastStore, MAX_VISIBLE_TOASTS } from './toast-store'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('toast store', () => {
  it('F-AP-03: shows a toast and removes it when dismissed, running onClose once', () => {
    const store = createToastStore()
    const onClose = vi.fn()
    const id = store.show({ message: 'Saved', onClose })
    expect(store.getItems().map((i) => i.message)).toEqual(['Saved'])
    store.dismiss(id)
    store.dismiss(id)
    expect(store.getItems()).toEqual([])
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('F-AP-03: a normal toast is announced politely and an error assertively, after the live region cleared', () => {
    const store = createToastStore()
    store.show({ message: 'Moved to Pantry' })
    store.show({ message: "Couldn't save", tone: 'error' })
    expect(store.getAnnouncements()).toEqual({ status: '', alert: '' })
    vi.advanceTimersByTime(ANNOUNCE_GAP_MS)
    expect(store.getAnnouncements()).toEqual({ status: 'Moved to Pantry', alert: "Couldn't save" })
  })

  it('F-AP-03: the same message twice is announced twice (the text is cleared in between)', () => {
    const store = createToastStore()
    const seen: string[] = []
    store.subscribe(() => seen.push(store.getAnnouncements().status))
    store.show({ message: 'Saved' })
    vi.advanceTimersByTime(ANNOUNCE_GAP_MS)
    store.show({ message: 'Saved' })
    vi.advanceTimersByTime(ANNOUNCE_GAP_MS)
    // announced = the text went from something else to 'Saved', twice
    const announced = seen.filter((text, i) => text === 'Saved' && seen[i - 1] !== 'Saved')
    expect(announced).toHaveLength(2)
  })

  it('too many toasts push the oldest out, and its onClose still runs (a held action is sent, not lost)', () => {
    const store = createToastStore()
    const closed: number[] = []
    for (let n = 0; n <= MAX_VISIBLE_TOASTS; n++)
      store.show({ message: `t${n}`, onClose: () => closed.push(n) })
    expect(store.getItems()).toHaveLength(MAX_VISIBLE_TOASTS)
    expect(closed).toEqual([0])
    expect(store.getItems()[0]?.message).toBe('t1')
  })

  it('the default duration is the undo window; null stays until handled', () => {
    const store = createToastStore()
    store.show({ message: 'a' })
    store.show({ message: 'b', durationMs: null })
    expect(store.getItems()[0]?.durationMs).toBe(5000)
    expect(store.getItems()[1]?.durationMs).toBeNull()
  })

  it('unsubscribe stops notifications; dispose clears pending announcements', () => {
    const store = createToastStore()
    const listener = vi.fn()
    const off = store.subscribe(listener)
    off()
    store.show({ message: 'x' })
    expect(listener).not.toHaveBeenCalled()
    store.dispose()
    vi.advanceTimersByTime(ANNOUNCE_GAP_MS * 2)
    expect(store.getAnnouncements().status).toBe('')
  })

  it('7.0.25: two toasts shown within the announce gap are announced together, not one over the other', () => {
    const store = createToastStore()
    store.show({ message: 'Milk used up' })
    store.show({ message: 'Eggs restocked' })
    vi.advanceTimersByTime(ANNOUNCE_GAP_MS)
    expect(store.getAnnouncements().status).toBe('Milk used up. Eggs restocked')
    store.dispose()
  })

  it('7.0.25: a store disposed with an announcement waiting still announces the next one', () => {
    const store = createToastStore()
    store.show({ message: 'First' })
    store.dispose() // the pending timer is cleared
    store.show({ message: 'Second' })
    vi.advanceTimersByTime(ANNOUNCE_GAP_MS)
    expect(store.getAnnouncements().status).toBe('Second')
    store.dispose()
  })

  it('7.0.25: the same message twice in one gap is announced once, without a doubled full stop', () => {
    const store = createToastStore()
    store.show({ message: 'Saved.' })
    store.show({ message: 'Saved.' })
    store.show({ message: 'Undo ready' })
    vi.advanceTimersByTime(ANNOUNCE_GAP_MS)
    expect(store.getAnnouncements().status).toBe('Saved. Undo ready')
    store.dispose()
  })
})
