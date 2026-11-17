// The two full-page states every guard can show before a page is allowed to render.

export function ConfigErrorScreen({ message }: { message: string }) {
  return (
    <main id="main" className="min-h-dvh bg-bg p-6 text-ink">
      <title>Chắt Chiu</title>
      <h1 className="text-xl font-bold">Chắt Chiu can&apos;t start</h1>
      <p role="alert" className="mt-2">
        {message}
      </p>
    </main>
  )
}

/** Shown until the stored session has been read: nothing protected, and no redirect, before then. */
export function SessionLoadingScreen() {
  return (
    <main id="main" className="min-h-dvh bg-bg" aria-busy="true">
      <title>Loading · Chắt Chiu</title>
      <p role="status" className="sr-only">
        Loading…
      </p>
    </main>
  )
}
