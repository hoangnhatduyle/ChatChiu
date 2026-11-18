/** Keyboard and assistive-tech changes save after this pause (CS-NUMBERED-CONSTANTS). */
export const KEYBOARD_COMMIT_DELAY_MS = 700

export const DOWN_ONLY_HINT = 'Can only go down here; open the item to add more.'

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
