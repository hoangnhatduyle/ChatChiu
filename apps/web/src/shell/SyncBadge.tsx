// The shell's sync badge (SPEC-AP-001 F-AP-01, NC-AP-NO-LOST-WRITES): says when the device is offline and how many
// changes are waiting, when a change the server refused needs attention, and when changes could not be kept or sent. A
// slim bar at the top of the page, in the flow (it moves the page down rather than covering its controls); nothing shows
// when all is saved and reachable. While changes are only being sent the rows themselves say "Saving…", so the bar
// stays quiet. A separate announcer (role=status) stays mounted and only its text changes, and it says the state, never
// the count, so counting up while she edits offline is not re-read. The container that reads the sync state is
// features/sync/SyncBadge.tsx (shell/ never imports data/).
import { Link } from 'react-router'
import { Icon } from '../ui/Icon'

/** What the badge needs (data/sync-status.ts `useSyncSummary` answers this). */
export type SyncBadgeSummary = {
  state: 'ONLINE_IDLE' | 'ONLINE_SYNCING' | 'OFFLINE_QUEUED' | 'SYNC_FAILED'
  reachable: boolean
  /** Changes not yet saved on the server: waiting for a connection or being sent. */
  pending: number
  /** Changes restored from an earlier version of the app that can never be sent. */
  unresolved: number
  failed: number
  persistence: 'ok' | 'unavailable' | 'queue-discarded'
}

type Notice = { text: string; announce: string; tone: 'error' | 'info'; review: boolean }

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function noticeOf(s: SyncBadgeSummary): Notice | null {
  const offline = s.reachable ? '' : 'Offline · '
  if (s.persistence === 'queue-discarded') {
    return {
      text: "Some unsent changes couldn't be restored on this device · a copy was kept",
      announce: "Some unsent changes couldn't be restored",
      tone: 'error',
      review: true,
    }
  }
  if (s.state === 'SYNC_FAILED') {
    return {
      text: `${offline}${plural(s.failed, 'change')} ${s.failed === 1 ? 'needs' : 'need'} attention`,
      announce: 'Some changes need attention',
      tone: 'error',
      review: true,
    }
  }
  if (s.unresolved > 0) {
    return {
      text: `${plural(s.unresolved, 'change')} from an earlier version can't be sent`,
      announce: "Some changes can't be sent",
      tone: 'error',
      review: true,
    }
  }
  if (!s.reachable) {
    const lost =
      s.persistence === 'unavailable' ? ' · these would be lost if you close the app' : ''
    return {
      text:
        s.pending > 0
          ? `Offline · ${plural(s.pending, 'change')} waiting to sync${lost}`
          : 'Offline',
      announce: "You're offline",
      tone: 'info',
      review: false,
    }
  }
  if (s.persistence === 'unavailable') {
    return {
      text: "Offline mode isn't available in this browser · changes won't survive closing the app",
      announce: "Offline mode isn't available in this browser",
      tone: 'info',
      review: false,
    }
  }
  return null
}

export function SyncBadgeView({ summary }: { summary: SyncBadgeSummary }) {
  const notice = noticeOf(summary)
  return (
    <>
      <div role="status" data-live-announcer="true" className="sr-only">
        {notice?.announce ?? ''}
      </div>
      {notice && (
        <div
          data-sync-badge={summary.state}
          className={
            'sticky top-0 z-30 flex flex-wrap items-center justify-center gap-x-2 border-b border-line bg-surface ' +
            'px-3 pt-[env(safe-area-inset-top)] text-sm font-semibold ' +
            (notice.tone === 'error' ? 'text-error' : 'text-ink')
          }
        >
          <span className="inline-flex min-h-8 items-center gap-2">
            <Icon name={notice.tone === 'error' ? 'alert' : 'clock'} size={16} />
            {notice.text}
          </span>
          {notice.review && (
            <Link
              to="/settings"
              className="inline-flex min-h-touch items-center px-2 font-bold underline"
            >
              Review
            </Link>
          )}
        </div>
      )}
    </>
  )
}
