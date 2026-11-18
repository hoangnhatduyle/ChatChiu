// The inventory header controls (F-IN-01..05, F-IN-07, F-IN-10, F-IN-13): search, status chips with
// counters, category / location / sort / group, the view switch, select mode, Scan receipt and Add item.
// Every value is held by the page in the URL; this component only shows it and reports changes.
import type { GroupKey, SortKey, StatusFilter } from '@chatchiu/domain'
import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { Icon } from '../../ui/Icon'
import { Segmented } from '../../ui/Segmented'
import { Select } from '../../ui/Select'
import type { ViewMode } from './inventory-params'

const PILL = 'inline-flex min-h-touch items-center gap-2 rounded-pill px-4 text-md font-bold'
const ALL = 'all'
/** The select-mode toggle: focus goes back to it when select mode ends (the rows it was on are gone). */
export const SELECT_TOGGLE_ID = 'inventory-select-toggle'

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: 'All',
  expired: 'Expired',
  expiring: 'Expiring',
  fresh: 'Fresh',
}
const SORT_OPTIONS: ReadonlyArray<{ id: SortKey; label: string }> = [
  { id: 'expiry', label: 'Expiry' },
  { id: 'name', label: 'Name' },
  { id: 'quantity', label: 'Quantity' },
  { id: 'recent', label: 'Recently added' },
]
const GROUP_OPTIONS: ReadonlyArray<{ id: GroupKey; label: string }> = [
  { id: 'none', label: 'None' },
  { id: 'category', label: 'Category' },
  { id: 'location', label: 'Location' },
]
const VIEW_OPTIONS: ReadonlyArray<{ id: ViewMode; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 'cards', label: 'Cards' },
  { id: 'table', label: 'Table' },
]

export type InventoryFiltersProps = {
  query: string
  onQuery: (query: string) => void
  categories: ReadonlyArray<{ id: number; name: string }>
  locations: ReadonlyArray<{ id: number; label: string }>
  categoryId: number | null
  locationId: number | null
  onCategory: (id: number | null) => void
  onLocation: (id: number | null) => void
  status: StatusFilter
  counts: Record<StatusFilter, number>
  onStatus: (status: StatusFilter) => void
  sort: SortKey
  onSort: (sort: SortKey) => void
  group: GroupKey
  onGroup: (group: GroupKey) => void
  view: ViewMode
  onView: (view: ViewMode) => void
  isFiltered: boolean
  onClear: () => void
  selecting: boolean
  onToggleSelect: () => void
  addHref: string
}

const toId = (value: string): number | null => (value === ALL ? null : Number(value))

export function InventoryFilters(props: InventoryFiltersProps) {
  // What she has typed lives here, so typing never waits on the router; the URL follows it. A change
  // from outside (the Back button) replaces it.
  const [typed, setTyped] = useState(props.query)
  const [seen, setSeen] = useState(props.query)
  if (props.query !== seen) {
    setSeen(props.query)
    setTyped(props.query)
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-h-touch w-full items-center gap-2 rounded-pill border border-field-line bg-surface px-3.5 md:w-72">
          <Icon name="search" size={18} className="text-muted" />
          <input
            type="search"
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value)
              props.onQuery(event.target.value)
            }}
            placeholder="Search name or notes"
            aria-label="Search stock"
            className="w-full bg-transparent text-base text-ink outline-none placeholder:text-muted"
          />
        </label>
        <div
          role="group"
          aria-label="Status"
          className="flex max-w-full gap-1.5 overflow-x-auto md:flex-wrap md:overflow-visible"
        >
          {(Object.keys(STATUS_LABELS) as StatusFilter[]).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={value === props.status}
              onClick={() => props.onStatus(value)}
              className={cx(
                PILL,
                'shrink-0 cursor-pointer border',
                value === props.status
                  ? 'border-transparent bg-chip-on text-chip-on-ink'
                  : 'border-line bg-surface text-ink hover:bg-hover',
              )}
            >
              {STATUS_LABELS[value]}
              <span className="ml-0.5 font-mono text-sm opacity-75">{props.counts[value]}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2 md:ml-auto">
          <Link
            to="/scan"
            className={cx(PILL, 'border border-line bg-surface text-ink hover:bg-hover')}
          >
            Scan receipt
          </Link>
          <Link
            to={props.addHref}
            className={cx(PILL, 'bg-accent text-accent-ink hover:bg-accent-hover')}
          >
            <Icon name="plus" size={18} strokeWidth={2.4} />
            Add item
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Select
          label="Category"
          options={[
            { id: ALL, label: 'All categories' },
            ...props.categories.map((c) => ({ id: String(c.id), label: c.name })),
          ]}
          value={props.categoryId === null ? ALL : String(props.categoryId)}
          onChange={(value) => props.onCategory(toId(value))}
        />
        <Select
          label="Location"
          options={[
            { id: ALL, label: 'All locations' },
            ...props.locations.map((l) => ({ id: String(l.id), label: l.label })),
          ]}
          value={props.locationId === null ? ALL : String(props.locationId)}
          onChange={(value) => props.onLocation(toId(value))}
        />
        <Select label="Sort" options={SORT_OPTIONS} value={props.sort} onChange={props.onSort} />
        <Select
          label="Group"
          options={GROUP_OPTIONS}
          value={props.group}
          onChange={props.onGroup}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="View" options={VIEW_OPTIONS} value={props.view} onChange={props.onView} />
        <Button
          id={SELECT_TOGGLE_ID}
          variant={props.selecting ? 'primary' : 'secondary'}
          aria-pressed={props.selecting}
          onPress={props.onToggleSelect}
        >
          Select
        </Button>
        {props.isFiltered && (
          <Button variant="ghost" onPress={props.onClear}>
            Clear filters
          </Button>
        )}
      </div>
    </div>
  )
}
