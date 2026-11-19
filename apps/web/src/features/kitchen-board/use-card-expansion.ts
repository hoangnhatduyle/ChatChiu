// Which location cards are showing all their items ("Show all N"), remembered on this device. Storage can be
// blocked or edited: anything unreadable means every card starts collapsed.
import { useState } from 'react'

export const EXPANDED_STORAGE_KEY = 'chatchiu.board.expanded'

export function loadExpanded(): ReadonlySet<string> {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(EXPANDED_STORAGE_KEY) ?? 'null')
    return new Set(Array.isArray(raw) ? raw.filter((k): k is string => typeof k === 'string') : [])
  } catch {
    return new Set()
  }
}

function saveExpanded(keys: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify([...keys]))
  } catch {
    // Not remembered on this device; the card still opens for this visit.
  }
}

export function useCardExpansion() {
  const [open, setOpen] = useState(loadExpanded)
  const toggle = (key: string) => {
    const next = new Set(open)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setOpen(next)
    saveExpanded(next)
  }
  return { isOpen: (key: string) => open.has(key), toggle }
}
