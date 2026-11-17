// Shown inside the shell when a page fails, most often a page chunk that a new deployment removed
// while an old tab was open. Reload fetches the current version.
import { Link } from 'react-router'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { PageTitle } from './PageTitle'

export function RouteError({ error }: { error: unknown }) {
  const detail = error instanceof Error ? error.message : null
  return (
    <div className="px-4 pt-5 md:px-6 md:pt-6">
      <PageTitle>This page didn't load</PageTitle>
      <p role="alert" className="mt-2 max-w-prose text-base text-muted">
        The app may have been updated while it was open. Reloading gets the current version.
      </p>
      {detail && <p className="mt-1 font-mono text-xs text-muted">{detail}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" onPress={() => window.location.reload()}>
          <Icon name="refresh" size={18} />
          Reload
        </Button>
        <Link
          to="/"
          className="inline-flex min-h-touch items-center gap-2 rounded-pill border border-field-line bg-surface px-4 font-bold text-ink hover:bg-hover"
        >
          Back to the kitchen
        </Link>
      </div>
    </div>
  )
}
