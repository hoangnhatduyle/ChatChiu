// Service-worker update checks: an installed PWA is rarely reloaded, so an open app asks for a new
// version every hour and whenever it comes back to the front (SPEC-SE-001 F-SE-05).

/** How often an open app asks for a new version (CS-NUMBERED-CONSTANTS). */
export const SW_UPDATE_CHECK_MS = 60 * 60 * 1000

/** Starts the periodic and on-focus update checks; returns a function that stops them. */
export function scheduleUpdateChecks(registration: ServiceWorkerRegistration): () => void {
  const check = () => {
    if (!registration.installing && navigator.onLine) void registration.update()
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') check()
  }
  const timer = setInterval(check, SW_UPDATE_CHECK_MS)
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisible)
  }
}

/** Options for useRegisterSW; module level, so they are not recreated on every render. */
export const REGISTER_OPTIONS = {
  onRegisteredSW(_url: string, registration: ServiceWorkerRegistration | undefined) {
    if (registration) scheduleUpdateChecks(registration)
  },
}
