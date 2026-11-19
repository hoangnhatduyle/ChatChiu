// The inventory list (SPEC-IN-001, route /stock): colourful status tiles, search, URL-held filters, sort and
// group (by place by default), the Shelves view (cards, 2 or 3 to a row on a wide screen) and a table as the
// second view, a virtual window of rows, the usage drag on cards, a tap that opens the quick-action panel, and select mode with ONE bulk delete and Undo.
// Reads and writes only through the data hooks (AR-NO-DIRECT-API); all filtering is the domain's
// filter.ts (NC-IN-ONE-FILTER-IMPL).
import { lazyRetry } from '../../core/lazy-retry'
import { countByStatus, filterItems, groupItems, locationLabel } from '@chatchiu/domain'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { useToday } from '../../core/use-today'
import { useToast } from '../../core/toast-context'
import { bulkDelete, useBootstrapQuery } from '../../data/inventory'
import { isTempId } from '../../data/resource'
import { useHeldWrite } from '../../data/undoable'
import { PAGE_FRAME } from '../../shell/page-frame'
import { PageHeader } from '../../shell/PageHeader'
import { Button } from '../../ui/Button'
import { EmptyState } from '../../ui/EmptyState'
import type { LocationLike } from '../../ui/location-style'
import { Skeleton } from '../../ui/Skeleton'
import { useBoardActions } from '../kitchen-board/use-board-actions'
import { PanelLoadBoundary } from '../item-panel/PanelLoadBoundary'
import {
  DEFAULT_GROUP,
  DEFAULT_SORT,
  DEFAULT_STATUS,
  hasFilterParams,
  loadRemembered,
  loadView,
  parseParams,
  rememberedFrom,
  saveRemembered,
  saveView,
  withParam,
  type ViewMode,
} from './inventory-params'
import { InventoryCards } from './InventoryCards'
import { InventoryFilters, SELECT_TOGGLE_ID } from './InventoryFilters'
import { InventoryTable } from './InventoryTable'
import { StockActions } from './StockActions'
import { StockTiles } from './StockTiles'
import { useMediaQuery } from './use-media-query'
import { flattenGroups } from './virtual-rows'

// The panel is its own chunk, fetched only when an item is opened (?item=).
const ItemPanelHost = lazyRetry(() => import('../item-panel/ItemPanelHost'))

/** The most ids one DELETE /api/inventory/bulk accepts (BULK_MAX in packages/contracts). */
export const BULK_DELETE_MAX = 200
/** Cards per row in the Shelves view: 3 from 1280 px, 2 from 768 px, else 1. */
const THREE_COLUMNS_QUERY = '(min-width: 1280px)'
const TWO_COLUMNS_QUERY = '(min-width: 768px)'

