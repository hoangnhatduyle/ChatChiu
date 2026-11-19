// The board header's controls (F-KB-12, F-KB-15): search, Scan receipt, Add item. Search lives in the URL
// (?q=), so a filtered board can be shared and survives a reload (web patterns: URL as state).
import { useState } from 'react'
import { Link } from 'react-router'
import { cx } from '../../ui/cx'
import { Icon } from '../../ui/Icon'

export type BoardHeaderProps = {
  query: string
  onQuery: (query: string) => void
}

const PILL = 'inline-flex min-h-touch items-center gap-2 rounded-pill px-5 text-md font-bold'

export function BoardHeader({ query, onQuery }: BoardHeaderProps) {
  // What she has typed lives here, so typing never waits on the router; the URL follows it. A change
  // from outside (the Back button) replaces it.
  const [typed, setTyped] = useState(query)
  const [seen, setSeen] = useState(query)
  if (query !== seen) {
    setSeen(query)
    setTyped(query)
  }
  return (
    <>
      <label className="flex min-h-touch w-full items-center gap-2 rounded-pill border border-line bg-surface px-4 md:w-60">
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
      <Link
        to="/scan"
        className={cx(
          PILL,
          'border border-line bg-surface text-ink hover:bg-hover hover:shadow-lift',
        )}
      >
        Scan receipt
      </Link>
      <Link
        to="/stock/new"
        className={cx(PILL, 'bg-accent text-accent-ink hover:bg-accent-hover hover:shadow-lift')}
      >
        <Icon name="plus" size={18} strokeWidth={2.4} />
        Add item
      </Link>
    </>
  )
}
