// The recipe library, a tab of Meals (F-MP-09, F-MP-11): search by name or ingredient, add, edit, delete
// with Undo. Items that need using up are matched to these recipes by the suggestions above the tabs.
import type { Recipe } from '@chatchiu/contracts'
import { recipeMatchesQuery, recipeStockMatch, type MatchableItem } from '@chatchiu/domain'
import { useState } from 'react'
import { SearchField, Input, Label } from 'react-aria-components'
import { newTempId } from '../../data/resource'
import { recipeWrites } from '../../data/recipes'
import { useHeldWrite } from '../../data/undoable'
import { useWrite } from '../../data/write'
import { Button } from '../../ui/Button'
import { CONTROL, LABEL } from '../../ui/Field'
import { EmptyState } from '../../ui/EmptyState'
import { RecipeCard } from './RecipeCard'
import { RecipeForm } from './RecipeForm'

export function RecipeLibrary({
  recipes,
  items,
  today,
  onPlan,
}: {
  recipes: readonly Recipe[]
  /** The kitchen, for the in-stock line on each card; undefined until it has loaded. */
  items: readonly MatchableItem[] | undefined
  today: string
  onPlan: (recipe: Recipe) => void
}) {
  const create = useWrite(recipeWrites.create)
  const update = useWrite(recipeWrites.update)
  const holdRemove = useHeldWrite(recipeWrites.remove)
  const [query, setQuery] = useState('')
  const [form, setForm] = useState<{ recipe: Recipe | null } | null>(null)
  const shown = recipes.filter((r) => recipeMatchesQuery(r, query))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <SearchField
          value={query}
          onChange={setQuery}
          className="flex min-w-48 flex-1 flex-col gap-1.5 md:max-w-sm"
        >
          <Label className={LABEL}>Search recipes</Label>
          <Input className={CONTROL} placeholder="Name or ingredient" />
        </SearchField>
        <Button id="add-recipe" variant="primary" onPress={() => setForm({ recipe: null })}>
          Add recipe
        </Button>
      </div>
      {recipes.length === 0 ? (
        <EmptyState icon="book" title="No recipes yet" align="start">
          Add one here, or plan a meal with a new name and it will appear in this list.
        </EmptyState>
      ) : shown.length === 0 ? (
        <p className="text-md text-muted">No recipe matches “{query}”.</p>
      ) : (
        <ul className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              stock={items ? recipeStockMatch(recipe, items, today) : undefined}
              onPlan={() => onPlan(recipe)}
              onEdit={() => setForm({ recipe })}
              onDelete={() => {
                // The card she pressed goes away: focus moves to the button that adds a recipe.
                if (holdRemove({ id: recipe.id }, `${recipe.name} deleted`))
                  requestAnimationFrame(() => document.getElementById('add-recipe')?.focus())
              }}
            />
          ))}
        </ul>
      )}
      {form && (
        <RecipeForm
          key={form.recipe?.id ?? 'new'}
          recipe={form.recipe}
          onClose={() => setForm(null)}
          onCreate={(body) => void create({ tempId: newTempId(), body })}
          onUpdate={(id, patch) => void update({ id, patch })}
        />
      )}
    </div>
  )
}
