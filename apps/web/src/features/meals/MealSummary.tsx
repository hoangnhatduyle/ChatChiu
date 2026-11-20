// Summary numbers (F-MP-10): the same figures as the old getSummary(), computed by the domain's
// mealSummary(), laid out as tiles, two charts, a ranked list and the meals she liked and ate lately. Tapping a
// meal opens its edit. The pieces live in SummaryParts.tsx.
import type { MealPlan } from '@chatchiu/contracts'
import { mealSummary } from '@chatchiu/domain'
import { dayLabel, MEAL_TYPE_LABEL, monthKey } from './format'
import { MEAL_DOT } from './meal-style'
import { cx } from '../../ui/cx'
import { Block, MealTypeSplit, MonthChart, StatTile, TopMeals } from './SummaryParts'

// The old getSummary() counts slots from the first plan to today, so plans planned ahead can exceed 100%; the number is kept, the display is capped.
const PERCENT = 100
const SLOTS_IN_WEEK = 21

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
  const completion = Math.min(PERCENT, Math.round(s.completionRate * PERCENT))
  const row = (plan: MealPlan) => (
    <button
      type="button"
      aria-label={`${plan.mealName}, ${plan.mealType}, ${dayLabel(plan.planDate)}`}
      onClick={() => onOpen(plan)}
      className="flex min-h-touch w-full cursor-pointer items-center gap-3 rounded-control px-2 text-left outline-none hover:bg-hover focus-visible:outline-2"
    >
      <span
        aria-hidden="true"
        className={cx('size-2.5 shrink-0 rounded-pill', MEAL_DOT[plan.mealType])}
      />
      <span className="min-w-0 flex-1 truncate text-base font-semibold text-ink">
        {plan.isFavorite && (
          <span aria-hidden="true" className="mr-1 text-tint-amber-ink">
            ★
          </span>
        )}
        {plan.mealName}
      </span>
      <span className="shrink-0 text-sm text-muted">
        {MEAL_TYPE_LABEL[plan.mealType]} · {dayLabel(plan.planDate)}
      </span>
    </button>
  )
  if (plans.length === 0) {
    return <p className="text-md text-muted">Plan a few meals and their numbers show up here.</p>
  }
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Total meals"
          value={String(s.totalMeals)}
          note={`on ${s.daysWithPlans} ${s.daysWithPlans === 1 ? 'day' : 'days'}`}
          tone="bg-tint-teal text-tint-teal-ink"
        />
        <StatTile
          label="This week"
          value={String(s.thisWeekCount)}
          note={`of ${SLOTS_IN_WEEK} slots`}
          tone="bg-tint-amber text-tint-amber-ink"
        />
        <StatTile
          label="Streak"
          value={`${s.currentStreak} ${s.currentStreak === 1 ? 'day' : 'days'}`}
          note="planned in a row"
          tone="bg-tint-orange text-tint-orange-ink"
        />
        <StatTile
          label="Completion"
          value={`${completion}%`}
          note="of slots filled"
          tone="bg-tint-green text-tint-green-ink"
          fill={completion}
        />
      </dl>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Block title="By meal type">
            <MealTypeSplit counts={s.byMealType} />
          </Block>
          <Block title="Top meals" hint="cooked most often">
            <TopMeals meals={s.mostFrequentMeals} />
          </Block>
          <Block title="By month">
            <MonthChart months={s.monthlyBreakdown} thisMonth={monthKey(today)} />
          </Block>
        </div>
        <div className="flex flex-col gap-4">
          <Block title="Favourites">
            {s.favoriteMeals.length === 0 ? (
              <p className="text-md text-muted">No favourites yet.</p>
            ) : (
              <ul>
                {s.favoriteMeals.map((p) => (
                  <li key={p.id}>{row(p)}</li>
                ))}
              </ul>
            )}
          </Block>
          <Block title="Recent meals">
            <ul>
              {s.recentMeals.map((p) => (
                <li key={p.id}>{row(p)}</li>
              ))}
            </ul>
          </Block>
        </div>
      </div>
    </div>
  )
}
