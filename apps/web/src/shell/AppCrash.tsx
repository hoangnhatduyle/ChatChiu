// Full-screen fallback when something above the pages fails (the shell, the sign-in guard, the data
// provider). Without it the app would be a blank page.
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'

export function AppCrash() {
  return (
    <main id="main" className="min-h-dvh bg-bg px-4 pt-10 text-ink md:px-6">
      <h1 className="text-2xl font-extrabold">Chắt Chiu hit a problem</h1>
      <p role="alert" className="mt-2 max-w-prose text-base text-muted">
        Something went wrong while showing the app. Your saved changes are kept. Reloading usually
        fixes it.
      </p>
      <div className="mt-4">
        <Button variant="primary" onPress={() => window.location.reload()}>
          <Icon name="refresh" size={18} />
          Reload
        </Button>
      </div>
    </main>
  )
}
