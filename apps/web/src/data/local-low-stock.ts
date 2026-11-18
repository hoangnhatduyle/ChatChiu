// F-NT-03 on the Fire: when a use crosses the low-stock line, "Butter is running low (15%)" shows on this device once,
// and again only after the item is restocked. Browsers do nothing here (the server pushes to web-push devices).
// It follows her settings: nothing shows when reminders are off on this tablet or low-stock alerts are off.
import type { InventoryItem, Preferences } from '@chatchiu/contracts'
import { percentLeft } from '@chatchiu/domain'
import {
  clearLowStockSeen,
  isNativeShell,
  loadLocalPlugin,
  notifyLowStock,
} from '../core/notify/localNotify'

export async function onLowStockCrossed(
  item: InventoryItem,
  preferences: Preferences | undefined,
): Promise<void> {
  if (!isNativeShell() || preferences?.lowStockAlerts === false) return
  try {
    await notifyLowStock(
      await loadLocalPlugin(),
      { itemId: item.id, name: item.name, percent: percentLeft(item) },
      new Date(),
      window.localStorage,
    )
  } catch {
    // The board already says "running low" in its own toast: a missing device alert is not worth a second error.
  }
}

export function onRestocked(itemId: number): void {
  if (!isNativeShell()) return
  try {
    clearLowStockSeen(itemId, window.localStorage)
  } catch {
    // Storage is full or blocked: the item may not alert again until storage works; never break the restock for it.
  }
}
