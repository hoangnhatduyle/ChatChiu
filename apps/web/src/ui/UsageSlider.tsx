// Usage bar (F-KB-04, F-QP-01). React Aria Slider for keyboard and screen readers; our rules on top:
// - 5 % steps (USAGE_STEP_PERCENT); a pointer saves on release, the keyboard saves once the keys
//   stop for KEYBOARD_COMMIT_DELAY_MS or focus leaves (one save, one Undo toast, not one per key);
// - `down-only` (board) can never go above the value it started at (NC-KB-NO-UP-DRAG);
// - a pointer that moves less than TAP_GUARD_PX sideways is a tap, and a gesture the browser
//   cancels (the finger started a vertical scroll) is not a change: neither saves anything.
// The hit area is the full 44 px row height (CS-ACCESSIBLE-UI); the drawn bar is thinner.
import { useEffect, useEffectEvent, useId, useRef, useState, type PointerEvent } from 'react'
import { snapPercent, TAP_GUARD_PX, USAGE_STEP_PERCENT } from '@chatchiu/domain'
import { Slider, SliderThumb, SliderTrack } from 'react-aria-components'
import { cx } from './cx'

/** Keyboard and assistive-tech changes save after this pause (CS-NUMBERED-CONSTANTS). */
export const KEYBOARD_COMMIT_DELAY_MS = 700

const DOWN_ONLY_HINT = 'Can only go down here; open the item to add more.'

export type UsageSliderProps = {
  /** Accessible name, e.g. "How much Whole milk is left". */
  label: string
  /** Percent left, 0–100. */
  value: number
  /**
   * Called once per change with the new percent, only when it changed.
   * Contract: the parent applies it to `value` synchronously (the data hooks write the cache
   * before any await, AR-WRITE-PATTERN). A later rollback simply arrives as a new `value`.
   */
  onCommit: (value: number) => void
  /** `down-only` on the board, `free` in the quick-action panel. */
  mode: 'down-only' | 'free'
  /** Spoken after the value, e.g. "0.6 of 1 L". */
  description?: string
  /** `low` draws the bar in the low-stock colour; the caller also shows a text cue. */
  tone?: 'normal' | 'low'
  /** `row` on the board, `big` in the panel. */
  size?: 'row' | 'big'
  /** A row that is still being saved cannot change yet (7.0.20); the bar is drawn dimmed. */
  isDisabled?: boolean
  className?: string
}

type Gesture = { id: number; x: number; moved: number; cancelled: boolean }
type PendingKey = { timer: ReturnType<typeof setTimeout>; final: number }

const PERCENT_FORMAT: Intl.NumberFormatOptions = { style: 'unit', unit: 'percent' }

export function UsageSlider({
  label,
  value,
  onCommit,
  mode,
  description,
  tone = 'normal',
  size = 'row',
  isDisabled = false,
  className,
}: UsageSliderProps) {
  const [draft, setDraft] = useState<number | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const pendingKey = useRef<PendingKey | null>(null)
  const descriptionId = useId()
  const shown = draft ?? value
  const clamp = (v: number) => (mode === 'down-only' ? Math.min(v, value) : v)

  const commit = (final: number) => {
    setDraft(null)
    if (final !== value) onCommit(final)
  }

  const flushKeyboard = () => {
    const pending = pendingKey.current
    if (!pending) return
    clearTimeout(pending.timer)
    pendingKey.current = null
    commit(pending.final)
  }

  // A keyboard change still waiting when the row unmounts is saved, not lost.
  const flushOnUnmount = useEffectEvent(flushKeyboard)
  useEffect(() => () => flushOnUnmount(), [])

  const handleChangeEnd = (next: number) => {
    const g = gesture.current
    gesture.current = null
    const final = clamp(snapPercent(next))
    if (g) {
      if (g.cancelled || g.moved < TAP_GUARD_PX) setDraft(null)
      else commit(final)
      return
    }
    // Keyboard or assistive tech: wait for the keys to stop.
    if (pendingKey.current) clearTimeout(pendingKey.current.timer)
    setDraft(final)
    pendingKey.current = {
      final,
      timer: setTimeout(() => {
        pendingKey.current = null
        commit(final)
      }, KEYBOARD_COMMIT_DELAY_MS),
    }
  }

  const startGesture = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary || e.button !== 0) return
    gesture.current = { id: e.pointerId, x: e.clientX, moved: 0, cancelled: false }
    // Keep receiving moves when a mouse drag leaves the 44 px row (touch captures implicitly).
    if (typeof e.currentTarget.setPointerCapture === 'function') {
      e.currentTarget.setPointerCapture(e.pointerId)
    }
  }
  const trackGesture = (e: PointerEvent) => {
    const g = gesture.current
    if (g && e.pointerId === g.id) g.moved = Math.max(g.moved, Math.abs(e.clientX - g.x))
  }
  const cancelGesture = (e: PointerEvent) => {
    const g = gesture.current
    if (g && e.pointerId === g.id) g.cancelled = true
  }

  const spoken = [description, mode === 'down-only' ? DOWN_ONLY_HINT : null]
    .filter(Boolean)
    .join('. ')
  const isBig = size === 'big'
  const colour = tone === 'low' ? 'bg-low' : 'bg-fill'
  return (
    <div
      className={className}
      onPointerDownCapture={startGesture}
      onPointerMoveCapture={trackGesture}
      onPointerCancelCapture={cancelGesture}
      onKeyDownCapture={() => {
        gesture.current = null
      }}
      onBlur={flushKeyboard}
    >
      <Slider
        aria-label={label}
        isDisabled={isDisabled}
        value={shown}
        minValue={0}
        maxValue={100}
        step={USAGE_STEP_PERCENT}
        formatOptions={PERCENT_FORMAT}
        onChange={(v) => setDraft(clamp(v))}
        onChangeEnd={handleChangeEnd}
      >
        <SliderTrack
          data-usage-track
          data-tone={tone}
          className={cx(
            'relative h-touch w-full touch-pan-y',
            isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-ew-resize',
          )}
        >
          <span
            aria-hidden="true"
            className={cx(
              'absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-pill bg-track',
              isBig ? 'h-3' : 'h-2',
            )}
          >
            <span
              className={cx('block h-full rounded-pill', colour)}
              style={{ width: `${shown}%` }}
            />
          </span>
          <SliderThumb
            data-usage-thumb
            aria-describedby={spoken ? descriptionId : undefined}
            className={cx(
              'top-1/2 rounded-pill border-3 border-surface shadow-pop',
              isBig ? 'size-[30px]' : 'size-6',
              colour,
              'transition-transform duration-fast data-dragging:scale-110',
              'data-focus-visible:shadow-[0_0_0_3px_var(--surface)]',
            )}
          />
        </SliderTrack>
      </Slider>
      {spoken && (
        // Read through aria-describedby only, so the browse cursor doesn't read it twice.
        <span id={descriptionId} aria-hidden="true" className="sr-only">
          {spoken}
        </span>
      )}
    </div>
  )
}
