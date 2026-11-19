// Data (F-SE-04, F-SE-05, 7.0.20b, 7.0.18): how syncing stands (SYNC_FAILED included) with the failed-writes
// list, the CSV export, and Reset app cache behind a confirmation.
import { buildInventoryCsv } from '@chatchiu/domain'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { userMessage } from '../../core/errors'
import { useSession } from '../../core/session-context'
import { useToast } from '../../core/toast-context'
import { resetAppCache } from '../../data/cache'
import { useBootstrapQuery } from '../../data/inventory'
import { acknowledgeQueueDiscarded } from '../../data/persistence'
import { discardUnsendableWrites } from '../../data/query-client'
import { useSyncSummary } from '../../data/sync-status'
import { Button } from '../../ui/Button'
import { ConfirmDialog } from './ConfirmDialog'
import { downloadTextFile } from './download'
import { FailedWritesList } from './FailedWritesList'
import { SectionCard } from './SectionCard'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function syncText(s: ReturnType<typeof useSyncSummary>): string {
  if (s.persistence === 'queue-discarded')
    return "Some unsent changes couldn't be restored on this device. A copy was kept."
  if (s.unresolved > 0)
    return `${plural(s.unresolved, 'change')} from an earlier version can't be sent`
  switch (s.state) {
    case 'SYNC_FAILED':
      return `${plural(s.failed, 'change')} ${s.failed === 1 ? 'needs' : 'need'} attention`
    case 'OFFLINE_QUEUED':
      return `${plural(s.waiting, 'change')} waiting for a connection`
    case 'ONLINE_SYNCING':
      return 'Saving changes…'
    case 'ONLINE_IDLE':
      return 'All changes saved'
  }
}

export function DataSection() {
  const client = useQueryClient()
  const toasts = useToast()
  const { user } = useSession()
  const bootstrap = useBootstrapQuery().data
  const sync = useSyncSummary()
  const [confirming, setConfirming] = useState(false)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  const exportCsv = () => {
    if (!bootstrap) {
      toasts.show({
        message:
          "Your inventory hasn't loaded yet, so there is nothing to export. Try again in a moment.",
        tone: 'error',
      })
      return
    }
    if (bootstrap.items.length === 0) {
      toasts.show({ message: 'No items to export yet' })
      return
    }
    try {
      const names = new Map(bootstrap.categories.map((c) => [c.id, c.name]))
      const csv = buildInventoryCsv(bootstrap.items, (id) =>
        id === null ? '' : (names.get(id) ?? ''),
      )
      downloadTextFile(`inventory_export_${new Date().toLocaleDateString('en-CA')}.csv`, csv)
      toasts.show({ message: 'Inventory exported' })
    } catch (error) {
      toasts.show({
        message: `Couldn't export the inventory. ${userMessage(error)}`,
        tone: 'error',
      })
    }
  }

  const reset = async () => {
    if (!user) return
    setResetting(true)
    setResetError(null)
    try {
      await resetAppCache(client, user.id)
    } catch (error) {
      // The error shows in the section: the dialog closes so it is not hidden behind it.
      setResetError(`Couldn't reset the cache. ${userMessage(error)}`)
      setResetting(false)
      setConfirming(false)
    }
  }

  return (
    <SectionCard title="Data">
      <p
        role="status"
        className={
          sync.state === 'SYNC_FAILED'
            ? 'text-base font-bold text-error'
            : 'text-base font-bold text-ink'
        }
      >
        {syncText(sync)}
      </p>
      {sync.persistence === 'unavailable' && (
        <p className="text-md text-muted">
          Changes made offline would be lost if you close the app: this browser can&apos;t keep
          them.
        </p>
      )}
      {sync.persistence === 'queue-discarded' && (
        <div>
          <Button variant="secondary" onPress={acknowledgeQueueDiscarded}>
            Got it
          </Button>
        </div>
      )}
      {sync.unresolved > 0 && (
        <div>
          <Button variant="secondary" onPress={() => setConfirmingDiscard(true)}>
            Discard changes that can&apos;t be sent
          </Button>
        </div>
      )}
      <FailedWritesList />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onPress={exportCsv}>
          Export inventory (CSV)
        </Button>
        <Button variant="secondary" onPress={() => setConfirming(true)}>
          Reset app cache
        </Button>
      </div>
      {resetError && (
        <p role="alert" className="text-md font-semibold text-error">
          {resetError}
        </p>
      )}
      <ConfirmDialog
        isOpen={confirmingDiscard}
        onOpenChange={setConfirmingDiscard}
        title="Discard these changes?"
        confirmLabel="Discard"
        onConfirm={() => {
          const n = discardUnsendableWrites(client)
          setConfirmingDiscard(false)
          toasts.show({ message: `Discarded ${plural(n, 'change')}` })
        }}
      >
        They were made in an earlier version of the app and can no longer be sent to the server.
        This cannot be undone.
      </ConfirmDialog>
      <ConfirmDialog
        isOpen={confirming}
        onOpenChange={setConfirming}
        title="Reset app cache?"
        confirmLabel="Reset cache"
        isBusy={resetting}
        onConfirm={() => void reset()}
      >
        This clears what this device saved, including changes still waiting to sync, and reloads the
        app. It cannot be undone. Your data on the server is not touched.
      </ConfirmDialog>
    </SectionCard>
  )
}
