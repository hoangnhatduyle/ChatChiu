// Choices for the reminder settings: IANA time zones (the browser's own list, always including hers) and hours.
export function timeZoneOptions(current: string): string[] {
  const all = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  const zones = all.includes(current) ? all : [current, ...all]
  return zones.includes('UTC') ? zones : [...zones, 'UTC']
}

/** "9:00 AM" for hour 9, in the device's way of writing times. */
export function hourLabel(hour: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2000, 0, 1, hour)))
}
