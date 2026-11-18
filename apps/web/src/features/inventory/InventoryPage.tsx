// The inventory list (SPEC-IN-001, route /stock): search, URL-held filters, sort and group, cards below
// 1024 px and a table from it, a virtual window of rows, counters that act as filters, the usage drag on
// cards, a tap that opens the quick-action panel, and select mode with ONE bulk delete and Undo.
// Reads and writes only through the data hooks (AR-NO-DIRECT-API); all filtering is the domain's
// filter.ts (NC-IN-ONE-FILTER-IMPL).
import {
  countByStatus,
  filterItems,
  groupItems,
  locationLabel,
  todayLocalDateString,
} from '@chatchiu/domain'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useToast } from '../../core/toast-context'
import { bulkDelete, useBootstrapQuery } from '../../data/inventory'
import { isTempId } from '../../data/resource'
import { useHeldWrite } from '../../data/undoable'
import { PageTitle } from '../../shell/PageTitle'
import { Button } from '../../ui/Button'
import { EmptyState } from '../../ui/EmptyState'
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
import { useMediaQuery } from './use-media-query'
import { flattenGroups } from './virtual-rows'

// The panel is its own chunk, fetched only when an item is opened (?item=).
const ItemPanelHost = lazy(() => import('../item-panel/ItemPanelHost'))

/** The most ids one DELETE /api/inventory/bulk accepts (BULK_MAX in packages/contracts). */
export const BULK_DELETE_MAX = 200
const WIDE_QUERY = '(min-width: 1024px)'

export default function InventoryPage() {
  const query = useBootstrapQuery()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const toasts = useToast()
  const { logUse } = useBoardActions()
  const holdBulk = useHeldWrite(bulkDelete)
  const wide = useMediaQuery(WIDE_QUERY)
  // Read once: what was saved on this device (F-IN-14, F-IN-05).
  const [savedFilters] = useState(loadRemembered)
  const [savedView, setSavedView] = useState(loadView)
  const restored = useRef(false)
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

  // Opened from the nav with no filters in the URL: bring back the ones she used last (F-IN-14).
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    if (hasFilterParams(params) || Object.keys(savedFilters).length === 0) return
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(savedFilters)) next.set(key, value)
        return next
      },
      { replace: true },
    )
  }, [params, savedFilters, setParams])
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

  const title = <PageTitle>Stock</PageTitle>
  const frame = (children: React.ReactNode) => (
    <div className="px-4 pt-5 pb-6 md:px-6 md:pt-6">
      {title}
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

  const today = todayLocalDateString()
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
  const groups = groupItems(shown, filters.group)
  const rows = flattenGroups(groups, filters.group !== 'none', (key) =>
    filters.group === 'category'
      ? key === null
        ? 'No category'
        : categoryName(key) || 'Unknown category'
      : key === null
        ? 'No location'
        : locationName(key) || 'Unknown location',
  )
  const isFiltered =
    filters.q !== '' ||
    filters.categoryId !== null ||
    filters.locationId !== null ||
    filters.status !== DEFAULT_STATUS
  const view: ViewMode = filters.view ?? savedView ?? 'auto'
  const showTable = view === 'table' || (view === 'auto' && wide)

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
  }

  return frame(
    <div className="mt-1 flex flex-col gap-4">
      <p className="text-md text-muted">
        {total} {total === 1 ? 'item' : 'items'}
      </p>
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
          status={filters.status}
          counts={counts}
          onStatus={(status) => setParam('status', status, DEFAULT_STATUS)}
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
          addHref={
            filters.locationId === null ? '/stock/new' : `/stock/new?location=${filters.locationId}`
          }
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
        <p role="status" className="text-md font-semibold text-muted">
          A category or location you filtered by no longer exists, so that filter was ignored.
        </p>
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
        <InventoryCards rows={rows} total={shown.length} {...actions} />
      )}
      {params.has('item') && (
        <PanelLoadBoundary key={params.get('item')} onError={panelFailed}>
          <Suspense fallback={null}>
            <ItemPanelHost />
          </Suspense>
        </PanelLoadBoundary>
      )}
    </div>,
  )
}
