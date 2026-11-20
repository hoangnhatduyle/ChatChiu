// A titled card of the stats page: a labelled group with a display-font heading. Shared by the overview blocks and
// the waste blocks.
import { useId, type ReactNode } from 'react'
import { cx } from '../../ui/cx'

export function Block({
  title,
  lead,
  className,
  children,
}: {
  title: string
  /** One line under the title saying what the block shows. */
  lead?: string
  className?: string
  children: ReactNode
}) {
  const headingId = useId()
  return (
    <div
      role="group"
      aria-labelledby={headingId}
      className={cx('rounded-panel border border-line bg-surface p-4 shadow-card', className)}
    >
      <h3 id={headingId} className="font-display text-lg font-bold text-ink">
        {title}
      </h3>
      {lead && <p className="mb-2 text-sm text-muted">{lead}</p>}
      <div className={lead ? undefined : 'mt-2'}>{children}</div>
    </div>
  )
}
