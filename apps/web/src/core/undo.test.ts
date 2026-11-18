// The two kinds of undo (AR-UNDO-KINDS, SPEC-QP-001): commit-now-and-reverse and hold-until-close.
import { UNDO_WINDOW_MS } from '@chatchiu/domain'
import { afterEach, beforeEach, vi } from 'vitest'
import { createToastStore } from './toast-store'
import { createUndoManager, type UndoManager } from './undo'

function setup() {
  const store = createToastStore()
  const win = new EventTarget()
  const doc = Object.assign(new EventTarget(), {
    visibilityState: 'visible' as DocumentVisibilityState,
  })
  const manager = createUndoManager({ toasts: store, windowTarget: win, documentTarget: doc })
  manager.start()
  return { store, manager, win, doc }
}
const press = (store: ReturnType<typeof createToastStore>, label: string, index = -1) =>
  store
    .getItems()
    .at(index)
    ?.actions?.find((a) => a.label === label)
    ?.onPress()
const closeAll = (store: ReturnType<typeof createToastStore>) =>
  store.getItems().forEach((i) => store.dismiss(i.id))

let current: UndoManager | undefined
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  current?.dispose()
  current = undefined
  vi.useRealTimers()
})
const make = () => {
  const s = setup()
  current = s.manager
  return s
}

