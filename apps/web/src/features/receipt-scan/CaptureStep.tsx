// Step one (F-RS-01): the receipt date, then a photo from the camera or the gallery. While the photo is
// shrunk, uploaded and read the screen says which of those it is doing; a failure shows why, with Try again.
import { Button } from '../../ui/Button'
import { LabelledDate } from './controls'
import { cx } from '../../ui/cx'
import { PRESSABLE } from '../../ui/Button'
import type { Phase } from './receipt-flow'

const WORKING: Partial<Record<Phase, string>> = {
  COMPRESSING: 'Getting the photo ready…',
  UPLOADING: 'Uploading the photo…',
  READING: 'Reading your receipt… this takes a few seconds.',
}

function PhotoPicker({
  label,
  capture,
  disabled,
  primary,
  onFile,
}: {
  label: string
  capture?: boolean
  disabled: boolean
  primary?: boolean
  onFile: (file: File) => void
}) {
  // A real <label> around the file input: native, keyboard reachable and named by its text.
  return (
    <label
      className={cx(
        PRESSABLE,
        'min-h-13 cursor-pointer rounded-pill px-5 text-base has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-(--focus)',
        primary ? 'bg-accent text-accent-ink' : 'border border-field-line bg-surface text-ink',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <input
        type="file"
        accept="image/*"
        capture={capture ? 'environment' : undefined}
        disabled={disabled}
        className="sr-only"
        aria-label={label}
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onFile(file)
        }}
      />
      <span aria-hidden="true">{label}</span>
    </label>
  )
}

export function CaptureStep({
  phase,
  receiptDate,
  onDate,
  onFile,
  error,
  onRetry,
  blockedReason,
}: {
  phase: Phase
  receiptDate: string
  onDate: (date: string) => void
  onFile: (file: File) => void
  error: string | null
  onRetry: () => void
  /** Why a photo cannot be taken now (offline, lists not loaded), or null. */
  blockedReason: string | null
}) {
  const working = WORKING[phase]
  if (phase === 'ERROR') {
    return (
      <div className="flex max-w-xl flex-col items-start gap-3">
        <p
          id="scan-error"
          tabIndex={-1}
          role="alert"
          className="text-base font-semibold text-error outline-none"
        >
          {error}
        </p>
        <Button variant="primary" onPress={onRetry}>
          Try again
        </Button>
      </div>
    )
  }
  if (working) {
    return (
      <p id="scan-working" tabIndex={-1} className="text-base font-semibold text-ink outline-none">
        {working}
      </p>
    )
  }
  const disabled = blockedReason !== null
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <p className="text-md text-muted">
        Take a clear photo of the whole receipt. You check every item before anything is added.
      </p>
      <LabelledDate
        label="Receipt date"
        value={receiptDate}
        onChange={onDate}
        className="max-w-xs"
      />
      <div className="flex flex-wrap gap-2">
        <PhotoPicker label="Take photo" capture primary disabled={disabled} onFile={onFile} />
        <PhotoPicker label="Choose from gallery" disabled={disabled} onFile={onFile} />
      </div>
      {blockedReason && <p className="text-md text-muted">{blockedReason}</p>}
    </div>
  )
}
