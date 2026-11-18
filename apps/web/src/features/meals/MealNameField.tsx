// The meal name with the recipe library as autocomplete (F-MP-03). A typed name that is not in the library
// is allowed: she plans "Pho bo" and the API adds it to her recipes (F-MP-05). Picking a recipe also
// links the plan to it (its recipe id).
import type { Recipe } from '@chatchiu/contracts'
import { recipeMatchesQuery } from '@chatchiu/domain'
import { ComboBox, Input, Label, ListBox, ListBoxItem, Popover } from 'react-aria-components'
import { cx } from '../../ui/cx'
import { CONTROL, InlineError, LABEL } from '../../ui/Field'

const MAX_SUGGESTED = 8

export function MealNameField({
  recipes,
  name,
  recipeId,
  errorMessage,
  onChange,
}: {
  recipes: readonly Recipe[]
  name: string
  recipeId: number | null
  errorMessage?: string
  onChange: (name: string, recipeId: number | null) => void
}) {
  const options = recipes.filter((r) => recipeMatchesQuery({ name: r.name, ingredients: '' }, name))
  return (
    <ComboBox
      allowsCustomValue
      menuTrigger="input"
      inputValue={name}
      selectedKey={recipeId === null ? null : String(recipeId)}
      items={options.slice(0, MAX_SUGGESTED)}
      onInputChange={(text) =>
        onChange(text, recipes.find((r) => r.id === recipeId && r.name === text)?.id ?? null)
      }
      onSelectionChange={(key) => {
        const picked = recipes.find((r) => String(r.id) === key)
        if (picked) onChange(picked.name, picked.id)
      }}
      isInvalid={errorMessage !== undefined}
      className="flex flex-col gap-1.5"
    >
      <Label className={LABEL}>Meal name</Label>
      <Input data-meal-name className={cx(CONTROL)} placeholder="Type a name or pick a recipe" />
      <InlineError>{errorMessage}</InlineError>
      <Popover
        offset={6}
        className="min-w-(--trigger-width) rounded-card border border-line bg-surface shadow-pop"
      >
        <ListBox className="max-h-60 overflow-auto p-1.5 outline-none">
          {(recipe: Recipe) => (
            <ListBoxItem
              id={String(recipe.id)}
              textValue={recipe.name}
              className="flex min-h-touch cursor-pointer items-center rounded-control px-3 text-base text-ink data-focused:bg-hover"
            >
              {recipe.name}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </ComboBox>
  )
}
