// The next two weeks (F-ST-09): one cell per day with how many items run out of date, a dot for each kind of food
// and today marked. The number is written in every cell and read out ("Fri 20 Nov, 2 items"), so the dots are only
// decoration. Computed here from the items the board already holds, with the domain's `expiryStrip`.
import type { InventoryItem } from '@chatchiu/contracts'
import { expiryStrip } from '@chatchiu/domain'
import { CategoryDot } from '../../ui/CategoryStyle'
import { cx } from '../../ui/cx'
import { Block } from './Block'
import { dayLabel } from './format'

/** The most dots in a cell; the number says the rest. */
const MAX_DOTS = 3

export function ExpiryStrip({
  items,
  today,
  colourOf,
  className,
}: {
  items: readonly InventoryItem[]
  today: string
  colourOf: (categoryId: number) => string | null | undefined
  className?: string
}) {
  const days = expiryStrip(items, today)
  return (
    <Block
      title="The next two weeks"
      lead="Items that run out of date each day. Today is marked."
      className={className}
    >
      <ol className="grid grid-cols-7 gap-1.5">
        {days.map((day) => {
          const [weekday = '', dayOfMonth = ''] = dayLabel(day.date).split(' ')
          const isToday = day.date === today
          return (
            <li
              key={day.date}
              aria-current={isToday ? 'date' : undefined}
              className={cx(
                'flex min-h-20 flex-col items-center gap-0.5 rounded-control border px-1 py-1.5 text-center',
                isToday
                  ? 'border-2 border-accent bg-tint-teal text-tint-teal-ink'
                  : 'border-line bg-bg',
              )}
            >
              <span aria-hidden="true" className="text-xs font-semibold text-muted">
                {weekday}
              </span>
              <span aria-hidden="true" className="text-md font-bold tabular">
                {dayOfMonth}
              </span>
              <span aria-hidden="true" className="text-md font-extrabold tabular">
                {day.count > 0 ? day.count : '·'}
              </span>
              <span aria-hidden="true" className="flex h-2 items-center gap-0.5">
                {day.categoryIds.slice(0, MAX_DOTS).map((id) => (
                  <CategoryDot key={id} colour={colourOf(id)} className="size-1.5" />
                ))}
              </span>
              <span className="sr-only">
                {dayLabel(day.date)}, {day.count} {day.count === 1 ? 'item' : 'items'}
                {isToday ? ', today' : ''}
              </span>
            </li>
          )
        })}
      </ol>
    </Block>
  )
}
