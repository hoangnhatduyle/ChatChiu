// Quick-action panel container (SPEC-QP-001): a bottom sheet on the phone, a side panel from 768 px.
// React Aria Modal + Dialog: focus is trapped and restored, Escape and the scrim close it. The
// layout switch is pure CSS (md:), so nothing re-renders when the tablet rotates.
import { useId, type ReactNode } from 'react'
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components'
import { cx } from './cx'
import { IconButton } from './IconButton'

export type ResponsivePanelProps = {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  /** Dialog title, e.g. the item name. */
  title: string
  /** Small line above the title, e.g. "Fridge · Expires in 6 days". */
  eyebrow?: string
  children: ReactNode
}

export function ResponsivePanel({
  isOpen,
  onOpenChange,
  title,
  eyebrow,
  children,
}: ResponsivePanelProps) {
  const eyebrowId = useId()
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      // The toast region sits outside the modal: pressing Undo (or Retry) there must not dismiss the panel (7.0.21a).
      shouldCloseOnInteractOutside={(element) => !element.closest('[data-live-announcer]')}
      className={cx(
        'fixed inset-0 z-40 bg-scrim',
        'data-entering:animate-[fade-in_var(--duration-fast)_ease-out]',
        'data-exiting:animate-[fade-in_var(--duration-fast)_ease-in_reverse]',
      )}
    >
      <Modal
        data-panel
        className={cx(
          'fixed inset-x-0 bottom-0 flex max-h-[90dvh] flex-col rounded-t-card bg-surface shadow-pop',
          'pb-[max(1.25rem,env(safe-area-inset-bottom))]',
          'data-entering:animate-[sheet-in_var(--duration-normal)_var(--ease-out)]',
          'data-exiting:animate-[sheet-in_var(--duration-fast)_ease-in_reverse]',
          'md:top-0 md:right-0 md:left-auto md:max-h-none md:w-[min(var(--spacing-panel),100vw)]',
          'md:rounded-none md:border-l md:border-line md:pb-5',
          'md:data-entering:animate-[panel-in_var(--duration-normal)_var(--ease-out)]',
          'md:data-exiting:animate-[panel-in_var(--duration-fast)_ease-in_reverse]',
        )}
      >
        <Dialog
          aria-describedby={eyebrow ? eyebrowId : undefined}
          className="flex min-h-0 flex-1 flex-col outline-none"
        >
          <span
            aria-hidden="true"
            className="mx-auto mt-2.5 h-1.5 w-11 shrink-0 rounded-pill bg-line md:hidden"
          />
          <header className="flex items-start gap-3 px-5 pt-3 md:px-6 md:pt-6">
            <div className="min-w-0 flex-1">
              {eyebrow && (
                <p id={eyebrowId} className="text-sm font-semibold text-muted">
                  {eyebrow}
                </p>
              )}
              <Heading
                slot="title"
                className="text-xl font-extrabold tracking-tight text-ink md:text-2xl"
              >
                {title}
              </Heading>
            </div>
            <IconButton
              icon="close"
              label="Close"
              variant="outline"
              onPress={() => onOpenChange(false)}
            />
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-2 md:px-6">{children}</div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  )
}
