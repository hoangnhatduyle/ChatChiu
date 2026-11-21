// The next two weeks (F-ST-09): one cell per day with how many items run out of date, a dot for each kind of food
// and today marked. A day with items is a button: pressing it lists those items under the strip, pressing it again
// closes the list. The number is written in every cell and read out ("Fri 20 Nov, 2 items"), so the dots are only
// decoration. Computed here from the items the board already holds, with the domain's `expiryStrip`.
import type { InventoryItem, Location } from '@chatchiu/contracts'
import { expiryStrip, getRemainingQuantity } from '@chatchiu/domain'
import { useState } from 'react'
import { CategoryDot } from '../../ui/CategoryStyle'
import { cx } from '../../ui/cx'
import { Block } from './Block'
import { amount, dayLabel } from './format'

/** The most dots in a cell; the number says the rest. */
const MAX_DOTS = 3

const itemsWord = (count: number) => `${count} ${count === 1 ? 'item' : 'items'}`

export function ExpiryStrip({
  items,
  locations,
  today,
  colourOf,
  className,
}: {
  items: readonly InventoryItem[]
  locations: readonly Location[]
  today: string
  colourOf: (categoryId: number) => string | null | undefined
  className?: string
}) {
  const [picked, setPicked] = useState<string | null>(null)
  const days = expiryStrip(items, today)
  const pickedDay = days.find((d) => d.date === picked && d.count > 0)
  const pickedItems = pickedDay ? items.filter((i) => i.expirationDate === pickedDay.date) : []
  const placeOf = (item: InventoryItem) => locations.find((l) => l.id === item.locationId)?.name
  return (
    <Block
      title="The next two weeks"
      lead="Items that run out of date each day. Press a day to see which."
      className={className}
    >
      <ol className="grid grid-cols-7 gap-1.5">
        {days.map((day) => {
          const [weekday = '', dayOfMonth = ''] = dayLabel(day.date).split(' ')
          const isToday = day.date === today
          const isPicked = pickedDay?.date === day.date
          const cell = cx(
            'flex min-h-20 w-full flex-col items-center gap-0.5 rounded-control border px-1 py-1.5 text-center',
            isToday
              ? 'border-2 border-accent bg-tint-teal text-tint-teal-ink'
              : 'border-line bg-bg',
          )
          const content = (
            <>
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
                {dayLabel(day.date)}, {itemsWord(day.count)}
                {isToday ? ', today' : ''}
              </span>
            </>
          )
          return (
            <li key={day.date} aria-current={isToday ? 'date' : undefined}>
              {day.count > 0 ? (
                <button
                  type="button"
                  aria-pressed={isPicked}
                  onClick={() => setPicked(isPicked ? null : day.date)}
                  className={cx(
                    cell,
                    'cursor-pointer outline-none transition-transform duration-fast hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2',
                    isPicked && 'ring-2 ring-ink',
                  )}
                >
                  {content}
                </button>
              ) : (
                <div className={cell}>{content}</div>
              )}
            </li>
          )
        })}
      </ol>
      <div aria-live="polite">
        {pickedDay && (
          <div className="mt-3 rounded-control border border-line bg-bg p-3">
            <h4 className="text-md font-extrabold text-ink">
              {dayLabel(pickedDay.date)}
              {pickedDay.date === today ? ' (today)' : ''} · {itemsWord(pickedDay.count)} run out
            </h4>
            <ul className="mt-1 flex flex-col divide-y divide-line">
              {pickedItems.map((item) => (
                <li key={item.id} className="flex flex-wrap justify-between gap-x-3 py-1.5">
                  <span className="flex items-center gap-2 text-base font-semibold text-ink">
                    <CategoryDot colour={colourOf(item.categoryId)} className="size-2" />
                    {item.name}
                  </span>
                  <span className="text-md text-muted">
                    {amount(getRemainingQuantity(item))} {item.unit}
                    {placeOf(item) ? ` · ${placeOf(item)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Block>
  )
}
