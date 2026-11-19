// The quick-action panel's content (SPEC-QP-001): level, quick uses, exact amount, where it is kept,
// shopping list, restock, usage history, recipes, and the two removals. Every change is saved at
// once with Undo (or held until the toast closes); nothing asks "are you sure?" (CS-UNDO-NOT-CONFIRM).
// A row with a temporary id is still being created: its writes are disabled until it has a real id.
import type { InventoryItem } from '@chatchiu/contracts'
import { needsUsingSoon, todayLocalDateString } from '@chatchiu/domain'
import { useState } from 'react'
import { Link } from 'react-router'
import { useBootstrapQuery } from '../../data/inventory'
import { isTempId } from '../../data/resource'
import { Button } from '../../ui/Button'
import { Select } from '../../ui/Select'
import { RecipesUsing } from './RecipesUsing'
import { RestockForm } from './RestockForm'
import { UsageControls } from './UsageControls'
import { UsageHistory } from './UsageHistory'
import { usePanelActions } from './use-panel-actions'

const LINK_CLASS =
  'inline-flex min-h-touch items-center justify-center rounded-pill border border-field-line bg-surface px-4 text-md font-bold text-ink hover:bg-hover active:bg-pressed'

const RESTOCK_BUTTON_ID = 'panel-restock'
const RESTOCK_FORM_ID = 'panel-restock-form'

export type ItemPanelProps = {
  item: InventoryItem
  /** Called after Move to waste or Delete hid the item: the panel has nothing left to show. */
  onRemoved: () => void
}

export function ItemPanel({ item, onRemoved }: ItemPanelProps) {
  const actions = usePanelActions(item, onRemoved)
  const bootstrap = useBootstrapQuery().data
  const [restocking, setRestocking] = useState(false)
  const saving = isTempId(item.id)
  const locations = bootstrap?.locations ?? []
  const location = locations.find((l) => l.id === item.locationId)
  const category = bootstrap?.categories.find((c) => c.id === item.categoryId)

  return (
    <div className="flex flex-col gap-5 pb-20">
      {saving && (
        <p role="status" className="rounded-control bg-hover px-3 py-2 text-md font-semibold">
          Saving… you can change this item once it is saved.
        </p>
      )}
      <UsageControls
        item={item}
        isDisabled={saving}
        onLevel={actions.setLevel}
        onQuick={actions.quickUse}
        onExact={actions.saveAmount}
      />
      <Select
        label="Stored in"
        options={locations.map((l) => ({
          id: String(l.id),
          label: l.subLocation ? `${l.name} - ${l.subLocation}` : l.name,
        }))}
        value={item.locationId === null ? null : String(item.locationId)}
        placeholder="No location"
        onChange={(id) => {
          const next = locations.find((l) => String(l.id) === id)
          if (next && !saving) actions.moveTo(next.id, next.name)
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button isDisabled={saving || !actions.listReady} onPress={actions.addToShopping}>
          Add to shopping list
        </Button>
        <Button
          id={RESTOCK_BUTTON_ID}
          isDisabled={saving}
          aria-expanded={restocking}
          aria-controls={restocking && !saving ? RESTOCK_FORM_ID : undefined}
          onPress={() => setRestocking((open) => !open)}
        >
          Restock
        </Button>
      </div>
      {!actions.listReady && (
        <div className="-mt-3 flex items-center gap-3 text-sm text-muted">
          <p>
            {actions.listFailed
              ? "Couldn't load your shopping list."
              : 'Your shopping list is not loaded yet.'}
          </p>
          {actions.listFailed && <Button onPress={actions.retryList}>Retry</Button>}
        </div>
      )}
      {restocking && !saving && (
        <div id={RESTOCK_FORM_ID}>
          <RestockForm
            item={item}
            categoryName={category?.name}
            locationName={location?.name}
            onRestock={actions.restockIt}
            onDone={() => {
              setRestocking(false)
              // The form she was in is gone: keep focus where she can carry on.
              requestAnimationFrame(() => document.getElementById(RESTOCK_BUTTON_ID)?.focus())
            }}
          />
        </div>
      )}
      {!saving && <UsageHistory item={item} />}
      {!saving && needsUsingSoon(item, todayLocalDateString()) && <RecipesUsing item={item} />}
      <div className="flex flex-wrap gap-2 border-t border-hair pt-4">
        {saving ? (
          <Button isDisabled>Edit all details</Button>
        ) : (
          <Link to={`/stock/${item.id}/edit`} className={LINK_CLASS}>
            Edit all details
          </Link>
        )}
        <Button isDisabled={saving} onPress={actions.wasteIt}>
          Move to waste
        </Button>
        <Button variant="danger" isDisabled={saving} onPress={actions.deleteIt}>
          Delete
        </Button>
      </div>
    </div>
  )
}
