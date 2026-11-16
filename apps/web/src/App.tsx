// Empty shell. The real AppShell and routes arrive in roadmap step 3.3.
export default function App() {
  return (
    <main className="grid min-h-dvh place-items-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Chắt Chiu</h1>
        {import.meta.env.VITE_ENABLE_DIAGNOSTICS === 'true' && (
          <a
            href="/diagnostics"
            className="mt-4 inline-block min-h-11 py-2 text-teal-800 underline"
          >
            Notification diagnostics
          </a>
        )}
      </div>
    </main>
  )
}
