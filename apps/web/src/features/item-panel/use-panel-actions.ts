// What the quick-action panel does with an item (SPEC-QP-001), through the data hooks only:
//  - a lower level or an exact use is a committed write (cache first) with an Undo toast; Undo reverses
//    it by the usage row the server answered with;
//  - a higher level (fixing a mistake), a move and a restock are committed item updates; Undo sends the
//    old values back;
//  - Move to waste and Delete are held until the toast closes (or the page is hidden): the other undo kind.
// A write that is refused before it starts (e.g. "still being saved") says so in an error toast.
import type { InventoryItem } from '@chatchiu/contracts'
import {
  amountAfterUsed,
  amountFromLeft,
  getFullQuantity,
  getRemainingQuantity,
  isOnShoppingList,
  percentAfterUsed,
  percentOf,
  quantityAtPercent,
  roundQuantity,
  shoppingEntry,
  wastedValueOfItem,
} from '@chatchiu/domain'
import { useCallback } from 'react'
import { useToast } from '../../core/toast-context'
import { itemWrites, logUsage, restock, undoUsage } from '../../data/inventory'
import { newTempId } from '../../data/resource'
import { shoppingWrites, useShoppingQuery } from '../../data/shopping'
import { useCommittedWrite, useHeldWrite } from '../../data/undoable'
import { wasteFromItem } from '../../data/waste'
import { useWrite, type WriteHandle } from '../../data/write'

const NOT_STARTED = 'That change could not start. Try again in a moment.'
const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : NOT_STARTED)

export type RestockRequest = {
  quantity: number
  expirationDate?: string
  totalPrice?: number | null
}
export type ExactAmount = { mode: 'used' | 'left'; amount: number; notes?: string }
/** A refused exact amount: the text to show next to the field. */
export type AmountProblem = string

