// Positions only a window of rows in the page (F-IN-06). The page itself scrolls (no inner scroller:
// a scrolling page frame hides the fixed bottom bar and toasts on a phone), so this uses the window
// virtualizer with the list's distance from the top of the page as its margin. Row heights are fixed
// (rows truncate rather than wrap), so nothing needs measuring.
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { ListRow } from './virtual-rows'

const OVERSCAN_ROWS = 8

export type VirtualRowsProps = {
  rows: readonly ListRow[]
  heightOf: (row: ListRow) => number
  /** Role of the element holding the rows (list, rowgroup). */
  role: string
  label?: string
  renderRow: (row: ListRow, index: number) => ReactNode
}

/** The list's top edge in page coordinates; follows the content above it growing or shrinking. */
function useListTop(): [(element: HTMLDivElement | null) => void, number] {
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const [top, setTop] = useState(0)
  const measure = useCallback((el: HTMLDivElement) => {
    const next = Math.round(el.getBoundingClientRect().top + window.scrollY)
    setTop((previous) => (previous === next ? previous : next))
  }, [])
  const attach = useCallback(
    (el: HTMLDivElement | null) => {
      setElement(el)
      if (el) measure(el)
    },
    [measure],
  )
  useEffect(() => {
    if (!element) return
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure(element))
    observer?.observe(document.body)
    // A width change can move the list without changing the page height (wrapping header controls).
    const onResize = () => measure(element)
    window.addEventListener('resize', onResize)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [element, measure])
  return [attach, top]
}

export function VirtualRows({ rows, heightOf, role, label, renderRow }: VirtualRowsProps) {
  // The virtualizer is one stable object whose answers change as she scrolls: the React Compiler would
  // cache them (rows would never move), so this component opts out, as TanStack Virtual documents.
  'use no memo'
  const [attach, listTop] = useListTop()
  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: (index) => heightOf(rows[index] as ListRow),
    getItemKey: (index) => (rows[index] as ListRow).key,
    overscan: OVERSCAN_ROWS,
    scrollMargin: listTop,
    // The first render already has a window (no empty frame before the observers report).
    initialRect: { width: window.innerWidth, height: window.innerHeight },
  })
  return (
    <div
      ref={attach}
      role={role}
      aria-label={label}
      className="relative w-full"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((virtual) => {
        const row = rows[virtual.index] as ListRow
        return (
          <div
            key={row.key}
            // The positioning wrapper is not part of the list or table structure.
            role="presentation"
            className="absolute top-0 left-0 w-full"
            style={{
              height: virtual.size,
              transform: `translateY(${virtual.start - virtualizer.options.scrollMargin}px)`,
            }}
          >
            {renderRow(row, virtual.index)}
          </div>
        )
      })}
    </div>
  )
}
