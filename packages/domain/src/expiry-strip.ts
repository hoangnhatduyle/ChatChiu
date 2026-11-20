// The next two weeks of expiry dates, one cell per day (F-ST-09): how many items run out of date that day and in
// which categories. Items already past their date and items further away are not in it. Pure.
import { addDays, daysBetween } from './dates.js'

export const EXPIRY_STRIP_DAYS = 14

export interface StripItem {
  expirationDate: string
  categoryId: number
}

export interface StripDay {
  date: string
  count: number
  /** Each category once, in the order its items were met. */
  categoryIds: number[]
}

export function expiryStrip(
  items: ReadonlyArray<StripItem>,
  today: string,
  days: number = EXPIRY_STRIP_DAYS,
): StripDay[] {
  const strip: StripDay[] = Array.from({ length: days }, (_, offset) => ({
    date: addDays(today, offset),
    count: 0,
    categoryIds: [],
  }))
  for (const item of items) {
    const offset = daysBetween(today, item.expirationDate)
    const day = offset >= 0 && offset < days ? strip[offset] : undefined
    if (!day) continue
    day.count += 1
    if (!day.categoryIds.includes(item.categoryId)) day.categoryIds.push(item.categoryId)
  }
  return strip
}
