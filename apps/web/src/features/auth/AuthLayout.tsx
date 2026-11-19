// Frame for login, register and reset-password (SPEC-AU-001). Signed-out visitors get no app
// navigation, so the page is a brand panel (tablet and up) beside one form card. On a phone the
// brand shrinks to a header row above the form.
import { useEffect, useRef, type ReactNode } from 'react'
import { BrandMark } from '../../ui/BrandMark'

const PROMISES = [
  'Every item in the kitchen, one board',
  'Use-by dates that warn you before the bin does',
  'Shopping and meals planned from what you already have',
]

type AuthLayoutProps = {
  title: string
  intro?: string
  /** Move focus to the heading on arrival: after a view switch, so it is announced (WCAG 2.4.3). */
  focusTitle?: boolean
  children: ReactNode
}

export function AuthLayout({ title, intro, focusTitle = false, children }: AuthLayoutProps) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (focusTitle) heading.current?.focus()
  }, [focusTitle])
  return (
    <div className="min-h-dvh bg-bg text-ink md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
      {/* Decorative: the promises are marketing, not content she needs, so screen readers skip them. */}
      <aside
        aria-hidden="true"
        className="hidden flex-col justify-between border-r border-line bg-rail p-10 text-rail-ink md:flex"
      >
        <BrandMark size={88} />
        <div>
          <p className="font-display text-4xl font-extrabold tracking-[-0.02em] text-ink">
            Chắt Chiu
          </p>
          <ol className="mt-8 flex flex-col gap-4">
            {PROMISES.map((text, index) => (
              <li key={text} className="flex items-baseline gap-4 border-t border-hair pt-4">
                <span className="tabular text-md font-semibold text-muted" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="text-lg font-semibold text-ink">{text}</span>
              </li>
            ))}
          </ol>
        </div>
        <p className="text-sm text-muted">Keep what you buy. Use what you keep.</p>
      </aside>
      <main
        id="main"
        className="mx-auto flex w-full max-w-md flex-col justify-center gap-6 px-4 py-8 md:max-w-none md:px-14"
      >
        <div className="flex items-center gap-3 md:hidden">
          <BrandMark size={44} className="rounded-control" />
          <span className="font-display text-xl font-extrabold tracking-[-0.01em]">Chắt Chiu</span>
        </div>
        <section className="w-full max-w-md rounded-card border border-line bg-surface p-6 shadow-card">
          <title>{`${title} · Chắt Chiu`}</title>
          <h1
            ref={heading}
            tabIndex={-1}
            className="text-2xl font-extrabold tracking-[-0.01em] outline-none"
          >
            {title}
          </h1>
          {intro && <p className="mt-1 text-md text-muted">{intro}</p>}
          <div className="mt-5 flex flex-col gap-4">{children}</div>
        </section>
      </main>
    </div>
  )
}

/** The message line under a form: always mounted so a screen reader announces what appears in it. */
// When empty it collapses to nothing (not display:none, which would take the live region out of the
// accessibility tree); the negative margin cancels the flex gap above it.
const COLLAPSED = 'empty:m-0 empty:-mt-4 empty:h-0 empty:overflow-hidden empty:p-0'

export function FormMessage({
  role,
  tone,
  focusOnMount = false,
  children,
}: {
  role: 'alert' | 'status'
  tone: 'error' | 'info'
  /** Take focus when it appears, for a message that replaces the form the user was in. */
  focusOnMount?: boolean
  children?: string
}) {
  const ref = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (focusOnMount) ref.current?.focus()
  }, [focusOnMount])
  return (
    <p
      ref={ref}
      role={role}
      tabIndex={focusOnMount ? -1 : undefined}
      className={`${
        tone === 'error'
          ? 'rounded-control bg-status-expired-bg px-3 py-2 text-md font-semibold text-status-expired-fg'
          : 'rounded-control bg-icon-bg px-3 py-2 text-md font-semibold text-icon-ink'
      } ${focusOnMount ? 'outline-none' : ''} ${COLLAPSED}`}
    >
      {children}
    </p>
  )
}
