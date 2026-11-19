// The shopping list (SPEC-SL-001, route /shopping): quick add, instant tick, delete and Clear purchased
// with Undo, show/hide purchased, group by category, counts, and Share. Reads and writes only through the
// data hooks (AR-NO-DIRECT-API); the ordering, grouping, counts and share text are the domain's
// shopping-list.ts. Items sent from the quick-action panel arrive through the same list (F-QP-04, F-SL-07);
// a change from another device arrives through realtime.
import { rowKey } from '../../data/resource'
import type { ShoppingItem } from '@chatchiu/contracts'
import {
  groupShoppingByCategory,
  shoppingCounts,
  shoppingShareText,
  sinkPurchased,
} from '@chatchiu/domain'
import { useId, useState } from 'react'
import { useToast } from '../../core/toast-context'
import { useBootstrapQuery } from '../../data/inventory'
import { newTempId } from '../../data/resource'
import { clearPurchased, shoppingWrites, useShoppingQuery } from '../../data/shopping'
import { useHeldWrite } from '../../data/undoable'
import { useWrite, type WriteHandle } from '../../data/write'
import { PageTitle } from '../../shell/PageTitle'
import { Button } from '../../ui/Button'
import { EmptyState } from '../../ui/EmptyState'
import { Skeleton } from '../../ui/Skeleton'
import { Switch } from '../../ui/Switch'
import { QuickAdd, type NewItem } from './QuickAdd'
import { shareText } from './share-list'
import { ShoppingRow } from './ShoppingRow'
import { loadView, saveView, type ShoppingView } from './shopping-view'

/** The most ids one POST /api/shopping-list/clear-purchased accepts (CLEAR_PURCHASED_MAX in packages/contracts). */
export const CLEAR_PURCHASED_MAX = 500
const UNKNOWN_CATEGORY = 'No category'
const NOT_STARTED = 'That change could not start. Try again in a moment.'

