// First-use hint (F-KB-11): how the usage bar works. Dismissing it is remembered on this device.
import { useState } from 'react'
import { Button } from '../../ui/Button'

const STORAGE_KEY = 'chatchiu.board-hint-dismissed'

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false // storage blocked: show the hint, it just comes back next visit
  }
}

export function BoardHint() {
  const [dismissed, setDismissed] = useState(wasDismissed)
  if (dismissed) return null

  function dismiss() {
    setDismissed(true)
    try {
      window.localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // Not remembered; nothing else to do.
    }
  }

  return (
    <div
      role="note"
      aria-label="Tip"
      className="flex items-center gap-3 rounded-card border border-line bg-icon-bg px-4 py-2 text-md text-icon-ink"
    >
      <p className="flex-1 font-semibold">
        Tip: drag any bar down to log what you used. It saves right away, and Undo is one tap.
      </p>
      <Button variant="secondary" onPress={dismiss}>
        Got it
      </Button>
    </div>
  )
}
