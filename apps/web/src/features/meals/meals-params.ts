// The meal plan's state that lives in the URL (CS-STATE-HOMES): which tab and which day. The week and
// month views show the week or month holding `date`. Unknown values fall back to the defaults.
export type MealsTab = 'week' | 'month' | 'recipes' | 'summary'

export const TABS: ReadonlyArray<MealsTab> = ['week', 'month', 'recipes', 'summary']
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
/** Years a calendar can sensibly show: a hand-edited URL outside them falls back to today. */
const FIRST_YEAR = 1900
const LAST_YEAR = 2999

function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const year = Number(value.slice(0, 4))
  if (year < FIRST_YEAR || year > LAST_YEAR) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function parseMealsParams(
  params: URLSearchParams,
  today: string,
): { tab: MealsTab; date: string } {
  const tab = TABS.find((t) => t === params.get('tab')) ?? 'week'
  const date = params.get('date')
  return { tab, date: date !== null && isRealDate(date) ? date : today }
}

/** The search string for a tab and day: the default tab and today are left out. */
export function mealsSearch(tab: MealsTab, date: string, today: string): string {
  const next = new URLSearchParams()
  if (tab !== 'week') next.set('tab', tab)
  if (date !== today) next.set('date', date)
  const text = next.toString()
  return text ? `?${text}` : ''
}
