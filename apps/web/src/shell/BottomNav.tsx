// Phone bottom bar below 768 px: Kitchen · Stock · Shopping · Meals · More (F-AP-02). The current
// tab gets a 3:1 bar on its top edge, a filled pill behind its icon and a bold label (not colour
// alone; a11y review H2) and aria-current. Labels stop growing at 13 px so five tabs still fit
// when the device text size is large (deliberate cap, a11y review M5).
import { Link, useLocation } from 'react-router'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { currentState, PHONE_TABS } from './nav'

export function BottomNav() {
  const { pathname } = useLocation()
  return (
    <nav
      aria-label="Main (phone)"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] md:hidden"
    >
      {PHONE_TABS.map((tab) => {
        const state = currentState(tab, pathname)
        const current = state !== undefined
        return (
          <Link
            key={tab.path}
            to={tab.path}
            aria-current={state}
            className={cx(
              'relative flex h-nav flex-col items-center justify-center gap-0.5 rounded-control text-[min(0.6875rem,13px)]',
              // Ring drawn inside the tab: the bar touches the screen edges (a11y review M1).
              'focus-visible:outline-offset-[-4px]',
              current
                ? 'font-bold text-rail-on-ink before:absolute before:top-0 before:h-[3px] before:w-10 before:rounded-b-pill before:bg-rail-on-ink'
                : 'font-semibold text-rail-ink',
            )}
          >
            <span
              className={cx(
                'flex h-8 w-14 items-center justify-center rounded-pill transition-transform duration-fast',
                current && 'bg-rail-on',
              )}
            >
              <Icon name={tab.icon} size={22} strokeWidth={2.2} />
            </span>
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
