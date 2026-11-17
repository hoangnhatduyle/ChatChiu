// Icon-only button: always named by `label` and a full 44 px square (CS-ACCESSIBLE-UI).
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from 'react-aria-components'
import { PRESSABLE } from './Button'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

export type IconButtonProps = Omit<
  AriaButtonProps,
  'className' | 'children' | 'style' | 'aria-label'
> & {
  icon: IconName
  /** Accessible name, e.g. "Add item to Pantry". Required: the button has no visible text. */
  label: string
  variant?: 'ghost' | 'outline'
  className?: string
}

const VARIANTS = {
  ghost: 'text-muted data-hovered:bg-hover data-hovered:text-ink data-pressed:bg-pressed',
  outline:
    'border border-field-line bg-surface text-ink data-hovered:bg-hover data-pressed:bg-pressed',
} as const

export function IconButton({
  icon,
  label,
  variant = 'ghost',
  className,
  ...props
}: IconButtonProps) {
  return (
    <AriaButton
      {...props}
      aria-label={label}
      className={cx(PRESSABLE, 'size-touch rounded-pill', VARIANTS[variant], className)}
    >
      <Icon name={icon} size={20} />
    </AriaButton>
  )
}
