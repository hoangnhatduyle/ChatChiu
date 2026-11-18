// The recipe library, a tab of Meals (F-MP-09, F-MP-11): search by name or ingredient, add, edit, delete
// with Undo. Items that need using up are matched to these recipes by the suggestions above the tabs.
import type { Recipe } from '@chatchiu/contracts'
import { parseIngredients, recipeMatchesQuery } from '@chatchiu/domain'
import { useState } from 'react'
import { SearchField, Input, Label } from 'react-aria-components'
import { newTempId } from '../../data/resource'
import { recipeWrites } from '../../data/recipes'
import { useHeldWrite } from '../../data/undoable'
import { useWrite } from '../../data/write'
import { Button } from '../../ui/Button'
import { CONTROL, LABEL } from '../../ui/Field'
import { EmptyState } from '../../ui/EmptyState'
import { IconButton } from '../../ui/IconButton'
import { RecipeForm } from './RecipeForm'

export function RecipeLibrary({
  recipes,
  onPlan,
}: {
  recipes: readonly Recipe[]
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
        <ul className="rounded-card border border-line bg-surface">
          {shown.map((recipe) => {
            const saving = recipe.id < 0
            const meta = [recipe.prepTime, recipe.servings ? `serves ${recipe.servings}` : null]
              .filter(Boolean)
              .join(' · ')
            return (
              <li
                key={recipe.id}
                className="flex items-center gap-2 border-b border-line px-3 py-2 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-ink">{recipe.name}</p>
                  <p className="line-clamp-1 text-sm text-muted">
                    {saving ? 'Saving…' : parseIngredients(recipe.ingredients).join(', ')}
                    {meta && !saving ? ` · ${meta}` : ''}
                  </p>
                </div>
                <Button
                  isDisabled={saving}
                  aria-label={`Plan ${recipe.name}`}
                  onPress={() => onPlan(recipe)}
                >
                  Plan
                </Button>
                <IconButton
                  icon="edit"
                  label={`Edit ${recipe.name}`}
                  isDisabled={saving}
                  onPress={() => setForm({ recipe })}
                />
                <IconButton
                  icon="trash"
                  label={`Delete ${recipe.name}`}
                  isDisabled={saving}
                  onPress={() => {
                    // The row she pressed goes away: focus moves to the button that adds a recipe.
                    if (holdRemove({ id: recipe.id }, `${recipe.name} deleted`))
                      requestAnimationFrame(() => document.getElementById('add-recipe')?.focus())
                  }}
                />
              </li>
            )
          })}
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
