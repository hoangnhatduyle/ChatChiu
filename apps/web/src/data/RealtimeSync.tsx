// Starts live sync for the signed-in user, after the first paint (the realtime library is loaded then,
// not with the app: decision 815e65dc). Mounted inside AppDataProvider, so it follows the user's
// query client and stops on sign-out or a user switch.
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useSession } from '../core/session-context'
import { connectRealtime, createRealtime } from '../core/realtime'
import { applyRealtimeChange, resyncFromServer } from './realtime-sync'

/** Waits for the browser to be idle, but never longer than this, so sync starts soon after boot. */
const START_DELAY_MS = 1_500

export function RealtimeSync() {
  const client = useQueryClient()
  const userId = useSession().user?.id
  useEffect(() => {
    if (!userId) return
    const realtime = createRealtime({
      connect: () => connectRealtime(userId),
      onChange: (change) => applyRealtimeChange(client, change),
      onResync: () => resyncFromServer(client),
    })
    const timer = setTimeout(() => realtime.start(), START_DELAY_MS)
    return () => {
      clearTimeout(timer)
      realtime.stop()
    }
  }, [client, userId])
  return null
}
