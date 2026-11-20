// The pieces of the Summary tab (F-MP-10): coloured number tiles, the meal-type split, ranked top meals and the
// month chart. Colour carries one meaning each: a tile is one kind of number, a meal type keeps the tint it has in
// the week, and every bar is the accent. Each chart is drawn for the eye and written out for a screen reader.
import type { MealTypeKey } from '@chatchiu/domain'
import { useId, type ReactNode } from 'react'
import { cx } from '../../ui/cx'
import { MEAL_TYPE_LABEL, monthLabel, monthShortLabel } from './format'
import { MEAL_DOT } from './meal-style'

const PERCENT = 100
const MIN_BAR_PERCENT = 4
// A column also holds its count above and its month below, so the bar may use this share of the chart's height.
const BAR_SHARE = 0.62

export function StatTile({
  label,
  value,
  note,
  tone,
  fill,
}: {
  label: string
  value: string
  note: string
  tone: string
  /** 0–100: draws a thin bar under the note. */
  fill?: number
}) {
  return (
    <div className={cx('flex flex-col gap-0.5 rounded-tile px-4 py-3.5', tone)}>
      <dt className="text-md font-bold">{label}</dt>
      <dd className="font-display text-tile font-extrabold tabular">{value}</dd>
      <dd className="text-sm font-semibold">{note}</dd>
      {fill !== undefined && (
        <dd aria-hidden="true" className="mt-1.5 h-1.5 rounded-pill bg-surface/60">
          <span
            className="block h-full rounded-pill bg-current"
            style={{ width: `${Math.min(PERCENT, fill)}%` }}
          />
        </dd>
      )}
    </div>
  )
}

export function Block({
  title,
  hint,
  children,
  className,
}: {
  title: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  const headingId = useId()
  return (
    <section
      aria-labelledby={headingId}
      className={cx('rounded-card border border-line bg-surface p-4 shadow-card', className)}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 id={headingId} className="font-display text-lg font-bold text-ink">
          {title}
        </h3>
        {hint && <span className="text-sm text-muted">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

/** Breakfast, lunch and dinner as one bar split by how many of each, with the numbers written under it. */
export function MealTypeSplit({ counts }: { counts: Record<MealTypeKey, number> }) {
  const types = ['breakfast', 'lunch', 'dinner'] as const
  const total = types.reduce((sum, type) => sum + counts[type], 0)
  return (
    <div className="flex flex-col gap-3">
      <div aria-hidden="true" className="flex h-3.5 gap-0.5 overflow-hidden rounded-pill bg-track">
        {types
          .filter((type) => counts[type] > 0)
          .map((type) => (
            <span
              key={type}
              className={cx('h-full', MEAL_DOT[type])}
              style={{ width: `${(counts[type] / total) * PERCENT}%` }}
            />
          ))}
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {types.map((type) => (
          <li key={type} className="flex flex-col">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-muted">
              <span aria-hidden="true" className={cx('size-2.5 rounded-pill', MEAL_DOT[type])} />
              {MEAL_TYPE_LABEL[type]}
            </span>
            <span className="font-display text-xl font-extrabold text-ink tabular">
              {counts[type]}
              <span className="ml-1.5 text-sm font-semibold text-muted">
                {total === 0 ? 0 : Math.round((counts[type] / total) * PERCENT)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The meals she cooks most, numbered, each with a bar as long as its count. */
export function TopMeals({ meals }: { meals: ReadonlyArray<{ name: string; count: number }> }) {
  const most = Math.max(1, ...meals.map((m) => m.count))
  return (
    <ol className="flex flex-col gap-2.5">
      {meals.map((m, index) => (
        <li key={m.name} className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-7 shrink-0 items-center justify-center rounded-control bg-tint-teal text-sm font-extrabold text-tint-teal-ink tabular"
          >
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-base font-semibold text-ink">{m.name}</span>
              <span className="text-sm font-bold text-muted tabular">×{m.count}</span>
            </div>
            <div aria-hidden="true" className="mt-1 h-1.5 rounded-pill bg-track">
              <div
                className="h-full rounded-pill bg-fill"
                style={{ width: `${(m.count / most) * PERCENT}%` }}
              />
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

/** One column per month, as tall as its meals; this month is the solid one. */
export function MonthChart({
  months,
  thisMonth,
}: {
  months: ReadonlyArray<{ month: string; count: number }>
  /** "2026-11" */
  thisMonth: string
}) {
  const most = Math.max(1, ...months.map((m) => m.count))
  return (
    <ul className="flex h-48 items-end gap-2 overflow-x-auto pb-1">
      {months.map((m, index) => {
        const first = `${m.month}-01`
        const showYear = index === 0 || m.month.endsWith('-01')
        return (
          <li
            key={m.month}
            className="flex h-full min-w-11 flex-1 flex-col items-center justify-end gap-1"
          >
            <span className="sr-only">
              {monthLabel(first)}: {m.count} {m.count === 1 ? 'meal' : 'meals'}
            </span>
            <span aria-hidden="true" className="text-sm font-bold text-ink tabular">
              {m.count}
            </span>
            <span
              aria-hidden="true"
              className={cx(
                'w-full max-w-14 flex-none rounded-t-control',
                m.month === thisMonth ? 'bg-accent' : 'bg-accent/45',
              )}
              style={{
                height: `${Math.max(MIN_BAR_PERCENT, (m.count / most) * 100) * BAR_SHARE}%`,
              }}
            />
            <span aria-hidden="true" className="text-xs font-semibold text-muted">
              {monthShortLabel(first)}
              {showYear && <span className="block text-2xs">{m.month.slice(0, 4)}</span>}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
