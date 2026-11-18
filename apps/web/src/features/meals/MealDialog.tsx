// Add or edit one meal (F-MP-03, F-MP-06, F-MP-07). Add: date, meal type, name (library autocomplete),
// notes, favourite. Edit: the same except date and type (copy by dragging, or add it again), and the
// favourite switch changes the meal at once; delete is a held write with Undo, never a confirm (NC-MP-NO-CONFIRM-DELETE).
import type { MealPlan, MealPlanUpdate, Recipe } from '@chatchiu/contracts'
import { MEAL_TYPES, type MealSlotType } from '@chatchiu/domain'
import { useId, useState } from 'react'
import { Button } from '../../ui/Button'
import { CONTROL, ERROR, Field, LABEL } from '../../ui/Field'
import { ResponsivePanel } from '../../ui/ResponsivePanel'
import { Select } from '../../ui/Select'
import { Switch } from '../../ui/Switch'
import { dayLabel, MEAL_TYPE_LABEL } from './format'
import { MealNameField } from './MealNameField'
import type { MealDraft } from './use-meal-actions'

export type MealDialogTarget =
  | { kind: 'add'; date: string; type: MealSlotType; recipe?: Recipe }
  | { kind: 'edit'; plan: MealPlan }

const TYPE_OPTIONS = MEAL_TYPES.map((id) => ({ id, label: MEAL_TYPE_LABEL[id] }))

export default function MealDialog({
  target,
  recipes,
  onClose,
  onAdd,
  onChange,
  onFavourite,
  onDelete,
}: {
  target: MealDialogTarget
  recipes: readonly Recipe[]
  onClose: () => void
  onAdd: (draft: MealDraft) => void
  onChange: (id: number, patch: MealPlanUpdate) => void
  onFavourite: (plan: MealPlan, value: boolean) => void
  onDelete: (plan: MealPlan) => void
}) {
  const plan = target.kind === 'edit' ? target.plan : null
  // What the fields started from: an edit is compared with this, not with the live meal, so a change that
  // arrives from another device while the dialog is open is not written back over.
  const [baseline] = useState(plan)
  const [date, setDate] = useState<string | null>(target.kind === 'add' ? target.date : null)
  const [type, setType] = useState<MealSlotType>(target.kind === 'add' ? target.type : 'dinner')
  const [name, setName] = useState(
    plan?.mealName ?? (target.kind === 'add' ? (target.recipe?.name ?? '') : ''),
  )
  const [recipeId, setRecipeId] = useState<number | null>(
    plan?.recipeId ?? (target.kind === 'add' ? (target.recipe?.id ?? null) : null),
  )
  const [notes, setNotes] = useState(plan?.notes ?? '')
  const [favourite, setFavourite] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dateId = useId()

  const trimmed = name.trim()
  // A typed name that is a library recipe (any case) links to it, so its favourite and recipe card follow.
  const linkedId =
    recipeId ??
    recipes.find((r) => r.name.trim().toLowerCase() === trimmed.toLowerCase())?.id ??
    null

  const save = () => {
    if (trimmed === '') {
      setError('Enter a meal name')
      // The message is below the field: move focus to the field so it is read out.
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-meal-name]')?.focus())
      return
    }
    if (plan && baseline) {
      const patch: MealPlanUpdate = {}
      if (trimmed !== baseline.mealName) patch.mealName = trimmed
      if (linkedId !== baseline.recipeId) patch.recipeId = linkedId
      if (notes.trim() !== (baseline.notes ?? ''))
        patch.notes = notes.trim() === '' ? null : notes.trim()
      if (Object.keys(patch).length > 0) onChange(plan.id, patch)
      return onClose()
    }
    if (date === null) return setError('Choose a date')
    onAdd({
      planDate: date,
      mealType: type,
      mealName: trimmed,
      recipeId: linkedId,
      notes: notes.trim() === '' ? null : notes.trim(),
      isFavorite: favourite,
    })
    onClose()
  }

  return (
    <ResponsivePanel
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={plan ? 'Edit meal' : 'Add a meal'}
      eyebrow={plan ? `${dayLabel(plan.planDate)} · ${MEAL_TYPE_LABEL[plan.mealType]}` : undefined}
    >
      <form
        className="flex flex-col gap-4 pb-3"
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        {!plan && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={dateId} className={LABEL}>
                Date
              </label>
              {/* The browser's own date picker: touch friendly, and far lighter than a custom one. */}
              <input
                id={dateId}
                type="date"
                value={date ?? ''}
                onChange={(event) => {
                  setDate(event.target.value === '' ? null : event.target.value)
                  setError(null)
                }}
                aria-invalid={error === 'Choose a date' || undefined}
                aria-describedby={error === 'Choose a date' ? `${dateId}-error` : undefined}
                className={CONTROL}
              />
              {error === 'Choose a date' && (
                <p id={`${dateId}-error`} role="alert" className={ERROR}>
                  {error}
                </p>
              )}
            </div>
            <Select label="Meal" options={TYPE_OPTIONS} value={type} onChange={setType} />
          </div>
        )}
        <MealNameField
          recipes={recipes}
          name={name}
          recipeId={recipeId}
          errorMessage={error === 'Enter a meal name' ? error : undefined}
          onChange={(text, id) => {
            setName(text)
            setRecipeId(id)
            setError(null)
          }}
        />
        <Field label="Notes" value={notes} onChange={setNotes} />
        <Switch
          label="Favourite"
          isSelected={plan ? plan.isFavorite : favourite}
          onChange={(value) => (plan ? onFavourite(plan, value) : setFavourite(value))}
        />
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="submit" variant="primary">
            Save
          </Button>
          {plan && (
            <Button
              variant="danger"
              onPress={() => {
                onDelete(plan)
                onClose()
              }}
            >
              Delete
            </Button>
          )}
        </div>
      </form>
    </ResponsivePanel>
  )
}
