// Push subscriptions and the test notification (step 5.8). These calls need the network and describe this
// device right now, so like the AI calls they are never queued, saved or replayed: offline they fail at once and
// the screen says so. The browser side lives in core/notify/webPush.ts; this file is the API side.
import { api } from '../core/api-client'
import { defineWrite } from './write'

export const savePushSubscription = defineWrite<PushSubscriptionJSON, { id: number }>({
  key: 'push/subscribe',
  label: 'Turn on notifications',
  persist: false,
  request: (subscription, requestId) =>
    api.post<{ id: number }>('/api/push/subscribe', subscription, { idempotencyKey: requestId }),
})

export const removePushSubscription = defineWrite<{ endpoint: string }, { deleted: boolean }>({
  key: 'push/unsubscribe',
  label: 'Turn off notifications',
  persist: false,
  request: ({ endpoint }, requestId) =>
    api.delete<{ deleted: boolean }>('/api/push/subscribe', {
      query: { endpoint },
      idempotencyKey: requestId,
    }),
})

export const sendTestPush = defineWrite<{ endpoint: string }, { sent: number }>({
  key: 'push/test',
  label: 'Send a test notification',
  persist: false,
  request: (input, requestId) =>
    api.post<{ sent: number }>('/api/push/test', input, { idempotencyKey: requestId }),
})
