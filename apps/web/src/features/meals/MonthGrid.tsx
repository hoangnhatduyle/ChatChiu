// The month (F-MP-02): one cell per day with how many meals are planned; tapping a day opens the weekly
// view on that day's week. Days of the neighbouring months that complete the first and last week are dimmed.
import type { MealPlan } from '@chatchiu/contracts'
import { monthWeeks } from '@chatchiu/domain'
import { cx } from '../../ui/cx'
import { dayLabel, dayOfMonth, monthKey } from './format'
import { MEAL_DOT } from './meal-style'

const WEEKDAY_HEADS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export function MonthGrid({
  date,
  today,
  plans,
  onPickDay,
}: {
  date: string
  today: string
  plans: readonly MealPlan[]
  onPickDay: (day: string) => void
}) {
  const counts = new Map<string, number>()
  const types = new Map<string, Set<string>>()
  for (const p of plans) {
    counts.set(p.planDate, (counts.get(p.planDate) ?? 0) + 1)
    types.set(p.planDate, (types.get(p.planDate) ?? new Set()).add(p.mealType))
  }
  const month = monthKey(date)
  return (
    <div role="group" aria-label="Month" className="grid grid-cols-7 gap-1">
      {WEEKDAY_HEADS.map((d) => (
        <p key={d} aria-hidden="true" className="px-1 text-center text-sm font-semibold text-muted">
          {d}
        </p>
      ))}
      {monthWeeks(date)
        .flat()
        .map((day) => {
          const count = counts.get(day) ?? 0
          const label =
            count > 0
              ? `${dayLabel(day)}, ${count} ${count === 1 ? 'meal' : 'meals'}`
              : dayLabel(day)
          return (
            <button
              key={day}
              type="button"
              aria-label={label}
              aria-current={day === today ? 'date' : undefined}
              onClick={() => onPickDay(day)}
              className={cx(
                'flex min-h-16 cursor-pointer flex-col items-start justify-between rounded-control border p-1.5',
                'text-left outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2',
                day === today ? 'border-2 border-accent bg-tint-teal text-ink' : 'border-line',
                day !== today &&
                  (monthKey(day) === month ? 'bg-surface text-ink' : 'bg-transparent text-muted'),
              )}
            >
              <span
                className={cx(
                  'text-md font-bold',
                  day === today && 'rounded-pill bg-accent px-2 text-accent-ink',
                )}
              >
                {dayOfMonth(day)}
                {day === today && <span className="sr-only">, today</span>}
              </span>
              {count > 0 && (
                <span aria-hidden="true" className="flex items-center gap-1">
                  {(['breakfast', 'lunch', 'dinner'] as const)
                    .filter((type) => types.get(day)?.has(type))
                    .map((type) => (
                      <span key={type} className={cx('size-2 rounded-pill', MEAL_DOT[type])} />
                    ))}
                  <span className="ml-0.5 text-sm font-bold tabular">{count}</span>
                </span>
              )}
            </button>
          )
        })}
    </div>
  )
}
