// "New version available · Reload" (SPEC-SE-001 F-SE-05). vite-plugin-pwa runs in prompt mode: a
// new deployment waits until she taps Reload, so nothing reloads under her mid-edit. The prompt
// stays until handled (no auto-close; Escape dismisses it). Its live region is always mounted, so
// the message is announced when it appears (a11y review M3).
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Toast } from '../ui/Toast'
import { REGISTER_OPTIONS } from './sw-updates'

export type UpdatePromptProps = {
  needRefresh: boolean
  onReload: () => void
  onDismiss: () => void
}

export function UpdatePrompt({ needRefresh, onReload, onDismiss }: UpdatePromptProps) {
  const dismiss = () => {
    onDismiss()
    // The prompt unmounts; put focus back on the page instead of losing it.
    document.getElementById('main')?.focus()
  }
  return (
    <div
      role="status"
      onKeyDown={(e) => e.key === 'Escape' && dismiss()}
      className="fixed inset-x-3 bottom-[calc(var(--spacing-nav)+env(safe-area-inset-bottom)+12px)] z-50 flex justify-center empty:hidden md:bottom-6"
    >
      {needRefresh && (
        <Toast
          live={false}
          message="New version available"
          actions={[{ label: 'Reload', onPress: onReload }]}
          onClose={dismiss}
          durationMs={null}
        />
      )}
    </div>
  )
}

/** Connects the prompt to the service worker registration. */
export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW(REGISTER_OPTIONS)
  return (
    <UpdatePrompt
      needRefresh={needRefresh}
      onReload={() => void updateServiceWorker(true)}
      onDismiss={() => setNeedRefresh(false)}
    />
  )
}
