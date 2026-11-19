// The item form (SPEC-IF-001), add and edit. Everything is checked inline at its field on Save and an
// invalid form is never sent (NC-IF-NO-SNACKBAR-VALIDATION); focus goes to the first problem. Photo and
// barcode controls are not rendered on purpose (D3, AR-HIDDEN-NOT-DROPPED).
import type { Bootstrap, InventoryItem } from '@chatchiu/contracts'
import { UNITS } from '@chatchiu/domain'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../ui/Button'
import { DateField } from '../../ui/DateField'
import { Field } from '../../ui/Field'
import { Select } from '../../ui/Select'
import { Switch } from '../../ui/Switch'
import { CategoryPicker } from './CategoryPicker'
import { ExpiryField } from './ExpiryField'
import { validate, type FormErrors, type FormMode, type FormValues } from './item-form-model'
import { LocationPicker } from './LocationPicker'
import { NameField } from './NameField'

export type ItemFormProps = {
  mode: FormMode
  initial: FormValues
  /** Edit: the item as it was, for the unit it may already have outside the list. */
  original?: InventoryItem
  categories: Bootstrap['categories']
  locations: Bootstrap['locations']
  existingNames: readonly string[]
  today: string
  /** Return false when nothing was sent and she stays on the form (Save works again). */
  onSubmit: (values: FormValues) => void | false
  onCancel: () => void
}

const FIRST_PROBLEM =
  '[data-invalid] [role="spinbutton"], [data-invalid] input, [data-invalid] button, [aria-invalid="true"]'

