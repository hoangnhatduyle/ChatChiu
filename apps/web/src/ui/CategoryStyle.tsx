// How a category looks: a soft tint of its own colour with the theme's ink on it (so it reads in light and
// dark), plus the raw colour as a decorative edge or dot. The category's NAME is always written next to the
// colour, so colour is never the only cue (NC-KB-NO-COLOUR-ONLY). The tint is `color-mix` (see `.cat-tint` in
// styles/base.css, with a neutral fallback for a browser without it).
import { categoryVars } from './category-colours'
import { cx } from './cx'

export function CategoryPill({
  name,
  colour,
  className,
}: {
  name: string
  colour: string | null | undefined
  className?: string
}) {
  return (
    <span
      style={categoryVars(colour)}
      className={cx(
        'cat-tint inline-flex max-w-full items-center rounded-control px-2 py-0.5 text-xs font-bold text-ink',
        className,
      )}
    >
      <span className="truncate">{name}</span>
    </span>
  )
}

/** A thin coloured edge for the left side of a card; decorative. */
export function CategoryEdge({
  colour,
  className,
}: {
  colour: string | null | undefined
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      style={{ ...categoryVars(colour), backgroundColor: 'var(--cat)' }}
      className={cx('absolute inset-y-0 left-0 w-1.5', className)}
    />
  )
}

export function CategoryDot({
  colour,
  className,
}: {
  colour: string | null | undefined
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      style={{ ...categoryVars(colour), backgroundColor: 'var(--cat)' }}
      className={cx('inline-block size-2.5 shrink-0 rounded-pill', className)}
    />
  )
}
