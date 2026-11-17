// "Couldn't save · Retry" for every write the server refused (F-AP-04, SPEC-QP-001 ROLLED_BACK). The
// cache is already rolled back by then; Retry applies the change again and resends it with the same
// idempotency key, Discard drops it. AI calls are not writes to the pantry and show their own message.
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useToast } from '../core/toast-context'
import { dismissFailedWrite, retryFailedWrite } from './write'

export function FailedWriteToasts() {
  const client = useQueryClient()
  const toasts = useToast()
  useEffect(() => {
    return client.getMutationCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'error') return
      const { mutation } = event
      if (mutation.options.mutationKey?.[0] !== 'write' || mutation.meta?.persist === false) return
      const id = String(mutation.mutationId)
      const label = String(mutation.meta?.label ?? 'a change')
      toasts.show({
        message: `Couldn't save · ${label}`,
        tone: 'error',
        actions: [
          { label: 'Retry', onPress: () => void retryFailedWrite(client, id) },
          { label: 'Discard', onPress: () => dismissFailedWrite(client, id) },
        ],
      })
    })
  }, [client, toasts])
  return null
}
