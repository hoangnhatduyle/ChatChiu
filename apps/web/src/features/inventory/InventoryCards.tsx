// The Shelves view (default, F-IN-05): items grouped by where they live, each on a card with a category-coloured
// edge, a category pill, an expiry chip and the usage bar, which behaves as on the board (F-IN-08, F-KB-04: down
// only, saved on release, Undo, the percent follows the finger). Tapping the name opens the quick-action panel
// (F-IN-09). On a wide screen the cards sit 2 or 3 to a row. A row still being saved (temporary id) shows
// "Saving…" and cannot be opened, dragged or selected (7.0.20a). No image and no barcode are shown (D3).
import { DOWN_ONLY_HINT, USED_UP_STYLE } from '../../ui/usage-slider-shared'
import type { InventoryItem } from '@chatchiu/contracts'
import type { GroupKey } from '@chatchiu/domain'
import { isTempId } from '../../data/resource'
import { cx } from '../../ui/cx'
import { ExpiryChip } from '../../ui/ExpiryChip'
import { LocationHeader } from '../../ui/LocationHeader'
import { LOCATION_EDGE_CLASS, locationStyle, type LocationLike } from '../../ui/location-style'
import { UsageSlider } from '../../ui/UsageSlider'
import { useLiveUsage } from '../kitchen-board/use-live-usage'
import { SelectBox } from './SelectBox'
import {
  SHELF_CARD_HEIGHT,
  SHELF_HEADER_HEIGHT,
  type ListEntry,
  type ListRow,
} from './virtual-rows'
import { VirtualRows } from './VirtualRows'

export type RowActions = {
  today: string
  selecting: boolean
  selected: ReadonlySet<number>
  onToggle: (id: number) => void
  onOpen: (id: number) => void
  onUse: (item: InventoryItem, percent: number) => void
  categoryName: (id: number) => string
  locationName: (id: number | null) => string
  /** What picks a place's icon and tint. */
  locationOf: (id: number | null) => LocationLike
  /** How the list is grouped: decides what a group header looks like and whether a card names its place. */
  group: GroupKey
}

export type InventoryCardsProps = RowActions & {
  rows: readonly ListRow[]
  total: number
  /** Cards per row: 1 on a phone, 2 from 768 px, 3 from 1280 px, 4 from 1700 px, 5 from 2200 px. */
  columns: number
}

export function InventoryCards({ rows, total, columns, ...actions }: InventoryCardsProps) {
  return (
    <>
      <p className="sr-only">{DOWN_ONLY_HINT}</p>
      <VirtualRows
        rows={rows}
        role="list"
        label="Stock"
        heightOf={(row) => (row.kind === 'header' ? SHELF_HEADER_HEIGHT : SHELF_CARD_HEIGHT)}
        renderRow={(row) => {
          if (row.kind === 'header') {
            return (
              // A list may hold list items, not bare headings: the header is an item that carries its heading.
              <div role="listitem" className="flex h-full items-end pb-3">
                <GroupHeader row={row} {...actions} />
              </div>
            )
          }
          const entries: ListEntry[] =
            row.kind === 'cards' ? row.entries : [{ item: row.item, position: row.position }]
          return (
            <div
              role="presentation"
              className="grid h-full gap-3 pb-3"
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
            >
              {entries.map(({ item, position }) => (
                <div
                  key={item.id}
                  role="listitem"
                  aria-posinset={position}
                  aria-setsize={total}
                  className="min-w-0"
                >
                  <Card item={item} {...actions} />
                </div>
              ))}
            </div>
          )
        }}
      />
    </>
  )
}

function GroupHeader({
  row,
  ...actions
}: { row: Extract<ListRow, { kind: 'header' }> } & RowActions) {
  if (actions.group === 'location') {
    return (
      <LocationHeader
        location={actions.locationOf(row.groupKey)}
        title={row.label}
        count={row.count}
        level={2}
        className="w-full rounded-card"
      />
    )
  }
  return (
    <div className="flex w-full items-center gap-3 rounded-card bg-tint-neutral px-3.5 py-3">
      <h2 className="min-w-0 flex-1 truncate font-display text-lg font-bold text-ink">
        {row.label}
      </h2>
      <span className="font-display text-xl font-extrabold text-ink tabular">{row.count}</span>
    </div>
  )
}

