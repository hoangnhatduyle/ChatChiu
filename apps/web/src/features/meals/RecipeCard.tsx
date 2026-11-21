// One recipe in the library. The card is as tall as what it has to say: a recipe with no time, servings or
// ingredients is a short row, and nudges to add the ingredients. When the kitchen is known it says how much of the
// recipe is in stock (never colour alone: the words are always there). Edit and delete show on hover for a mouse and
// stay visible for touch; keyboard focus reveals them too.
import type { Recipe } from '@chatchiu/contracts'
import { parseIngredients, type RecipeStockMatch } from '@chatchiu/domain'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { Icon } from '../../ui/Icon'
import { IconButton } from '../../ui/IconButton'
import { recipeInitial, recipeTone } from './meal-style'

const NEUTRAL = 'bg-tint-neutral text-tint-neutral-ink'
const PILL = `rounded-pill px-2.5 py-0.5 text-sm font-semibold ${NEUTRAL}`
const REVEAL =
  'transition-opacity duration-fast pointer-fine:opacity-0 pointer-fine:group-hover/card:opacity-100 pointer-fine:group-focus-within/card:opacity-100'

function stockLabel({ total, have }: RecipeStockMatch): string {
  return have.length === total ? `All ${total} in stock` : `${have.length} of ${total} in stock`
}

function stockTone({ total, have }: RecipeStockMatch): string {
  if (have.length === total) return 'bg-tint-green text-tint-green-ink'
  return have.length > 0 ? 'bg-tint-amber text-tint-amber-ink' : NEUTRAL
}

export function RecipeCard({
  recipe,
  stock,
  onPlan,
  onEdit,
  onDelete,
}: {
  recipe: Recipe
  /** Undefined while the kitchen has not loaded: the card shows no stock line rather than a wrong one. */
  stock: RecipeStockMatch | undefined
  onPlan: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const saving = recipe.id < 0
  const ingredients = parseIngredients(recipe.ingredients)
  const showMeta = !saving && (recipe.servings || recipe.prepTime)
  return (
    <li className="group/card flex flex-col gap-2.5 rounded-panel border border-line bg-surface p-3.5 shadow-card">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cx(
            'flex size-11 shrink-0 items-center justify-center rounded-control font-display text-xl font-extrabold',
            recipeTone(recipe.name),
          )}
        >
          {recipeInitial(recipe.name)}
        </span>
        <p className="min-w-0 flex-1 font-display text-lg leading-tight font-bold text-ink">
          {recipe.name}
        </p>
        <div className={cx('-my-1 -mr-1.5 flex shrink-0', REVEAL)}>
          <IconButton
            icon="edit"
            label={`Edit ${recipe.name}`}
            isDisabled={saving}
            onPress={onEdit}
          />
          <IconButton
            icon="trash"
            label={`Delete ${recipe.name}`}
            isDisabled={saving}
            onPress={onDelete}
          />
        </div>
      </div>
      {showMeta && (
        <p className="flex flex-wrap gap-1.5">
          {recipe.servings ? <span className={PILL}>Serves {recipe.servings}</span> : null}
          {recipe.prepTime ? <span className={PILL}>{recipe.prepTime}</span> : null}
        </p>
      )}
      {saving ? (
        <p className="text-sm text-muted">Saving…</p>
      ) : ingredients.length === 0 ? (
        <button
          type="button"
          aria-label={`Add ingredients to ${recipe.name}`}
          onClick={onEdit}
          className="flex min-h-touch w-full cursor-pointer items-center gap-2 rounded-control border border-dashed border-field-line px-3 text-left text-md font-semibold text-muted outline-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Icon name="plus" size={16} />
          Add ingredients to see what you have
        </button>
      ) : (
        <>
          {stock && (
            <p
              className={cx(
                'flex w-fit items-center gap-1.5 rounded-pill px-2.5 py-1 text-sm font-bold',
                stockTone(stock),
              )}
            >
              {stock.have.length === stock.total && (
                <Icon name="check" size={14} strokeWidth={2.6} />
              )}
              {stockLabel(stock)}
            </p>
          )}
          <p className="line-clamp-2 text-sm text-muted">
            {stock && stock.missing.length > 0
              ? `Missing: ${stock.missing.join(', ')}`
              : `Uses ${ingredients.join(', ')}`}
          </p>
        </>
      )}
      <div className="flex items-center">
        <Button isDisabled={saving} aria-label={`Plan ${recipe.name}`} onPress={onPlan}>
          Plan
        </Button>
      </div>
    </li>
  )
}
