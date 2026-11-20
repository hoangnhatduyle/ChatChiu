// The shopping list (SPEC-SL-001, route /shopping): quick add, instant tick, delete and Clear purchased
// with Undo, show/hide purchased, group by category, counts, and Share. Reads and writes only through the
// data hooks (AR-NO-DIRECT-API); the ordering, grouping, counts and share text are the domain's
// shopping-list.ts. Items sent from the quick-action panel arrive through the same list (F-QP-04, F-SL-07);
// a change from another device arrives through realtime.
import { rowKey } from '../../data/resource'
import type { ShoppingItem } from '@chatchiu/contracts'
import {
  groupShoppingByCategory,
  isOnShoppingList,
  shoppingCounts,
  shoppingShareText,
  sinkPurchased,
} from '@chatchiu/domain'
import { useId, useState } from 'react'
import { useToast } from '../../core/toast-context'
import { useBootstrapQuery } from '../../data/inventory'
import { newTempId } from '../../data/resource'
import { clearPurchased, shoppingWrites, useShoppingQuery } from '../../data/shopping'
import { useStatsOverviewQuery } from '../../data/stats'
import { useHeldWrite } from '../../data/undoable'
import { useWrite, type WriteHandle } from '../../data/write'
import { PAGE_FRAME } from '../../shell/page-frame'
import { PageHeader } from '../../shell/PageHeader'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { CategoryPill } from '../../ui/CategoryStyle'
import { EmptyState } from '../../ui/EmptyState'
import { Skeleton } from '../../ui/Skeleton'
import { Switch } from '../../ui/Switch'
import { BoughtRing } from './BoughtRing'
import { lowSuggestions, suggestionEntry, type LowSuggestion } from './low-suggestions'
import { QuickAdd, type NewItem } from './QuickAdd'
import { RunningLowSuggestions } from './RunningLowSuggestions'
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

  // What the kitchen says is low: the stats overview has run-out dates, the bootstrap summary is what the board
  // already holds (so the suggestions also work offline and before the overview has loaded).
  const stats = useStatsOverviewQuery('all')
  const items = query.data
  const frame = (children: React.ReactNode, actions?: React.ReactNode) => (
    <div className={PAGE_FRAME}>
      <PageHeader
        title="Shopping"
        subtitle="What to buy, and what your kitchen is asking for"
        actions={actions}
      />
      {children}
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

  const suggestions = lowSuggestions(stats.data?.lowStock ?? bootstrap?.summary?.lowStock, items)
  const addSuggestion = (row: LowSuggestion) => {
    if (isOnShoppingList(items, row.name)) {
      toasts.show({ message: 'Already on your list' })
      return
    }
    // Not "added": the write may wait offline or be refused, and a refusal has its own toast.
    toasts.show({ message: `Adding ${row.name} to the shopping list` })
    reportRefusal(create({ tempId: newTempId(), body: suggestionEntry(row) }))
  }
  const categoryOf = (id: number | null) => {
    const category = id === null ? undefined : bootstrap?.categories.find((c) => c.id === id)
    return category ? { name: category.name, colour: category.color } : undefined
  }

  return frame(
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="flex flex-col gap-4 lg:col-start-1">
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
        </div>
      </div>
      <aside
        aria-label="Progress and suggestions"
        className="order-2 flex flex-col gap-4 lg:sticky lg:top-6 lg:order-none lg:col-start-2 lg:row-span-2 lg:row-start-1"
      >
        <Card className="rounded-panel p-4">
          <BoughtRing bought={counts.purchased} total={items.length} />
        </Card>
        <Card className="rounded-panel p-4">
          <RunningLowSuggestions rows={suggestions} onAdd={addSuggestion} />
        </Card>
      </aside>
      <div className="order-3 flex flex-col gap-4 lg:order-none lg:col-start-1">
        {items.length === 0 ? (
          <EmptyState brand icon="cart" title="Your list is empty">
            Nothing to buy right now. Add something above, or pull in what is running low.
          </EmptyState>
        ) : visible.length === 0 ? (
          <p className="text-md text-muted">
            Everything on the list is bought. Turn on Show purchased to see it.
          </p>
        ) : (
          groups.map((group) => {
            const id = `${headingId}-${group.key ?? 'none'}`
            const category = categoryOf(group.key)
            return (
              <section key={group.key ?? 'all'} aria-labelledby={grouped ? id : undefined}>
                {grouped && (
                  <h2 id={id} className="mb-1.5 flex items-center gap-2 text-md font-bold">
                    {category ? (
                      <CategoryPill name={category.name} colour={category.colour} />
                    ) : (
                      <span className="rounded-control bg-tint-neutral px-2 py-0.5 text-xs font-bold text-tint-neutral-ink">
                        {categoryName(group.key)}
                      </span>
                    )}
                    <span aria-hidden="true" className="text-sm font-semibold text-muted tabular">
                      {group.items.length}
                    </span>
                    <span className="sr-only">
                      , {group.items.length} {group.items.length === 1 ? 'item' : 'items'}
                    </span>
                  </h2>
                )}
                <ul className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
                  {group.items.map((item) => (
                    <ShoppingRow
                      key={rowKey('shopping', item.id)}
                      item={item}
                      onTick={tick}
                      onDelete={remove}
                      category={grouped ? undefined : categoryOf(item.categoryId)}
                    />
                  ))}
                </ul>
              </section>
            )
          })
        )}
      </div>
    </div>,
    <>
      <Button isDisabled={counts.pending === 0} onPress={() => void share()}>
        Share list
      </Button>
      <Button isDisabled={clearable.length === 0} onPress={clear}>
        {`Clear bought (${clearable.length})`}
      </Button>
    </>,
  )
}
