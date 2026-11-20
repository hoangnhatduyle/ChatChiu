// Running low (F-ST-06): each item with its percent left (the server's, never an amount compared with a threshold),
// a small meter, its amount, and how long it should last at her pace.
import type { RunOutRow } from '@chatchiu/contracts'
import { Block } from './Block'
import { amount, dayLabel } from './format'

export function RunningLowList({
  rows,
  className,
}: {
  rows: readonly RunOutRow[]
  className?: string
}) {
  return (
    <Block
      title="Running low"
      lead="With how long it should last at your pace."
      className={className}
    >
      {rows.length === 0 ? (
        <p className="text-md text-muted">Nothing is running low.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
              <span className="text-base font-bold text-ink">{row.name}</span>
              <span className="text-md text-ink">
                <span className="font-bold tabular">{Math.round(row.percentLeft)}% left</span>
                <span className="text-muted">
                  {' '}
                  · {amount(row.currentQuantity)} of {amount(row.initialQuantity)} {row.unit}
                </span>
              </span>
              <span aria-hidden="true" className="mt-1 block h-1.5 w-full rounded-pill bg-track">
                <span
                  className="block h-full rounded-pill bg-low"
                  style={{ width: `${Math.max(2, Math.min(100, row.percentLeft))}%` }}
                />
              </span>
              <span className="w-full pt-1 text-sm text-muted">
                {row.avgDailyUse !== null && row.runOutDate !== null
                  ? `${amount(row.avgDailyUse)} ${row.unit} a day · runs out ${dayLabel(row.runOutDate)}`
                  : 'No usage history yet'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Block>
  )
}
