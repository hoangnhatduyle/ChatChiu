// Where the money is (F-ST-05): the stock value by category as a ring, with a legend that is the real content: every
// category's name, number of items and value, written out. A press on a legend row looks closer (the ring's centre
// shows that category). The ring is a CSS conic gradient (no chart library) and is hidden from assistive tech: the
// legend and the table behind "Show as a table" say the same thing in words (NC-ST-NO-COLOUR-ONLY-CHARTS).
import type { StatsOverview } from '@chatchiu/contracts'
import { useState } from 'react'
import { CategoryDot } from '../../ui/CategoryStyle'
import { cx } from '../../ui/cx'
import { Block } from './Block'
import { ChartTable } from './charts/ChartTable'
import { money } from './format'
import { ringGradient, ringRows } from './ring'

export function ValueRing({
  byCategory,
  totalValue,
  colourOf,
  className,
}: {
  byCategory: StatsOverview['byCategory']
  totalValue: number
  colourOf: (categoryId: number) => string | null | undefined
  className?: string
}) {
  const [picked, setPicked] = useState<string | null>(null)
  const rows = ringRows(byCategory, colourOf)
  const current = rows.find((r) => r.key === picked)
  return (
    <Block
      title="Stock by category"
      lead="Stock value by kind of food. Tap a row to look closer."
      className={className}
    >
      {rows.length === 0 ? (
        <p className="text-md text-muted">Nothing in stock yet.</p>
      ) : (
        <div className="flex flex-col items-center gap-5 md:flex-row">
          <div
            aria-hidden="true"
            data-testid="value-ring"
            className="relative size-52 shrink-0 rounded-pill"
            style={{ background: ringGradient(rows) }}
          >
            <div className="absolute inset-7 flex flex-col items-center justify-center rounded-pill bg-surface text-center">
              <span className="font-display text-xl leading-tight font-extrabold tabular">
                {money(current ? current.value : totalValue)}
              </span>
              <span className="max-w-24 truncate text-sm text-muted">
                {current ? current.label : 'in stock'}
              </span>
            </div>
          </div>
          <ul className="flex w-full min-w-0 flex-col gap-0.5">
            {rows.map((row) => (
              <li key={row.key}>
                <button
                  type="button"
                  aria-pressed={picked === row.key}
                  onClick={() => setPicked(picked === row.key ? null : row.key)}
                  className={cx(
                    'flex min-h-touch w-full cursor-pointer items-center gap-2.5 rounded-control px-2 text-left text-base hover:bg-hover',
                    picked === row.key && 'bg-hover font-bold ring-2 ring-accent',
                  )}
                >
                  <CategoryDot colour={row.colour} className="size-3" />
                  <span className="min-w-0 flex-1 truncate text-ink">{row.label}</span>
                  <span className="text-muted tabular">
                    {row.count} · {money(row.value)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ChartTable
        title="Stock by category"
        labelHeading="Category"
        valueHeading="Value"
        rows={rows}
      />
    </Block>
  )
}
