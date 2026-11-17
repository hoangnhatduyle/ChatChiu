// Tablet nav rail, 84 px, from 768 px (architecture.md §4, F-AP-02). The current item has a filled
// pill, bold label and a bar on the rail edge, not colour alone (a11y review H2), plus
// aria-current="page".
import { Link, useLocation } from 'react-router'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { DESTINATIONS, currentState } from './nav'

export const BRAND_ICON = '/icons/icon-192x192.png'

export function NavRail() {
  const { pathname } = useLocation()
  return (
    <nav
      aria-label="Main"
      className="sticky top-0 hidden h-dvh w-[calc(var(--spacing-rail)+env(safe-area-inset-left))] shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-line bg-rail py-4 pl-[env(safe-area-inset-left)] md:flex"
    >
      <img
        src={BRAND_ICON}
        alt="Chắt Chiu"
        width={50}
        height={50}
        className="mb-3.5 size-[50px] shrink-0 rounded-card"
      />
      {DESTINATIONS.map((d) => {
        const state = currentState(d, pathname)
        const current = state !== undefined
        return (
          <Link
            key={d.path}
            to={d.path}
            aria-current={state}
            className={cx(
              'relative flex h-15 w-17 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[16px] text-[min(0.6875rem,13px)]',
              'transition-transform duration-fast active:scale-[0.97]',
              current
                ? 'bg-rail-on font-bold text-rail-on-ink before:absolute before:-left-2 before:h-7 before:w-1 before:rounded-r-pill before:bg-rail-on-ink'
                : 'font-semibold text-rail-ink hover:bg-hover',
            )}
          >
            <Icon name={d.icon} size={22} />
            {d.label}
          </Link>
        )
      })}
    </nav>
  )
}
