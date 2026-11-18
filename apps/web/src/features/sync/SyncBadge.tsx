// Reads the sync state and draws the shell's badge (SPEC-AP-001 F-AP-01). Mounted by routes.tsx as the shell's banner.
import type { PersistenceStatus } from '../../data/persistence'
import type { SyncState } from '../../data/sync-state'
import { useSyncSummary } from '../../data/sync-status'
import { SyncBadgeView, type SyncBadgeSummary } from '../../shell/SyncBadge'

// shell/ may not import data/, so the view repeats these unions: a change on either side is a compile error here.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never
type Assert<T extends true> = T
export type SyncStateMatchesView = Assert<Same<SyncState, SyncBadgeSummary['state']>>
export type PersistenceMatchesView = Assert<
  Same<PersistenceStatus, SyncBadgeSummary['persistence']>
>

export function SyncBadge() {
  const { state, reachable, waiting, syncing, unresolved, failed, persistence } = useSyncSummary()
  return (
    <SyncBadgeView
      summary={{ state, reachable, pending: waiting + syncing, unresolved, failed, persistence }}
    />
  )
}
