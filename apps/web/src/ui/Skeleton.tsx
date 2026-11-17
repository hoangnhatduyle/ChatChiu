// Placeholder block for the very first visit only (NC-AP-NO-SPINNER-WITH-CACHE). The caller gives
// it the final element's size so nothing shifts when data arrives (NC-AP-NO-LAYOUT-SHIFT).
// Opacity pulse only; reduced motion stops it (base.css).
import { cx } from './cx'

export type SkeletonProps = {
  /** Size and shape utilities matching the content it stands in for, e.g. "h-11 w-full". */
  className: string
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div aria-hidden="true" className={cx('animate-pulse rounded-control bg-track', className)} />
  )
}
