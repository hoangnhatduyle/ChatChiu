// The words of a reminder, shared by the server's send job and the Fire's on-device schedule (AR-ONE-DEFINITION).
import { describe, expect, it } from 'vitest'
import { cleanName, expiryReminder, lowStockReminder, nameList } from './reminder-text.js'

describe('reminder text', () => {
  it('expiry: one item and several items, with the list url and a per-day tag', () => {
    expect(expiryReminder(['Milk'], '2026-11-18')).toEqual({
      title: 'Item expiring soon',
      body: 'Milk expires soon',
      url: '/stock?status=expiring',
      tag: 'expiring-2026-11-18',
    })
    expect(expiryReminder(['A', 'B', 'C'], '2026-11-18')).toMatchObject({
      title: '3 items expiring soon',
      body: 'A, B, C',
    })
  })
  it('low stock: one and several', () => {
    expect(lowStockReminder(['Butter'])).toMatchObject({
      title: 'Running low',
      body: 'Butter is running low',
      url: '/',
      tag: 'low-stock',
    })
    expect(lowStockReminder(['A', 'B'])).toMatchObject({ title: '2 items running low' })
  })
  it('names are plain and bounded: "A, B, C and 2 more", control characters removed, 60 characters at most', () => {
    expect(nameList(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C and 2 more')
    expect(cleanName('Mi\u0000lk\n')).toBe('Mi lk')
    expect(cleanName('x'.repeat(100))).toHaveLength(60)
  })
})
