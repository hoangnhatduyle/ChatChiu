// One item on a location card (F-KB-03/05/07/08): category dot, name and amount left, expiry chip, the down-only
// usage bar with the percent (and a text cue) beside it. While the bar is dragged the percent, the amount and
// the Low cue follow the finger (F-KB-18); the write still happens once, on release. A row that is still being
// saved (temporary id) cannot be opened or dragged yet (7.0.20a); a row at 0% stays, greyed, until she removes it
// (NC-KB-NO-AUTO-DELETE).
import { USED_UP_STYLE } from '../../ui/usage-slider-shared'
import type { InventoryItem } from '@chatchiu/contracts'
import { isTempId } from '../../data/resource'
import { CategoryDot } from '../../ui/CategoryStyle'
import { cx } from '../../ui/cx'
import { ExpiryChip } from '../../ui/ExpiryChip'
import { UsageSlider } from '../../ui/UsageSlider'
import { useLiveUsage } from './use-live-usage'

export type BoardRowProps = {
  item: InventoryItem
  today: string
  /** The category's colour, for the dot (decorative). */
  categoryColour: string | null
  onOpen: (id: number) => void
  onUse: (item: InventoryItem, percent: number) => void
}

export function BoardRow({ item, today, categoryColour, onOpen, onUse }: BoardRowProps) {
  const { setLive, stored, percent, usedUp, level, cue, amount } = useLiveUsage(item)
  const saving = isTempId(item.id)

  return (
    <li data-used-up={usedUp} className="border-t border-hair px-3.5 py-1.5 first:border-t-0">
      <div className="flex items-center gap-2.5">
        <CategoryDot colour={categoryColour} />
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
            <span className="block truncate text-sm text-muted">{amount}</span>
          </button>
        )}
        <ExpiryChip
          expirationDate={item.expirationDate}
          today={today}
          className={usedUp ? USED_UP_STYLE : undefined}
        />
      </div>
      <div className="flex items-center gap-2">
        <UsageSlider
          label={`How much ${item.name} is left`}
          value={stored}
          mode="down-only"
          description={amount}
          tone={level === 'normal' ? 'normal' : 'low'}
          isDisabled={saving}
          onDraft={setLive}
          className={cx('min-w-0 flex-1 px-1.5', usedUp && USED_UP_STYLE)}
          onCommit={(next) => onUse(item, next)}
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
    </li>
  )
}
