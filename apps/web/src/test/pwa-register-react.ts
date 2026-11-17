// Test stand-in for vite-plugin-pwa's virtual:pwa-register/react (no service workers in jsdom).
import { useState } from 'react'

export function useRegisterSW() {
  const needRefresh = useState(false)
  const offlineReady = useState(false)
  return { needRefresh, offlineReady, updateServiceWorker: async () => {} }
}
