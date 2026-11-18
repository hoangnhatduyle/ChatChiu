// SPEC-NT-001 F-NT-01 (the Fire shows the same reminder), F-NT-02 (her local day and hour) and NC-NT-NO-DUPLICATES
// (one expiry reminder per local day): what the on-device schedule holds.
import { describe, expect, it } from 'vitest'
import {
  planLocalReminders,
  zonedInstant,
  type ScheduleItem,
  type SchedulePrefs,
} from './local-schedule.js'

const item = (
  id: number,
  name: string,
  expirationDate: string | null,
  over: Partial<ScheduleItem> = {},
): ScheduleItem => ({
  id,
  name,
  expirationDate,
  notificationEnabled: true,
  notificationDaysBefore: 3,
  ...over,
})
const TORONTO: SchedulePrefs = { timezone: 'America/Toronto', notifyHour: 9, expiryAlerts: true }
/** 00:30 local on 2026-11-18 in Toronto (UTC-5). */
const MIDNIGHT = new Date('2026-11-18T05:30:00Z')

describe('zonedInstant', () => {
  it('F-NT-02: 9:00 in Toronto is 14:00 UTC in winter and 13:00 UTC in summer time', () => {
    expect(zonedInstant('2026-11-18', 9, 'America/Toronto').toISOString()).toBe(
      '2026-11-18T14:00:00.000Z',
    )
    expect(zonedInstant('2026-07-01', 9, 'America/Toronto').toISOString()).toBe(
      '2026-07-01T13:00:00.000Z',
    )
  })
  it('follows the clock change itself (summer time ends on 2026-11-01)', () => {
    expect(zonedInstant('2026-10-31', 9, 'America/Toronto').toISOString()).toBe(
      '2026-10-31T13:00:00.000Z',
    )
    expect(zonedInstant('2026-11-02', 9, 'America/Toronto').toISOString()).toBe(
      '2026-11-02T14:00:00.000Z',
    )
  })
  it('a notify hour inside the skipped spring-forward hour fires just after the gap, never an hour early', () => {
    // 2026-03-08 02:00 does not exist in Toronto (02:00 EST jumps to 03:00 EDT = 07:00Z).
    expect(zonedInstant('2026-03-08', 2, 'America/Toronto').toISOString()).toBe(
      '2026-03-08T07:00:00.000Z',
    )
    // Berlin skips 02:00 on 2026-03-29 (01:00Z -> 03:00 CEST).
    expect(zonedInstant('2026-03-29', 2, 'Europe/Berlin').toISOString()).toBe(
      '2026-03-29T01:00:00.000Z',
    )
  })
  it('works for a zone ahead of UTC', () => {
    expect(zonedInstant('2026-11-18', 9, 'Asia/Ho_Chi_Minh').toISOString()).toBe(
      '2026-11-18T02:00:00.000Z',
    )
  })
})

describe('planLocalReminders', () => {
  it('F-NT-01: three items in their window give ONE grouped reminder per day, at her hour, opening the expiring list', () => {
    const items = [
      item(1, 'Milk', '2026-11-20'),
      item(2, 'Eggs', '2026-11-20'),
      item(3, 'Butter', '2026-11-21'),
    ]
    const plan = planLocalReminders(items, TORONTO, MIDNIGHT)
    const first = plan[0]!
    expect(first.at).toBe('2026-11-18T14:00:00.000Z')
    expect(first.title).toBe('3 items expiring soon')
    expect(first.body).toBe('Milk, Eggs, Butter')
    expect(first.url).toBe('/stock?status=expiring')
    expect(first.tag).toBe('expiring-2026-11-18')
    // Still all three on Nov 19; on Nov 21 Milk and Eggs are past, so only Butter is left.
    expect(plan.find((r) => r.tag === 'expiring-2026-11-19')?.title).toBe('3 items expiring soon')
    expect(plan.find((r) => r.tag === 'expiring-2026-11-21')?.title).toBe('Item expiring soon')
  })

  it('NC-NT-NO-DUPLICATES: never more than one reminder per local day, each with its own id', () => {
    const items = Array.from({ length: 6 }, (_, i) => item(i + 1, `Item ${i + 1}`, '2026-11-22'))
    const plan = planLocalReminders(items, TORONTO, MIDNIGHT)
    expect(new Set(plan.map((r) => r.tag)).size).toBe(plan.length)
    expect(new Set(plan.map((r) => r.id)).size).toBe(plan.length)
  })

  it('F-NT-02: just before local midnight "today" is still the local date, so nothing is dated a day early', () => {
    const lateNight = new Date('2026-11-19T04:59:00Z') // 23:59 on Nov 18 in Toronto
    const plan = planLocalReminders([item(1, 'Milk', '2026-11-19')], TORONTO, lateNight)
    expect(plan.map((r) => r.tag)).toEqual(['expiring-2026-11-19'])
    expect(plan[0]!.at).toBe('2026-11-19T14:00:00.000Z')
  })

  it('a reminder whose time has already passed today is not scheduled', () => {
    const afterNine = new Date('2026-11-18T15:00:00Z') // 10:00 local
    const plan = planLocalReminders([item(1, 'Milk', '2026-11-20')], TORONTO, afterNine)
    expect(plan.map((r) => r.tag)).not.toContain('expiring-2026-11-18')
    expect(plan.map((r) => r.tag)).toContain('expiring-2026-11-19')
  })

  it('leaves out items with reminders off, no date, already expired, or beyond their days-before window', () => {
    const items = [
      item(1, 'Off', '2026-11-20', { notificationEnabled: false }),
      item(2, 'No date', null),
      item(3, 'Expired', '2026-11-10'),
      item(4, 'Far', '2026-12-25'),
    ]
    const plan = planLocalReminders(items, TORONTO, MIDNIGHT, 5)
    expect(plan).toEqual([])
  })

  it("uses each item's own days-before, defaulting to 3", () => {
    const plan = planLocalReminders(
      [
        item(1, 'Early', '2026-11-25', { notificationDaysBefore: 7 }),
        item(2, 'Default', '2026-11-25', { notificationDaysBefore: null }),
      ],
      TORONTO,
      MIDNIGHT,
    )
    expect(plan.find((r) => r.tag === 'expiring-2026-11-18')?.body).toBe('Early expires soon')
    expect(plan.find((r) => r.tag === 'expiring-2026-11-22')?.body).toBe('Early, Default')
  })

  it('schedules nothing when expiry alerts are off', () => {
    expect(
      planLocalReminders(
        [item(1, 'Milk', '2026-11-20')],
        { ...TORONTO, expiryAlerts: false },
        MIDNIGHT,
      ),
    ).toEqual([])
  })

  it('only looks as far ahead as the horizon', () => {
    const plan = planLocalReminders(
      [item(1, 'Milk', '2026-12-30', { notificationDaysBefore: 60 })],
      TORONTO,
      MIDNIGHT,
      3,
    )
    expect(plan).toHaveLength(3)
  })
})
