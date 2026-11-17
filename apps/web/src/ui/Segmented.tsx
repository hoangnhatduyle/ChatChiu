// Segmented control: one of a few options (week/month, card/table, theme). React Aria's
// single-selection ToggleButtonGroup gives radiogroup semantics and arrow-key movement.
import type { Key } from 'react-aria-components'
import { ToggleButton, ToggleButtonGroup } from 'react-aria-components'
import { cx } from './cx'

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
          // Selection follows focus, as with native radios (arrow keys pick).
          onFocus={() => option.id !== value && onChange(option.id)}
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
