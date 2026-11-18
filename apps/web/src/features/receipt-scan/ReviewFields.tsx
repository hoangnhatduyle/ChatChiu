// One item's fields for the one-by-one review (F-RS-08): name, quantity, unit, total price, category, location,
// purchase date, expiry as a date or "N days/weeks/months", notes, the reminder, and "Ask AI for expiry".
import { addDays, addExpiryOffset, daysBetween, type OffsetUnit } from '@chatchiu/domain'
import { useState } from 'react'
import { expirationSuggest } from '../../data/ai'
import { useIsReachable } from '../../data/sync-status'
import { useWrite } from '../../data/write'
import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'
import { Switch } from '../../ui/Switch'
import { CategoryOptions, LabelledDate, LabelledSelect, UnitOptions } from './controls'
import { idOf, parseNumber } from './field-values'
import { isDate, type ItemPatch, type ReviewItem } from './review-model'

const OFFSET_UNITS: ReadonlyArray<{ id: OffsetUnit; label: string }> = [
  { id: 'day', label: 'days' },
  { id: 'week', label: 'weeks' },
  { id: 'month', label: 'months' },
  { id: 'year', label: 'years' },
]
/** Longest expiry offset taken, in the unit chosen or in days for an AI answer. */
const MAX_OFFSET = 3650
const SUGGEST_FAILED = "Couldn't get a suggestion. Set the date yourself."

export type Lists = {
  categories: ReadonlyArray<{ id: number; name: string }>
  locations: ReadonlyArray<{ id: number; name: string; subLocation: string | null }>
}

export function ReviewFields({
  item,
  lists,
  onChange,
}: {
  item: ReviewItem
  lists: Lists
  onChange: (patch: ItemPatch) => void
}) {
  const [quantity, setQuantity] = useState(String(item.quantity))
  const [price, setPrice] = useState(item.totalPrice === null ? '' : String(item.totalPrice))
  const [amount, setAmount] = useState(String(daysBetween(item.purchaseDate, item.expirationDate)))
  const [unit, setUnit] = useState<OffsetUnit>('day')
  const [note, setNote] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const reachable = useIsReachable()
  const suggest = useWrite(expirationSuggest)

  const setExpiry = (date: string) => {
    onChange({ expirationDate: date })
    setAmount(String(daysBetween(item.purchaseDate, date)))
    setUnit('day')
  }
  const setOffset = (nextAmount: string, nextUnit: OffsetUnit) => {
    setAmount(nextAmount)
    setUnit(nextUnit)
    const n = Number(nextAmount.trim().replace(',', '.'))
    if (nextAmount.trim() === '' || !Number.isFinite(n) || n < 0 || n > MAX_OFFSET) return
    const date = addExpiryOffset(item.purchaseDate, n, nextUnit)
    // A runaway offset (years above 9999) is ignored: the date stays as it was.
    if (isDate(date)) onChange({ expirationDate: date })
  }
  // Changing the purchase date keeps the expiry date and shows how far away it now is.
  const setPurchase = (date: string) => {
    onChange({ purchaseDate: date })
    setAmount(String(daysBetween(date, item.expirationDate)))
    setUnit('day')
  }
  const askAi = async () => {
    setAsking(true)
    setNote(null)
    try {
      const result = await suggest({
        itemName: item.name,
        categoryName: lists.categories.find((c) => c.id === item.categoryId)?.name,
        storageLocation: lists.locations.find((l) => l.id === item.locationId)?.name,
        purchaseDate: item.purchaseDate,
      }).result
      const days = result.status === 'saved' ? result.data.days : NaN
      if (result.status !== 'saved' || !Number.isFinite(days) || days <= 0 || days > MAX_OFFSET) {
        return setNote(SUGGEST_FAILED)
      }
      // Counted from the purchase date as it is when the answer arrives, not when she asked.
      onChange((now) => ({ expirationDate: addDays(now.purchaseDate, days) }))
      setAmount(String(days))
      setUnit('day')
      setNote(`AI suggests ${days} days. ${result.data.note}`)
    } catch {
      setNote(SUGGEST_FAILED)
    } finally {
      setAsking(false)
    }
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field
        label="Name"
        value={item.name}
        onChange={(name) => onChange({ name })}
        maxLength={200}
        className="md:col-span-2"
      />
      <Field
        label="Quantity"
        inputMode="decimal"
        value={quantity}
        onChange={(v) => {
          setQuantity(v)
          onChange({ quantity: parseNumber(v) ?? 0 })
        }}
      />
      <LabelledSelect label="Unit" value={item.unit} onChange={(u) => onChange({ unit: u })}>
        <UnitOptions current={item.unit} />
      </LabelledSelect>
      <Field
        label="Total price"
        description="What the receipt charged for this line."
        inputMode="decimal"
        value={price}
        onChange={(v) => {
          setPrice(v)
          onChange({ totalPrice: parseNumber(v) })
        }}
      />
      <LabelledSelect
        label="Category"
        value={item.categoryId === null ? '' : String(item.categoryId)}
        onChange={(v) => onChange({ categoryId: idOf(v) })}
      >
        <CategoryOptions categories={lists.categories} />
      </LabelledSelect>
      <LabelledSelect
        label="Location"
        value={item.locationId === null ? '' : String(item.locationId)}
        onChange={(v) => onChange({ locationId: idOf(v) })}
      >
        <option value="">Choose…</option>
        {lists.locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.subLocation ? `${l.name} · ${l.subLocation}` : l.name}
          </option>
        ))}
      </LabelledSelect>
      <LabelledDate label="Purchase date" value={item.purchaseDate} onChange={setPurchase} />
      <LabelledDate label="Expiry date" value={item.expirationDate} onChange={setExpiry} />
      <div className="flex items-end gap-2">
        <Field
          label="Expires in"
          inputMode="decimal"
          value={amount}
          onChange={(v) => setOffset(v, unit)}
          className="w-24"
        />
        <LabelledSelect
          label="Expires in unit"
          value={unit}
          onChange={(v) => setOffset(amount, v as OffsetUnit)}
        >
          {OFFSET_UNITS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.id}
            </option>
          ))}
        </LabelledSelect>
      </div>
      <div className="flex flex-col items-start gap-1">
        <Button
          variant="secondary"
          isDisabled={!reachable || asking || !item.name.trim()}
          onPress={() => void askAi()}
        >
          Ask AI for expiry
        </Button>
        {!reachable && <p className="text-sm text-muted">Needs a connection.</p>}
        {note && (
          <p role="status" className="text-sm text-muted">
            {note}
          </p>
        )}
      </div>
      <Field
        label="Notes"
        value={item.notes}
        onChange={(notes) => onChange({ notes })}
        maxLength={1000}
        className="md:col-span-2"
      />
      <Switch
        label="Remind me before it expires"
        isSelected={item.notify}
        onChange={(notify) => onChange({ notify })}
      />
    </div>
  )
}
