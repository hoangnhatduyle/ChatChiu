// On/off switch with a visible label (e.g. "Expiry notifications"). React Aria gives role="switch",
// Space to toggle and focus handling; the state is shown by position and fill, and the label stays.
import { Switch as AriaSwitch } from 'react-aria-components'
import { cx } from './cx'

export type SwitchProps = {
  label: string
  isSelected: boolean
  onChange: (isSelected: boolean) => void
  className?: string
}

export function Switch({ label, isSelected, onChange, className }: SwitchProps) {
  return (
    <AriaSwitch
      isSelected={isSelected}
      onChange={onChange}
      className={cx(
        'group flex min-h-touch cursor-pointer items-center gap-3 text-base',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          'flex h-7 w-12 shrink-0 items-center rounded-pill border border-field-line bg-track px-0.5',
          'transition-colors duration-fast group-data-selected:border-accent group-data-selected:bg-accent',
          'group-data-focus-visible:outline-2 group-data-focus-visible:outline-offset-2',
        )}
      >
        <span
          className={cx(
            'block size-5 rounded-pill bg-muted shadow-pop group-data-selected:bg-accent-ink',
            'transition-transform duration-fast group-data-selected:translate-x-5',
          )}
        />
      </span>
      {label}
    </AriaSwitch>
  )
}
