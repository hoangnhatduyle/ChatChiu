// One item on the board (F-KB-03/05/07/08): expiry chip, name, amount left, percent with a text cue,
// and the down-only usage bar. A row that is still being saved (temporary id) cannot be opened or
// dragged yet (7.0.20a); a row at 0% stays, greyed, until she removes it (NC-KB-NO-AUTO-DELETE).
import { USED_UP_STYLE } from '../../ui/usage-slider-shared'
import type { InventoryItem } from '@chatchiu/contracts'
import { isUsedUp, lowStockLevel, percentLeft, quantityLabel } from '@chatchiu/domain'
import { isTempId } from '../../data/resource'
import { cx } from '../../ui/cx'
import { ExpiryChip } from '../../ui/ExpiryChip'
import { UsageSlider } from '../../ui/UsageSlider'

export type BoardRowProps = {
  item: InventoryItem
  today: string
  onOpen: (id: number) => void
  onUse: (item: InventoryItem, percent: number) => void
}

const CUE = { warning: 'Low', critical: 'Very low' } as const

export function BoardRow({ item, today, onOpen, onUse }: BoardRowProps) {
  // A sliver left still reads 1%, never 0%: 0% means used up, and only a drag to 0 does that.
  const left = percentLeft(item)
  const percent = left > 0 ? Math.max(1, Math.round(left)) : 0
  const usedUp = isUsedUp(item)
  const saving = isTempId(item.id)
  const level = usedUp ? 'normal' : lowStockLevel(item)
  const cue = usedUp ? 'Used up' : level === 'normal' ? null : CUE[level]
  const amount = quantityLabel(item)

  return (
    <li data-used-up={usedUp} className="border-b border-hair px-3 py-2 last:border-b-0">
      <div className="flex items-center gap-2.5">
        <ExpiryChip
          expirationDate={item.expirationDate}
          today={today}
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
            aria-label={`Open ${item.name}, ${amount}`}
            data-open-item={item.id}
            onClick={() => onOpen(item.id)}
            className="min-h-touch min-w-0 flex-1 cursor-pointer text-left outline-offset-2"
          >
            <span className={cx('block truncate text-base font-semibold', usedUp && 'text-muted')}>
              {item.name}
            </span>{' '}
            <span className="block text-sm text-muted">{amount}</span>
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
        isDisabled={saving}
        className={cx('px-1.5', usedUp && USED_UP_STYLE)}
        onCommit={(next) => onUse(item, next)}
      />
    </li>
  )
}
