// Button (architecture.md §4). React Aria handles press, keyboard and focus-visible; the look is
// ours: pill header actions and rounded panel actions, all at least 44 px tall.
import type { ReactNode } from 'react'
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from 'react-aria-components'
import { cx } from './cx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'md' | 'lg'
export type ButtonShape = 'pill' | 'rounded'

export type ButtonProps = Omit<AriaButtonProps, 'className' | 'children' | 'style'> & {
  variant?: ButtonVariant
  size?: ButtonSize
  shape?: ButtonShape
  className?: string
  children: ReactNode
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink data-hovered:bg-accent-hover',
  secondary:
    'border border-field-line bg-surface text-ink data-hovered:bg-hover data-pressed:bg-pressed',
  ghost: 'bg-transparent text-ink data-hovered:bg-hover data-pressed:bg-pressed',
  danger: 'bg-status-expired-bg text-status-expired-fg',
}

const SIZES: Record<ButtonSize, string> = {
  md: 'min-h-touch px-4 text-md',
  lg: 'min-h-13 px-4 text-base',
}

const SHAPES: Record<ButtonShape, string> = {
  pill: 'rounded-pill',
  rounded: 'rounded-control',
}

/** Shared by Button and IconButton: press feedback is a small scale (transform only). */
export const PRESSABLE =
  'inline-flex items-center justify-center gap-2 select-none cursor-pointer font-bold ' +
  'transition-transform duration-fast ease-out data-pressed:scale-[0.97] ' +
  'data-disabled:cursor-not-allowed data-disabled:border-transparent ' +
  'data-disabled:bg-disabled-bg data-disabled:text-disabled-ink data-disabled:scale-100'

export function Button({
  variant = 'secondary',
  size = 'md',
  shape = 'pill',
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <AriaButton
      {...props}
      className={cx(PRESSABLE, VARIANTS[variant], SIZES[size], SHAPES[shape], className)}
    >
      {children}
    </AriaButton>
  )
}
