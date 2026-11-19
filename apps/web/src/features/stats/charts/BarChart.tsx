// One small bar chart (F-ST-04): one series, one hue from the theme (`fill` token, validated in both
// themes), thin bars with a rounded data end, every value written next to its bar, and the same data as a
// table on request, so nothing is carried by colour alone (NC-ST-NO-COLOUR-ONLY-CHARTS). A single series
// needs no legend: the title names it.
import { useId, useState } from 'react'
import { Button } from '../../../ui/Button'
import { money } from '../format'

export interface BarRow {
  key: string
  label: string
  /** The bar length. */
  value: number
  /** How many items the value comes from. */
  count: number
}

const MIN_BAR_PERCENT = 2

export function BarChart({
  title,
  labelHeading,
  valueHeading,
  rows,
}: {
  title: string
  /** Names what each bar is, in the table: "Month", "Category". */
  labelHeading: string
  /** Names the measure in the table, e.g. "Value lost". */
  valueHeading: string
  rows: readonly BarRow[]
}) {
  const titleId = useId()
  const [showTable, setShowTable] = useState(false)
  const max = Math.max(0, ...rows.map((r) => r.value))
  return (
    <figure aria-labelledby={titleId} className="rounded-card border border-line bg-surface p-3">
      <figcaption className="mb-2">
        <h3 id={titleId} className="text-md font-extrabold text-ink">
          {title}
        </h3>
      </figcaption>
      {rows.length === 0 ? (
        <p className="text-md text-muted">Nothing wasted in this range.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li
              key={row.key}
              className="grid grid-cols-[minmax(4.5rem,8rem)_1fr_auto] items-center gap-2"
            >
              <span className="text-md break-words text-ink">{row.label}</span>
              <span aria-hidden="true" className="h-2 rounded-r-[4px] bg-track">
                <span
                  className="block h-full rounded-r-[4px] bg-fill"
                  style={{
                    width: `${max === 0 ? 0 : Math.max(MIN_BAR_PERCENT, (row.value / max) * 100)}%`,
                  }}
                />
              </span>
              <span className="flex items-baseline gap-1.5 whitespace-nowrap">
                <span className=" text-md font-bold text-ink tabular">{money(row.value)}</span>
                <span className="text-sm text-muted">
                  {row.count} {row.count === 1 ? 'item' : 'items'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {rows.length > 0 && (
        <div className="mt-2">
          <Button
            variant="ghost"
            aria-expanded={showTable}
            onPress={() => setShowTable((open) => !open)}
          >
            {showTable ? 'Hide the table' : 'Show as a table'}
          </Button>
          {showTable && (
            <table className="mt-1 w-full text-left text-md">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr className="text-sm text-muted">
                  <th scope="col" className="py-1 font-semibold">
                    {labelHeading}
                  </th>
                  <th scope="col" className="py-1 text-right font-semibold">
                    Items
                  </th>
                  <th scope="col" className="py-1 text-right font-semibold">
                    {valueHeading}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-t border-line">
                    <th scope="row" className="py-1 font-normal">
                      {row.label}
                    </th>
                    <td className="py-1 text-right tabular">{row.count}</td>
                    <td className="py-1 text-right tabular">{money(row.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </figure>
  )
}
