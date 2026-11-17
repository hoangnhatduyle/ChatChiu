// What the UI shows about syncing (SPEC-AP-001 F-AP-01): how many writes are waiting, whether the API
// is reachable, and whether offline mode works on this device.
import { useMutationState } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { getConnectivity } from '../core/connectivity'
import {
  getPersistenceStatus,
  subscribePersistenceStatus,
  type PersistenceStatus,
} from './persistence'
import { syncState } from './sync-state'

type WriteKind = 'waiting' | 'syncing' | 'unresolved'

/**
 * Writes not yet saved on the server: `waiting` are paused (offline), `syncing` are being sent, and
 * `unresolved` were restored from an older build that this one cannot run (kept, never dropped).
 */
export function usePendingWrites(): { waiting: number; syncing: number; unresolved: number } {
  const kinds = useMutationState<WriteKind>({
    filters: { status: 'pending' },
    select: (mutation) => {
      if (!mutation.options.mutationFn) return 'unresolved'
      return mutation.state.isPaused ? 'waiting' : 'syncing'
    },
  })
  const count = (kind: WriteKind) => kinds.filter((k) => k === kind).length
  return { waiting: count('waiting'), syncing: count('syncing'), unresolved: count('unresolved') }
}

/** False while the API is unreachable (no connection, or the browser says offline). */
export function useIsReachable(): boolean {
  const connectivity = getConnectivity()
  return useSyncExternalStore(connectivity.subscribe, connectivity.isOnline)
}

export function usePersistenceStatus(): PersistenceStatus {
  return useSyncExternalStore(subscribePersistenceStatus, getPersistenceStatus)
}

/** Everything the sync badge needs in one place. */
export function useSyncSummary() {
  const writes = usePendingWrites()
  const reachable = useIsReachable()
  return {
    ...writes,
    reachable,
    state: syncState({
      reachable,
      waiting: writes.waiting,
      syncing: writes.syncing + writes.unresolved,
    }),
    /** 'unavailable': queued writes would not survive a reload on this device. */
    persistence: usePersistenceStatus(),
  }
}
