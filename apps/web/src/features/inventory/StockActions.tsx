// The two actions in the Stock page header (F-IN-13): Scan receipt and Add item (pre-filled with the place being
// filtered, if any).
import { Link } from 'react-router'
import { cx } from '../../ui/cx'
import { Icon } from '../../ui/Icon'

const PILL = 'inline-flex min-h-touch items-center gap-2 rounded-pill px-5 text-md font-bold'

export function StockActions({ addHref }: { addHref: string }) {
  return (
    <>
      <Link
        to="/scan"
        className={cx(
          PILL,
          'border border-line bg-surface text-ink hover:bg-hover hover:shadow-lift',
        )}
      >
        Scan receipt
      </Link>
      <Link
        to={addHref}
        className={cx(PILL, 'bg-accent text-accent-ink hover:bg-accent-hover hover:shadow-lift')}
      >
        <Icon name="plus" size={18} strokeWidth={2.4} />
        Add item
      </Link>
    </>
  )
}
