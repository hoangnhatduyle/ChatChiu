// The kitchen board (SPEC-KB-001): one column per location, every item visible, the usage bar saved on
// release with Undo. Reads and writes only through the data hooks (AR-NO-DIRECT-API); a change from
// another device arrives in the same cache, so the board updates itself (F-KB-16).
import {
  boardChipCounts,
  boardColumns,
  boardFilter,
  filterItems,
  todayLocalDateString,
} from '@chatchiu/domain'
import { lazy, Suspense } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useToast } from '../../core/toast-context'
import { useBootstrapQuery } from '../../data/inventory'
import { PageTitle } from '../../shell/PageTitle'
import { PanelLoadBoundary } from '../item-panel/PanelLoadBoundary'
import { Button } from '../../ui/Button'
import { EmptyState } from '../../ui/EmptyState'
import { BoardFilters } from './BoardFilters'
import { parseChip } from './board-chips'
import { BoardHint } from './BoardHint'
import { BoardLoadError, BoardLoading } from './BoardStates'
import { LocationColumn } from './LocationColumn'
import { useBoardActions } from './use-board-actions'

// The panel is its own chunk, fetched only when an item is opened (?item=).
const ItemPanelHost = lazy(() => import('../item-panel/ItemPanelHost'))

const DATE_FORMAT: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }

export default function KitchenBoardPage() {
  const query = useBootstrapQuery()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { logUse } = useBoardActions()
  const toasts = useToast()
  const data = query.data

  const text = params.get('q') ?? ''
  const chip = parseChip(params.get('show'))
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

  const title = <PageTitle>Kitchen</PageTitle>
  if (!data) {
    return (
      <Frame>
        <div className="px-4 pt-5 md:px-6 md:pt-6">{title}</div>
        {query.isError ? <BoardLoadError onRetry={() => void query.refetch()} /> : <BoardLoading />}
      </Frame>
    )
  }

  const today = todayLocalDateString()
  const counts = boardChipCounts(data.items, today)
  const shown = boardFilter(filterItems(data.items, { q: text }, today), chip, today)
  const columns = boardColumns(shown, data.locations)
  const date = new Intl.DateTimeFormat('en', DATE_FORMAT).format(new Date())
  const total = data.items.length
  const shownCount = shown.length

  return (
    <Frame>
      <div className="flex flex-col gap-3 px-4 pt-5 md:px-6 md:pt-6">
        <div>
          {title}
          <p className="text-md text-muted">
            {date} · {total} {total === 1 ? 'item' : 'items'}
          </p>
        </div>
        {total > 0 && (
          <BoardFilters
            query={text}
            onQuery={(value) => setParam('q', value, true)}
            chip={chip}
            onChip={(value) => setParam('show', value === 'all' ? null : value)}
            counts={counts}
          />
        )}
        {total > 0 && <BoardHint />}
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
        {/* Announces how many items the chip and search leave on the board (WCAG 4.1.3). */}
        <p role="status" data-testid="board-result-count" className="sr-only">
          {shownCount} {shownCount === 1 ? 'item' : 'items'} shown
        </p>
      </div>
      {total === 0 ? (
        <EmptyState
          icon="home"
          title="No items yet"
          action={{ label: 'Add first item', onPress: () => void navigate('/stock/new') }}
        >
          Add what is in your kitchen and it shows up here, by where it is kept.
        </EmptyState>
      ) : (
        <div className="relative grid min-h-72 flex-1 snap-x snap-mandatory scroll-px-4 auto-cols-[86%] md:scroll-px-6 grid-flow-col gap-3.5 overflow-x-auto px-4 pt-3 pb-4 md:auto-cols-[calc((100%-0.875rem)/2)] md:px-6 lg:auto-cols-[calc((100%-2.625rem)/4)]">
          {columns.map((column) => (
            <LocationColumn
              key={column.key ?? 'none'}
              locationId={column.key}
              name={column.name}
              items={column.items}
              filtered={text !== '' || chip !== 'all'}
              today={today}
              onOpen={(id) => setParam('item', String(id))}
              onUse={logUse}
            />
          ))}
        </div>
      )}
      {params.has('item') && (
        <PanelLoadBoundary key={params.get('item')} onError={panelFailed}>
          <Suspense fallback={null}>
            <ItemPanelHost />
          </Suspense>
        </PanelLoadBoundary>
      )}
    </Frame>
  )
}

/** The page's height: the screen minus the phone's bottom bar, so each column scrolls on its own. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[calc(100dvh-var(--spacing-nav)-env(safe-area-inset-bottom))] flex-col md:h-dvh">
      {children}
    </div>
  )
}
