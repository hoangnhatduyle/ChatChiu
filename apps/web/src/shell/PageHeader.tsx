// A page's head: the title (the h1 the shell focuses after a navigation), one line about the page, and its
// actions on the right (they wrap under the title on a phone).
import type { ReactNode } from 'react'
import { PageTitle } from './PageTitle'

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end gap-x-5 gap-y-3">
      <div className="min-w-0 flex-1 basis-52">
        <PageTitle>{title}</PageTitle>
        {subtitle && <p className="mt-1.5 text-base text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
