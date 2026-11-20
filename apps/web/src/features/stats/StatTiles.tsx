// The numbers at a glance (F-ST-05): five coloured tiles. A term list, so each number is read with its name.
import type { StatsOverview } from '@chatchiu/contracts'
import { cx } from '../../ui/cx'
import { money } from './format'

type Tile = { label: string; value: string; note?: string; tone: string }

export function StatTiles({ overview }: { overview: StatsOverview }) {
  const { stock, waste } = overview
  const tiles: Tile[] = [
    {
      label: 'Total items',
      value: String(stock.totalItems),
      tone: 'bg-tint-green text-tint-green-ink',
    },
    {
      label: 'Stock value',
      value: money(stock.totalValue),
      tone: 'bg-tint-teal text-tint-teal-ink',
    },
    {
      label: 'Expiring in 7 days',
      value: String(stock.expiringCount),
      tone: 'bg-tint-amber text-tint-amber-ink',
    },
    { label: 'Expired', value: String(stock.expiredCount), tone: 'bg-tint-red text-tint-red-ink' },
    {
      label: 'Wasted in 30 days',
      value: String(waste.last30dCount),
      note: `${money(waste.last30dValue)} lost`,
      tone: 'bg-tint-orange text-tint-orange-ink',
    },
  ]
  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      {tiles.map((tile) => (
        <div key={tile.label} className={cx('rounded-tile px-4 py-3.5', tile.tone)}>
          <dt className="text-md font-bold">{tile.label}</dt>
          <dd className="font-display text-tile font-extrabold tabular">{tile.value}</dd>
          {tile.note && <dd className="text-sm font-semibold">{tile.note}</dd>}
        </div>
      ))}
    </dl>
  )
}
