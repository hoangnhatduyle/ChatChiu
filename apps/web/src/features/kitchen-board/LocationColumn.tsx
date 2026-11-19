// One location's column (F-KB-01): its name and count, a + that opens the item form with this
// location chosen (F-KB-12), and its rows, soonest expiry first.
import { rowKey } from '../../data/resource'
import type { InventoryItem } from '@chatchiu/contracts'
import { Link } from 'react-router'
import { Icon } from '../../ui/Icon'
import { BoardRow, type BoardRowProps } from './BoardRow'

export type LocationColumnProps = {
  /** The location id, or null for the "No location" column. */
  locationId: number | null
  name: string
  items: InventoryItem[]
  /** True while a chip or search narrows the board, so an empty column says "matches". */
  filtered: boolean
  today: string
  onOpen: BoardRowProps['onOpen']
  onUse: BoardRowProps['onUse']
}

export function LocationColumn({
  locationId,
  name,
  items,
  filtered,
  today,
  onOpen,
  onUse,
}: LocationColumnProps) {
  const headingId = `column-${locationId ?? 'none'}`
  const addTo = locationId === null ? '/stock/new' : `/stock/new?location=${locationId}`
  return (
    <section
      aria-labelledby={headingId}
      className="flex min-h-0 snap-start flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card"
    >
      <div className="flex items-center gap-2 border-b border-hair py-2 pr-1.5 pl-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-icon-bg text-icon-ink">
          <Icon name="pin" size={19} />
        </span>
        <h2 id={headingId} className="min-w-0 flex-1 truncate text-lg font-extrabold">
          {name}{' '}
          <span aria-hidden="true" className="text-md font-semibold text-muted">
            {items.length}
          </span>
          <span className="sr-only">
            , {items.length} {items.length === 1 ? 'item' : 'items'}
          </span>
        </h2>
        <Link
          to={addTo}
          aria-label={`Add to ${name}`}
          className="flex size-11 items-center justify-center rounded-control text-muted hover:bg-hover active:bg-pressed"
        >
          <Icon name="plus" size={20} strokeWidth={2.2} />
        </Link>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {items.map((item) => (
          <BoardRow
            key={rowKey('inventory', item.id)}
            item={item}
            today={today}
            onOpen={onOpen}
            onUse={onUse}
          />
        ))}
      </ul>
      {items.length === 0 && (
        <p className="px-3 py-4 text-md text-muted">
          {filtered ? 'Nothing here matches.' : 'Nothing here yet.'}
        </p>
      )}
    </section>
  )
}
