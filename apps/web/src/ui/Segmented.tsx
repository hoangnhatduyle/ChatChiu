// Segmented control: one of a few options (week/month, card/table, theme). React Aria's
// single-selection ToggleButtonGroup gives radiogroup semantics and arrow-key movement.
import { useEffect, useRef } from 'react'
import type { Key } from 'react-aria-components'
import { ToggleButton, ToggleButtonGroup } from 'react-aria-components'
import { cx } from './cx'

const ARROW_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])

export type SegmentedOption<T extends string> = { id: T; label: string }

export type SegmentedProps<T extends string> = {
  /** Accessible name of the group. */
  label: string
  options: ReadonlyArray<SegmentedOption<T>>
  value: T
  onChange: (value: T) => void
  className?: string
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: SegmentedProps<T>) {
  // Selection follows focus only when an arrow key moved it (as native radios do): tabbing in, or
  // across, the group must not change the value (7.0.33b).
  const arrowMoved = useRef(false)
  useEffect(() => {
    const track = (e: KeyboardEvent) => {
      const inGroup =
        e.target instanceof Element && e.target.closest('[role="radiogroup"]') !== null
      arrowMoved.current = e.type === 'keydown' && inGroup && ARROW_KEYS.has(e.key)
    }
    // Capture phase: the group moves focus while handling the same keydown.
    window.addEventListener('keydown', track, true)
    window.addEventListener('keyup', track, true)
    const reset = () => {
      arrowMoved.current = false
    }
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('keydown', track, true)
      window.removeEventListener('keyup', track, true)
      window.removeEventListener('blur', reset)
    }
  }, [])
  const handleChange = (keys: Set<Key>) => {
    const next = options.find((o) => keys.has(o.id))
    if (next) onChange(next.id)
  }
  return (
    <ToggleButtonGroup
      aria-label={label}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[value]}
      onSelectionChange={handleChange}
      className={cx('inline-flex gap-1 rounded-pill border border-line bg-surface p-1', className)}
    >
      {options.map((option) => (
        <ToggleButton
          key={option.id}
          id={option.id}
          onFocus={() => arrowMoved.current && option.id !== value && onChange(option.id)}
          className={cx(
            'inline-flex min-h-touch min-w-16 cursor-pointer items-center justify-center rounded-pill px-4',
            'text-md font-semibold text-muted select-none data-hovered:text-ink',
            'data-selected:bg-chip-on data-selected:font-bold data-selected:text-chip-on-ink',
          )}
        >
          {option.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
}
