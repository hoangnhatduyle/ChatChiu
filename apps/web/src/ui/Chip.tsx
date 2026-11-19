// Filter chip (F-KB-12): a toggle button. Selected chips carry a check glyph and heavier ink as
// well as the fill, so the state is not colour-only (a11y review H2).
import { ToggleButton } from 'react-aria-components'
import { cx } from './cx'
import { Icon } from './Icon'

export type ChipProps = {
  label: string
  /** Optional count shown after the label (e.g. "Use soon 6"). */
  count?: number
  isSelected: boolean
  onChange: (isSelected: boolean) => void
  className?: string
}

export function Chip({ label, count, isSelected, onChange, className }: ChipProps) {
  return (
    <ToggleButton
      isSelected={isSelected}
      onChange={onChange}
      className={cx(
        'inline-flex min-h-touch shrink-0 cursor-pointer items-center gap-1.5 rounded-pill border px-3.5',
        'text-md font-semibold whitespace-nowrap select-none',
        'transition-transform duration-fast ease-out data-pressed:scale-[0.97]',
        'border-line bg-surface text-ink data-hovered:bg-hover',
        'data-selected:border-chip-on data-selected:bg-chip-on data-selected:font-bold data-selected:text-chip-on-ink',
        className,
      )}
    >
      {isSelected && <Icon name="check" size={16} strokeWidth={2.6} />}
      {label}
      {count !== undefined && <span className=" text-sm tabular">{count}</span>}
    </ToggleButton>
  )
}
