// The coloured tiles above the Stock list (F-IN-07): Expired, Expiring soon, Fresh. They are the status filter
// (?status=): pressing one filters the list, pressing the chosen one again shows everything. The numbers count what
// the other filters leave, so a tile never promises more than it shows.
import type { ExpiryFilterStatus } from '@chatchiu/domain'
import { cx } from '../../ui/cx'

type Tile = ExpiryFilterStatus

const TILES: ReadonlyArray<{ id: Tile; label: string; caption: string; tone: string }> = [
  {
    id: 'expired',
    label: 'Expired',
    caption: 'Past their date',
    tone: 'bg-tint-red text-tint-red-ink',
  },
  {
    id: 'expiring',
    label: 'Expiring soon',
    caption: 'Today to 3 days',
    tone: 'bg-tint-amber text-tint-amber-ink',
  },
  {
    id: 'fresh',
    label: 'Fresh',
    caption: 'More than 3 days',
    tone: 'bg-tint-green text-tint-green-ink',
  },
]

export type StockTilesProps = {
  /** The chosen status, or 'all'. */
  status: 'all' | Tile
  counts: Record<Tile, number>
  onStatus: (status: 'all' | Tile) => void
}

export function StockTiles({ status, counts, onStatus }: StockTilesProps) {
  return (
    <div role="group" aria-label="Filter by date" className="grid grid-cols-3 gap-2.5 md:gap-3.5">
      {TILES.map((tile) => {
        const on = status === tile.id
        return (
          <button
            key={tile.id}
            type="button"
            aria-pressed={on}
            onClick={() => onStatus(on ? 'all' : tile.id)}
            className={cx(
              'flex min-h-touch cursor-pointer flex-col gap-0.5 rounded-tile px-3.5 py-3 text-left md:px-4 md:py-3.5',
              'transition-[transform,box-shadow] duration-fast ease-out hover:-translate-y-0.5 hover:shadow-lift',
              tile.tone,
              on && 'ring-2 ring-current ring-offset-2 ring-offset-bg',
            )}
          >
            <span className="font-display text-tile font-extrabold tabular">{counts[tile.id]}</span>
            <span className="text-md font-bold">{tile.label}</span>
            <span className="hidden text-xs font-semibold md:block">{tile.caption}</span>
          </button>
        )
      })}
    </div>
  )
}
