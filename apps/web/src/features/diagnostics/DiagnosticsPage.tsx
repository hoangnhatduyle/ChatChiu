// Dev-only notification spike page (roadmap 0.6). Only bundled when VITE_ENABLE_DIAGNOSTICS=true.
import { useState } from 'react'
import { detectCapabilities, formatReport, type CapabilityCheck } from './capabilities.ts'
import { runPushTest, showLocalNotification, type Log } from './pushTest.ts'

const STATUS_STYLE: Record<CapabilityCheck['status'], string> = {
  yes: 'bg-emerald-100 text-emerald-900',
  no: 'bg-rose-100 text-rose-900',
  info: 'bg-slate-100 text-slate-800',
}

const CLOSED_APP_DELAY_SECONDS = 20

interface TestButtonProps {
  readonly label: string
  readonly busy: boolean
  readonly onPress: () => void
}

function TestButton({ label, busy, onPress }: TestButtonProps) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onPress}
      className="min-h-11 rounded-lg bg-teal-700 px-4 py-2 font-medium text-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-teal-900 disabled:opacity-50"
    >
      {label}
    </button>
  )
}

export default function DiagnosticsPage() {
  const [checks, setChecks] = useState(() => detectCapabilities({ window, navigator }))
  const [log, setLog] = useState<readonly string[]>([])
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const append: Log = (line) => {
    const stamp = new Date().toLocaleTimeString()
    setLog((prev) => [...prev, `[${stamp}] ${line}`])
  }

  const run = (task: (log: Log) => Promise<void>) => async () => {
    setBusy(true)
    try {
      await task(append)
    } catch (err) {
      append(`✗ Unexpected error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setChecks(detectCapabilities({ window, navigator }))
      setBusy(false)
    }
  }

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(formatReport(checks, log))
      setCopied(true)
    } catch {
      append('✗ Copy failed; take a screenshot instead')
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 text-slate-900">
      <h1 className="text-2xl font-semibold">Notification diagnostics</h1>
      <p className="mt-1 text-sm text-slate-600">
        Development page. Nothing here touches your kitchen data.
      </p>

      <section aria-labelledby="caps" className="mt-6">
        <h2 id="caps" className="text-lg font-semibold">
          This device
        </h2>
        <dl className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200">
          {checks.map((c) => (
            <div key={c.id} className="flex items-start justify-between gap-4 px-3 py-2">
              <dt className="text-sm">{c.label}</dt>
              <dd
                className={`rounded px-2 py-0.5 text-right text-xs break-all ${STATUS_STYLE[c.status]}`}
              >
                {c.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="tests" className="mt-6">
        <h2 id="tests" className="text-lg font-semibold">
          Tests
        </h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <TestButton
            label="1. Local notification"
            busy={busy}
            onPress={run(showLocalNotification)}
          />
          <TestButton label="2. Push now" busy={busy} onPress={run((l) => runPushTest(0, l))} />
          <TestButton
            label={`3. Push in ${CLOSED_APP_DELAY_SECONDS}s (close the app)`}
            busy={busy}
            onPress={run((l) => runPushTest(CLOSED_APP_DELAY_SECONDS, l))}
          />
        </div>
      </section>

      <section aria-labelledby="log" className="mt-6">
        <div className="flex items-center justify-between">
          <h2 id="log" className="text-lg font-semibold">
            Log
          </h2>
          <button
            type="button"
            onClick={copyReport}
            className="min-h-11 px-2 text-sm text-teal-800 underline"
          >
            {copied ? 'Copied ✓' : 'Copy report'}
          </button>
        </div>
        <pre
          aria-live="polite"
          className="mt-2 min-h-24 rounded-lg bg-slate-900 p-3 text-xs whitespace-pre-wrap text-slate-100"
        >
          {log.length ? log.join('\n') : 'No tests run yet.'}
        </pre>
      </section>
    </main>
  )
}
