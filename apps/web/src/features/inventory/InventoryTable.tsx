// The table view (from 1024 px, F-IN-05): name, category, location, amount left, expiry, percent. ARIA
// table roles on a grid of divs, because the rows are virtual (F-IN-06). The name opens the quick-action
// panel (F-IN-09); there is no usage bar here (F-IN-08 is for cards) and no image or barcode (D3).
import type { InventoryItem } from '@chatchiu/contracts'
import { isUsedUp, lowStockLevel, percentLeft, quantityLabel } from '@chatchiu/domain'
import { isTempId } from '../../data/resource'
import { cx } from '../../ui/cx'
import { ExpiryChip } from '../../ui/ExpiryChip'
import type { RowActions } from './InventoryCards'
import { SelectBox } from './SelectBox'
import { HEADER_HEIGHT, TABLE_ROW_HEIGHT, type ListRow } from './virtual-rows'
import { VirtualRows } from './VirtualRows'

const COLUMNS = 'minmax(0,2.2fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1.2fr) 7.5rem 5.5rem'
const CUE = { warning: 'Low', critical: 'Very low' } as const

export type InventoryTableProps = RowActions & { rows: readonly ListRow[] }

export function InventoryTable({ rows, ...actions }: InventoryTableProps) {
  const selectWidth = actions.selecting ? '3rem ' : ''
  const template = `${selectWidth}${COLUMNS}`
  return (
    <div role="table" aria-label="Stock" aria-rowcount={rows.length + 1} className="w-full">
      <div role="rowgroup">
        <div
          role="row"
          aria-rowindex={1}
          className="grid items-center gap-3 border-b border-line px-3 py-2 text-sm font-semibold text-muted"
          style={{ gridTemplateColumns: template }}
        >
          {actions.selecting && (
            <span role="columnheader" className="sr-only">
              Select
            </span>
          )}
          <span role="columnheader">Name</span>
          <span role="columnheader">Category</span>
          <span role="columnheader">Location</span>
          <span role="columnheader">Left</span>
          <span role="columnheader">Expires</span>
          <span role="columnheader" className="text-right">
            Level
          </span>
        </div>
      </div>
      <VirtualRows
        rows={rows}
        role="rowgroup"
        heightOf={(row) => (row.kind === 'header' ? HEADER_HEIGHT : TABLE_ROW_HEIGHT)}
        renderRow={(row, index) =>
          row.kind === 'header' ? (
            <div role="row" aria-rowindex={index + 2} className="flex h-full items-end px-3 pb-1.5">
              <div role="cell" aria-colspan={6}>
                <h2 className="text-md font-extrabold text-muted">
                  {row.label} <span className="tabular text-sm">{row.count}</span>
                </h2>
              </div>
            </div>
          ) : (
            <Row item={row.item} rowIndex={index + 2} template={template} {...actions} />
          )
        }
      />
    </div>
  )
}

function Row({
  item,
  rowIndex,
  template,
  ...actions
}: { item: InventoryItem; rowIndex: number; template: string } & RowActions) {
  const left = percentLeft(item)
  const percent = left > 0 ? Math.max(1, Math.round(left)) : 0
  const usedUp = isUsedUp(item)
  const saving = isTempId(item.id)
  const level = usedUp ? 'normal' : lowStockLevel(item)
  const cue = usedUp ? 'Used up' : level === 'normal' ? null : CUE[level]
  return (
    <div
      role="row"
      aria-rowindex={rowIndex}
      data-used-up={usedUp}
      className="grid h-full items-center gap-3 border-b border-hair px-3"
      style={{ gridTemplateColumns: template }}
    >
      {actions.selecting && (
        <span role="cell">
          {!saving && (
            <SelectBox
              name={item.name}
              checked={actions.selected.has(item.id)}
              onChange={() => actions.onToggle(item.id)}
            />
          )}
        </span>
      )}
      <span role="cell" className="min-w-0">
        {saving ? (
          <span className="block min-h-touch">
            <span className="block truncate text-base font-semibold">{item.name}</span>
            <span className="block text-sm text-muted">Saving…</span>
          </span>
        ) : (
          <button
            type="button"
            aria-label={`Open ${item.name}`}
            data-open-item={item.id}
            onClick={() => actions.onOpen(item.id)}
            className={cx(
              'min-h-touch w-full cursor-pointer truncate text-left text-base font-semibold outline-offset-2',
              usedUp && 'text-muted',
            )}
          >
            {item.name}
          </button>
        )}
      </span>
      <span role="cell" className="truncate text-md text-muted">
        {actions.categoryName(item.categoryId)}
      </span>
      <span role="cell" className="truncate text-md text-muted">
        {actions.locationName(item.locationId)}
      </span>
      <span role="cell" className="truncate text-md">
        {quantityLabel(item)}
      </span>
      <span role="cell">
        <ExpiryChip expirationDate={item.expirationDate} today={actions.today} />
      </span>
      <span role="cell" className="flex flex-col items-end">
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
  )
}
