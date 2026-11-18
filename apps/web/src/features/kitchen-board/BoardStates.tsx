// What the board shows before it has data: a skeleton in its final shape (no spinner, and no
// empty-state flash, NC-AP-NO-SPINNER-WITH-CACHE) or, when the first load failed, why and a Retry.
import { Button } from '../../ui/Button'
import { Skeleton } from '../../ui/Skeleton'

export function BoardLoading() {
  return (
    <div role="status" aria-label="Loading the kitchen" className="flex flex-1 flex-col gap-3 p-4">
      <Skeleton className="h-11 w-full" />
      <div className="grid flex-1 grid-cols-1 gap-3.5 lg:grid-cols-4 md:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="hidden h-64 md:block" />
        <Skeleton className="hidden h-64 lg:block" />
        <Skeleton className="hidden h-64 lg:block" />
      </div>
    </div>
  )
}

export function BoardLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 p-4">
      <p role="alert" className="text-base font-semibold">
        Couldn&apos;t load the kitchen. Check your connection and try again.
      </p>
      <Button variant="primary" onPress={onRetry}>
        Retry
      </Button>
    </div>
  )
}
