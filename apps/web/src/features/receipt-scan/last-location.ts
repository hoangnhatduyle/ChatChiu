// Her last-used location for scanned items (F-RS-06). Only an id that is still one of her locations is used:
// a stale or invented value is ignored, never replaced by a fixed id (NC-RS-NO-HARDCODED-LOCATION).
export const LAST_LOCATION_KEY = 'chatchiu.receipt-scan.last-location'

export function readLastLocation(locationIds: readonly number[]): number | null {
  try {
    const id = Number(window.localStorage.getItem(LAST_LOCATION_KEY))
    return Number.isInteger(id) && locationIds.includes(id) ? id : null
  } catch {
    return null
  }
}

export function rememberLocation(id: number): void {
  try {
    window.localStorage.setItem(LAST_LOCATION_KEY, String(id))
  } catch {
    // Storage can be blocked (private window): the next scan just asks again.
  }
}
