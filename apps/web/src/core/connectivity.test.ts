// Step 4.3: is the API reachable? navigator.onLine can say "online" on a network with no internet
// (kitchen Wi-Fi), so a failed request marks us offline and a probe with backoff finds the way back.
// SPEC-AP-001 connectivity_and_queue: ONLINE_IDLE <-> OFFLINE_QUEUED, F-AP-01.
import { afterEach, beforeEach, vi } from 'vitest'
import {
  createConnectivity,
  getConnectivity,
  PROBE_BACKOFF_MS,
  PROBE_TIMEOUT_MS,
  resetConnectivityForTests,
  type Connectivity,
} from './connectivity'

function setup(initiallyOnline = true) {
  const win = new EventTarget()
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  const probe = vi.fn<() => Promise<boolean>>(() => Promise.resolve(false))
  const connectivity = createConnectivity({
    probe,
    isOnline: () => initiallyOnline,
    windowTarget: win,
    documentTarget: doc,
  })
  const changes = vi.fn()
  connectivity.subscribe(changes)
  return { connectivity, probe, win, doc, changes }
}

let toDispose: Connectivity | undefined
beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  toDispose?.dispose()
  toDispose = undefined
  vi.useRealTimers()
})
const track = (s: ReturnType<typeof setup>) => {
  toDispose = s.connectivity
  return s
}

