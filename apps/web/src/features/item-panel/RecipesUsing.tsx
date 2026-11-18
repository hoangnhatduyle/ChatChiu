// "Recipes that use this" (F-QP-09): shown for an item that needs using up within 3 days, with the
// same word matching as the meal planner's suggestions (F-MP-12, packages/domain recipe-match.ts).
import type { InventoryItem } from '@chatchiu/contracts'
import { recipesUsingItem } from '@chatchiu/domain'
import { useRecipesQuery } from '../../data/recipes'
import { Button } from '../../ui/Button'

export function RecipesUsing({ item }: { item: InventoryItem }) {
  const query = useRecipesQuery()
  const matches = query.data ? recipesUsingItem(query.data, item.name) : []
  if (!query.data) {
    if (query.isError) {
      return (
        <div role="alert" className="flex items-center gap-3 text-md text-muted">
          <p className="flex-1">Couldn&apos;t load recipes that use {item.name}.</p>
          <Button onPress={() => void query.refetch()}>Retry</Button>
        </div>
      )
    }
    return query.fetchStatus === 'paused' ? (
      <p className="text-md text-muted">
        Offline. Recipes that use {item.name} load when you are back online.
      </p>
    ) : null
  }
  if (matches.length === 0) return null
  return (
    <section aria-labelledby="panel-recipes-heading" className="flex flex-col gap-2">
      <h3 id="panel-recipes-heading" className="text-sm font-semibold text-muted">
        Recipes that use this
      </h3>
      <ul className="flex flex-col gap-1">
        {matches.map((recipe) => (
          <li
            key={recipe.id}
            className="min-h-touch rounded-control bg-hover px-3 py-2 text-base font-semibold"
          >
            {recipe.name}
          </li>
        ))}
      </ul>
    </section>
  )
}