export function usePanelActions(item: InventoryItem, onClose: () => void) {
  const commitUsage = useCommittedWrite(logUsage)
  const commitUpdate = useCommittedWrite(itemWrites.update)
  const commitRestock = useCommittedWrite(restock)
  const reverseUsage = useWrite(undoUsage)
  const updateItem = useWrite(itemWrites.update)
  const addToList = useWrite(shoppingWrites.create)
  const holdWaste = useHeldWrite(wasteFromItem)
  const holdRemove = useHeldWrite(itemWrites.remove)
  const toasts = useToast()
  const shopping = useShoppingQuery()

  /** A refusal that happened before the write started has no failed-write toast: say it here. */
  const reportRefusal = useCallback(
    (handle: WriteHandle<unknown>) => {
      void handle.result.then((result) => {
        if (result.status === 'failed' && result.blocked) {
          toasts.show({ message: reasonOf(result.error), tone: 'error' })
        }
      })
    },
    [toasts],
  )

  /** Logs a use that leaves `next`. False when there is nothing to log (below the 6-decimal precision). */
  const lowerTo = useCallback(
    (next: number, percent: number, notes?: string): boolean => {
      const before = getRemainingQuantity(item)
      const used = roundQuantity(before - next)
      if (used <= 0) return false
      const handle = commitUsage(
        { itemId: item.id, amountUsed: used, currentQuantity: next, ...(notes ? { notes } : {}) },
        {
          message:
            next <= 0 ? `${item.name} used up` : `${item.name}: ${Math.round(percent)}% left`,
          reverse: {
            build: (saved) => ({
              run: () => reverseUsage({ itemId: item.id, usageId: saved.id, restoreTo: before }),
            }),
          },
        },
      )
      reportRefusal(handle)
      return true
    },
    [commitUsage, reverseUsage, reportRefusal, item],
  )

  const raiseTo = useCallback(
    (next: number, percent: number) => {
      // The stored value, which can be null (read as the full amount): Undo must put back exactly that.
      const before = item.currentQuantity
      const handle = commitUpdate(
        { id: item.id, patch: { currentQuantity: next } },
        {
          message: `${item.name}: ${Math.round(percent)}% left`,
          reverse: {
            build: () => ({
              run: () => updateItem({ id: item.id, patch: { currentQuantity: before } }),
            }),
          },
        },
      )
      reportRefusal(handle)
    },
    [commitUpdate, updateItem, reportRefusal, item],
  )

  /** The big slider (F-QP-01): down is a use, up corrects a mistake. */
  const setLevel = useCallback(
    (percent: number) => {
      const next = percent >= 100 ? getFullQuantity(item) : quantityAtPercent(item, percent)
      const before = getRemainingQuantity(item)
      if (next < before) lowerTo(next, percent)
      else if (next > before) raiseTo(next, percent)
    },
    [item, lowerTo, raiseTo],
  )

  /** Used 10% / 25% / half / it all (F-QP-02): one tap, no drag. */
  const quickUse = useCallback(
    (points: number) => {
      // Not clamped to 100: an item above its full amount loses exactly the points the button says.
      const full = getFullQuantity(item)
      const current = full > 0 ? (getRemainingQuantity(item) / full) * 100 : 0
      const percent = percentAfterUsed(current, points)
      const logged = lowerTo(percent <= 0 ? 0 : quantityAtPercent(item, percent), percent)
      if (!logged) toasts.show({ message: 'That is too little to log.' })
    },
    [item, lowerTo, toasts],
  )

  /** "Used ___" or "Left ___" with a note (F-QP-03). Returns what is wrong, or null when it was saved. */
  const saveAmount = useCallback(
    ({ mode, amount, notes }: ExactAmount): AmountProblem | null => {
      const before = getRemainingQuantity(item)
      const next = mode === 'used' ? amountAfterUsed(item, amount) : amountFromLeft(item, amount)
      const percent = percentOf(next, getFullQuantity(item))
      if (next > before) {
        // "Left" above what is there: correcting a mistake upward. A note belongs to a use, so refuse it.
        if (notes) return 'A note is saved with a use. Clear the note to correct the level upward.'
        raiseTo(next, percent)
        return null
      }
      if (next === before) {
        return mode === 'used' ? 'Enter an amount above 0.' : 'That is what is left already.'
      }
      return lowerTo(next, percent, notes) ? null : 'That amount is too small to save.'
    },
    [item, lowerTo, raiseTo],
  )

  // A list that failed to refresh may be out of date: adding without it could duplicate a row.
  const listReady = shopping.data !== undefined && !shopping.isError
  const listFailed = shopping.isError
  const retryList = useCallback(() => void shopping.refetch(), [shopping])

  const addToShopping = useCallback(() => {
    if (!shopping.data) return
    if (isOnShoppingList(shopping.data, item.name)) {
      toasts.show({ message: 'Already on your list' })
      return
    }
    // Not "added": the write may wait offline or be refused, and a refusal has its own toast.
    toasts.show({ message: `Adding ${item.name} to the shopping list` })
    reportRefusal(addToList({ tempId: newTempId(), body: shoppingEntry(item) }))
  }, [shopping.data, item, toasts, addToList, reportRefusal])

  const wasteIt = useCallback(() => {
    const value = wastedValueOfItem(item)
    const message =
      value === null
        ? `${item.name} moved to waste`
        : `${item.name} moved to waste (${value.toFixed(2)})`
    if (holdWaste({ itemId: item.id }, message)) onClose()
  }, [holdWaste, item, onClose])

  const deleteIt = useCallback(() => {
    if (holdRemove({ id: item.id }, `${item.name} deleted`)) onClose()
  }, [holdRemove, item, onClose])

  const moveTo = useCallback(
    (locationId: number, locationName: string) => {
      const before = item.locationId
      if (locationId === before) return
      const handle = commitUpdate(
        { id: item.id, patch: { locationId } },
        {
          message: `${item.name} moved to ${locationName}`,
          reverse: {
            build: () => ({
              run: () => updateItem({ id: item.id, patch: { locationId: before } }),
            }),
          },
        },
      )
      reportRefusal(handle)
    },
    [commitUpdate, updateItem, reportRefusal, item],
  )

  const restockIt = useCallback(
    (request: RestockRequest) => {
      const before = {
        quantity: item.quantity,
        currentQuantity: item.currentQuantity,
        initialQuantity: item.initialQuantity,
        expirationDate: item.expirationDate,
        price: item.price,
      }
      const handle = commitRestock(
        { id: item.id, ...request },
        {
          message: `${item.name} restocked`,
          reverse: {
            build: () => ({ run: () => updateItem({ id: item.id, patch: before }) }),
          },
        },
      )
      reportRefusal(handle)
    },
    [commitRestock, updateItem, reportRefusal, item],
  )

  return {
    setLevel,
    quickUse,
    saveAmount,
    addToShopping,
    listReady,
    listFailed,
    retryList,
    wasteIt,
    deleteIt,
    moveTo,
    restockIt,
  }
}
