// What a usage row shows while its bar is being dragged (F-KB-18): the percent, the amount and the Low cue follow
// the finger; nothing is saved until release. Shared by the Kitchen rows and the Stock cards, so the two cannot
// drift apart. `setLive` is what the slider's `onDraft` calls.
import type { InventoryItem } from '@chatchiu/contracts'
import {
  isUsedUp,
  lowStockLevel,
  percentLeft,
  quantityAtPercent,
  quantityLabel,
  type LowStockLevel,
} from '@chatchiu/domain'
import { useState } from 'react'

const CUE = { warning: 'Low', critical: 'Very low' } as const

export type LiveUsage = {
  setLive: (percent: number | null) => void
  /** The saved percent (a sliver left still reads 1%, never 0%: only a drag to 0 uses it up). */
  stored: number
  /** The percent to show: the draft while dragging, else the saved one. */
  percent: number
  usedUp: boolean
  level: LowStockLevel
  /** "Low", "Very low", "Used up" or null. */
  cue: string | null
  /** "0.35 of 1 pcs". */
  amount: string
}

export function useLiveUsage(item: InventoryItem): LiveUsage {
  const [live, setLive] = useState<number | null>(null)
  const left = percentLeft(item)
  const stored = left > 0 ? Math.max(1, Math.round(left)) : 0
  const shown = live === null ? item : { ...item, currentQuantity: quantityAtPercent(item, live) }
  const usedUp = isUsedUp(item)
  const level = usedUp ? 'normal' : lowStockLevel(shown)
  const cue = usedUp ? 'Used up' : level === 'normal' ? null : CUE[level]
  return {
    setLive,
    stored,
    percent: live ?? stored,
    usedUp,
    level,
    cue,
    amount: quantityLabel(shown),
  }
}
