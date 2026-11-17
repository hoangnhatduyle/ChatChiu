// Expiry status chip (F-KB-03). Always text plus a spoken description, never colour alone
// (NC-KB-NO-COLOUR-ONLY). A rounded tag with a glyph, not a pill, so it cannot be mistaken for a
// pressed filter chip (decision bda297d4). Labels and status come from @chatchiu/domain.
import {
  daysLeft,
  expiryChipLabel,
  expiryDescription,
  expiryStatus,
  type ExpiryStatus,
} from '@chatchiu/domain'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

export type ExpiryChipProps = {
  /** ISO date (YYYY-MM-DD), or null when the item has no expiry date. */
  expirationDate: string | null
  /** Today's local date (YYYY-MM-DD); passed in so the chip stays pure. */
  today: string
  className?: string
}

const TONE: Record<ExpiryStatus, string> = {
  expired: 'bg-status-expired-bg text-status-expired-fg',
  today: 'bg-status-today-bg text-status-today-fg',
  soon: 'bg-status-soon-bg text-status-soon-fg',
  ok: 'bg-status-ok-bg text-status-ok-fg',
}

const GLYPH: Record<ExpiryStatus, IconName | null> = {
  expired: 'alert',
  today: 'clock',
  soon: 'clock',
  ok: null,
}

const BASE =
  'inline-flex min-w-13 shrink-0 items-center justify-center gap-1 rounded-control px-2 py-1 text-xs font-bold whitespace-nowrap'

export function ExpiryChip({ expirationDate, today, className }: ExpiryChipProps) {
  if (expirationDate === null) {
    // Same footprint as a real chip so rows line up; nothing to announce.
    return (
      <span aria-hidden="true" className={cx(BASE, 'invisible', className)}>
        —
      </span>
    )
  }
  const days = daysLeft(expirationDate, today)
  const status = expiryStatus(expirationDate, today)
  const glyph = GLYPH[status]
  return (
    <span data-status={status} className={cx(BASE, TONE[status], className)}>
      {glyph && <Icon name={glyph} size={12} strokeWidth={2.6} />}
      <span aria-hidden="true">{expiryChipLabel(days)}</span>
      <span className="sr-only">{expiryDescription(days)}</span>
    </span>
  )
}
