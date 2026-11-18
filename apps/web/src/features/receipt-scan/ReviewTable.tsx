// All items in one table with inline cells (F-RS-07, the tablet's layout). Every cell is a labelled control
// ("Quantity of Rice"), so a row can be read and edited without seeing the others.
import { CategoryOptions, UnitOptions } from './controls'
import { idOf, NATIVE, parseNumber } from './field-values'
import type { Lists } from './ReviewFields'
import type { ItemPatch, ReviewItem } from './review-model'

/** Header, then the least width its column keeps (the inputs fill it). */
const COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ['Add', 'w-12'],
  ['Name', 'min-w-44'],
  ['Qty', 'min-w-20'],
  ['Unit', 'min-w-28'],
  ['Total price', 'min-w-28'],
  ['Category', 'min-w-44'],
  ['Location', 'min-w-44'],
  ['Purchased', 'min-w-44'],
  ['Expires', 'min-w-44'],
  ['Notes', 'min-w-40'],
  ['Remind', 'w-16'],
]
const CELL = 'px-1.5 py-1.5 align-top'
const INPUT = `${NATIVE} min-w-0`

export function ReviewTable({
  items,
  lists,
  onChange,
}: {
  items: readonly ReviewItem[]
  lists: Lists
  onChange: (key: number, patch: ItemPatch) => void
}) {
  return (
    // `relative`: a scroller that is not positioned lets sr-only text escape and widen the page (5.x lessons).
    <div
      role="region"
      aria-label="Receipt items"
      tabIndex={0}
      className="relative overflow-x-auto rounded-card border border-line bg-surface"
    >
      <table
        aria-label="Items read from the receipt"
        className="w-full min-w-[84rem] border-collapse text-md"
      >
        <thead>
          <tr className="border-b border-line text-left text-sm font-semibold text-muted">
            {COLUMNS.map(([title, width]) => (
              <th key={title} scope="col" className={`px-1.5 py-2 ${width}`}>
                {title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const n = item.name || `item ${item.key + 1}`
            return (
              <tr
                key={item.key}
                className={`border-b border-line last:border-b-0 ${item.included ? '' : 'opacity-60'}`}
              >
                <td className={CELL}>
                  <input
                    type="checkbox"
                    className="size-5 accent-(--accent)"
                    aria-label={`Include ${n}`}
                    checked={item.included}
                    onChange={(e) => onChange(item.key, { included: e.target.checked })}
                  />
                </td>
                <td className={CELL}>
                  <input
                    className={INPUT}
                    aria-label={`Name of item ${item.key + 1}`}
                    value={item.name}
                    maxLength={200}
                    onChange={(e) => onChange(item.key, { name: e.target.value })}
                  />
                </td>
                <td className={CELL}>
                  <input
                    className={INPUT}
                    inputMode="decimal"
                    aria-label={`Quantity of ${n}`}
                    defaultValue={String(item.quantity)}
                    onChange={(e) =>
                      onChange(item.key, { quantity: parseNumber(e.target.value) ?? 0 })
                    }
                  />
                </td>
                <td className={CELL}>
                  <select
                    className={INPUT}
                    aria-label={`Unit of ${n}`}
                    value={item.unit}
                    onChange={(e) => onChange(item.key, { unit: e.target.value })}
                  >
                    <UnitOptions current={item.unit} />
                  </select>
                </td>
                <td className={CELL}>
                  <input
                    className={INPUT}
                    inputMode="decimal"
                    aria-label={`Total price of ${n}`}
                    defaultValue={item.totalPrice === null ? '' : String(item.totalPrice)}
                    onChange={(e) =>
                      onChange(item.key, { totalPrice: parseNumber(e.target.value) })
                    }
                  />
                </td>
                <td className={CELL}>
                  <select
                    className={INPUT}
                    aria-label={`Category of ${n}`}
                    value={item.categoryId === null ? '' : String(item.categoryId)}
                    onChange={(e) => onChange(item.key, { categoryId: idOf(e.target.value) })}
                  >
                    <CategoryOptions categories={lists.categories} />
                  </select>
                </td>
                <td className={CELL}>
                  <select
                    className={INPUT}
                    aria-label={`Location of ${n}`}
                    value={item.locationId === null ? '' : String(item.locationId)}
                    onChange={(e) => onChange(item.key, { locationId: idOf(e.target.value) })}
                  >
                    <option value="">Choose…</option>
                    {lists.locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.subLocation ? `${l.name} · ${l.subLocation}` : l.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className={CELL}>
                  <input
                    type="date"
                    className={INPUT}
                    aria-label={`Purchase date of ${n}`}
                    value={item.purchaseDate}
                    onChange={(e) =>
                      e.target.value && onChange(item.key, { purchaseDate: e.target.value })
                    }
                  />
                </td>
                <td className={CELL}>
                  <input
                    type="date"
                    className={INPUT}
                    aria-label={`Expiry of ${n}`}
                    value={item.expirationDate}
                    onChange={(e) =>
                      e.target.value && onChange(item.key, { expirationDate: e.target.value })
                    }
                  />
                </td>
                <td className={CELL}>
                  <input
                    className={INPUT}
                    aria-label={`Notes of ${n}`}
                    value={item.notes}
                    maxLength={1000}
                    onChange={(e) => onChange(item.key, { notes: e.target.value })}
                  />
                </td>
                <td className={CELL}>
                  <input
                    type="checkbox"
                    className="size-5 accent-(--accent)"
                    aria-label={`Remind before expiry of ${n}`}
                    checked={item.notify}
                    onChange={(e) => onChange(item.key, { notify: e.target.checked })}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
