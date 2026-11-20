// One shopping row (F-SL-02, F-SL-03): a big round tick (a native checkbox: instant, saved in the background), the
// name with its quantity and note, the category when the list is not grouped, and Delete (hidden at once, with
// Undo). A row still being saved (temporary id) says so and cannot be ticked or deleted yet (7.0.20a).
import type { ShoppingItem } from '@chatchiu/contracts'
import { useId } from 'react'
import { isTempId } from '../../data/resource'
import { CategoryPill } from '../../ui/CategoryStyle'
import { cx } from '../../ui/cx'
import { Icon } from '../../ui/Icon'
import { IconButton } from '../../ui/IconButton'

export type ShoppingRowProps = {
  item: ShoppingItem
  onTick: (item: ShoppingItem) => void
  onDelete: (item: ShoppingItem) => void
  /** Shown as a pill when the list is not grouped by category. */
  category?: { name: string; colour: string | null }
}

export function ShoppingRow({ item, onTick, onDelete, category }: ShoppingRowProps) {
  const saving = isTempId(item.id)
  const bought = item.isPurchased
  const detailsId = useId()
  return (
    <li
      data-purchased={bought}
      className="flex items-center gap-2 border-b border-hair px-2 py-1 last:border-b-0"
    >
      <label className="relative flex size-touch shrink-0 cursor-pointer items-center justify-center">
        <input
          type="checkbox"
          // A stable name: the checked state says whether it is bought.
          aria-label={item.name}
          aria-describedby={detailsId}
          data-shopping-id={item.id}
          checked={bought}
          disabled={saving}
          onChange={() => onTick(item)}
          className={cx(
            'peer size-[30px] cursor-pointer appearance-none rounded-pill border-2 border-field-line bg-surface',
            'transition-colors duration-fast checked:border-tint-green-ink checked:bg-tint-green-ink',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        />
        <Icon
          name="check"
          size={16}
          strokeWidth={3}
          className="pointer-events-none absolute text-surface opacity-0 peer-checked:opacity-100"
        />
      </label>
      <div id={detailsId} className="min-w-0 flex-1 py-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={cx(
              'text-base font-semibold break-words',
              bought && 'text-muted line-through',
            )}
          >
            {item.name}
          </span>
          {item.quantity && (
            <span className="rounded-pill bg-tint-neutral px-2 text-sm font-semibold text-tint-neutral-ink">
              {item.quantity}
            </span>
          )}
          {category && <CategoryPill name={category.name} colour={category.colour} />}
        </p>
        {item.notes && <p className="text-sm break-words text-muted">{item.notes}</p>}
        {saving && <p className="text-sm text-muted">Saving…</p>}
      </div>
      <IconButton
        icon="trash"
        label={`Delete ${item.name}`}
        isDisabled={saving}
        onPress={() => onDelete(item)}
      />
    </li>
  )
}
