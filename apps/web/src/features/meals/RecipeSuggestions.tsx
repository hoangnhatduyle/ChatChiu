// "Cook with what expires soon" (F-MP-12): recipes that use items due within 3 days, most matches first.
// The API matches by words, with no AI and no paid call (NC-MP-NO-PAID-SUGGESTIONS). Nothing shows when
// nothing matches or the list has not loaded: it is a hint, not a state the page waits for.
import type { RecipeSuggestion } from '@chatchiu/contracts'
import { Icon } from '../../ui/Icon'

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
      className="rounded-card border border-line bg-status-soon-bg/60 p-3"
    >
      <h2 id="suggestions-heading" className="text-md font-extrabold text-ink">
        Cook with what expires soon
      </h2>
      <ul className="mt-2 flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible">
        {suggestions.slice(0, MAX_SHOWN).map((recipe) => (
          <li key={recipe.id} className="shrink-0">
            <button
              type="button"
              onClick={() => onPlan(recipe)}
              className="flex min-h-touch cursor-pointer flex-col items-start rounded-control border border-line bg-surface px-3 py-1.5 text-left outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <span className="flex items-center gap-1.5 text-md font-bold text-ink">
                <Icon name="plus" size={16} />
                <span>{recipe.name}</span>
              </span>
              <span className="text-sm text-muted">Uses {recipe.matchingItems.join(', ')}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
