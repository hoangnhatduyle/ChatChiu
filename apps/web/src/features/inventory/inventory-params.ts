// The inventory page's state that lives in the URL and on the device (SPEC-IN-001, CS-STATE-HOMES):
// q, category, location, status, sort, group and view are search params, so Back and a refresh keep them
// (NC-IN-NO-LOST-FILTERS); the filters she used last and her card/table choice are also remembered on
// this device (F-IN-14, F-IN-05). Unknown values (a hand-edited URL, even a prototype key) fall back to
// the default instead of hiding items. Pure apart from the two small storage helpers.
import type { GroupKey, SortKey, StatusFilter } from '@chatchiu/domain'

/** Shelves (cards) is the default; the table is the second view. An old saved 'auto' reads as no choice, i.e. Shelves. */
export type ViewMode = 'cards' | 'table'

export type InventoryParams = {
  q: string
  categoryId: number | null
  locationId: number | null
  status: StatusFilter
  sort: SortKey
  group: GroupKey
  view: ViewMode | null
}

export const STATUSES: ReadonlyArray<StatusFilter> = ['all', 'expired', 'expiring', 'fresh']
export const SORTS: ReadonlyArray<SortKey> = ['expiry', 'name', 'quantity', 'recent']
export const GROUPS: ReadonlyArray<GroupKey> = ['none', 'category', 'location']
export const VIEWS: ReadonlyArray<ViewMode> = ['cards', 'table']

export const DEFAULT_STATUS: StatusFilter = 'all'
export const DEFAULT_SORT: SortKey = 'expiry'
/** Shelves: grouped by where things live. */
export const DEFAULT_GROUP: GroupKey = 'location'

const ID = /^\d+$/

function oneOf<T extends string>(allowed: ReadonlyArray<T>, value: string | null): T | null {
  return allowed.find((candidate) => candidate === value) ?? null
}
/** A positive whole id that is safe to compare ("0", "-1" and 20-digit numbers are not ids). */
const idOf = (value: string | null): number | null => {
  if (value === null || !ID.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export function parseParams(params: URLSearchParams): InventoryParams {
  return {
    q: params.get('q') ?? '',
    categoryId: idOf(params.get('category')),
    locationId: idOf(params.get('location')),
    status: oneOf(STATUSES, params.get('status')) ?? DEFAULT_STATUS,
    sort: oneOf(SORTS, params.get('sort')) ?? DEFAULT_SORT,
    group: oneOf(GROUPS, params.get('group')) ?? DEFAULT_GROUP,
    view: oneOf(VIEWS, params.get('view')),
  }
}

/** The params kept between visits: category, location, status, sort and group (not the search text). */
export const REMEMBERED_KEYS = ['category', 'location', 'status', 'sort', 'group'] as const
type RememberedKey = (typeof REMEMBERED_KEYS)[number]
export type RememberedFilters = Partial<Record<RememberedKey, string>>

/** The non-default, valid remembered values currently in the URL. */
export function rememberedFrom(params: URLSearchParams): RememberedFilters {
  const parsed = parseParams(params)
  const out: RememberedFilters = {}
  if (parsed.categoryId !== null) out.category = String(parsed.categoryId)
  if (parsed.locationId !== null) out.location = String(parsed.locationId)
  if (parsed.status !== DEFAULT_STATUS) out.status = parsed.status
  if (parsed.sort !== DEFAULT_SORT) out.sort = parsed.sort
  if (parsed.group !== DEFAULT_GROUP) out.group = parsed.group
  return out
}

/** True when the URL already says something about the filters (so nothing is restored over it). */
export const hasFilterParams = (params: URLSearchParams): boolean =>
  REMEMBERED_KEYS.some((key) => params.has(key)) || params.has('q')

export const FILTERS_STORAGE_KEY = 'chatchiu.inventory.filters'
export const VIEW_STORAGE_KEY = 'chatchiu.inventory.view'

/** Reads what was saved; anything unreadable or invalid is ignored (storage can be blocked or edited). */
export function loadRemembered(): RememberedFilters {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(FILTERS_STORAGE_KEY) ?? '{}')
    if (typeof raw !== 'object' || raw === null) return {}
    const probe = new URLSearchParams()
    for (const key of REMEMBERED_KEYS) {
      const value = (raw as Record<string, unknown>)[key]
      if (typeof value === 'string') probe.set(key, value)
    }
    return rememberedFrom(probe)
  } catch {
    // Unreadable (corrupt JSON): drop it so it is not re-parsed on every visit.
    try {
      window.localStorage.removeItem(FILTERS_STORAGE_KEY)
    } catch {
      // Storage is blocked: nothing to clean.
    }
    return {}
  }
}

export function saveRemembered(filters: RememberedFilters): void {
  try {
    window.localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters))
  } catch {
    // Storage blocked or full: the URL still holds the filters for this visit.
  }
}

export function loadView(): ViewMode | null {
  try {
    return oneOf(VIEWS, window.localStorage.getItem(VIEW_STORAGE_KEY))
  } catch {
    return null
  }
}

export function saveView(view: ViewMode): void {
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view)
  } catch {
    // Not remembered on this device; the choice still applies through the URL.
  }
}

/** A copy of `params` with one key set, or removed when the value is empty or the default. */
export function withParam(
  params: URLSearchParams,
  key: string,
  value: string | null,
  defaultValue?: string,
): URLSearchParams {
  const next = new URLSearchParams(params)
  if (value === null || value === '' || value === defaultValue) next.delete(key)
  else next.set(key, value)
  return next
}
