/** Keyboard and assistive-tech changes save after this pause (CS-NUMBERED-CONSTANTS). */
export const KEYBOARD_COMMIT_DELAY_MS = 700

/**
 * Said once per list (an sr-only line above it), not by every row's slider (7.0.25iii): a screen reader would
 * otherwise repeat it on each of dozens of rows.
 */
export const DOWN_ONLY_HINT = 'The usage bars here can only go down; open an item to add more.'

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
  /** `row` on the board, `big` in the panel. */
  size?: 'row' | 'big'
  /**
   * Called with the value under the finger on every step of a drag (or a key press that has not saved yet), and
   * with null when the gesture ends or is cancelled. For showing the number live; it never saves anything.
   */
  onDraft?: (percent: number | null) => void
  /** A row that is still being saved cannot change yet (7.0.20); the bar is drawn dimmed. */
  isDisabled?: boolean
  className?: string
}

/**
 * How a used-up row is set apart. Not `opacity-*`: dimming the text drops it under the 4.5:1 contrast ratio
 * (7.0.28f). The row's name is muted, its "Used up" cue is text, and the colour is drawn out of the bar.
 */
export const USED_UP_STYLE = 'grayscale'