describe('commit now, reverse on Undo', () => {
  it('SPEC-QP-001 commit_now_action: shows an Undo toast for the undo window; Undo sends the reverse', async () => {
    const { store, manager } = make()
    const reverse = vi.fn().mockResolvedValue(undefined)
    manager.commit({ message: 'Moved to Pantry', reverse })
    const toast = store.getItems()[0]
    expect(toast).toMatchObject({ message: 'Moved to Pantry', durationMs: UNDO_WINDOW_MS })
    press(store, 'Undo')
    await vi.advanceTimersByTimeAsync(0)
    expect(reverse).toHaveBeenCalledTimes(1)
    expect(store.getItems().some((i) => i.message === 'Moved to Pantry')).toBe(false)
  })

  it('F-KB-08: a commit can carry extra actions, shown before Undo (the used-up toast)', () => {
    const { store, manager } = make()
    const onAdd = vi.fn()
    manager.commit({
      message: 'Milk used up',
      reverse: vi.fn(),
      extraActions: [{ label: 'Add to shopping list', onPress: onAdd }],
    })
    expect(store.getItems()[0]?.actions?.map((a) => a.label)).toEqual([
      'Add to shopping list',
      'Undo',
    ])
    press(store, 'Add to shopping list')
    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it('a commit can be retracted (its first write was refused): the toast goes and Undo is gone', async () => {
    const { store, manager } = make()
    const handle = manager.commit({ message: 'Used 1', reverse: vi.fn() })
    expect(store.getItems()).toHaveLength(1)
    handle.retract()
    expect(store.getItems()).toHaveLength(0)
    expect(manager.canUndoLast()).toBe(false)
    expect(await handle.undo()).toBe(false)
  })

  it('Undo cannot be used twice', async () => {
    const { store, manager } = make()
    const reverse = vi.fn().mockResolvedValue(undefined)
    const handle = manager.commit({ message: 'Moved', reverse })
    press(store, 'Undo')
    await handle.undo()
    expect(reverse).toHaveBeenCalledTimes(1)
  })

  it('a reverse that fails says so, with Retry that tries again', async () => {
    const { store, manager } = make()
    const reverse = vi.fn().mockRejectedValueOnce(new Error('no')).mockResolvedValue(undefined)
    manager.commit({ message: 'Moved', reverse })
    press(store, 'Undo')
    await vi.advanceTimersByTimeAsync(0)
    const error = store.getItems().find((i) => i.tone === 'error')
    expect(error?.message).toMatch(/Couldn't undo/)
    press(store, 'Retry')
    await vi.advanceTimersByTimeAsync(0)
    expect(reverse).toHaveBeenCalledTimes(2)
  })

  it('F-AP-03 non-timed fallback: after the toast has closed, undoLast still reverses the newest change', async () => {
    const { store, manager } = make()
    const reverse = vi.fn().mockResolvedValue(undefined)
    manager.commit({ message: 'Moved', reverse })
    closeAll(store)
    expect(manager.canUndoLast()).toBe(true)
    await expect(manager.undoLast()).resolves.toBe(true)
    expect(reverse).toHaveBeenCalledTimes(1)
    expect(manager.canUndoLast()).toBe(false)
    await expect(manager.undoLast()).resolves.toBe(false)
  })

  it('a newer change replaces the fallback (only the latest is undone, never an older one by surprise)', async () => {
    const { manager } = make()
    const first = vi.fn().mockResolvedValue(undefined)
    const second = vi.fn().mockResolvedValue(undefined)
    manager.commit({ message: 'a', reverse: first })
    manager.commit({ message: 'b', reverse: second })
    await manager.undoLast()
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
  })
})

describe('hold until the toast closes', () => {
  const hold = () => ({
    hide: vi.fn(),
    restore: vi.fn(),
    send: vi.fn().mockResolvedValue(undefined),
  })

  it('NC-QP-NO-EARLY-SEND: hides at once, and sends nothing before the window closes', () => {
    const { manager } = make()
    const h = hold()
    manager.hold({ message: 'Moved to waste', ...h })
    expect(h.hide).toHaveBeenCalledTimes(1)
    expect(h.send).not.toHaveBeenCalled()
  })

  it('SPEC-QP-001 HIDDEN_LOCALLY -> SENDING: when the toast closes after the window, the server call is made (not keepalive)', () => {
    const { store, manager } = make()
    const h = hold()
    manager.hold({ message: 'Moved to waste', ...h })
    closeAll(store)
    expect(h.send).toHaveBeenCalledWith({ keepalive: false })
    expect(h.restore).not.toHaveBeenCalled()
  })

  it('FORBID UNDONE -> SENDING: an undone action is restored and never reaches the server', () => {
    const { store, manager } = make()
    const h = hold()
    manager.hold({ message: 'Moved to waste', ...h })
    press(store, 'Undo')
    closeAll(store)
    expect(h.restore).toHaveBeenCalledTimes(1)
    expect(h.send).not.toHaveBeenCalled()
  })

  it('FORBID DONE -> UNDONE: once sent, Undo does nothing', async () => {
    const { store, manager } = make()
    const h = hold()
    const handle = manager.hold({ message: 'Moved to waste', ...h })
    closeAll(store)
    await handle.undo()
    expect(h.restore).not.toHaveBeenCalled()
    expect(h.send).toHaveBeenCalledTimes(1)
  })

  it('NC-QP-NO-LOST-ACTION: hiding the page sends every held action at once, with keepalive, exactly once', () => {
    const { store, manager, doc, win } = make()
    const a = hold()
    const b = hold()
    manager.hold({ message: 'a', ...a })
    manager.hold({ message: 'b', ...b })
    doc.visibilityState = 'hidden'
    doc.dispatchEvent(new Event('visibilitychange'))
    win.dispatchEvent(new Event('pagehide'))
    expect(a.send).toHaveBeenCalledTimes(1)
    expect(a.send).toHaveBeenCalledWith({ keepalive: true })
    expect(b.send).toHaveBeenCalledWith({ keepalive: true })
    expect(store.getItems()).toEqual([])
  })

  it('NC-QP-NO-LOST-ACTION: leaving the app (dispose) sends what is still held', () => {
    const { manager } = make()
    const h = hold()
    manager.hold({ message: 'x', ...h })
    manager.dispose()
    expect(h.send).toHaveBeenCalledWith({ keepalive: true })
  })

  it('a held action is never pushed out by newer toasts: its Undo window stays whole', () => {
    const { store, manager } = make()
    const h = hold()
    manager.hold({ message: 'old', ...h })
    for (let n = 0; n < 5; n++) store.show({ message: `n${n}` })
    expect(h.send).not.toHaveBeenCalled()
    expect(store.getItems().some((i) => i.message === 'old')).toBe(true)
  })

  it('undoLast keeps a stack: after a newer change is sent, an older undoable one is still reachable, and says what it undid', async () => {
    const { store, manager } = make()
    const reverse = vi.fn().mockResolvedValue(undefined)
    manager.commit({ message: 'Used 1 egg', reverse })
    manager.hold({ message: 'Deleted milk', ...hold() })
    closeAll(store) // the hold is sent
    await expect(manager.undoLast()).resolves.toBe(true)
    expect(reverse).toHaveBeenCalledTimes(1)
    expect(store.getItems().some((i) => i.message === 'Undone · Used 1 egg')).toBe(true)
  })

  it('a send that throws shows "Couldn\'t save" with Retry, and does not lose the error', async () => {
    const { store, manager } = make()
    const h = {
      ...hold(),
      send: vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(undefined),
    }
    manager.hold({ message: 'Moved', ...h })
    closeAll(store)
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getItems().find((i) => i.tone === 'error')?.message).toMatch(/Couldn't save/)
    press(store, 'Retry')
    await vi.advanceTimersByTimeAsync(0)
    expect(h.send).toHaveBeenCalledTimes(2)
  })

  it('undoLast also undoes a held action that is still in its window', () => {
    const { manager } = make()
    const h = hold()
    manager.hold({ message: 'x', ...h })
    expect(manager.canUndoLast()).toBe(true)
    void manager.undoLast()
    expect(h.restore).toHaveBeenCalledTimes(1)
  })

  it('a held action that was already sent is no longer the undoLast target', () => {
    const { store, manager } = make()
    manager.hold({ message: 'x', ...hold() })
    closeAll(store)
    expect(manager.canUndoLast()).toBe(false)
  })
})