export default function ShoppingPage() {
  const query = useShoppingQuery()
  const bootstrap = useBootstrapQuery().data
  const toasts = useToast()
  const create = useWrite(shoppingWrites.create)
  const update = useWrite(shoppingWrites.update)
  const holdRemove = useHeldWrite(shoppingWrites.remove)
  const holdClear = useHeldWrite(clearPurchased)
  const [view, setView] = useState<ShoppingView>(loadView)
  const headingId = useId()

  const items = query.data
  const title = <PageTitle>Shopping</PageTitle>
  const frame = (children: React.ReactNode) => (
    <div className="px-4 pt-5 pb-6 md:px-6 md:pt-6">
      {title}
      <div className="mt-3 flex max-w-3xl flex-col gap-4">{children}</div>
    </div>
  )
  if (!items) {
    return frame(
      query.isError ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-base font-semibold">
            Couldn&apos;t load your shopping list. Check your connection and try again.
          </p>
          <Button variant="primary" onPress={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <div role="status" aria-label="Loading your shopping list" className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ),
    )
  }

  const counts = shoppingCounts(items)
  const visible = view.showPurchased ? items : items.filter((i) => !i.isPurchased)
  // Grouping needs the category names: until they have loaded the list stays flat. A category that
  // no longer exists is shown under "No category": one group, not a heading with a made-up name.
  const grouped = view.groupByCategory && bootstrap !== undefined
  const known = new Set((bootstrap?.categories ?? []).map((c) => c.id))
  const categoryName = (id: number | null) =>
    id === null
      ? UNKNOWN_CATEGORY
      : (bootstrap?.categories.find((c) => c.id === id)?.name ?? UNKNOWN_CATEGORY)
  const groups = grouped
    ? groupShoppingByCategory(
        visible.map((i) =>
          i.categoryId !== null && !known.has(i.categoryId) ? { ...i, categoryId: null } : i,
        ),
      )
    : [{ key: null, items: sinkPurchased(visible) }]
  const clearable = items.filter((i) => i.isPurchased && i.id > 0)

  const changeView = (next: ShoppingView) => {
    setView(next)
    saveView(next)
  }
  /** A refusal before the write started (e.g. "still being saved") has no failed-write toast: say it here. */
  const reportRefusal = (handle: WriteHandle<unknown>) =>
    void handle.result.then((result) => {
      if (result.status === 'failed' && result.blocked) {
        toasts.show({
          message: result.error instanceof Error ? result.error.message : NOT_STARTED,
          tone: 'error',
        })
      }
    })

  const add = (item: NewItem) => {
    reportRefusal(create({ tempId: newTempId(), body: item }))
    // The new row is far from the field she is typing in: say it was added.
    toasts.show({ message: `${item.name} added to the list` })
  }
  const tick = (item: ShoppingItem) =>
    reportRefusal(update({ id: item.id, patch: { isPurchased: !item.isPurchased } }))
  const remove = (item: ShoppingItem) => {
    const flat = groups.flatMap((g) => g.items)
    const at = flat.findIndex((i) => i.id === item.id)
    const neighbour = flat[at + 1] ?? flat[at - 1]
    if (holdRemove({ id: item.id }, `${item.name} removed`)) {
      // The row she was on is gone: focus goes to the row next to it, or the page title if it was the last.
      requestAnimationFrame(() => {
        const next = neighbour
          ? document.querySelector<HTMLElement>(`[data-shopping-id="${neighbour.id}"]`)
          : null
        ;(next ?? document.querySelector<HTMLElement>('h1'))?.focus()
      })
    }
  }
  const clear = () => {
    // Exactly the rows that are purchased now: a row ticked later is not part of it (NC-SL-ONE-CLEAR).
    const purchased = clearable.map((i) => i.id)
    const ids = purchased.slice(0, CLEAR_PURCHASED_MAX)
    if (ids.length === 0) return
    const more = purchased.length > ids.length
    const held = holdClear(
      { ids },
      `${ids.length} bought ${ids.length === 1 ? 'item' : 'items'} cleared${more ? '. That is the most at once: tap again for the rest' : ''}`,
    )
    // Focus moves only when rows really went: the button she pressed goes with them.
    if (held) requestAnimationFrame(() => document.querySelector<HTMLElement>('h1')?.focus())
  }
  const share = async () => {
    const text = shoppingShareText(items)
    if (text === null) return
    const outcome = await shareText(text)
    if (outcome === 'copied') toasts.show({ message: 'Copied to the clipboard' })
    if (outcome === 'failed') {
      toasts.show({ message: "Couldn't share the list. Try again in a moment.", tone: 'error' })
    }
  }

  return frame(
    <>
      <p role="status" className="text-md text-muted">
        {counts.pending} pending · {counts.purchased} purchased
      </p>
      <QuickAdd onAdd={add} />
      {query.isError && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-card border border-line bg-status-soon-bg px-4 py-2 text-md font-semibold text-status-soon-fg"
        >
          <p className="flex-1">
            Couldn&apos;t refresh. You are seeing what was saved on this device.
          </p>
          <Button variant="secondary" onPress={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <Switch
          label="Show purchased"
          isSelected={view.showPurchased}
          onChange={(showPurchased) => changeView({ ...view, showPurchased })}
        />
        <Switch
          label="Group by category"
          isSelected={view.groupByCategory}
          onChange={(groupByCategory) => changeView({ ...view, groupByCategory })}
        />
        <div className="flex gap-2 md:ml-auto">
          <Button isDisabled={counts.pending === 0} onPress={() => void share()}>
            Share
          </Button>
          <Button isDisabled={clearable.length === 0} onPress={clear}>
            {`Clear purchased (${clearable.length})`}
          </Button>
        </div>
      </div>
      {items.length === 0 ? (
        <EmptyState icon="cart" title="Your list is empty" align="start">
          Add what you need above. Items that run low in your kitchen can be sent here from their
          panel.
        </EmptyState>
      ) : visible.length === 0 ? (
        <p className="text-md text-muted">
          Everything on the list is bought. Turn on Show purchased to see it.
        </p>
      ) : (
        groups.map((group) => {
          const id = `${headingId}-${group.key ?? 'none'}`
          return (
            <section key={group.key ?? 'all'} aria-labelledby={grouped ? id : undefined}>
              {grouped && (
                <h2 id={id} className="mb-1 text-md font-extrabold text-muted">
                  {categoryName(group.key)}{' '}
                  <span aria-hidden="true" className="font-mono text-sm">
                    {group.items.length}
                  </span>
                  <span className="sr-only">
                    , {group.items.length} {group.items.length === 1 ? 'item' : 'items'}
                  </span>
                </h2>
              )}
              <ul className="rounded-card border border-line bg-surface">
                {group.items.map((item) => (
                  <ShoppingRow
                    key={rowKey('shopping', item.id)}
                    item={item}
                    onTick={tick}
                    onDelete={remove}
                  />
                ))}
              </ul>
            </section>
          )
        })
      )}
    </>,
  )
}
