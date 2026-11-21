// The waste log (F-ST-01), opened from a button beside the Waste heading and shown a page at a time: each entry
// with its name, category, quantity, unit, value (price × quantity) and date; delete hides it with Undo and sends
// after the window (held write, never a confirm). The category name is the one the API joins, then the loaded
// categories, then "No category": never "Unknown" (NC-ST-NO-UNKNOWN-CATEGORY).
import type { Category, WasteEntry } from '@chatchiu/contracts'
import { todayInTimeZone, wasteValue } from '@chatchiu/domain'
import { useState } from 'react'
import { useHeldWrite } from '../../data/undoable'
import { wasteWrites } from '../../data/waste'
import { Button } from '../../ui/Button'
import { EmptyState } from '../../ui/EmptyState'
import { IconButton } from '../../ui/IconButton'
import { ResponsivePanel } from '../../ui/ResponsivePanel'
import { categoryName } from './category-name'
import { amount, dateLabel, money } from './format'

/** Entries on one page of the log. */
export const WASTE_LOG_PAGE_SIZE = 8

type LogProps = {
  entries: readonly WasteEntry[]
  categories: readonly Category[]
  timezone: string
  isFiltered: boolean
}

function LogPage({ entries, categories, timezone, isFiltered }: LogProps) {
  const holdRemove = useHeldWrite(wasteWrites.remove)
  const [requestedPage, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(entries.length / WASTE_LOG_PAGE_SIZE))
  // A delete can empty the last page: stay on the last one that exists.
  const page = Math.min(requestedPage, pages)
  const first = (page - 1) * WASTE_LOG_PAGE_SIZE
  const shown = entries.slice(first, first + WASTE_LOG_PAGE_SIZE)
  const dateOf = (entry: WasteEntry) =>
    dateLabel(todayInTimeZone(timezone, new Date(entry.wastedDate)))
  const remove = (entry: WasteEntry) => {
    const at = shown.findIndex((e) => e.id === entry.id)
    const neighbour = shown[at + 1] ?? shown[at - 1]
    if (!holdRemove({ id: entry.id }, `${entry.itemName} removed`)) return
    // The row she pressed goes away: focus moves to the next row's delete button, or to the page text.
    requestAnimationFrame(() => {
      const next = neighbour ? document.getElementById(`waste-delete-${neighbour.id}`) : null
      ;(next ?? document.getElementById('waste-log-page'))?.focus()
    })
  }
  if (entries.length === 0) {
    return (
      <EmptyState
        icon="trash"
        title={isFiltered ? 'No waste matches' : 'Nothing wasted'}
        align="start"
      >
        {isFiltered
          ? 'Try another time range or category.'
          : 'Items you mark as wasted show up here.'}
      </EmptyState>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="rounded-card border border-line bg-surface">
        {shown.map((entry) => (
          <li
            key={entry.id}
            className="flex items-center gap-2 border-b border-line px-3 py-2 last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-ink">{entry.itemName}</p>
              <p className="text-sm text-muted">
                {categoryName(entry, categories)} · {dateOf(entry)}
              </p>
            </div>
            <p className="text-right text-md text-ink">
              <span className="tabular">
                {amount(entry.quantity)} {entry.unit}
              </span>
              <span className="block font-bold tabular">
                {entry.price === null ? (
                  <span className="font-sans font-normal text-muted">No price</span>
                ) : (
                  money(wasteValue(entry))
                )}
              </span>
            </p>
            <IconButton
              icon="trash"
              id={`waste-delete-${entry.id}`}
              label={`Delete ${entry.itemName}, ${amount(entry.quantity)} ${entry.unit}, ${dateOf(entry)}`}
              onPress={() => remove(entry)}
            />
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <nav aria-label="Waste log pages" className="flex items-center justify-between gap-2">
          <Button isDisabled={page === 1} onPress={() => setPage(page - 1)}>
            Previous
          </Button>
          <p
            id="waste-log-page"
            tabIndex={-1}
            aria-live="polite"
            className="text-center text-md text-muted tabular outline-none"
          >
            Page {page} of {pages}
          </p>
          <Button isDisabled={page === pages} onPress={() => setPage(page + 1)}>
            Next
          </Button>
        </nav>
      )}
    </div>
  )
}

export function WasteLog({
  isOpen,
  onOpenChange,
  ...log
}: LogProps & { isOpen: boolean; onOpenChange: (isOpen: boolean) => void }) {
  const count = log.entries.length
  return (
    <ResponsivePanel
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Waste log"
      eyebrow={`${count} ${count === 1 ? 'entry' : 'entries'}${log.isFiltered ? ' in this range and category' : ''}`}
    >
      {/* Mounted only while open, so it starts on page 1 every time. */}
      <LogPage {...log} />
    </ResponsivePanel>
  )
}
