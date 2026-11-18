// "This slot already has a meal": Replace it or Cancel (F-MP-04, NC-MP-NO-UNHANDLED-409). Neither empties
// the slot (forbidden CONFLICT_PROMPT -> EMPTY): Replace changes the meal that is there.
import { useId } from 'react'
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'

export function ReplacePrompt({
  canReplace,
  slot,
  existingName,
  newName,
  onReplace,
  onCancel,
}: {
  /** "Dinner on Wed 18 Nov" */
  slot: string
  /** False until the meal in the way is known and saved: a blind Replace could change the wrong thing. */
  canReplace: boolean
  existingName: string | null
  newName: string
  onReplace: () => void
  onCancel: () => void
}) {
  const descriptionId = useId()
  return (
    <ModalOverlay
      isOpen
      onOpenChange={(open) => !open && onCancel()}
      className={cx('fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4')}
    >
      <Modal className="w-full max-w-md rounded-card bg-surface p-5 shadow-pop">
        <Dialog
          role="alertdialog"
          aria-describedby={descriptionId}
          className="flex flex-col gap-3 outline-none"
        >
          <Heading slot="title" className="text-xl font-extrabold">
            Replace the meal?
          </Heading>
          <p id={descriptionId} className="text-base text-ink">
            {slot} already has {existingName ?? 'a meal'}. Replace it with {newName}?
          </p>
          <div className="flex gap-2 pt-1">
            <Button variant="primary" isDisabled={!canReplace} onPress={onReplace}>
              Replace
            </Button>
            <Button autoFocus onPress={onCancel}>
              Cancel
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  )
}
