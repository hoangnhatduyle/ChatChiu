// The sync state shown by the badge (SPEC-AP-001 connectivity_and_queue). SYNC_FAILED: a write the
// server refused was rolled back and is waiting for Retry or Discard (data/write.ts).
export type SyncState = 'ONLINE_IDLE' | 'ONLINE_SYNCING' | 'OFFLINE_QUEUED' | 'SYNC_FAILED'

export type SyncInputs = { reachable: boolean; waiting: number; syncing: number; failed?: number }

/** Never ONLINE_IDLE while any write is pending or failed: changes are synced, rolled back or reported, never dropped. */
export function syncState({ reachable, waiting, syncing, failed = 0 }: SyncInputs): SyncState {
  // A refused write needs the user, so it comes first, even while other writes are still pending.
  if (failed > 0) return 'SYNC_FAILED'
  if (waiting === 0 && syncing === 0) return 'ONLINE_IDLE'
  return !reachable && waiting > 0 ? 'OFFLINE_QUEUED' : 'ONLINE_SYNCING'
}
