// A scroll area that stays quiet: no scrollbar until the pointer is over it, a soft fade at an edge where more
// content remains, and an optional "N more" pill that goes away at the end (UI refresh, Dashboard feedback 2).
// It is a labelled, focusable region, so the keyboard can scroll it. The end state is read from the scroll
// position by a passive listener that only sets state when an edge is crossed (and from a ResizeObserver),
// so a long scroll does not re-render anything.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { cx } from './cx'

const EDGE_PX = 2

export type ScrollFadeProps = {
  /** Accessible name of the region. */
  label: string
  axis?: 'x' | 'y'
  /** Which surface the fade melts into. */
  tone?: 'surface' | 'bg'
  /** Text of the pill while more remains, e.g. "5 more". Omit for no pill. */
  moreLabel?: string
  className?: string
  /** Classes for the element that scrolls (set its height or width limit here). */
  scrollerClassName?: string
  children: ReactNode
}

export function ScrollFade({
  label,
  axis = 'y',
  tone = 'surface',
  moreLabel,
  className,
  scrollerClassName,
  children,
}: ScrollFadeProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: true, end: true })

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const [pos, size, view] =
      axis === 'y'
        ? [el.scrollTop, el.scrollHeight, el.clientHeight]
        : [el.scrollLeft, el.scrollWidth, el.clientWidth]
    const next = { start: pos <= EDGE_PX, end: pos + view >= size - EDGE_PX }
    setEdges((prev) => (prev.start === next.start && prev.end === next.end ? prev : next))
  }, [axis])

  useEffect(() => {
    measure()
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    for (const child of Array.from(el.children)) observer.observe(child)
    return () => observer.disconnect()
  }, [measure])

  const from = tone === 'surface' ? 'from-surface' : 'from-bg'
  const vertical = axis === 'y'
  return (
    <div className={cx('relative', className)}>
      <div
        ref={ref}
        role="region"
        aria-label={label}
        tabIndex={0}
        onScroll={measure}
        className={cx(
          // `relative`: sr-only text inside is positioned against the scroller, so it is clipped with it and can never widen the page.
          'scroll-quiet relative outline-offset-[-3px]',
          vertical ? 'overflow-y-auto' : 'overflow-x-auto',
          scrollerClassName,
        )}
      >
        {children}
      </div>
      {!edges.start && (
        <span
          aria-hidden="true"
          data-fade="start"
          className={cx(
            'pointer-events-none absolute z-10 to-transparent',
            vertical
              ? `inset-x-0 top-0 h-6 bg-linear-to-b ${from}`
              : `inset-y-0 left-0 w-6 bg-linear-to-r ${from}`,
          )}
        />
      )}
      {!edges.end && (
        <>
          <span
            aria-hidden="true"
            data-fade="end"
            className={cx(
              'pointer-events-none absolute z-10 to-transparent',
              vertical
                ? `inset-x-0 bottom-0 h-10 bg-linear-to-t ${from}`
                : `inset-y-0 right-0 w-10 bg-linear-to-l ${from}`,
            )}
          />
          {moreLabel && (
            <span
              aria-hidden="true"
              data-more-pill
              className={cx(
                'pointer-events-none absolute z-20 rounded-pill bg-tint-neutral px-2.5 py-0.5 text-xs font-bold text-tint-neutral-ink shadow-card',
                vertical ? 'bottom-2 left-1/2 -translate-x-1/2' : 'top-2 right-2',
              )}
            >
              {moreLabel}
            </span>
          )}
        </>
      )}
    </div>
  )
}
