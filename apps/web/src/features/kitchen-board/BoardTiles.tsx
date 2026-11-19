// The four clickable cards on top of the Kitchen (F-KB-12): Expired, Use today, Running low, Fresh. A press
// filters the board to those items (they stay in their place cards); pressing the chosen card again shows
// everything. State is aria-pressed, not a "Clear filter" bar. Colour is never the only cue: each card says its
// name, and the chosen one says "Showing. Tap to clear".
import type { BoardTile } from '@chatchiu/domain'
import { cx } from '../../ui/cx'
import { Icon } from '../../ui/Icon'
import { TILE_CAPTIONS, TILE_LABELS, TILE_ORDER } from './board-tiles'

const TONE: Record<BoardTile, string> = {
  expired: 'bg-tint-red text-tint-red-ink',
  today: 'bg-tint-amber text-tint-amber-ink',
  low: 'bg-tint-orange text-tint-orange-ink',
  fresh: 'bg-tint-green text-tint-green-ink',
}

export type BoardTilesProps = {
  /** The chosen tile, or null for no filter. */
  tile: BoardTile | null
  counts: Record<BoardTile, number>
  onPick: (tile: BoardTile | null) => void
}

export function BoardTiles({ tile, counts, onPick }: BoardTilesProps) {
  return (
    <section aria-labelledby="board-tiles-hint" className="flex flex-col gap-2.5">
      <p id="board-tiles-hint" className="flex items-center gap-2 text-md font-semibold text-muted">
        <Icon name="chevron-right" size={16} />
        Tap a card to see only those items, grouped by place. Tap it again to show everything.
      </p>
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {TILE_ORDER.map((value) => {
          const on = tile === value
          return (
            <button
              key={value}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(on ? null : value)}
              className={cx(
                'group flex min-h-touch cursor-pointer flex-col gap-0.5 rounded-tile px-3.5 py-3 text-left md:px-4 md:py-3.5',
                'transition-[transform,box-shadow] duration-fast ease-out hover:-translate-y-0.5 hover:shadow-lift',
                TONE[value],
                on && 'ring-2 ring-current ring-offset-2 ring-offset-bg',
              )}
            >
              <span className="font-display text-tile font-extrabold tabular">{counts[value]}</span>
              <span className="text-md font-bold">{TILE_LABELS[value]}</span>
              <span className="hidden text-xs font-semibold md:block">{TILE_CAPTIONS[value]}</span>
              <span
                aria-hidden="true"
                className="mt-1 flex items-center gap-1 text-xs font-bold md:mt-1.5"
              >
                {on ? 'Showing. Tap to clear' : 'Tap to filter'}
                <Icon
                  name="chevron-right"
                  size={14}
                  strokeWidth={2.6}
                  className="transition-transform duration-fast group-hover:translate-x-0.5"
                />
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
