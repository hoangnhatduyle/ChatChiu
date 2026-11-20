// F-ST-09: the next two weeks of expiry dates, one cell per day.
import { describe, expect, it } from 'vitest'
import { expiryStrip, EXPIRY_STRIP_DAYS } from './expiry-strip.js'

const TODAY = '2030-06-10'
const item = (id: number, expirationDate: string, categoryId = 1) => ({
  id,
  expirationDate,
  categoryId,
})

describe('expiryStrip', () => {
  it('has one cell per day from today, 14 by default, in order', () => {
    const strip = expiryStrip([], TODAY)
    expect(strip).toHaveLength(EXPIRY_STRIP_DAYS)
    expect(strip[0]).toEqual({ date: '2030-06-10', count: 0, categoryIds: [] })
    expect(strip.at(-1)?.date).toBe('2030-06-23')
  })

  it('counts the items that expire on each day and lists their categories once each', () => {
    const strip = expiryStrip(
      [
        item(1, '2030-06-10', 5),
        item(2, '2030-06-10', 5),
        item(3, '2030-06-10', 7),
        item(4, '2030-06-12'),
      ],
      TODAY,
    )
    expect(strip[0]).toEqual({ date: '2030-06-10', count: 3, categoryIds: [5, 7] })
    expect(strip[2]?.count).toBe(1)
  })

  it('leaves out what is already expired and what is further away than the strip', () => {
    const strip = expiryStrip(
      [item(1, '2030-06-09'), item(2, '2030-06-24'), item(3, '2030-06-23')],
      TODAY,
    )
    expect(strip.reduce((sum, day) => sum + day.count, 0)).toBe(1)
    expect(strip.at(-1)?.count).toBe(1)
  })

  it('takes a different length, and does not change what it was given', () => {
    const items = [item(2, '2030-06-12'), item(1, '2030-06-11')]
    expect(expiryStrip(items, TODAY, 3)).toHaveLength(3)
    expect(items.map((i) => i.id)).toEqual([2, 1])
  })
})
