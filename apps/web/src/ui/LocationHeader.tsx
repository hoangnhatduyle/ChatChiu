// The shelf-label header of a location: its icon in a white square, its name, a status line and a count, on its
// own tint. One component for the Kitchen cards, the Settings preview and anywhere else a place is named, so
// they cannot drift apart. Pure: no data, no router.
import type { ReactNode } from 'react'
import { cx } from './cx'
import { Icon } from './Icon'
import { LOCATION_TINT_CLASS, locationStyle, type LocationLike } from './location-style'

export type LocationHeaderProps = {
  location: LocationLike
  /** The text shown for the name (the board uses "Fridge - Top shelf"). */
  title: string
  /** "1 expired · 2 low", or "All good". */
  status?: string
  /** Shown big on the right. */
  count?: ReactNode
  /** The heading's id, for `aria-labelledby` on the card. */
  headingId?: string
  /** The heading level: 2 where the card sits straight under the page's h1, else 3. */
  level?: 2 | 3
  /** Something after the count, e.g. an add button. */
  trailing?: ReactNode
  className?: string
}

export function LocationHeader({
  location,
  title,
  status,
  count,
  headingId,
  level = 3,
  trailing,
  className,
}: LocationHeaderProps) {
  const { icon, color } = locationStyle(location)
  const Heading = level === 2 ? 'h2' : 'h3'
  return (
    <div
      data-location-color={color}
      className={cx('flex items-center gap-3 px-3.5 py-3', LOCATION_TINT_CLASS[color], className)}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-surface/75 text-loc-ink">
        <Icon name={icon} size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <Heading
          id={headingId}
          className="truncate font-display text-lg leading-tight font-bold text-loc-ink"
        >
          {title}
        </Heading>
        {status && <p className="text-xs font-semibold text-loc-ink-soft">{status}</p>}
      </div>
      {count !== undefined && (
        <span className="font-display text-xl font-extrabold text-loc-ink tabular">{count}</span>
      )}
      {trailing}
    </div>
  )
}
