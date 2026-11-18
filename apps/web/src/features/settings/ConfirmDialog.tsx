// An irreversible-action confirmation (Reset app cache). Undo is for changes that can be taken back; this one
// cannot, so it asks first (CS-UNDO-NOT-CONFIRM allows a confirm only for irreversible actions).
import { useId } from 'react'
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components'
import { Button } from '../../ui/Button'

export function ConfirmDialog({
  isOpen,
  onOpenChange,
  title,
  children,
  confirmLabel,
  onConfirm,
  isBusy,
}: {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  title: string
  children: React.ReactNode
  confirmLabel: string
  onConfirm: () => void
  isBusy?: boolean
}) {
  const bodyId = useId()
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable={!isBusy}
      isKeyboardDismissDisabled={isBusy}
      className="fixed inset-0 z-40 flex items-center justify-center bg-scrim p-4"
    >
      <Modal className="w-full max-w-sm rounded-card bg-surface p-5 shadow-pop">
        <Dialog
          role="alertdialog"
          aria-describedby={bodyId}
          className="flex flex-col gap-3 outline-none"
        >
          <Heading slot="title" className="text-lg font-extrabold text-ink">
            {title}
          </Heading>
          <div id={bodyId} className="text-md text-ink">
            {children}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              autoFocus
              isDisabled={isBusy}
              onPress={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button variant="danger" isDisabled={isBusy} onPress={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  )
}
