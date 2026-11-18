// Add or edit a recipe (F-MP-09): name, comma-separated ingredients, prep time, servings, instructions.
// An edit sends only what changed (an emptied optional field is sent as null).
import type { Recipe, RecipeCreate, RecipeUpdate } from '@chatchiu/contracts'
import { useState } from 'react'
import { Label, TextArea, TextField } from 'react-aria-components'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { CONTROL, Field, InlineError, LABEL } from '../../ui/Field'
import { ResponsivePanel } from '../../ui/ResponsivePanel'

type Errors = Partial<Record<'name' | 'ingredients' | 'servings', string>>

const blankToNull = (text: string): string | null => (text.trim() === '' ? null : text.trim())

export function RecipeForm({
  recipe,
  onClose,
  onCreate,
  onUpdate,
}: {
  recipe: Recipe | null
  onClose: () => void
  onCreate: (body: RecipeCreate) => void
  onUpdate: (id: number, patch: RecipeUpdate) => void
}) {
  const [name, setName] = useState(recipe?.name ?? '')
  const [ingredients, setIngredients] = useState(recipe?.ingredients ?? '')
  const [prepTime, setPrepTime] = useState(recipe?.prepTime ?? '')
  const [servings, setServings] = useState(recipe?.servings?.toString() ?? '')
  const [instructions, setInstructions] = useState(recipe?.instructions ?? '')
  const [errors, setErrors] = useState<Errors>({})

  const save = () => {
    const found: Errors = {}
    if (name.trim() === '') found.name = 'Enter a name'
    if (ingredients.trim() === '') found.ingredients = 'Enter at least one ingredient'
    const count = servings.trim() === '' ? null : Number(servings.trim())
    if (count !== null && (!Number.isInteger(count) || count <= 0))
      found.servings = 'Servings is a whole number above zero'
    setErrors(found)
    if (Object.keys(found).length > 0) return

    if (!recipe) {
      onCreate({
        name: name.trim(),
        ingredients: ingredients.trim(),
        ...(blankToNull(prepTime) !== null && { prepTime: blankToNull(prepTime) }),
        ...(count !== null && { servings: count }),
        ...(blankToNull(instructions) !== null && { instructions: blankToNull(instructions) }),
      })
      return onClose()
    }
    const patch: RecipeUpdate = {}
    if (name.trim() !== recipe.name) patch.name = name.trim()
    if (ingredients.trim() !== recipe.ingredients) patch.ingredients = ingredients.trim()
    if (blankToNull(prepTime) !== recipe.prepTime) patch.prepTime = blankToNull(prepTime)
    if (count !== recipe.servings) patch.servings = count
    if (blankToNull(instructions) !== recipe.instructions)
      patch.instructions = blankToNull(instructions)
    if (Object.keys(patch).length > 0) onUpdate(recipe.id, patch)
    onClose()
  }

  return (
    <ResponsivePanel
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={recipe ? 'Edit recipe' : 'Add a recipe'}
    >
      <form
        className="flex flex-col gap-4 pb-3"
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <Field label="Name" isRequired value={name} onChange={setName} errorMessage={errors.name} />
        <Field
          label="Ingredients"
          isRequired
          value={ingredients}
          onChange={setIngredients}
          description="Separate with commas, e.g. eggs, milk, cheese"
          errorMessage={errors.ingredients}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prep time" value={prepTime} onChange={setPrepTime} placeholder="15 min" />
          <Field
            label="Servings"
            inputMode="numeric"
            value={servings}
            onChange={setServings}
            errorMessage={errors.servings}
          />
        </div>
        <TextField
          value={instructions}
          onChange={setInstructions}
          className="flex flex-col gap-1.5"
        >
          <Label className={LABEL}>Instructions</Label>
          <TextArea rows={4} className={cx(CONTROL, 'resize-y')} />
          <InlineError />
        </TextField>
        <div className="pt-1">
          <Button type="submit" variant="primary">
            Save
          </Button>
        </div>
      </form>
    </ResponsivePanel>
  )
}
