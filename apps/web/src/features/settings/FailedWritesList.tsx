// Changes the server refused (roadmap 7.0.20b): each was rolled back on screen and waits here for Retry or
// Discard, with the reason in words. The same list the "Couldn't save" toast offers, for anyone who missed it.
import { useQueryClient } from '@tanstack/react-query'
import { userMessage } from '../../core/errors'
import { canRetry, dismissFailedWrite, retryFailedWrite, useFailedWrites } from '../../data/write'
import { Button } from '../../ui/Button'

export function FailedWritesList() {
  const client = useQueryClient()
  const failed = useFailedWrites()
  if (failed.length === 0) return null
  return (
    <ul
      role="list"
      aria-label="Changes that need attention"
      className="rounded-control border border-line"
    >
      {failed.map((write) => (
        <li key={write.id} className="flex flex-col gap-2 border-b border-line p-3 last:border-b-0">
          <div>
            <p className="text-base font-bold text-ink">{write.label}</p>
            <p className="text-sm text-muted">{userMessage(write.error)}</p>
          </div>
          <div className="flex gap-2">
            {canRetry(write.error) && (
              <Button variant="primary" onPress={() => void retryFailedWrite(client, write.id)}>
                {`Retry ${write.label}`}
              </Button>
            )}
            <Button variant="secondary" onPress={() => dismissFailedWrite(client, write.id)}>
              {`Discard ${write.label}`}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}
