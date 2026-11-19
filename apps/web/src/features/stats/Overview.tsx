// The overview (F-ST-05, F-ST-06): stock value and counts, what is running low with its usage rate and
// predicted run-out, stock by category and location, and what was added lately. The figures come from the
// API's one overview call; nothing is recomputed here, so the value (price × current quantity) and the
// percent-based low stock rule have one definition (NC-ST-NO-RAW-PRICE-SUM, NC-ST-NO-ABSOLUTE-LOW).
import type { RunOutRow, StatsOverview } from '@chatchiu/contracts'
import { useId } from 'react'
import { amount, dateLabel, dayLabel, money } from './format'

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-3">
      <dt className="text-sm font-semibold text-muted">{label}</dt>
      <dd className=" text-2xl font-extrabold text-ink tabular">{value}</dd>
      {note && <dd className="text-sm text-muted">{note}</dd>}
    </div>
  )
}

export function Block({ title, children }: { title: string; children: React.ReactNode }) {
  const headingId = useId()
  return (
    <div
      role="group"
      aria-labelledby={headingId}
      className="rounded-card border border-line bg-surface p-3"
    >
      <h3 id={headingId} className="mb-2 text-md font-extrabold text-ink">
        {title}
      </h3>
      {children}
    </div>
  )
}

function RunningLow({ rows }: { rows: readonly RunOutRow[] }) {
  if (rows.length === 0) return <p className="text-md text-muted">Nothing is running low.</p>
  return (
    <ul className="flex flex-col divide-y divide-line">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
          <span className="text-base font-bold text-ink">{row.name}</span>
          <span className="text-md text-ink">
            <span className=" font-bold tabular">{Math.round(row.percentLeft)}% left</span>
            <span className="text-muted">
              {' '}
              · {amount(row.currentQuantity)} of {amount(row.initialQuantity)} {row.unit}
            </span>
          </span>
          <span className="w-full text-sm text-muted">
            {row.avgDailyUse !== null && row.runOutDate !== null
              ? `${amount(row.avgDailyUse)} ${row.unit} a day · runs out ${dayLabel(row.runOutDate)}`
              : 'No usage history yet'}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function Overview({ overview }: { overview: StatsOverview }) {
  const { stock, waste } = overview
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Stat label="Total items" value={String(stock.totalItems)} />
        <Stat label="Stock value" value={money(stock.totalValue)} />
        <Stat label="Expiring in 7 days" value={String(stock.expiringCount)} />
        <Stat label="Expired" value={String(stock.expiredCount)} />
        <Stat
          label="Wasted in 30 days"
          value={String(waste.last30dCount)}
          note={`${money(waste.last30dValue)} lost`}
        />
      </dl>
      <Block title="Running low">
        <RunningLow rows={overview.lowStock} />
      </Block>
      <div className="grid gap-3 md:grid-cols-2">
        <Block title="Stock by category">
          <ul className="flex flex-col gap-1">
            {overview.byCategory.map((c) => (
              <li key={c.categoryId} className="flex justify-between text-base">
                <span className="text-ink">{c.category}</span>
                <span className=" text-muted tabular">
                  {c.count} · {money(c.value)}
                </span>
              </li>
            ))}
          </ul>
        </Block>
        <Block title="Stock by location">
          <ul className="flex flex-col gap-1">
            {overview.byLocation.map((l) => (
              <li key={l.locationId ?? 'none'} className="flex justify-between text-base">
                <span className="text-ink">{l.location}</span>
                <span className=" text-muted tabular">{l.count}</span>
              </li>
            ))}
          </ul>
        </Block>
      </div>
      <Block title="Recently added">
        {overview.recentlyAdded.length === 0 ? (
          <p className="text-md text-muted">Nothing added yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {overview.recentlyAdded.map((item) => (
              <li key={item.id} className="flex flex-wrap justify-between gap-x-3 py-1.5 text-base">
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
  )
}
