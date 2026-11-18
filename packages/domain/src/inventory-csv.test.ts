// SPEC-SE-001 F-SE-04: the inventory CSV keeps the old export's columns.
import { describe, expect, it } from 'vitest'
import { buildInventoryCsv } from './inventory-csv.js'

const item = (over: Record<string, unknown> = {}) => ({
  name: 'Milk',
  categoryId: 1,
  quantity: 2,
  unit: 'L',
  expirationDate: '2026-11-20',
  notes: null,
  ...over,
})
const names = (id: number | null) => (id === 1 ? 'Dairy' : '')

describe('buildInventoryCsv', () => {
  it('F-SE-04: has the old header and one quoted row per item, with the category name', () => {
    const csv = buildInventoryCsv([item()], names)
    expect(csv.split('\r\n')).toEqual([
      'Name,Category,Quantity,Unit,Expiration,Notes',
      '"Milk","Dairy","2","L","2026-11-20",""',
    ])
  })

  it('F-SE-04: doubles quotes and defuses spreadsheet formulas', () => {
    const csv = buildInventoryCsv([item({ name: '=SUM(A1)', notes: 'the "good" one' })], names)
    expect(csv).toContain(`"'=SUM(A1)"`)
    expect(csv).toContain('"the ""good"" one"')
  })

  it('F-SE-04: a tab or carriage return in front of a formula is defused too', () => {
    const csv = buildInventoryCsv([item({ name: '\t=1+1', notes: '\r@x' })], names)
    expect(csv).toContain(`"'\t=1+1"`)
    expect(csv).toContain(`"'\r@x"`)
  })

  it('F-SE-04: an empty inventory is just the header', () => {
    expect(buildInventoryCsv([], names)).toBe('Name,Category,Quantity,Unit,Expiration,Notes')
  })
})
