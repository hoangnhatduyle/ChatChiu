// The user's own icon at a given size. Decorative by default (the name is written beside it); pass `label`
// when it stands alone. Explicit width and height, so nothing shifts while it loads.
import { brandIconFor } from './brand'
import { cx } from './cx'

export function BrandMark({
  size = 44,
  label,
  className,
}: {
  size?: number
  label?: string
  className?: string
}) {
  return (
    <img
      src={brandIconFor(size)}
      alt={label ?? ''}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={cx('shrink-0 rounded-card object-cover', className)}
    />
  )
}