export function ItemForm({
  mode,
  initial,
  original,
  categories,
  locations,
  existingNames,
  today,
  onSubmit,
  onCancel,
}: ItemFormProps) {
  const [values, setValues] = useState<FormValues>(initial)
  const [errors, setErrors] = useState<FormErrors>({})
  const [attempt, setAttempt] = useState(0)
  const [moreOpen, setMoreOpen] = useState(false)
  const form = useRef<HTMLFormElement>(null)
  const sent = useRef(false)
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    // A field she is fixing stops showing its old complaint until the next Save.
    setErrors((prev) => ({ ...prev, ...clearedBy(key) }))
  }

  // After a failed Save, move focus to the first field with a problem (the errors are inline).
  useEffect(() => {
    if (attempt > 0) form.current?.querySelector<HTMLElement>(FIRST_PROBLEM)?.focus()
  }, [attempt])

  const unitOptions = [
    ...UNITS,
    ...(original && !(UNITS as readonly string[]).includes(original.unit) ? [original.unit] : []),
  ]
  const category = categories.find((c) => c.id === values.categoryId)
  const location = locations.find((l) => l.id === values.locationId)

  return (
    <form
      ref={form}
      noValidate
      className="flex max-w-2xl flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        const found = validate(values, mode, original)
        setErrors(found)
        if (Object.keys(found).length > 0) {
          setAttempt((n) => n + 1)
          return
        }
        // Two quick taps must not save twice: the page leaves asynchronously.
        if (sent.current) return
        sent.current = true
        if (onSubmit(values) === false) sent.current = false
      }}
    >
      <NameField
        value={values.name}
        onChange={(v) => set('name', v)}
        existingNames={existingNames}
        error={errors.name}
      />
      <div className="grid gap-5 md:grid-cols-2">
        <CategoryPicker
          categories={categories}
          value={values.categoryId}
          onChange={(id) => set('categoryId', id)}
          error={errors.category}
        />
        <LocationPicker
          locations={locations}
          value={values.locationId}
          onChange={(id) => set('locationId', id)}
          error={errors.location}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {mode === 'add' ? (
          <Field
            label="Quantity"
            inputMode="decimal"
            value={values.quantity}
            onChange={(v) => set('quantity', v)}
            isInvalid={errors.quantity !== undefined}
            errorMessage={errors.quantity}
          />
        ) : (
          <>
            <Field
              label={`Full amount (${values.unit})`}
              inputMode="decimal"
              value={values.fullAmount}
              onChange={(v) => set('fullAmount', v)}
              isInvalid={errors.fullAmount !== undefined}
              errorMessage={errors.fullAmount}
            />
            <Field
              label={`Left now (${values.unit})`}
              inputMode="decimal"
              value={values.leftNow}
              onChange={(v) => set('leftNow', v)}
              isInvalid={errors.leftNow !== undefined}
              errorMessage={errors.leftNow}
            />
          </>
        )}
        <Select
          label="Unit"
          options={unitOptions.map((u) => ({ id: u, label: u }))}
          value={values.unit}
          onChange={(u) => set('unit', u)}
          isInvalid={errors.unit !== undefined}
          errorMessage={errors.unit}
        />
      </div>
      <DateField
        label="Purchase date"
        value={values.purchaseDate}
        onChange={(v) => set('purchaseDate', v)}
      />
      <ExpiryField
        value={values.expirationDate}
        onChange={(v) => set('expirationDate', v)}
        from={values.purchaseDate ?? today}
        purchaseDate={values.purchaseDate}
        itemName={values.name}
        categoryName={category?.name}
        locationName={location?.name}
        error={errors.expiry}
      />
      <Field
        label="Total price (optional)"
        inputMode="decimal"
        description="What you paid for the whole amount. It is stored per unit."
        value={values.totalPrice}
        onChange={(v) => set('totalPrice', v)}
        isInvalid={errors.totalPrice !== undefined}
        errorMessage={errors.totalPrice}
      />
      <Field
        label="Notes (optional)"
        value={values.notes}
        onChange={(v) => set('notes', v)}
        isInvalid={errors.notes !== undefined}
        errorMessage={errors.notes}
      />
      <div className="flex flex-col gap-3">
        <Button
          aria-expanded={moreOpen}
          aria-controls={moreOpen ? 'item-form-more' : undefined}
          onPress={() => setMoreOpen((open) => !open)}
          className="self-start"
        >
          More options
        </Button>
        {moreOpen && (
          <div
            id="item-form-more"
            className="flex flex-col gap-3 rounded-card border border-line p-3"
          >
            <Switch
              label="Expiry notifications"
              isSelected={values.notify}
              onChange={(v) => set('notify', v)}
            />
            <Field
              label="Days before expiry"
              inputMode="numeric"
              value={values.daysBefore}
              onChange={(v) => set('daysBefore', v)}
              isInvalid={errors.daysBefore !== undefined}
              errorMessage={errors.daysBefore}
              className="w-40"
            />
            <Field
              label="Low-stock threshold (%)"
              inputMode="decimal"
              description="Running low is flagged at or under this percent of the full amount."
              value={values.lowStock}
              onChange={(v) => set('lowStock', v)}
              isInvalid={errors.lowStock !== undefined}
              errorMessage={errors.lowStock}
              className="w-56"
            />
          </div>
        )}
      </div>
      <div className="flex gap-2 border-t border-hair pt-4">
        <Button type="submit" variant="primary" size="lg">
          Save item
        </Button>
        <Button variant="ghost" size="lg" onPress={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

/** The error keys a field's change clears. */
function clearedBy(key: keyof FormValues): FormErrors {
  const map: Partial<Record<keyof FormValues, keyof FormErrors>> = {
    name: 'name',
    categoryId: 'category',
    locationId: 'location',
    quantity: 'quantity',
    fullAmount: 'fullAmount',
    leftNow: 'leftNow',
    unit: 'unit',
    purchaseDate: 'expiry',
    expirationDate: 'expiry',
    totalPrice: 'totalPrice',
    notes: 'notes',
    daysBefore: 'daysBefore',
    lowStock: 'lowStock',
  }
  const field = map[key]
  return field ? { [field]: undefined } : {}
}
