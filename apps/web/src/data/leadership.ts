// Which window of the app is the leader for a user (Web Locks). Only the leader writes the saved cache
// and resumes queued writes; another window waits and takes over when the leader closes. Without Web
// Locks (old browsers) a window leads, since nothing can be coordinated.
export type LockManagerLike = Pick<LockManager, 'request'>

export interface Leadership {
  isLeader(): boolean
  subscribe(listener: () => void): () => void
  /** Starts waiting for, or holding, leadership. Safe to call again after stop(). */
  start(): void
  /** Gives up leadership, or stops waiting for it. */
  stop(): void
}

export function createLeadership(
  userId: string,
  locks: LockManagerLike | undefined = typeof navigator === 'undefined'
    ? undefined
    : navigator.locks,
): Leadership {
  let leader = false
  let controller: AbortController | undefined
  let finish: (() => void) | undefined
  const listeners = new Set<() => void>()

  const setLeader = (next: boolean) => {
    if (leader === next) return
    leader = next
    for (const listener of [...listeners]) listener()
  }

  return {
    isLeader: () => leader,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    start() {
      if (controller) return
      if (!locks) {
        setLeader(true)
        return
      }
      const own = new AbortController()
      controller = own
      locks
        .request(`chatchiu-sync:${userId}`, { signal: own.signal }, () => {
          if (own.signal.aborted) return Promise.resolve()
          setLeader(true)
          // Holding the lock means staying pending until stop().
          return new Promise<void>((resolve) => {
            finish = resolve
          })
        })
        .catch(() => undefined) // an AbortError: stopped before it was granted
    },
    stop() {
      controller?.abort()
      controller = undefined
      finish?.()
      finish = undefined
      setLeader(false)
    },
  }
}
