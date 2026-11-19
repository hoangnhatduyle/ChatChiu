// The kitchen board (SPEC-KB-001): four filter tiles, then one card per location with its 5 most urgent items
// ("Show all N" opens it), the usage bar saved on release with Undo. Reads and writes only through the data hooks (AR-NO-DIRECT-API); a change from
// another device arrives in the same cache, so the board updates itself (F-KB-16).
import { DOWN_ONLY_HINT } from '../../ui/usage-slider-shared'
import { lazyRetry } from '../../core/lazy-retry'
import { boardColumns, boardTileCounts, boardTileFilter, filterItems } from '@chatchiu/domain'
import { Suspense } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useToday } from '../../core/use-today'
import { useToast } from '../../core/toast-context'
import { useBootstrapQuery } from '../../data/inventory'
import { PAGE_FRAME } from '../../shell/page-frame'
import { PageHeader } from '../../shell/PageHeader'
import { PanelLoadBoundary } from '../item-panel/PanelLoadBoundary'
import { Button } from '../../ui/Button'
import { EmptyState } from '../../ui/EmptyState'
import { ScrollFade } from '../../ui/ScrollFade'
import { BoardHeader } from './BoardHeader'
import { parseTile, tileAnnouncement } from './board-tiles'
import { BoardTiles } from './BoardTiles'
import { BoardLoadError, BoardLoading } from './BoardStates'
import { LocationCard } from './LocationCard'
import { useBoardActions } from './use-board-actions'
import { useCardExpansion } from './use-card-expansion'

// The panel is its own chunk, fetched only when an item is opened (?item=).
const ItemPanelHost = lazyRetry(() => import('../item-panel/ItemPanelHost'))

const DATE_FORMAT: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }

export default function KitchenBoardPage() {
  const query = useBootstrapQuery()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { logUse } = useBoardActions()
  const toasts = useToast()
  const data = query.data

  const text = params.get('q') ?? ''
  const tile = parseTile(params.get('show'))
  const expansion = useCardExpansion()
  const setParam = (key: string, value: string | null, replace = false) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value === null || value === '') next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace },
    )

  // The panel's chunk could not load (offline, or removed by a deploy): keep the board, say so.
  const panelFailed = () => {
    toasts.show({
      message: "Couldn't open the item. Check your connection and try again.",
      tone: 'error',
    })
    setParam('item', null, true)
  }

  const today = useToday()
  if (!data) {
    return (
      <div className={PAGE_FRAME}>
        <PageHeader title="Kitchen" />
        {query.isError ? <BoardLoadError onRetry={() => void query.refetch()} /> : <BoardLoading />}
      </div>
    )
  }

  const counts = boardTileCounts(data.items, today)
  const searched = filterItems(data.items, { q: text }, today)
  const shown = tile === null ? searched : boardTileFilter(searched, tile, today)
  const columns = boardColumns(shown, data.locations, today)
  // A tile leaves out the places with nothing to show; a search keeps every place (F-KB-15).
  const visible = tile === null ? columns : columns.filter((column) => column.items.length > 0)
  const placeCount = columns.filter((column) => column.items.length > 0).length
  const date = new Intl.DateTimeFormat('en', DATE_FORMAT).format(new Date())
  const total = data.items.length
  const shownCount = shown.length
  const colours = new Map(data.categories.map((c) => [c.id, c.color]))
  const locationOf = (key: number | null) => data.locations.find((l) => l.id === key)
  const allPlaces = data.locations.length

  return (
    <div className={PAGE_FRAME}>
      <PageHeader
        title="Kitchen"
        subtitle={`${date} · ${total} ${total === 1 ? 'item' : 'items'}${
          total > 0 ? ` in ${allPlaces} ${allPlaces === 1 ? 'place' : 'places'}` : ''
        }`}
        actions={
          total > 0 ? (
            <BoardHeader query={text} onQuery={(value) => setParam('q', value, true)} />
          ) : undefined
        }
      />
      <div className="flex flex-col gap-4">
        {total > 0 && (
          <BoardTiles tile={tile} counts={counts} onPick={(value) => setParam('show', value)} />
        )}
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
        {/* Announces what the tile and search leave on the board (WCAG 4.1.3). */}
        <p className="sr-only">{DOWN_ONLY_HINT}</p>
        <p role="status" data-testid="board-result-count" className="sr-only">
          {tile === null
            ? `${shownCount} ${shownCount === 1 ? 'item' : 'items'} shown`
            : tileAnnouncement(tile, shownCount, placeCount)}
        </p>
        {total === 0 ? (
          <EmptyState
            icon="home"
            brand
            title="No items yet"
            action={{ label: 'Add first item', onPress: () => void navigate('/stock/new') }}
          >
            Add what is in your kitchen and it shows up here, by where it is kept.
          </EmptyState>
        ) : (
          // One page scroll on a wide screen (a grid of cards); a swipe row on a phone and a portrait tablet.
          <ScrollFade
            label="Places"
            axis="x"
            tone="bg"
            scrollerClassName="snap-x snap-mandatory scroll-px-5 grid grid-flow-col auto-cols-[86%] items-start gap-3.5 -mx-1.5 -mt-1.5 -mb-6 px-1.5 pt-1.5 pb-8 md:auto-cols-[calc((100%-0.875rem)/2)] lg:grid-flow-row lg:auto-cols-auto lg:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] lg:gap-4"
          >
            {visible.map((column) => (
              <LocationCard
                key={column.key ?? 'none'}
                locationId={column.key}
                name={column.name}
                location={locationOf(column.key) ?? { name: column.name }}
                items={column.items}
                filtered={text !== '' || tile !== null}
                today={today}
                expanded={expansion.isOpen(String(column.key ?? 'none'))}
                onToggle={() => expansion.toggle(String(column.key ?? 'none'))}
                categoryColour={(id) => colours.get(id) ?? null}
                onOpen={(id) => setParam('item', String(id))}
                onUse={logUse}
              />
            ))}
          </ScrollFade>
        )}
      </div>
      {params.has('item') && (
        <PanelLoadBoundary
          key={params.get('item')}
          onError={panelFailed}
          reset={ItemPanelHost.reset}
        >
          <Suspense fallback={null}>
            <ItemPanelHost />
          </Suspense>
        </PanelLoadBoundary>
      )}
    </div>
  )
}
