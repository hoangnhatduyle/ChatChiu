// What the board shows before it has data: a skeleton in its final shape (no spinner, and no
// empty-state flash, NC-AP-NO-SPINNER-WITH-CACHE) or, when the first load failed, why and a Retry.
import { Button } from '../../ui/Button'
import { Skeleton } from '../../ui/Skeleton'

export function BoardLoading() {
  return (
    <div role="status" aria-label="Loading the kitchen" className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="hidden h-28 lg:block" />
        <Skeleton className="hidden h-28 lg:block" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-72" />
        <Skeleton className="hidden h-72 md:block" />
        <Skeleton className="hidden h-72 lg:block" />
      </div>
    </div>
  )
}

export function BoardLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p role="alert" className="text-base font-semibold">
        Couldn&apos;t load the kitchen. Check your connection and try again.
      </p>
      <Button variant="primary" onPress={onRetry}>
        Retry
      </Button>
    </div>
  )
}
