// Card: the rounded paper surface the pages are built from (UI refresh, Style A). `lift` adds the hover
// rise that says "this can be pressed"; it moves with transform only and stops under reduced motion (base.css).
import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

export type CardProps = Omit<HTMLAttributes<HTMLElement>, 'className' | 'children'> & {
  as?: 'div' | 'section' | 'article' | 'li' | 'aside'
  /** Rises a little on hover. Only for cards that are themselves pressable or that expand. */
  lift?: boolean
  className?: string
  children: ReactNode
}

export function Card({ as = 'div', lift = false, className, children, ...rest }: CardProps) {
  const Tag = as as 'div'
  return (
    <Tag
      {...rest}
      className={cx(
        'rounded-card border border-line bg-surface shadow-card',
        lift &&
          'transition-[transform,box-shadow] duration-normal ease-out hover:-translate-y-0.5 hover:shadow-lift',
        className,
      )}
    >
      {children}
    </Tag>
  )
}
