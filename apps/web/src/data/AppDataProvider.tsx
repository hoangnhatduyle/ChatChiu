// Gives the signed-in user a query client backed by IndexedDB (step 4.3). Mounted under RequireAuth, so
// there is always a user; a different user gets a fresh client and their own saved cache (keyed by id).
// Sign-out keeps the saved cache and queue for that user, so a session that ends with unsynced writes
// does not lose them; "Reset app cache" (Settings, 5.8) deletes it.
//
// NC-AP-NO-LOST-WRITES, in this file:
//  - saving starts only after the saved cache was read successfully (else an empty save could erase it);
//  - only the leading window (Web Locks) saves and resumes queued writes;
//  - a write is saved before it is sent (beforeSend), and the cache is saved at once when the page is
//    hidden, closed, or this provider goes away.
import {
  persistQueryClientSave,
  PersistQueryClientProvider,
} from '@tanstack/react-query-persist-client'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Outlet } from 'react-router'
import { getConnectivity } from '../core/connectivity'
import { useSession } from '../core/session-context'
import './register'
import { createLeadership } from './leadership'
import { createIdbPersister } from './persistence'
import { createWriteGate } from './write-gate'
import {
  adoptQueuedWrites,
  connectOnlineManager,
  createAppQueryClient,
  persistOptionsFor,
  resumeQueuedWrites,
} from './query-client'

export function AppDataProvider() {
  const { user } = useSession()
  return user ? <UserData key={user.id} userId={user.id} /> : null
}

function UserData({ userId }: { userId: string }) {
  const [leadership] = useState(() => createLeadership(userId))
  const isLeader = useSyncExternalStore(leadership.subscribe, leadership.isLeader)
  // Saving is allowed only once the saved cache was read successfully (see write-gate.ts).
  const [gate] = useState(createWriteGate)
  const [restoredOk, setRestoredOk] = useState(false)
  const [persister] = useState(() =>
    createIdbPersister(userId, { canWrite: () => leadership.isLeader() }),
  )
  const [persistOptions] = useState(() => persistOptionsFor(persister))
  const [client] = useState(() =>
    createAppQueryClient({
      // Write-ahead: the write is saved before it is sent.
      beforeSend: () => gate.saveIfRestored(),
    }),
  )

  useEffect(() => {
    gate.setSave(() => persistQueryClientSave({ queryClient: client, ...persistOptions }))
  }, [gate, client, persistOptions])

  useEffect(() => {
    leadership.start()
    return () => leadership.stop()
  }, [leadership])

  useEffect(() => connectOnlineManager(getConnectivity()), [])

  // Becoming the leader (the first window, or after the previous leader closed) after a good restore:
  // pick up writes another window saved, then run what is queued.
  useEffect(() => {
    if (!isLeader || !restoredOk) return
    let cancelled = false
    void adoptQueuedWrites(client, persister).then(() => {
      if (!cancelled) resumeQueuedWrites(client)
    })
    return () => {
      cancelled = true
    }
  }, [client, persister, isLeader, restoredOk])

  useEffect(() => {
    const flush = () => {
      void gate.saveIfRestored()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
      flush() // sign-out or a user switch: keep the queue
    }
  }, [gate])

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={persistOptions}
      onSuccess={() => {
        gate.setRestored(true)
        setRestoredOk(true)
      }}
      // A saved cache that could not be read is left exactly as it is, and nothing is saved over it
      // (the persister blocks writes after a failed read). The persistence status says so.
      onError={() => {
        gate.setRestored(false)
      }}
    >
      <Outlet />
    </PersistQueryClientProvider>
  )
}
