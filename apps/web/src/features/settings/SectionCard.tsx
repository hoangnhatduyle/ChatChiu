// The frame every Settings section shares: a labelled region with a heading and a bordered surface.
import { useId, type ReactNode } from 'react'

export function SectionCard({
  title,
  description,
  headingId,
  children,
}: {
  title: string
  /** An id other code can focus: after a row is removed, focus returns to this heading. */
  headingId?: string
  description?: string
  children: ReactNode
}) {
  const generatedId = useId()
  const id = headingId ?? generatedId
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div>
        <h2 id={id} tabIndex={-1} className="text-lg font-extrabold text-ink outline-none">
          {title}
        </h2>
        {description && <p className="text-md text-muted">{description}</p>}
      </div>
      <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 shadow-card">
        {children}
      </div>
    </section>
  )
}
