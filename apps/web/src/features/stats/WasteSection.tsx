// The waste half of the page (F-ST-02, F-ST-03, F-ST-04, F-ST-07): the time range and category filters, the
// totals, the two charts and the most wasted items. The server filters and adds them up for the range and
// category in the URL; the log below is the same entries, filtered with the domain's one range rule.
import type { Category, StatsOverview } from '@chatchiu/contracts'
import type { WasteRange } from '@chatchiu/domain'
import { Segmented } from '../../ui/Segmented'
import { Select } from '../../ui/Select'
import { NO_CATEGORY } from './category-name'
import { BarChart, type BarRow } from './charts/BarChart'
import { monthLabel, money } from './format'
import { Block } from './Overview'
import { RANGES } from './stats-params'

const RANGE_LABEL: Record<WasteRange, string> = {
  week: 'Week',
  month: 'Month',
  year: 'Year',
  all: 'All',
}
const RANGE_OPTIONS = RANGES.map((id) => ({ id, label: RANGE_LABEL[id] }))
const ALL_CATEGORIES = 'all'
const MAX_MONTHS = 12

export function WasteFilters({
  range,
  categoryId,
  categories,
  onChange,
}: {
  range: WasteRange
  categoryId: number | null
  categories: readonly Category[]
  onChange: (range: WasteRange, categoryId: number | null) => void
}) {
  const options = [
    { id: ALL_CATEGORIES, label: 'All categories' },
    ...categories.map((c) => ({ id: String(c.id), label: c.name })),
  ]
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Segmented
        label="Time range"
        options={RANGE_OPTIONS}
        value={range}
        onChange={(next) => onChange(next, categoryId)}
      />
      <Select
        label="Category"
        className="min-w-48"
        options={options}
        value={categoryId === null ? ALL_CATEGORIES : String(categoryId)}
        onChange={(next) => onChange(range, next === ALL_CATEGORIES ? null : Number(next))}
      />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-3">
      <dt className="text-sm font-semibold text-muted">{label}</dt>
      <dd className="font-mono text-2xl font-extrabold text-ink tabular">{value}</dd>
    </div>
  )
}

export function WasteFigures({ waste }: { waste: StatsOverview['waste'] }) {
  const months: BarRow[] = waste.byMonth.slice(-MAX_MONTHS).map((m) => ({
    key: m.month,
    label: monthLabel(m.month),
    value: m.valueLost,
    count: m.itemsWasted,
  }))
  const categories: BarRow[] = waste.byCategory.map((c) => ({
    key: String(c.categoryId ?? 'none'),
    label: c.categoryName ?? NO_CATEGORY,
    value: c.valueLost,
    count: c.itemsWasted,
  }))
  const top = (
    title: string,
    rows: StatsOverview['waste']['mostWastedByCount'],
    by: 'count' | 'value',
  ) => (
    <Block title={title}>
      {rows.length === 0 ? (
        <p className="text-md text-muted">Nothing wasted in this range.</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {rows.map((row) => (
            <li key={row.itemName} className="flex justify-between text-base">
              <span className="font-semibold text-ink">{row.itemName}</span>
              <span className="font-mono text-muted tabular">
                {by === 'count' ? `×${row.timesWasted}` : money(row.totalValue)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Block>
  )
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-2">
        <Stat label="Items wasted" value={String(waste.totalItems)} />
        <Stat label="Value lost" value={money(waste.totalValue)} />
      </dl>
      <div className="grid gap-3 md:grid-cols-2">
        <BarChart
          title="Waste by month"
          labelHeading="Month"
          valueHeading="Value lost"
          rows={months}
        />
        <BarChart
          title="Waste by category"
          labelHeading="Category"
          valueHeading="Value lost"
          rows={categories}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {top('Most wasted by count', waste.mostWastedByCount, 'count')}
        {top('Most wasted by value', waste.mostWastedByValue, 'value')}
      </div>
    </div>
  )
}
