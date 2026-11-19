// One place on the Kitchen (F-KB-01): a shelf-label header (its icon and tint, name, what needs attention,
// count, and a + that opens the item form with this place chosen, F-KB-12), then its 5 most urgent items
// (expired, then use today, then low, then soonest). "Show all N" opens the card in place and is remembered;
// no item is ever unreachable (NC-KB-NO-HIDDEN-ITEMS). An opened card that is very tall scrolls inside itself
// with a quiet scrollbar, a fade and a "More below" pill.
import { boardTileCounts } from '@chatchiu/domain'
import type { InventoryItem } from '@chatchiu/contracts'
import { Link } from 'react-router'
import { rowKey } from '../../data/resource'
import { Card } from '../../ui/Card'
import { Icon } from '../../ui/Icon'
import { LocationHeader } from '../../ui/LocationHeader'
import type { LocationLike } from '../../ui/location-style'
import { ScrollFade } from '../../ui/ScrollFade'
import { BoardRow, type BoardRowProps } from './BoardRow'

/** How many items a card shows before "Show all N". */
export const CARD_PREVIEW_COUNT = 5

export type LocationCardProps = {
  /** The location id, or null for the "No location" card. */
  locationId: number | null
  /** The text on the header ("Fridge - Top shelf"). */
  name: string
  /** What picks its icon and tint. */
  location: LocationLike
  /** Most urgent first. */
  items: InventoryItem[]
  /** True while a tile or the search narrows the board, so an empty card says "matches". */
  filtered: boolean
  today: string
  expanded: boolean
  onToggle: () => void
  categoryColour: (categoryId: number) => string | null
  onOpen: BoardRowProps['onOpen']
  onUse: BoardRowProps['onUse']
}

function statusLine(items: readonly InventoryItem[], today: string): string {
  const { expired, today: soon, low } = boardTileCounts(items, today)
  const bits = [
    expired > 0 && `${expired} expired`,
    soon > 0 && `${soon} due soon`,
    low > 0 && `${low} low`,
  ].filter(Boolean)
  return bits.length > 0 ? bits.join(' · ') : 'All good'
}

export function LocationCard({
  locationId,
  name,
  location,
  items,
  filtered,
  today,
  expanded,
  onToggle,
  categoryColour,
  onOpen,
  onUse,
}: LocationCardProps) {
  const key = locationId ?? 'none'
  const headingId = `column-${key}`
  const listId = `card-items-${key}`
  const addTo = locationId === null ? '/stock/new' : `/stock/new?location=${locationId}`
  const canToggle = items.length > CARD_PREVIEW_COUNT
  const shown = canToggle && !expanded ? items.slice(0, CARD_PREVIEW_COUNT) : items
  const rows = shown.map((item) => (
    <BoardRow
      key={rowKey('inventory', item.id)}
      item={item}
      today={today}
      categoryColour={categoryColour(item.categoryId)}
      onOpen={onOpen}
      onUse={onUse}
    />
  ))
  return (
    <Card
      as="section"
      lift
      aria-labelledby={headingId}
      className="flex snap-start flex-col overflow-hidden"
    >
      <LocationHeader
        location={location}
        title={name}
        status={statusLine(items, today)}
        headingId={headingId}
        level={2}
        count={
          <>
            <span aria-hidden="true">{items.length}</span>
            <span className="sr-only">
              {items.length} {items.length === 1 ? 'item' : 'items'}
            </span>
          </>
        }
        trailing={
          <Link
            to={addTo}
            aria-label={`Add to ${name}`}
            className="flex size-11 shrink-0 items-center justify-center rounded-control text-loc-ink hover:bg-surface/60 active:bg-surface/80"
          >
            <Icon name="plus" size={20} strokeWidth={2.2} />
          </Link>
        }
      />
      {items.length > 0 &&
        (canToggle && expanded ? (
          <ScrollFade
            label={`${name} items`}
            moreLabel="More below"
            scrollerClassName="max-h-[min(36rem,70dvh)]"
          >
            <ul id={listId}>{rows}</ul>
          </ScrollFade>
        ) : (
          <ul id={listId}>{rows}</ul>
        ))}
      {items.length === 0 && (
        <p className="border-t border-hair px-3.5 py-4 text-md text-muted">
          {filtered ? 'Nothing here matches.' : 'Nothing here yet.'}
        </p>
      )}
      {canToggle && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={onToggle}
          className="flex min-h-touch w-full cursor-pointer items-center justify-center gap-1.5 border-t border-line text-md font-bold text-accent hover:bg-hover"
        >
          {expanded ? 'Show fewer' : `Show all ${items.length}`}
          <Icon
            name="chevron-down"
            size={18}
            strokeWidth={2.4}
            className={expanded ? 'rotate-180' : undefined}
          />
        </button>
      )}
    </Card>
  )
}
