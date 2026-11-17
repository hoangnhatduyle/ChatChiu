// The sync state shown by the badge (SPEC-AP-001 connectivity_and_queue). SYNC_FAILED joins in step
// 4.4, when the write hooks report a write that was rolled back.
export type SyncState = 'ONLINE_IDLE' | 'ONLINE_SYNCING' | 'OFFLINE_QUEUED'

export type SyncInputs = { reachable: boolean; waiting: number; syncing: number }

/** Never ONLINE_IDLE while any write is pending: queued changes are synced or rolled back, never dropped. */
export function syncState({ reachable, waiting, syncing }: SyncInputs): SyncState {
  if (waiting === 0 && syncing === 0) return 'ONLINE_IDLE'
  return !reachable && waiting > 0 ? 'OFFLINE_QUEUED' : 'ONLINE_SYNCING'
}