describe('connectivity', () => {
  it('F-AP-01: starts from what the browser says', () => {
    expect(track(setup(true)).connectivity.isOnline()).toBe(true)
    expect(track(setup(false)).connectivity.isOnline()).toBe(false)
  })

  it('F-AP-01: a network failure marks us offline, once, even though the browser still says online', () => {
    const { connectivity, changes } = track(setup())
    connectivity.reportFailure()
    connectivity.reportFailure()
    expect(connectivity.isOnline()).toBe(false)
    expect(changes).toHaveBeenCalledTimes(1)
  })

  it('F-AP-01: after a failure it probes with backoff, and a good probe brings us back online', async () => {
    const { connectivity, probe, changes } = track(setup())
    probe.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    connectivity.reportFailure()
    expect(probe).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(PROBE_BACKOFF_MS[0] ?? 0)
    expect(probe).toHaveBeenCalledTimes(1)
    expect(connectivity.isOnline()).toBe(false)
    await vi.advanceTimersByTimeAsync(PROBE_BACKOFF_MS[1] ?? 0)
    expect(probe).toHaveBeenCalledTimes(2)
    expect(connectivity.isOnline()).toBe(true)
    expect(changes).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(probe).toHaveBeenCalledTimes(2) // stopped
  })

  it('the backoff grows and then stays at its cap', async () => {
    const { connectivity, probe } = track(setup())
    connectivity.reportFailure()
    const total = PROBE_BACKOFF_MS.reduce((a, b) => a + b, 0)
    await vi.advanceTimersByTimeAsync(total)
    expect(probe).toHaveBeenCalledTimes(PROBE_BACKOFF_MS.length)
    const cap = PROBE_BACKOFF_MS.at(-1) ?? 0
    await vi.advanceTimersByTimeAsync(cap)
    expect(probe).toHaveBeenCalledTimes(PROBE_BACKOFF_MS.length + 1)
    expect([...PROBE_BACKOFF_MS]).toEqual([...PROBE_BACKOFF_MS].sort((a, b) => a - b))
  })

  it('F-AP-01: any answer from the server while offline brings us back online and stops probing', async () => {
    const { connectivity, probe } = track(setup())
    connectivity.reportFailure()
    connectivity.reportReachable()
    expect(connectivity.isOnline()).toBe(true)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(probe).not.toHaveBeenCalled()
  })

  it('reportReachable while already online changes nothing', () => {
    const { connectivity, changes } = track(setup())
    connectivity.reportReachable()
    expect(changes).not.toHaveBeenCalled()
  })

  it('F-AP-01: the browser "online" event probes at once, and only a good probe makes us online', async () => {
    const { connectivity, probe, win } = track(setup(false))
    win.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(probe).toHaveBeenCalledTimes(1)
    expect(connectivity.isOnline()).toBe(false) // the probe failed: "online" was a lie
    probe.mockResolvedValue(true)
    win.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(connectivity.isOnline()).toBe(true)
  })

  it('F-AP-01: the browser "offline" event marks us offline', () => {
    const { connectivity, win } = track(setup())
    win.dispatchEvent(new Event('offline'))
    expect(connectivity.isOnline()).toBe(false)
  })

  it('F-AP-01: coming back to the foreground while offline probes at once', async () => {
    const { connectivity, probe, doc } = track(setup())
    connectivity.reportFailure()
    doc.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('a hidden tab does not probe', async () => {
    const { connectivity, probe, doc } = track(setup())
    connectivity.reportFailure()
    doc.visibilityState = 'hidden'
    doc.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(probe).not.toHaveBeenCalled()
  })

  it('never runs two probes at once', async () => {
    const { connectivity, probe, win } = track(setup())
    let release: (ok: boolean) => void = () => {}
    probe.mockImplementation(() => new Promise<boolean>((resolve) => (release = resolve)))
    connectivity.reportFailure()
    win.dispatchEvent(new Event('online'))
    win.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(PROBE_BACKOFF_MS[0] ?? 0)
    expect(probe).toHaveBeenCalledTimes(1)
    release(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(connectivity.isOnline()).toBe(true)
  })

  it('a probe that throws counts as "still offline"', async () => {
    const { connectivity, probe } = track(setup())
    probe.mockRejectedValue(new Error('boom'))
    connectivity.reportFailure()
    await vi.advanceTimersByTimeAsync(PROBE_BACKOFF_MS[0] ?? 0)
    expect(connectivity.isOnline()).toBe(false)
    probe.mockResolvedValue(true)
    await vi.advanceTimersByTimeAsync(PROBE_BACKOFF_MS[1] ?? 0)
    expect(connectivity.isOnline()).toBe(true)
  })

  it('unsubscribe stops notifications, and dispose removes listeners and timers', async () => {
    const { connectivity, probe, win, changes } = setup()
    const other = vi.fn()
    const off = connectivity.subscribe(other)
    off()
    connectivity.reportFailure()
    expect(other).not.toHaveBeenCalled()
    expect(changes).toHaveBeenCalledTimes(1)
    connectivity.dispose()
    win.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(120_000)
    expect(probe).not.toHaveBeenCalled()
  })

  it('F-AP-01: an app that starts offline probes by itself (the browser may never send an "online" event)', async () => {
    const { probe } = track(setup(false))
    await vi.advanceTimersByTimeAsync(PROBE_BACKOFF_MS[0] ?? 0)
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('F-AP-01: a probe that started before a newer failure cannot undo that failure', async () => {
    const { connectivity, probe } = track(setup())
    let release: (ok: boolean) => void = () => {}
    probe.mockImplementation(() => new Promise<boolean>((resolve) => (release = resolve)))
    connectivity.reportFailure()
    await vi.advanceTimersByTimeAsync(PROBE_BACKOFF_MS[0] ?? 0) // the probe starts and waits
    connectivity.reportReachable() // a request got through...
    connectivity.reportFailure() // ...and then another failed
    release(true) // the old probe finishes with an out-of-date "yes"
    await vi.advanceTimersByTimeAsync(0)
    expect(connectivity.isOnline()).toBe(false)
  })

  it('F-AP-01: a probe that never settles is given up on, and probing carries on', async () => {
    const { connectivity, probe } = track(setup())
    probe.mockImplementationOnce(() => new Promise<boolean>(() => {})).mockResolvedValue(true)
    connectivity.reportFailure()
    await vi.advanceTimersByTimeAsync((PROBE_BACKOFF_MS[0] ?? 0) + PROBE_TIMEOUT_MS)
    expect(probe).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(PROBE_BACKOFF_MS[1] ?? 0)
    expect(probe).toHaveBeenCalledTimes(2)
    expect(connectivity.isOnline()).toBe(true)
  })
})

describe('getConnectivity', () => {
  it('is one shared instance until reset (tests and hot reload)', () => {
    resetConnectivityForTests()
    const first = getConnectivity()
    expect(getConnectivity()).toBe(first)
    resetConnectivityForTests()
    expect(getConnectivity()).not.toBe(first)
    resetConnectivityForTests()
  })
})
