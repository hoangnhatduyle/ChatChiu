// The waste log (F-ST-01): each entry with its name, category, quantity, unit, value (price × quantity) and
// date; delete hides it with Undo and sends after the window (held write, never a confirm). The category
// name is the one the API joins, then the loaded categories, then "No category": never "Unknown"
// (NC-ST-NO-UNKNOWN-CATEGORY).
import type { Category, WasteEntry } from '@chatchiu/contracts'
import { wasteValue } from '@chatchiu/domain'
import { todayInTimeZone } from '@chatchiu/domain'
import { wasteWrites } from '../../data/waste'
import { useHeldWrite } from '../../data/undoable'
import { EmptyState } from '../../ui/EmptyState'
import { IconButton } from '../../ui/IconButton'
import { categoryName } from './category-name'
import { amount, dateLabel, money } from './format'

export function WasteLog({
  entries,
  categories,
  timezone,
  isFiltered,
}: {
  entries: readonly WasteEntry[]
  categories: readonly Category[]
  timezone: string
  isFiltered: boolean
}) {
  const holdRemove = useHeldWrite(wasteWrites.remove)
  const dateOf = (entry: WasteEntry) =>
    dateLabel(todayInTimeZone(timezone, new Date(entry.wastedDate)))
  const remove = (entry: WasteEntry) => {
    const at = entries.findIndex((e) => e.id === entry.id)
    const neighbour = entries[at + 1] ?? entries[at - 1]
    if (!holdRemove({ id: entry.id }, `${entry.itemName} removed`)) return
    // The row she pressed goes away: focus moves to the next row's delete button, or to the heading.
    requestAnimationFrame(() => {
      const next = neighbour ? document.getElementById(`waste-delete-${neighbour.id}`) : null
      ;(next ?? document.getElementById('waste-log-heading'))?.focus()
    })
  }
  return (
    <div role="group" aria-label="Waste log" className="flex flex-col gap-2">
      <h3
        id="waste-log-heading"
        tabIndex={-1}
        className="text-md font-extrabold text-ink outline-none"
      >
        Waste log
      </h3>
      {entries.length === 0 ? (
        <EmptyState
          icon="trash"
          title={isFiltered ? 'No waste matches' : 'Nothing wasted'}
          align="start"
        >
          {isFiltered
            ? 'Try another time range or category.'
            : 'Items you mark as wasted show up here.'}
        </EmptyState>
      ) : (
        <ul className="rounded-card border border-line bg-surface">
          {entries.map((entry) => (
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
                <span className="font-mono tabular">
                  {amount(entry.quantity)} {entry.unit}
                </span>
                <span className="block font-mono font-bold tabular">
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
      )}
    </div>
  )
}
