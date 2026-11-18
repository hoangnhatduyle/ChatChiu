// What the board does with an item (F-KB-04, F-KB-08, F-KB-09), through the data hooks only:
//  - a released drag is a committed write (cache first) with an Undo toast; Undo reverses it by the
//    usage row the server answered with; if the server refuses the change, the toast is taken back;
//  - at 0% the same toast also offers Add to shopping list and Remove (D8). Remove is the other undo
//    kind: held until the toast closes, so Undo never has to call the server;
//  - a save that crossed the low-stock line raises an in-app alert (the device notification, F-NT-03,
//    arrives with step 5.8), unless she has already undone it.
import type { InventoryItem } from '@chatchiu/contracts'
import { getRemainingQuantity, quantityAtPercent, roundQuantity } from '@chatchiu/domain'
import { useCallback } from 'react'
import { useToast } from '../../core/toast-context'
import { itemWrites, logUsage, undoUsage } from '../../data/inventory'
import { newTempId } from '../../data/resource'
import { shoppingWrites } from '../../data/shopping'
import { useCommittedWrite, useHeldWrite } from '../../data/undoable'
import { useWrite } from '../../data/write'

const NOT_STARTED = 'That change could not start. Try again in a moment.'

/** Why a write was refused before it started (e.g. "still being saved"), for an error toast. */
const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : NOT_STARTED)

export function useBoardActions() {
  const commitUsage = useCommittedWrite(logUsage)
  const reverseUsage = useWrite(undoUsage)
  const holdRemove = useHeldWrite(itemWrites.remove)
  const addToList = useWrite(shoppingWrites.create)
  const toasts = useToast()

  const addToShopping = useCallback(
    (item: InventoryItem) => {
      // Not "added": the write may wait offline or be refused, and a refusal has its own toast.
      toasts.show({ message: `Adding ${item.name} to the shopping list` })
      void addToList({ tempId: newTempId(), body: { name: item.name } }).result.then((result) => {
        if (result.status === 'failed' && result.blocked) {
          toasts.show({ message: reasonOf(result.error), tone: 'error' })
        }
      })
    },
    [addToList, toasts],
  )

  const remove = useCallback(
    (item: InventoryItem) => {
      holdRemove({ id: item.id }, `${item.name} removed`)
    },
    [holdRemove],
  )

  const logUse = useCallback(
    (item: InventoryItem, percent: number) => {
      const before = getRemainingQuantity(item)
      const next = quantityAtPercent(item, percent)
      // NC-KB-NO-UP-DRAG: the board only ever lowers the amount; anything else is not a use.
      if (next >= before) return
      const usedUp = percent <= 0 || next <= 0
      let undone = false
      const handle = commitUsage(
        { itemId: item.id, amountUsed: roundQuantity(before - next), currentQuantity: next },
        {
          message: usedUp ? `${item.name} used up` : `${item.name}: ${percent}% left`,
          extraActions: usedUp
            ? [
                { label: 'Add to shopping list', onPress: () => addToShopping(item) },
                { label: 'Remove', onPress: () => remove(item) },
              ]
            : undefined,
          onUndo: () => {
            undone = true
          },
          reverse: {
            build: (saved) => ({
              run: () => reverseUsage({ itemId: item.id, usageId: saved.id, restoreTo: before }),
            }),
          },
        },
      )
      void handle.result.then((result) => {
        if (result.status === 'failed' && result.blocked) {
          toasts.show({ message: reasonOf(result.error), tone: 'error' })
        } else if (result.status === 'saved' && result.data.crossedLowStock && !usedUp && !undone) {
          toasts.show({
            message: `${item.name} is running low`,
            actions: [{ label: 'Add to shopping list', onPress: () => addToShopping(item) }],
          })
        }
      })
    },
    [commitUsage, reverseUsage, addToShopping, remove, toasts],
  )

  return { logUse, remove, addToShopping }
}
