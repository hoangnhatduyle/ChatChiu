// Inline stroke icons (architecture.md §4). Paths from the approved prototype plus a few UI glyphs.
// Decorative by default (aria-hidden); pass `label` when the icon is the only thing saying something.

const PATHS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10',
  cart: 'M3 4h2l2.4 11h11l2-8H6.2 M9 20h.01 M18 20h.01',
  calendar: 'M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4',
  book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z M5 17a3 3 0 0 1 3-3h11',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  chart: 'M4 20V11 M10 20V5 M16 20v-6 M21 20H3',
  settings: 'M4 6h9 M17 6h3 M4 12h3 M11 12h9 M4 18h11 M19 18h1 M15 4v4 M9 10v4 M17 16v4',
  fridge: 'M6 3h12v18H6z M6 10h12 M9 6v2 M9 13v3',
  snow: 'M12 3v18 M4.2 7.5l15.6 9 M4.2 16.5l15.6-9',
  jar: 'M8 3h8v3H8z M7 6h10a1 1 0 0 1 1 1v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7a1 1 0 0 1 1-1z',
  bowl: 'M3 11h18a9 9 0 0 1-18 0z M8 7c0-2 2-2 2-4 M13 7c0-2 2-2 2-4',
  pin: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z M12 7.5a2 2 0 1 0 0 4a2 2 0 1 0 0-4',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14 M20 20l-4-4',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3 M16 4h3a1 1 0 0 1 1 1v3 M20 16v3a1 1 0 0 1-1 1h-3 M8 20H5a1 1 0 0 1-1-1v-3 M7 12h10',
  plus: 'M12 5v14 M5 12h14',
  close: 'M6 6l12 12 M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  clock: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17 M12 7.5V12l3 2',
  alert: 'M12 3.5l9 16H3z M12 10v4 M12 17h.01',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-left': 'M15 6l-6 6 6 6',
  'chevron-right': 'M9 6l6 6-6 6',
  undo: 'M9 14L4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7 M20 5v6h-6',
} as const

export type IconName = keyof typeof PATHS

export type IconProps = {
  name: IconName
  /** Pixel size of the square icon. */
  size?: number
  /** Accessible name; omit for decorative icons. */
  label?: string
  strokeWidth?: number
  className?: string
}

export function Icon({ name, size = 20, label, strokeWidth = 2, className }: IconProps) {
  const a11y = label
    ? { role: 'img', 'aria-label': label }
    : { 'aria-hidden': true as const, focusable: 'false' as const }
  return (
    <svg
      {...a11y}
      data-icon={name}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ? `shrink-0 ${className}` : 'shrink-0'}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
