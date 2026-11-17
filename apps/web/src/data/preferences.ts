// Preferences (step 4.4): one row per user; a change shows at once (the theme must not wait for a
// round trip) and the server's row replaces it.
import type { Preferences, PreferencesUpdate } from '@chatchiu/contracts'
import { api } from '../core/api-client'
import { queryKeys, useApiQuery } from './query'
import { defineWrite } from './write'

export const updatePreferences = defineWrite<
  PreferencesUpdate,
  Preferences,
  { before: Partial<Preferences> | null }
>({
  key: 'preferences/update',
  refetchOnFailure: queryKeys.preferences,
  label: 'Change settings',
  scope: () => 'preferences',
  request: (patch, requestId) =>
    api.patch<Preferences>('/api/preferences', patch, { idempotencyKey: requestId }),
  apply: (client, patch) => {
    const current = client.getQueryData<Preferences>(queryKeys.preferences)
    if (!current) return { before: null }
    const before: Record<string, unknown> = {}
    for (const field of Object.keys(patch)) before[field] = current[field as keyof Preferences]
    client.setQueryData<Preferences>(queryKeys.preferences, { ...current, ...patch })
    return { before: before as Partial<Preferences> }
  },
  reconcile: (client, saved) => client.setQueryData(queryKeys.preferences, saved),
  rollback: (client, { before }) => {
    if (!before) return
    client.setQueryData<Preferences>(queryKeys.preferences, (old) =>
      old ? { ...old, ...before } : old,
    )
  },
})

export const usePreferencesQuery = () =>
  useApiQuery<Preferences>(queryKeys.preferences, '/api/preferences')
