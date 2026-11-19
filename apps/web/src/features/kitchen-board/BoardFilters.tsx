// The board header controls (F-KB-12): search, the four chips with counts, Scan receipt, Add item.
// Search and the chip live in the URL (?q=, ?show=), so a filtered board can be shared and survives a
// reload (web patterns: URL as state).
import type { BoardChip } from '@chatchiu/domain'
import { Link } from 'react-router'
import { cx } from '../../ui/cx'
import { Icon } from '../../ui/Icon'
import { CHIP_LABELS, CHIP_ORDER } from './board-chips'
import { useState } from 'react'

export type BoardFiltersProps = {
  query: string
  onQuery: (query: string) => void
  chip: BoardChip
  onChip: (chip: BoardChip) => void
  counts: Record<BoardChip, number>
}

const PILL = 'inline-flex min-h-touch items-center gap-2 rounded-pill px-4 text-md font-bold'

export function BoardFilters({ query, onQuery, chip, onChip, counts }: BoardFiltersProps) {
  // What she has typed lives here, so typing never waits on the router; the URL follows it. A change
  // from outside (the Back button) replaces it.
  const [typed, setTyped] = useState(query)
  const [seen, setSeen] = useState(query)
  if (query !== seen) {
    setSeen(query)
    setTyped(query)
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex min-h-touch w-full items-center gap-2 rounded-pill border border-field-line bg-surface px-3.5 md:w-52">
        <Icon name="search" size={18} className="text-muted" />
        <input
          type="search"
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value)
            onQuery(event.target.value)
          }}
          placeholder="Find on the board"
          aria-label="Search the board"
          className="w-full bg-transparent text-base text-ink outline-none placeholder:text-muted"
        />
      </label>
      <div
        role="group"
        aria-label="Show"
        className="flex max-w-full gap-1.5 overflow-x-auto md:flex-wrap md:overflow-visible"
      >
        {CHIP_ORDER.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={value === chip}
            onClick={() => onChip(value)}
            className={cx(
              PILL,
              'shrink-0 cursor-pointer border',
              value === chip
                ? 'border-transparent bg-chip-on text-chip-on-ink'
                : 'border-line bg-surface text-ink hover:bg-hover',
            )}
          >
            {CHIP_LABELS[value]}
            <span className="ml-0.5 tabular text-sm opacity-75">{counts[value]}</span>
          </button>
        ))}
      </div>
      <Link
        to="/scan"
        className={cx(PILL, 'border border-line bg-surface text-ink hover:bg-hover')}
      >
        Scan receipt
      </Link>
      <Link to="/stock/new" className={cx(PILL, 'bg-accent text-accent-ink hover:bg-accent-hover')}>
        <Icon name="plus" size={18} strokeWidth={2.4} />
        Add item
      </Link>
    </div>
  )
}
