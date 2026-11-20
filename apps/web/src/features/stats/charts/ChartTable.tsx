// The same figures as a chart, as a plain table (NC-ST-NO-COLOUR-ONLY-CHARTS): behind a "Show as a table" button
// under each chart, so nothing is carried by a drawing alone. Used by the bar charts and the stock-value ring.
import { useState } from 'react'
import { Button } from '../../../ui/Button'
import { money } from '../format'

export interface TableRow {
  key: string
  label: string
  value: number
  count: number
}

export function ChartTable({
  title,
  labelHeading,
  valueHeading,
  rows,
}: {
  title: string
  /** Names what each row is: "Month", "Category". */
  labelHeading: string
  /** Names the measure: "Value lost", "Value". */
  valueHeading: string
  rows: readonly TableRow[]
}) {
  const [showTable, setShowTable] = useState(false)
  if (rows.length === 0) return null
  return (
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
  )
}
