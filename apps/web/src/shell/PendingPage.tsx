// Stand-in page for each destination until its feature screen lands in Phase 5 (5.1–5.8 replace
// these routes in routes.tsx). Lazy-loaded, so the route-splitting and budgets are real now.
import { EmptyState } from '../ui/EmptyState'
import type { IconName } from '../ui/Icon'
import { PageTitle } from './PageTitle'

export type PendingPageProps = { title: string; icon: IconName }

export default function PendingPage({ title, icon }: PendingPageProps) {
  return (
    <div className="max-w-3xl px-4 pt-5 md:px-6 md:pt-6">
      <PageTitle>{title}</PageTitle>
      <EmptyState icon={icon} title="Being rebuilt" align="start">
        This screen arrives in a later step of the new Chắt{'\u00a0'}Chiu.
      </EmptyState>
    </div>
  )
}
