// Navigation for tablets and desktops (architecture.md §4, F-AP-02): an 84 px icon rail from 768 px and, from
// 1024 px, the same <nav> as a 232 px sidebar with labels and the Stock expired count. One element, switched
// by CSS only, so nothing remounts or loses focus when the window is resized. The current item has a filled
// pill, bold label and (on the rail) a bar on the edge, not colour alone (a11y review H2), plus aria-current.
import { Link, useLocation } from 'react-router'
import { BRAND_NAME } from '../ui/brand'
import { BrandMark } from '../ui/BrandMark'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { DESTINATIONS, currentState } from './nav'
import { useNavCounts } from './nav-counts'

const STOCK_PATH = '/stock'

export function NavRail() {
  const { pathname } = useLocation()
  const { expired } = useNavCounts()
  return (
    <nav
      aria-label="Main"
      className="sticky top-0 hidden h-dvh w-[calc(var(--spacing-rail)+env(safe-area-inset-left))] shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-line bg-rail py-4 pl-[env(safe-area-inset-left)] md:flex lg:w-[calc(var(--spacing-sidebar)+env(safe-area-inset-left))] lg:items-stretch lg:py-5 lg:pr-3.5 lg:pl-[calc(0.875rem+env(safe-area-inset-left))]"
    >
      <div className="mb-3.5 flex items-center gap-3 lg:px-2 lg:pb-3">
        <BrandMark size={44} label={BRAND_NAME} className="shadow-card" />
        <div className="hidden lg:block" aria-hidden="true">
          <p className="font-display text-xl leading-none font-bold text-ink">{BRAND_NAME}</p>
          <p className="mt-1 text-xs text-muted">Keep what you buy</p>
        </div>
      </div>
      {DESTINATIONS.map((d) => {
        const state = currentState(d, pathname)
        const current = state !== undefined
        const badge = d.path === STOCK_PATH ? expired : 0
        return (
          <Link
            key={d.path}
            to={d.path}
            aria-current={state}
            className={cx(
              'relative flex h-15 w-17 shrink-0 flex-col items-center justify-center gap-0.5 rounded-card text-[min(0.6875rem,13px)]',
              'transition-transform duration-fast active:scale-[0.97]',
              'lg:h-auto lg:min-h-touch lg:w-full lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-base',
              current
                ? 'bg-rail-on font-bold text-rail-on-ink before:absolute before:-left-2 before:h-7 before:w-1 before:rounded-r-pill before:bg-rail-on-ink lg:bg-sidebar-on lg:text-sidebar-on-ink lg:before:hidden'
                : 'font-semibold text-rail-ink hover:bg-hover',
            )}
          >
            <Icon name={d.icon} size={22} />
            {d.label}
            {badge > 0 && (
              <>
                <span
                  aria-hidden="true"
                  className={cx(
                    'hidden rounded-pill px-2 text-xs font-bold tabular lg:ml-auto lg:inline-block',
                    current ? 'bg-surface text-tint-red-ink' : 'bg-tint-red text-tint-red-ink',
                  )}
                >
                  {badge}
                </span>
                <span className="sr-only">, {badge} expired</span>
              </>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
