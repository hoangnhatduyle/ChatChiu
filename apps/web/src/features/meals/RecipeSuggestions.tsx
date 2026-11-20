// "Cook with what expires soon" (F-MP-12): recipes that use items due within 3 days, most matches first, as a rail
// above the plan. The API matches by words, with no AI and no paid call (NC-MP-NO-PAID-SUGGESTIONS). Nothing shows
// when nothing matches or the list has not loaded: it is a hint, not a state the page waits for.
import type { RecipeSuggestion } from '@chatchiu/contracts'
import { cx } from '../../ui/cx'
import { Icon } from '../../ui/Icon'
import { ScrollFade } from '../../ui/ScrollFade'
import { recipeInitial, recipeTone } from './meal-style'

const MAX_SHOWN = 5

export function RecipeSuggestions({
  suggestions,
  onPlan,
}: {
  suggestions: readonly RecipeSuggestion[] | undefined
  onPlan: (recipe: RecipeSuggestion) => void
}) {
  if (!suggestions || suggestions.length === 0) return null
  return (
    <section
      aria-labelledby="suggestions-heading"
      className="rounded-panel border border-line bg-surface p-3.5 shadow-card"
    >
      <h2 id="suggestions-heading" className="font-display text-lg font-bold text-ink">
        Cook with what expires soon
      </h2>
      <p className="text-sm text-muted">
        Ideas for what runs out of date first. Tap one to plan it.
      </p>
      <ScrollFade label="Recipe ideas" axis="x" className="mt-2.5">
        <ul className="flex gap-3 pb-1">
          {suggestions.slice(0, MAX_SHOWN).map((recipe) => (
            <li key={recipe.id} className="w-64 shrink-0">
              <button
                type="button"
                onClick={() => onPlan(recipe)}
                className="flex min-h-touch w-full cursor-pointer items-center gap-3 rounded-card border border-line bg-bg px-3 py-2 text-left outline-none transition-[transform,box-shadow] duration-fast hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    'flex size-10 shrink-0 items-center justify-center rounded-control font-display text-lg font-extrabold',
                    recipeTone(recipe.name),
                  )}
                >
                  {recipeInitial(recipe.name)}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-md font-bold text-ink">
                    <Icon name="plus" size={16} />
                    <span className="truncate">{recipe.name}</span>
                  </span>
                  <span className="block truncate text-sm text-muted">
                    Uses {recipe.matchingItems.join(', ')}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </ScrollFade>
    </section>
  )
}
