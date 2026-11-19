// The card view (below 1024 px, F-IN-05): one card per item with the usage bar, which behaves as on the
// board (F-IN-08, F-KB-04: down only, saved on release, Undo). Tapping the name opens the quick-action
// panel (F-IN-09). A row still being saved (temporary id) shows "Saving…" and cannot be opened, dragged
// or selected (7.0.20a). No image and no barcode are shown (D3).
import { DOWN_ONLY_HINT, USED_UP_STYLE } from '../../ui/usage-slider-shared'
import type { InventoryItem } from '@chatchiu/contracts'
import { isUsedUp, lowStockLevel, percentLeft, quantityLabel } from '@chatchiu/domain'
import { isTempId } from '../../data/resource'
import { cx } from '../../ui/cx'
import { ExpiryChip } from '../../ui/ExpiryChip'
import { UsageSlider } from '../../ui/UsageSlider'
import { SelectBox } from './SelectBox'
import { CARD_HEIGHT, HEADER_HEIGHT, type ListRow } from './virtual-rows'
import { VirtualRows } from './VirtualRows'

const CUE = { warning: 'Low', critical: 'Very low' } as const

export type RowActions = {
  today: string
  selecting: boolean
  selected: ReadonlySet<number>
  onToggle: (id: number) => void
  onOpen: (id: number) => void
  onUse: (item: InventoryItem, percent: number) => void
  categoryName: (id: number) => string
  locationName: (id: number | null) => string
}

export type InventoryCardsProps = RowActions & { rows: readonly ListRow[]; total: number }

export function InventoryCards({ rows, total, ...actions }: InventoryCardsProps) {
  return (
    <>
      <p className="sr-only">{DOWN_ONLY_HINT}</p>
      <VirtualRows
        rows={rows}
        role="list"
        label="Stock"
        heightOf={(row) => (row.kind === 'header' ? HEADER_HEIGHT : CARD_HEIGHT)}
        renderRow={(row) =>
          row.kind === 'header' ? (
            <div role="presentation" className="flex h-full items-end pb-1.5">
              <h2 className="text-md font-extrabold text-muted">
                {row.label} <span className="tabular text-sm">{row.count}</span>
              </h2>
            </div>
          ) : (
            <div
              role="listitem"
              aria-posinset={row.position}
              aria-setsize={total}
              className="h-full pb-2"
            >
              <Card item={row.item} {...actions} />
            </div>
          )
        }
      />
    </>
  )
}

function Card({ item, ...actions }: { item: InventoryItem } & RowActions) {
  const left = percentLeft(item)
  const percent = left > 0 ? Math.max(1, Math.round(left)) : 0
  const usedUp = isUsedUp(item)
  const saving = isTempId(item.id)
  const level = usedUp ? 'normal' : lowStockLevel(item)
  const cue = usedUp ? 'Used up' : level === 'normal' ? null : CUE[level]
  const amount = quantityLabel(item)
  const where = [actions.categoryName(item.categoryId), actions.locationName(item.locationId)]
    .filter(Boolean)
    .join(' · ')
  return (
    <div
      data-used-up={usedUp}
      className="flex h-full flex-col justify-between overflow-hidden rounded-card border border-line bg-surface px-3 py-1.5"
    >
      <div className="flex items-center gap-2.5">
        {actions.selecting && !saving && (
          <SelectBox
            name={item.name}
            checked={actions.selected.has(item.id)}
            onChange={() => actions.onToggle(item.id)}
          />
        )}
        <ExpiryChip
          expirationDate={item.expirationDate}
          today={actions.today}
          className={usedUp ? USED_UP_STYLE : undefined}
        />
        {saving ? (
          <span className="min-h-10 min-w-0 flex-1">
            <span className="block truncate text-base font-semibold">{item.name}</span>
            <span className="block text-sm text-muted">Saving…</span>
          </span>
        ) : (
          <button
            type="button"
            aria-label={`Open ${item.name}, ${amount}${where ? ` · ${where}` : ''}`}
            data-open-item={item.id}
            onClick={() => actions.onOpen(item.id)}
            className="min-h-touch min-w-0 flex-1 cursor-pointer text-left outline-offset-2"
          >
            <span className={cx('block truncate text-base font-semibold', usedUp && 'text-muted')}>
              {item.name}
            </span>{' '}
            <span className="block truncate text-sm text-muted">
              {amount}
              {where && ` · ${where}`}
            </span>
          </button>
        )}
        <span className="flex shrink-0 flex-col items-end">
          <span className="tabular text-md font-bold">{percent}%</span>
          {cue && (
            <span
              className={cx('text-2xs font-bold', level === 'critical' ? 'text-error' : 'text-low')}
            >
              {cue}
            </span>
          )}
        </span>
      </div>
      <UsageSlider
        label={`How much ${item.name} is left`}
        value={percent}
        mode="down-only"
        description={amount}
        tone={level === 'normal' ? 'normal' : 'low'}
        // No accidental use while she is picking items to delete.
        isDisabled={saving || actions.selecting}
        className={cx('px-1.5', usedUp && USED_UP_STYLE)}
        onCommit={(next) => actions.onUse(item, next)}
      />
    </div>
  )
}
