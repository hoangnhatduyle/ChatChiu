// "Reset app cache" (SPEC-SE-001 F-SE-05): forget what this device saved for her (the cached lists and any
// writes still waiting, which is why the screen asks first) and the app's offline files, then reload to
// fetch everything fresh. Her data on the server is not touched.
import type { QueryClient } from '@tanstack/react-query'
import { deletePersistedCache } from './persistence'

export async function resetAppCache(client: QueryClient, userId: string): Promise<void> {
  client.clear()
  await deletePersistedCache(userId)
  if ('caches' in window) {
    for (const name of await caches.keys()) await caches.delete(name)
  }
  window.location.reload()
}
