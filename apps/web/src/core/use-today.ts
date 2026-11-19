// The local date as a value that follows the clock (7.0.28e, 7.0.30f): a screen left open over midnight, or a
// tablet that slept through it, must not keep yesterday's expiry chips and meal week. One timer per mounted
// reader, aimed at the next local midnight; the page becoming visible checks again, because a sleeping
// device misses its timers.
import { todayLocalDateString } from '@chatchiu/domain'
import { useSyncExternalStore } from 'react'

/** Milliseconds from `now` to the next local midnight (plus a second, so the date has really changed). */
export function msUntilMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
  return next.getTime() - now.getTime()
}

function subscribe(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const arm = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      onChange()
      arm()
    }, msUntilMidnight(new Date()))
  }
  const onVisible = () => {
    onChange()
    arm()
  }
  arm()
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisible)
  }
}

export function useToday(): string {
  return useSyncExternalStore(subscribe, todayLocalDateString, todayLocalDateString)
}
