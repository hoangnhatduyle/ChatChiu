// Run-out sentence and the last five uses, newest first, read-only (F-QP-08, F-KB-10).
import type { InventoryItem, UsageEntry } from '@chatchiu/contracts'
import { getRemainingQuantity, runOutText, todayLocalDateString } from '@chatchiu/domain'
import { useUsageHistoryQuery } from '../../data/inventory'
import { Button } from '../../ui/Button'

const SHOWN_ENTRIES = 5
const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
const DATE_FORMATTER = new Intl.DateTimeFormat('en', DATE_FORMAT)
const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

function newestFirst(entries: readonly UsageEntry[]): UsageEntry[] {
  return [...entries]
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
    .slice(0, SHOWN_ENTRIES)
}

export function UsageHistory({ item }: { item: InventoryItem }) {
  const query = useUsageHistoryQuery(item.id)
  const format = DATE_FORMATTER
  let body
  if (query.data) {
    const prediction = runOutText(
      getRemainingQuantity(item),
      query.data,
      todayLocalDateString(),
      timeZone(),
    )
    const entries = newestFirst(query.data)
    body = (
      <>
        {prediction && <p className="text-md font-semibold">{prediction}</p>}
        {entries.length === 0 ? (
          <p className="text-md text-muted">No uses logged yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-hair">
            {entries.map((entry) => (
              <li key={entry.id} data-testid="usage-entry" className="py-2 text-md">
                <span className="font-semibold">{format.format(new Date(entry.recordedAt))}</span>
                {' · '}used {entry.amountUsed} {item.unit}
                {entry.notes && <span className="block text-sm text-muted">{entry.notes}</span>}
              </li>
            ))}
          </ul>
        )}
      </>
    )
  } else if (query.isError) {
    body = (
      <div role="alert" className="flex items-center gap-3 text-md text-muted">
        <p className="flex-1">Couldn&apos;t load the usage history.</p>
        <Button onPress={() => void query.refetch()}>Retry</Button>
      </div>
    )
  } else if (query.fetchStatus === 'paused') {
    body = <p className="text-md text-muted">Offline. The usage loads when you are back online.</p>
  } else {
    body = <p className="text-md text-muted">Loading usage…</p>
  }
  return (
    <section aria-labelledby="panel-history-heading" className="flex flex-col gap-2">
      <h3 id="panel-history-heading" className="text-sm font-semibold text-muted">
        Usage
      </h3>
      {body}
    </section>
  )
}
