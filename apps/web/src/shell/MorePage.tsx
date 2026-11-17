// /more (phone): the destinations that don't fit the bottom bar (decision 5c2a7d16).
import { Link } from 'react-router'
import { Icon } from '../ui/Icon'
import { MORE_LINKS } from './nav'
import { PageTitle } from './PageTitle'

export default function MorePage() {
  return (
    <div className="max-w-xl px-4 pt-5 md:px-6 md:pt-6">
      <PageTitle>More</PageTitle>
      <ul className="mt-4 overflow-hidden rounded-card border border-line bg-surface shadow-card">
        {MORE_LINKS.map((d) => (
          <li key={d.path} className="border-b border-hair last:border-b-0">
            <Link
              to={d.path}
              className="flex min-h-14 items-center gap-3 px-4 text-base font-semibold text-ink hover:bg-hover active:bg-pressed"
            >
              <span className="flex size-9 items-center justify-center rounded-control bg-icon-bg text-icon-ink">
                <Icon name={d.icon} size={20} />
              </span>
              <span className="flex-1">{d.title}</span>
              <Icon name="chevron-right" size={18} className="text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
