// A native <select> that saves once she has settled on a value (7.0.32b). Arrowing through a closed select fires a
// change event per key; sending a write per key would queue a dozen saves. The choice shows at once; it is saved
// when focus leaves the select or after a short pause.
import { useEffect, useRef, useState, type ReactNode } from 'react'

export const SELECT_SETTLE_MS = 700

type Props<T extends string | number> = {
  className: string
  value: T
  /** Turns the chosen text back into a value. */
  parse: (text: string) => T
  onCommit: (value: T) => void
  children: ReactNode
}

export function DeferredSelect<T extends string | number>({
  className,
  value,
  parse,
  onCommit,
  children,
}: Props<T>) {
  const [draft, setDraft] = useState<T | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef<T | null>(null)

  const flush = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const chosen = latest.current
    latest.current = null
    setDraft(null)
    if (chosen !== null && chosen !== value) onCommit(chosen)
  }
  // Leaving the screen with a choice still waiting saves it, as the usage slider does.
  const flushOnUnmount = useRef(flush)
  useEffect(() => {
    flushOnUnmount.current = flush
  })
  useEffect(() => () => flushOnUnmount.current(), [])

  return (
    <select
      className={className}
      value={draft ?? value}
      onChange={(e) => {
        const chosen = parse(e.target.value)
        latest.current = chosen
        setDraft(chosen)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(flush, SELECT_SETTLE_MS)
      }}
      onBlur={flush}
    >
      {children}
    </select>
  )
}
