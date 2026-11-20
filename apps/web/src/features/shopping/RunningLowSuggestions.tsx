// "Running low" beside the list (F-SL-09): what the kitchen is asking for, one tap adds it. Rows already on the
// list are not offered, so the list shrinks as she adds them.
import { dayLabel } from '../meals/format'
import { Button } from '../../ui/Button'
import type { LowSuggestion } from './low-suggestions'

export function RunningLowSuggestions({
  rows,
  onAdd,
}: {
  rows: readonly LowSuggestion[]
  onAdd: (row: LowSuggestion) => void
}) {
  return (
    <section aria-labelledby="running-low-heading" className="flex flex-col gap-1">
      <h2 id="running-low-heading" className="font-display text-xl font-bold">
        Running low
      </h2>
      <p className="text-sm text-muted">From your kitchen. One tap adds it.</p>
      {rows.length === 0 ? (
        <p className="mt-2 text-md text-muted">Everything running low is already on your list.</p>
      ) : (
        <ul className="mt-1">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-3 border-t border-hair py-2 first:border-t-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-bold">{row.name}</p>
                <p className="text-sm text-muted">
                  {Math.round(row.percentLeft)}% left
                  {row.runOutDate && ` · runs out ${dayLabel(row.runOutDate)}`}
                </p>
              </div>
              <Button
                aria-label={`Add ${row.name} to the shopping list`}
                variant="secondary"
                onPress={() => onAdd(row)}
              >
                Add
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
