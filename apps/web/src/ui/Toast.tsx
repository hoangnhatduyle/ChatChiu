// One toast (F-AP-03): a message with Undo / Retry / action buttons. A normal toast closes itself
// after the undo window (UNDO_WINDOW_MS), but never while keyboard focus is inside it or a mouse is
// over it (WCAG 2.2.1); an error toast stays until dismissed. Placement, stacking and the
// persistent live region belong to the toast region (core/toast.tsx, step 4.5; decision recorded):
// it will own role="status"/"alert" and this <p> will drop its role.
import { useEffect, useEffectEvent, useState, type FocusEvent } from 'react'
import { UNDO_WINDOW_MS } from '@chatchiu/domain'
import { Button } from 'react-aria-components'
import { cx } from './cx'
import { Icon } from './Icon'

export type ToastAction = { label: string; onPress: () => void }

export type ToastProps = {
  message: string
  actions?: ReadonlyArray<ToastAction>
  onClose: () => void
  /** `error` adds an alert glyph (e.g. "Couldn't save · Retry"). */
  tone?: 'default' | 'error'
  /** Auto-close delay; `null` keeps the toast until it is handled (e.g. the update prompt). */
  durationMs?: number | null
  /** false when the toast sits inside a live region its container already owns. */
  live?: boolean
}

export function Toast({
  message,
  actions = [],
  onClose,
  tone = 'default',
  durationMs = UNDO_WINDOW_MS,
  live = true,
}: ToastProps) {
  const [hasFocus, setHasFocus] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const isPaused = hasFocus || isHovered
  const isSticky = tone === 'error' || durationMs === null
  const close = useEffectEvent(onClose)

  useEffect(() => {
    if (isPaused || isSticky || durationMs === null) return
    const timer = setTimeout(close, durationMs)
    return () => clearTimeout(timer)
  }, [isPaused, isSticky, durationMs])

  // Only keyboard focus pauses the timer: after a mouse press on Retry the button keeps focus,
  // and the toast must still close.
  const handleFocus = (e: FocusEvent<HTMLDivElement>) => {
    if (isKeyboardFocus(e.target)) setHasFocus(true)
  }

  const handleBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHasFocus(false)
  }

  return (
    <div
      data-toast
      onFocus={handleFocus}
      onBlur={handleBlur}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      className={cx(
        '[--focus:var(--toast-ink)]',
        'flex min-h-13 w-full max-w-xl items-center gap-2 rounded-card bg-toast py-1 pr-1 pl-4 text-toast-ink shadow-pop',
        'animate-[toast-in_var(--duration-normal)_var(--ease-out)]',
      )}
    >
      {tone === 'error' && <Icon name="alert" size={18} />}
      <p role={live ? 'status' : undefined} className="flex-1 py-2 text-md font-semibold">
        {message}
      </p>
      {actions.map((action, index) => (
        <Button
          key={`${index}-${action.label}`}
          onPress={action.onPress}
          className={cx(
            'min-h-touch shrink-0 cursor-pointer rounded-control px-3 text-md font-extrabold text-toast-act',
            'data-hovered:underline data-pressed:scale-[0.97] transition-transform duration-fast',
          )}
        >
          {action.label}
        </Button>
      ))}
      {isSticky && (
        <Button
          aria-label="Dismiss"
          onPress={onClose}
          className="flex size-touch shrink-0 cursor-pointer items-center justify-center rounded-control text-toast-ink"
        >
          <Icon name="close" size={18} />
        </Button>
      )}
    </div>
  )
}

/** True when focus came from the keyboard. Engines without :focus-visible count every focus. */
function isKeyboardFocus(el: Element): boolean {
  try {
    return el.matches(':focus-visible')
  } catch {
    return true
  }
}
