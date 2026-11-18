// One shopping row (F-SL-02, F-SL-03): a checkbox to tick or untick (instant, saved in the background),
// the name with its quantity and note, and Delete (hidden at once, with Undo). A row still being saved
// (temporary id) says so and cannot be ticked or deleted yet (7.0.20a).
import type { ShoppingItem } from '@chatchiu/contracts'
import { useId } from 'react'
import { isTempId } from '../../data/resource'
import { cx } from '../../ui/cx'
import { IconButton } from '../../ui/IconButton'

export type ShoppingRowProps = {
  item: ShoppingItem
  onTick: (item: ShoppingItem) => void
  onDelete: (item: ShoppingItem) => void
}

export function ShoppingRow({ item, onTick, onDelete }: ShoppingRowProps) {
  const saving = isTempId(item.id)
  const bought = item.isPurchased
  const detailsId = useId()
  return (
    <li
      data-purchased={bought}
      className="flex items-center gap-2 border-b border-hair px-2 py-1 last:border-b-0"
    >
      <label className="flex size-touch shrink-0 cursor-pointer items-center justify-center">
        <input
          type="checkbox"
          // A stable name: the checked state says whether it is bought.
          aria-label={item.name}
          aria-describedby={detailsId}
          data-shopping-id={item.id}
          checked={bought}
          disabled={saving}
          onChange={() => onTick(item)}
          className="size-5 cursor-pointer accent-(--accent) disabled:cursor-not-allowed"
        />
      </label>
      <div id={detailsId} className="min-w-0 flex-1 py-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span
            className={cx(
              'text-base font-semibold break-words',
              bought && 'text-muted line-through',
            )}
          >
            {item.name}
          </span>
          {item.quantity && <span className="font-mono text-md text-muted">{item.quantity}</span>}
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
