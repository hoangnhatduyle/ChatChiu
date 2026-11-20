// How much of the list is bought: a ring and "3 of 8 bought so far". The ring is a picture of the numbers beside
// it (role img with the same words), so nothing is carried by the drawing alone.
const RADIUS = 26
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function BoughtRing({ bought, total }: { bought: number; total: number }) {
  const share = total === 0 ? 0 : Math.min(1, bought / total)
  const words = total === 0 ? 'Nothing on the list' : `${bought} of ${total} bought`
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 64 64" role="img" aria-label={words} className="size-16 shrink-0">
        <circle cx="32" cy="32" r={RADIUS} fill="none" strokeWidth="8" className="stroke-track" />
        <circle
          cx="32"
          cy="32"
          r={RADIUS}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - share)}
          transform="rotate(-90 32 32)"
          className="stroke-tint-green-ink"
        />
      </svg>
      <div aria-hidden="true">
        {total === 0 ? (
          <p className="text-base font-semibold text-muted">Nothing to buy yet</p>
        ) : (
          <>
            <p className="font-display text-2xl leading-tight font-extrabold tabular">
              {bought} of {total}
            </p>
            <p className="text-md text-muted">bought so far</p>
          </>
        )}
      </div>
    </div>
  )
}
