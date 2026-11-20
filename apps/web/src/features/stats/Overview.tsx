// The overview (F-ST-05, F-ST-06): a headline, the numbers, where the money is, what is running low, the next two
// weeks, items by place and what was added lately. The figures come from the API's one overview call; nothing is
// recomputed here, so the value (price × current quantity) and the percent-based low stock rule have one definition
// (NC-ST-NO-RAW-PRICE-SUM, NC-ST-NO-ABSOLUTE-LOW). Only the next-two-weeks strip is read from the items the board
// already holds.
import type { Category, InventoryItem, Location, StatsOverview } from '@chatchiu/contracts'
import { Block } from './Block'
import { ExpiryStrip } from './ExpiryStrip'
import { amount, dateLabel } from './format'
import { PlaceBars } from './PlaceBars'
import { RunningLowList } from './RunningLowList'
import { StatsHero } from './StatsHero'
import { StatTiles } from './StatTiles'
import { ValueRing } from './ValueRing'

export function Overview({
  overview,
  items,
  categories,
  locations,
  today,
}: {
  overview: StatsOverview
  /** The board's items (for the next-two-weeks strip); absent until they have loaded. */
  items: readonly InventoryItem[] | undefined
  categories: readonly Category[]
  locations: readonly Location[]
  today: string
}) {
  const colourOf = (categoryId: number) => categories.find((c) => c.id === categoryId)?.color
  return (
    <div className="flex flex-col gap-4">
      <StatsHero overview={overview} />
      <StatTiles overview={overview} />
      <div className="grid gap-4 lg:grid-cols-12">
        <ValueRing
          byCategory={overview.byCategory}
          totalValue={overview.stock.totalValue}
          colourOf={colourOf}
          className="lg:col-span-7"
        />
        <RunningLowList rows={overview.lowStock} className="lg:col-span-5" />
        {items && (
          <ExpiryStrip items={items} today={today} colourOf={colourOf} className="lg:col-span-7" />
        )}
        <PlaceBars
          byLocation={overview.byLocation}
          locations={locations}
          className={items ? 'lg:col-span-5' : 'lg:col-span-12'}
        />
        <Block title="Recently added" lead="Last things that came in." className="lg:col-span-12">
          {overview.recentlyAdded.length === 0 ? (
            <p className="text-md text-muted">Nothing added yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {overview.recentlyAdded.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap justify-between gap-x-3 py-1.5 text-base"
                >
                  <span className="font-semibold text-ink">{item.name}</span>
                  <span className="text-md text-muted">
                    {amount(item.currentQuantity ?? item.quantity)} of{' '}
                    {amount(item.initialQuantity ?? item.quantity)} {item.unit} · added{' '}
                    {dateLabel(item.createdAt.slice(0, 10))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Block>
      </div>
    </div>
  )
}
