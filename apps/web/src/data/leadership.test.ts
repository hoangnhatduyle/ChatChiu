// Only one window per user writes the saved cache and resumes the queued writes (NC-AP-NO-LOST-WRITES):
// two windows would send every queued write twice and overwrite each other's saved queue.
import { createLeadership, type LockManagerLike } from './leadership'

/** A minimal Web Locks stand-in: one holder per name, the rest wait in order. */
function fakeLocks(): LockManagerLike {
  const held = new Map<string, boolean>()
  const waiting = new Map<string, Array<() => void>>()
  const grant = (name: string, run: () => Promise<void>) => {
    held.set(name, true)
    void run().finally(() => {
      held.set(name, false)
      waiting.get(name)?.shift()?.()
    })
  }
  return {
    request: ((name: string, options: unknown, callback?: () => Promise<void>) => {
      const run = (typeof options === 'function' ? options : callback) as () => Promise<void>
      const signal =
        typeof options === 'object' ? (options as { signal?: AbortSignal }).signal : undefined
      return new Promise<void>((resolve, reject) => {
        const start = () => {
          if (signal?.aborted) return reject(new DOMException('aborted', 'AbortError'))
          grant(name, () => run().then(resolve))
        }
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        if (held.get(name)) waiting.set(name, [...(waiting.get(name) ?? []), start])
        else start()
      })
    }) as LockManagerLike['request'],
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('createLeadership', () => {
  it('F-AP-01: with no Web Locks support the window leads (nothing to coordinate with)', () => {
    const leadership = createLeadership('u', undefined)
    leadership.start()
    expect(leadership.isLeader()).toBe(true)
  })

  it('NC-AP-NO-LOST-WRITES: the first window leads and the second waits', async () => {
    const locks = fakeLocks()
    const a = createLeadership('u', locks)
    const b = createLeadership('u', locks)
    a.start()
    await tick()
    b.start()
    await tick()
    expect(a.isLeader()).toBe(true)
    expect(b.isLeader()).toBe(false)
  })

  it('NC-AP-NO-LOST-WRITES: when the leader goes away the waiting window takes over and is told', async () => {
    const locks = fakeLocks()
    const a = createLeadership('u', locks)
    const b = createLeadership('u', locks)
    const told = vi.fn()
    b.subscribe(told)
    a.start()
    await tick()
    b.start()
    await tick()
    a.stop()
    await tick()
    expect(a.isLeader()).toBe(false)
    expect(b.isLeader()).toBe(true)
    expect(told).toHaveBeenCalled()
  })

  it('different users do not compete', async () => {
    const locks = fakeLocks()
    const a = createLeadership('u1', locks)
    const b = createLeadership('u2', locks)
    a.start()
    b.start()
    await tick()
    expect(a.isLeader() && b.isLeader()).toBe(true)
  })

  it('stopping before the lock is granted cancels the wait', async () => {
    const locks = fakeLocks()
    const a = createLeadership('u', locks)
    const b = createLeadership('u', locks)
    a.start()
    await tick()
    b.start()
    b.stop()
    a.stop()
    await tick()
    expect(b.isLeader()).toBe(false)
  })

  it('can be started again after a stop (React StrictMode runs effects twice)', async () => {
    const locks = fakeLocks()
    const a = createLeadership('u', locks)
    a.start()
    a.stop()
    a.start()
    await tick()
    expect(a.isLeader()).toBe(true)
  })

  it('subscribers are told when leadership changes, and can unsubscribe', async () => {
    const a = createLeadership('u', fakeLocks())
    const told = vi.fn()
    const off = a.subscribe(told)
    a.start()
    await tick()
    expect(told).toHaveBeenCalledTimes(1)
    off()
    a.stop()
    await tick()
    expect(told).toHaveBeenCalledTimes(1)
  })
})
