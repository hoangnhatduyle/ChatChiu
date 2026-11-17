// Navigation model (SPEC-AP-001 F-AP-02, decision 5c2a7d16): six destinations on the tablet rail;
// on the phone four tabs plus More, which lists Waste & Stats and Settings.
import type { IconName } from '../ui/Icon'

export type Destination = {
  path: string
  /** Short nav label (fits the 84 px rail). */
  label: string
  /** Page title (h1 and document title). */
  title: string
  icon: IconName
}

export const DESTINATIONS = [
  { path: '/', label: 'Kitchen', title: 'Kitchen', icon: 'home' },
  { path: '/stock', label: 'Stock', title: 'Stock', icon: 'box' },
  { path: '/shopping', label: 'Shopping', title: 'Shopping', icon: 'cart' },
  { path: '/meals', label: 'Meals', title: 'Meals', icon: 'calendar' },
  { path: '/stats', label: 'Stats', title: 'Waste & Stats', icon: 'chart' },
  { path: '/settings', label: 'Settings', title: 'Settings', icon: 'settings' },
] as const satisfies ReadonlyArray<Destination>

export type PhoneTab = Destination & {
  /** Other paths on which this tab is the current one. */ also: readonly string[]
}

const [kitchen, stock, shopping, meals, stats, settings] = DESTINATIONS

export const MORE: PhoneTab = {
  path: '/more',
  label: 'More',
  title: 'More',
  icon: 'more',
  also: [stats.path, settings.path],
}

export const PHONE_TABS: ReadonlyArray<PhoneTab> = [
  { ...kitchen, also: [] },
  { ...stock, also: [] },
  { ...shopping, also: [] },
  { ...meals, also: [] },
  MORE,
]

/** Destinations listed on the More page. */
export const MORE_LINKS: ReadonlyArray<Destination> = [stats, settings]

/**
 * The nav item's aria-current for `path`: "page" when it is the current page, "true" when it only
 * leads to it (More on /stats), otherwise undefined. Case-insensitive like the router; `/` only
 * matches exactly.
 */
export function currentState(
  item: { path: string; also?: readonly string[] },
  path: string,
): 'page' | 'true' | undefined {
  const here = path.toLowerCase().replace(/\/+$/, '') || '/'
  const matches = (p: string) => (p === '/' ? here === '/' : here === p || here.startsWith(`${p}/`))
  if (matches(item.path)) return 'page'
  return (item.also ?? []).some(matches) ? 'true' : undefined
}
