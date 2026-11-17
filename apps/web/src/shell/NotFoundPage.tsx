// Any unknown path inside the app.
import { Link } from 'react-router'
import { Icon } from '../ui/Icon'
import { PageTitle } from './PageTitle'

export default function NotFoundPage() {
  return (
    <div className="px-4 pt-5 md:px-6 md:pt-6">
      <PageTitle>Page not found</PageTitle>
      <p className="mt-2 text-base text-muted">This address isn't part of the app.</p>
      <Link
        to="/"
        className="mt-4 inline-flex min-h-touch items-center gap-2 rounded-pill bg-accent px-4 font-bold text-accent-ink hover:bg-accent-hover"
      >
        <Icon name="home" size={18} />
        Back to the kitchen
      </Link>
    </div>
  )
}