export default function InventoryPage() {
  const query = useBootstrapQuery()
  const [params, setRawParams] = useSearchParams()
  const { key: locationKey } = useLocation()
  // The search this page last wrote itself: a change to anything else is a navigation from outside (the nav).
  const ownSearch = useRef<string | null>(null)
  const setParams = useCallback(
    (update: (prev: URLSearchParams) => URLSearchParams, options?: { replace?: boolean }) =>
      setRawParams((prev) => {
        const next = update(prev)
        ownSearch.current = next.toString()
        return next
      }, options),
    [setRawParams],
  )
  const navigate = useNavigate()
  const toasts = useToast()
  const { logUse } = useBoardActions()
  const holdBulk = useHeldWrite(bulkDelete)
  const threeColumns = useMediaQuery(THREE_COLUMNS_QUERY)
  const twoColumns = useMediaQuery(TWO_COLUMNS_QUERY)
  const columns = threeColumns ? 3 : twoColumns ? 2 : 1
  // Read once: her card/table choice saved on this device (F-IN-05).
  const [savedView, setSavedView] = useState(loadView)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set())
  const [capped, setCapped] = useState(false)

  const data = query.data
  const parsed = parseParams(params)
  // A category or location that no longer exists (deleted, or saved on this device long ago) must not
  // silently empty the list: it is ignored, and she is told.
  const categoryId =
    parsed.categoryId !== null && data && !data.categories.some((c) => c.id === parsed.categoryId)
      ? null
      : parsed.categoryId
  const locationId =
    parsed.locationId !== null && data && !data.locations.some((l) => l.id === parsed.locationId)
      ? null
      : parsed.locationId
  const staleFilter = categoryId !== parsed.categoryId || locationId !== parsed.locationId
  const filters = { ...parsed, categoryId, locationId }
  const setParam = (key: string, value: string | null, defaultValue?: string) =>
    setParams((prev) => withParam(prev, key, value, defaultValue), { replace: true })

  // Opened from the nav with no filters in the URL: bring back the ones she used last (F-IN-14). This also
  // runs when the nav is pressed while already on /stock?...; what the page wrote itself (a cleared filter)
  // is not a visit and must not be undone.
  useEffect(() => {
    if (ownSearch.current === params.toString()) return
    if (hasFilterParams(params)) return
    const saved = loadRemembered()
    if (Object.keys(saved).length === 0) return
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(saved)) next.set(key, value)
        return next
      },
      { replace: true },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs per navigation (the location key), not per param
  }, [locationKey])
  // Whatever the URL holds is remembered for the next visit; clearing is remembered too.
  const { category: savedCategory, location: savedLocation, ...savedRest } = rememberedFrom(params)
  const remembered = JSON.stringify({
    ...savedRest,
    ...(savedCategory !== undefined && categoryId !== null ? { category: savedCategory } : {}),
    ...(savedLocation !== undefined && locationId !== null ? { location: savedLocation } : {}),
  })
  useEffect(() => {
    saveRemembered(JSON.parse(remembered) as ReturnType<typeof rememberedFrom>)
  }, [remembered])

  const today = useToday()
  const frame = (children: React.ReactNode, header?: { subtitle: string; addHref: string }) => (
    <div className={PAGE_FRAME}>
      <PageHeader
        title="Stock"
        subtitle={header?.subtitle}
        actions={header && <StockActions addHref={header.addHref} />}
      />
      {children}
    </div>
  )
  if (!data) {
    return frame(
      query.isError ? (
        <div className="mt-4 flex flex-col items-start gap-3">
          <p role="alert" className="text-base font-semibold">
            Couldn&apos;t load your stock. Check your connection and try again.
          </p>
          <Button variant="primary" onPress={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <div role="status" aria-label="Loading your stock" className="mt-4 flex flex-col gap-3">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ),
    )
  }

  const total = data.items.length
  // The counters count what the other filters leave, so a chip never promises more than it shows.
  const beforeStatus = filterItems(
    data.items,
    { q: filters.q, categoryId: filters.categoryId, locationId: filters.locationId },
    today,
  )
  const counts = { all: beforeStatus.length, ...countByStatus(beforeStatus, today) }
  const shown = filterItems(
    data.items,
    {
      q: filters.q,
      categoryId: filters.categoryId,
      locationId: filters.locationId,
      status: filters.status,
      sort: filters.sort,
    },
    today,
  )
  const categoryName = (id: number) => data.categories.find((c) => c.id === id)?.name ?? ''
  const locationName = (id: number | null) => {
    const location = data.locations.find((l) => l.id === id)
    return location ? locationLabel(location) : ''
  }
  const view: ViewMode = filters.view ?? savedView ?? 'cards'
  const showTable = view === 'table'
  const groups = groupItems(shown, filters.group)
  const groupLabel = (key: number | null) =>
    filters.group === 'category'
      ? key === null
        ? 'No category'
        : categoryName(key) || 'Unknown category'
      : key === null
        ? 'No location'
        : locationName(key) || 'Unknown location'
  // The table has one row per item; Shelves cuts a group into rows of `columns` cards.
  const rows = flattenGroups(groups, filters.group !== 'none', groupLabel, showTable ? 1 : columns)
  const isFiltered =
    filters.q !== '' ||
    filters.categoryId !== null ||
    filters.locationId !== null ||
    filters.status !== DEFAULT_STATUS

  // Select mode only counts what is on screen: an item hidden by a filter is never deleted by accident.
  const inSelectMode = selecting && total > 0
  const selectableIds = shown.filter((i) => !isTempId(i.id)).map((i) => i.id)
  const chosen = selectableIds.filter((id) => selected.has(id))

  const exitSelecting = () => {
    setSelecting(false)
    setSelected(new Set())
    setCapped(false)
  }
  const toggle = (id: number) => {
    if (selected.has(id)) {
      setSelected((prev) => new Set([...prev].filter((x) => x !== id)))
      setCapped(false)
    } else if (chosen.length >= BULK_DELETE_MAX) {
      setCapped(true)
    } else {
      setSelected((prev) => new Set([...prev, id]))
    }
  }
  const selectAll = () => {
    setSelected(new Set(selectableIds.slice(0, BULK_DELETE_MAX)))
    setCapped(selectableIds.length > BULK_DELETE_MAX)
  }
  const deleteChosen = () => {
    const first = shown.find((i) => i.id === chosen[0])
    const message =
      chosen.length === 1 && first ? `${first.name} deleted` : `${chosen.length} items deleted`
    // One request for all of them, sent when the Undo window closes (NC-IN-ONE-REQUEST).
    if (holdBulk({ ids: chosen }, message)) {
      exitSelecting()
      // The rows she was on are gone: put focus on the toggle that opened select mode.
      requestAnimationFrame(() => document.getElementById(SELECT_TOGGLE_ID)?.focus())
    }
  }

  const chooseView = (next: ViewMode) => {
    saveView(next)
    setSavedView(next)
    setParam('view', next)
  }
  const panelFailed = () => {
    toasts.show({
      message: "Couldn't open the item. Check your connection and try again.",
      tone: 'error',
    })
    setParam('item', null)
  }
  const actions = {
    today,
    selecting: inSelectMode,
    selected,
    onToggle: toggle,
    onOpen: (id: number) => setParams((prev) => withParam(prev, 'item', String(id))),
    onUse: logUse,
    categoryName,
    locationName,
    categoryColour: (id: number) => data.categories.find((c) => c.id === id)?.color ?? null,
    locationOf: (id: number | null): LocationLike =>
      data.locations.find((l) => l.id === id) ?? { name: 'No location' },
    group: filters.group,
  }

  return frame(
    <div className="flex flex-col gap-4">
      {total > 0 && (
        <StockTiles
          status={filters.status}
          counts={counts}
          onStatus={(status) => setParam('status', status, DEFAULT_STATUS)}
        />
      )}
      {total > 0 && (
        <InventoryFilters
          query={filters.q}
          onQuery={(value) => setParam('q', value)}
          categories={data.categories}
          locations={data.locations.map((l) => ({ id: l.id, label: locationLabel(l) }))}
          categoryId={filters.categoryId}
          locationId={filters.locationId}
          onCategory={(id) => setParam('category', id === null ? null : String(id))}
          onLocation={(id) => setParam('location', id === null ? null : String(id))}
          sort={filters.sort}
          onSort={(sort) => setParam('sort', sort, DEFAULT_SORT)}
          group={filters.group}
          onGroup={(group) => setParam('group', group, DEFAULT_GROUP)}
          view={view}
          onView={chooseView}
          isFiltered={isFiltered}
          onClear={() =>
            setParams(
              (prev) => {
                let next = prev
                for (const key of ['q', 'category', 'location', 'status'])
                  next = withParam(next, key, null)
                return next
              },
              { replace: true },
            )
          }
          selecting={inSelectMode}
          onToggleSelect={() => (inSelectMode ? exitSelecting() : setSelecting(true))}
        />
      )}
      {inSelectMode && (
        <div className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface p-2">
          <Button onPress={selectAll}>Select all</Button>
          <Button
            onPress={() => {
              setSelected(new Set())
              setCapped(false)
            }}
          >
            Select none
          </Button>
          <p role="status" className="sr-only">
            {chosen.length} selected
          </p>
          <Button variant="danger" isDisabled={chosen.length === 0} onPress={deleteChosen}>
            {`Delete selected (${chosen.length})`}
          </Button>
          {capped && (
            <p role="status" className="text-sm font-semibold text-muted">
              Selected the first {BULK_DELETE_MAX}, the most you can delete at once.
            </p>
          )}
        </div>
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
      {staleFilter && (
        <div role="status" className="flex items-center gap-3 text-md font-semibold text-muted">
          <p className="flex-1">
            A category or location you filtered by no longer exists, so that filter was ignored.
          </p>
          <Button
            variant="secondary"
            onPress={() =>
              setParams(
                (prev) => {
                  let next = prev
                  if (categoryId !== parsed.categoryId) next = withParam(next, 'category', null)
                  if (locationId !== parsed.locationId) next = withParam(next, 'location', null)
                  return next
                },
                { replace: true },
              )
            }
          >
            Dismiss
          </Button>
        </div>
      )}
      {/* Announces how many items the filters leave (WCAG 4.1.3). */}
      <p role="status" data-testid="inventory-result-count" className="sr-only">
        {shown.length} {shown.length === 1 ? 'item' : 'items'} shown
      </p>
      {total === 0 ? (
        <EmptyState
          icon="box"
          title="No items yet"
          action={{ label: 'Add first item', onPress: () => void navigate('/stock/new') }}
        >
          Add what is in your kitchen and it shows up here.
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState icon="search" title="Nothing matches">
          No item fits these filters.
          <Button
            className="mt-3"
            onPress={() =>
              setParams(
                (prev) =>
                  ['q', 'category', 'location', 'status'].reduce(
                    (next, key) => withParam(next, key, null),
                    prev,
                  ),
                { replace: true },
              )
            }
          >
            Clear filters
          </Button>
        </EmptyState>
      ) : showTable ? (
        <InventoryTable rows={rows} {...actions} />
      ) : (
        <InventoryCards rows={rows} total={shown.length} columns={columns} {...actions} />
      )}
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
    </div>,
    {
      subtitle: `${total} ${total === 1 ? 'item' : 'items'} · everything you own, by where it lives`,
      addHref:
        filters.locationId === null ? '/stock/new' : `/stock/new?location=${filters.locationId}`,
    },
  )
}
