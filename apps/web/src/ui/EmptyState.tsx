// Empty state (F-KB-14 and the other lists): what's missing, one line of help, one action.
import type { ReactNode } from 'react'
import { BrandMark } from './BrandMark'
import { Button } from './Button'
import { Icon, type IconName } from './Icon'

export type EmptyStateProps = {
  icon: IconName
  title: string
  children?: ReactNode
  action?: { label: string; onPress: () => void }
  /** Shows the app's own icon instead of the glyph square: a friendlier face for a list that is simply empty. */
  brand?: boolean
  /** `start` lines it up with a left-aligned page heading; `center` stands alone in a list. */
  align?: 'center' | 'start'
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  brand = false,
  align = 'center',
}: EmptyStateProps) {
  return (
    <section
      className={
        align === 'center'
          ? 'mx-auto flex max-w-sm flex-col items-center gap-3 px-6 py-12 text-center'
          : 'flex max-w-md flex-col items-start gap-3 py-8'
      }
    >
      {brand ? (
        <BrandMark size={72} />
      ) : (
        <span className="flex size-16 items-center justify-center rounded-card bg-icon-bg text-icon-ink">
          <Icon name={icon} size={30} />
        </span>
      )}
      <h2 className="font-display text-xl font-bold text-ink">{title}</h2>
      {children && <p className="text-base text-muted">{children}</p>}
      {action && (
        <Button variant="primary" className="mt-2" onPress={action.onPress}>
          <Icon name="plus" size={18} strokeWidth={2.4} />
          {action.label}
        </Button>
      )}
    </section>
  )
}
