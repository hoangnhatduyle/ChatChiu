// Summary numbers (F-MP-10): the same figures as the old getSummary(), computed by the domain's
// mealSummary(). Tapping a meal opens its edit.
import type { MealPlan } from '@chatchiu/contracts'
import { mealSummary } from '@chatchiu/domain'
import { useId } from 'react'
import { cx } from '../../ui/cx'
import { dayLabel, MEAL_TYPE_LABEL, monthLabel } from './format'
import { MEAL_TONE } from './meal-style'

// The old getSummary() counts slots from the first plan to today, so plans planned ahead can exceed 100%; the number is kept, the display is capped.
const PERCENT = 100

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-3">
      <dt className="text-sm font-semibold text-muted">{label}</dt>
      <dd className=" text-2xl font-extrabold text-ink tabular">{value}</dd>
    </div>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="rounded-card border border-line bg-surface p-3">
      <h3 id={headingId} className="mb-2 text-md font-extrabold text-ink">
        {title}
      </h3>
      {children}
    </section>
  )
}

export function MealSummary({
  plans,
  today,
  onOpen,
}: {
  plans: readonly MealPlan[]
  today: string
  onOpen: (plan: MealPlan) => void
}) {
  const s = mealSummary(plans, { today })
  const open = (plan: MealPlan) => (
    <button
      type="button"
      aria-label={`${plan.mealName}, ${plan.mealType}, ${dayLabel(plan.planDate)}`}
      onClick={() => onOpen(plan)}
      className="flex min-h-touch w-full cursor-pointer items-center justify-between gap-3 text-left outline-none hover:bg-hover focus-visible:outline-2"
    >
      <span className="text-base font-semibold text-ink">{plan.mealName}</span>
      <span className="text-sm text-muted">
        {MEAL_TYPE_LABEL[plan.mealType]} · {dayLabel(plan.planDate)}
      </span>
    </button>
  )
  if (plans.length === 0) {
    return <p className="text-md text-muted">Plan a few meals and their numbers show up here.</p>
  }
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Total meals" value={String(s.totalMeals)} />
        <Stat label="This week" value={String(s.thisWeekCount)} />
        <Stat
          label="Streak"
          value={`${s.currentStreak} ${s.currentStreak === 1 ? 'day' : 'days'}`}
        />
        <Stat
          label="Completion"
          value={`${Math.min(PERCENT, Math.round(s.completionRate * PERCENT))}%`}
        />
      </dl>
      <p className="flex flex-wrap gap-2 text-md font-semibold">
        {(['breakfast', 'lunch', 'dinner'] as const).map((type) => (
          <span key={type} className={cx('rounded-pill px-3 py-0.5', MEAL_TONE[type])}>
            {MEAL_TYPE_LABEL[type]} {s.byMealType[type]}
          </span>
        ))}
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <Block title="Top meals">
          <ol className="flex flex-col gap-1">
            {s.mostFrequentMeals.map((m) => (
              <li key={m.name} className="flex justify-between text-base">
                <span className="font-semibold text-ink">{m.name}</span>
                <span className=" text-muted tabular">×{m.count}</span>
              </li>
            ))}
          </ol>
        </Block>
        <Block title="Favourites">
          {s.favoriteMeals.length === 0 ? (
            <p className="text-md text-muted">No favourites yet.</p>
          ) : (
            <ul>
              {s.favoriteMeals.map((p) => (
                <li key={p.id}>{open(p)}</li>
              ))}
            </ul>
          )}
        </Block>
        <Block title="By month">
          <ul className="flex flex-col gap-1.5">
            {s.monthlyBreakdown.map((m) => (
              <li key={m.month} className="text-base">
                <div className="flex justify-between">
                  <span className="text-ink">{monthLabel(`${m.month}-01`)}</span>
                  <span className=" text-muted tabular">{m.count}</span>
                </div>
                <div aria-hidden="true" className="mt-0.5 h-1.5 rounded-pill bg-track">
                  <div
                    className="h-full rounded-pill bg-accent"
                    style={{ width: `${m.percentage}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Block>
        <Block title="Recent meals">
          <ul>
            {s.recentMeals.map((p) => (
              <li key={p.id}>{open(p)}</li>
            ))}
          </ul>
        </Block>
      </div>
    </div>
  )
}
