// Is the API reachable right now? navigator.onLine can say "online" on a network with no internet
// (kitchen Wi-Fi), so we also treat a failed request as "offline" and probe with backoff until the
// API answers again. Feeds TanStack's onlineManager (data/query-client.ts), which pauses and resumes
// the write queue. SPEC-AP-001 connectivity_and_queue, F-AP-01.
import { pingApi } from './ping'

/** Waits between probes while offline; the last value repeats. */
export const PROBE_BACKOFF_MS: readonly number[] = [2_000, 4_000, 8_000, 16_000, 30_000]
/** A probe that has not answered by now counts as "not reachable" (pingApi has its own, shorter limit). */
export const PROBE_TIMEOUT_MS = 10_000

type Target = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>
type VisibilityTarget = Target & { visibilityState?: string }

export type ConnectivityDeps = {
  /** Resolves true when the API is reachable. Must not reject (a rejection counts as unreachable). */
  probe: () => Promise<boolean>
  isOnline?: () => boolean
  windowTarget?: Target
  documentTarget?: VisibilityTarget
}

export interface Connectivity {
  isOnline(): boolean
  subscribe(listener: () => void): () => void
  /** A request failed because there was no connection. */
  reportFailure(): void
  /** The server answered something (any status), so it is reachable. */
  reportReachable(): void
  dispose(): void
}

export function createConnectivity({
  probe,
  isOnline = () => navigator.onLine,
  windowTarget = window,
  documentTarget = document,
}: ConnectivityDeps): Connectivity {
  let online = isOnline()
  let attempt = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let probing = false
  let disposed = false
  // Bumped by every failure report, so a probe that started earlier cannot undo a newer failure.
  let failureCount = 0
  const listeners = new Set<() => void>()

  function setOnline(next: boolean) {
    if (online === next) return
    online = next
    if (next) {
      attempt = 0
      clearTimeout(timer)
      timer = undefined
    }
    for (const listener of [...listeners]) listener()
  }

  function schedule() {
    if (disposed || timer !== undefined || probing) return
    const delay = PROBE_BACKOFF_MS[Math.min(attempt, PROBE_BACKOFF_MS.length - 1)] ?? 0
    attempt += 1
    timer = setTimeout(() => void runProbe(), delay)
  }

  async function runProbe() {
    clearTimeout(timer)
    timer = undefined
    if (probing || disposed) return
    probing = true
    const failuresAtStart = failureCount
    let timeout: ReturnType<typeof setTimeout> | undefined
    const reachable = await Promise.race([
      Promise.resolve()
        .then(probe)
        .catch(() => false),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), PROBE_TIMEOUT_MS)
      }),
    ])
    clearTimeout(timeout)
    probing = false
    if (disposed) return
    // A failure reported while this probe was running is newer than its answer: ignore the answer.
    if (reachable && failureCount === failuresAtStart) setOnline(true)
    else if (!online) schedule()
  }

  const onBrowserOnline = () => {
    if (!online) void runProbe() // "online" can be a lie: only a good probe counts
  }
  const onBrowserOffline = () => {
    setOnline(false)
    schedule()
  }
  const onVisibility = () => {
    if (!online && documentTarget.visibilityState !== 'hidden') void runProbe()
  }
  // The browser may never send an "online" event (captive portals, some VPNs), so an app that starts
  // offline probes by itself.
  if (!online) schedule()
  windowTarget.addEventListener('online', onBrowserOnline)
  windowTarget.addEventListener('offline', onBrowserOffline)
  documentTarget.addEventListener('visibilitychange', onVisibility)

  return {
    isOnline: () => online,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    reportFailure() {
      failureCount += 1
      setOnline(false)
      schedule()
    },
    reportReachable() {
      setOnline(true)
    },
    dispose() {
      disposed = true
      clearTimeout(timer)
      timer = undefined
      listeners.clear()
      windowTarget.removeEventListener('online', onBrowserOnline)
      windowTarget.removeEventListener('offline', onBrowserOffline)
      documentTarget.removeEventListener('visibilitychange', onVisibility)
    },
  }
}

let instance: Connectivity | undefined

/** Drops the shared instance (tests, hot reload): its listeners and timers are removed. */
export function resetConnectivityForTests(): void {
  instance?.dispose()
  instance = undefined
}

/** The app's connectivity, built on first use. */
export function getConnectivity(): Connectivity {
  instance ??= createConnectivity({
    probe: () => pingApi({ baseUrl: import.meta.env.VITE_API_BASE_URL }),
  })
  return instance
}
