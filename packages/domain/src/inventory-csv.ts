// The inventory CSV export (SPEC-SE-001 F-SE-04): the old export's six columns. The Category column
// holds the category's name (the old export wrote its numeric id, which no spreadsheet reader could use).

export type CsvItem = {
  name: string
  categoryId: number | null
  quantity: number
  unit: string
  expirationDate: string | null
  notes: string | null
}

export const CSV_HEADER = ['Name', 'Category', 'Quantity', 'Unit', 'Expiration', 'Notes'] as const

/** Quoted, with a leading quote on cells a spreadsheet would run as a formula (=, +, -, @, or a leading tab or carriage return). */
function cell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  const safe = /^[\t\r=+\-@]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

export function buildInventoryCsv(
  items: readonly CsvItem[],
  categoryName: (categoryId: number | null) => string,
): string {
  const rows = items.map((i) =>
    [i.name, categoryName(i.categoryId), i.quantity, i.unit, i.expirationDate, i.notes]
      .map(cell)
      .join(','),
  )
  return [CSV_HEADER.join(','), ...rows].join('\r\n')
}
