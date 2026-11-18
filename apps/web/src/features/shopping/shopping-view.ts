// The two list switches (Show purchased, Group by category) are remembered on this device (F-SL-05).
// Storage can be blocked or edited: anything unreadable falls back to the defaults.
export type ShoppingView = { showPurchased: boolean; groupByCategory: boolean }

export const DEFAULT_VIEW: ShoppingView = { showPurchased: true, groupByCategory: false }
export const VIEW_STORAGE_KEY = 'chatchiu.shopping.view'

export function loadView(): ShoppingView {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(VIEW_STORAGE_KEY) ?? 'null')
    if (typeof raw !== 'object' || raw === null) return DEFAULT_VIEW
    const { showPurchased, groupByCategory } = raw as Record<string, unknown>
    return {
      showPurchased:
        typeof showPurchased === 'boolean' ? showPurchased : DEFAULT_VIEW.showPurchased,
      groupByCategory:
        typeof groupByCategory === 'boolean' ? groupByCategory : DEFAULT_VIEW.groupByCategory,
    }
  } catch {
    return DEFAULT_VIEW
  }
}

export function saveView(view: ShoppingView): void {
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(view))
  } catch {
    // Not remembered on this device; the switches still work for this visit.
  }
}