function Card({ item, ...actions }: { item: InventoryItem } & RowActions) {
  const { setLive, stored, percent, usedUp, level, cue, amount } = useLiveUsage(item)
  const saving = isTempId(item.id)
  const category = actions.categoryName(item.categoryId)
  const place = actions.group === 'location' ? '' : actions.locationName(item.locationId)
  // The left stripe is the place's own colour, the same one its header wears on the Kitchen board.
  const { color: edgeColour } = locationStyle(actions.locationOf(item.locationId))
  return (
    <div
      data-used-up={usedUp}
      className="relative flex h-full flex-col justify-between overflow-hidden rounded-card border border-line bg-surface py-1.5 pr-3 pl-4.5 shadow-card"
    >
      <span
        aria-hidden="true"
        data-location-edge={edgeColour}
        className={cx('absolute inset-y-0 left-0 w-1.5', LOCATION_EDGE_CLASS[edgeColour])}
      />
      <div className="flex items-center gap-2">
        {actions.selecting && !saving && (
          <SelectBox
            name={item.name}
            checked={actions.selected.has(item.id)}
            onChange={() => actions.onToggle(item.id)}
          />
        )}
        {saving ? (
          <span className="min-h-10 min-w-0 flex-1">
            <span className="block truncate text-base font-bold">{item.name}</span>
            <span className="block text-sm text-muted">Saving…</span>
          </span>
        ) : (
          // The button holds only the name, so its label (name, category, amount, place) always contains what
          // is drawn in it; the category and amount are drawn under it and the whole area presses the button.
          <div className="relative min-w-0 flex-1">
            <button
              type="button"
              aria-label={`Open ${item.name}, ${[category, amount].filter(Boolean).join(', ')}${place ? ` · ${place}` : ''}`}
              data-open-item={item.id}
              onClick={() => actions.onOpen(item.id)}
              className={cx(
                'min-h-touch w-full cursor-pointer truncate text-left text-base font-bold outline-offset-2 after:absolute after:inset-0',
                usedUp && 'text-muted',
              )}
            >
              {item.name}
            </button>
            <span
              aria-hidden="true"
              className="pointer-events-none -mt-2 flex items-center gap-2 pb-1"
            >
              {category && (
                // Outlined, no fill: a filled pill would read as a status chip (Expired, Today, 20d).
                <span className="inline-flex max-w-full items-center rounded-control border border-line px-2 py-0.5 text-xs font-semibold text-muted">
                  <span className="truncate">{category}</span>
                </span>
              )}
              <span className="truncate text-sm text-muted">
                {amount}
                {place && ` · ${place}`}
              </span>
            </span>
          </div>
        )}
        <ExpiryChip
          expirationDate={item.expirationDate}
          today={actions.today}
          className={usedUp ? USED_UP_STYLE : undefined}
        />
      </div>
      <div className="flex items-center gap-2">
        <UsageSlider
          label={`How much ${item.name} is left`}
          value={stored}
          mode="down-only"
          description={amount}
          // No accidental use while she is picking items to delete.
          isDisabled={saving || actions.selecting}
          onDraft={setLive}
          className={cx('min-w-0 flex-1 px-1.5', usedUp && USED_UP_STYLE)}
          onCommit={(next) => actions.onUse(item, next)}
        />
        <span className="flex w-14 shrink-0 flex-col items-end">
          <span className="text-md font-bold tabular">{percent}%</span>
          {cue && (
            <span
              className={cx('text-2xs font-bold', level === 'critical' ? 'text-error' : 'text-low')}
            >
              {cue}
            </span>
          )}
        </span>
      </div>
    </div>
  )
}
