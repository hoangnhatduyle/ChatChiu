// A required pick from a list with an inline "add a new one" (F-IF-02, F-IF-03). The list can be empty:
// nothing assumes seeded categories or locations (AR-NO-SEED-ASSUMPTIONS). Adding needs the network,
// because the item must be saved with the new row's real id: offline, the add is switched off with a note.
// The add block is not a <form> (it sits inside the item form): Enter in its field adds, and never saves
// the item. Used for categories and locations (CategoryPicker.tsx, LocationPicker.tsx).
import { useRef, useState } from 'react'
import { useIsReachable } from '../../data/sync-status'
import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'
import { Select } from '../../ui/Select'

export type PickerOption = { id: number; label: string }

export type AddablePickerProps = {
  /** "Category": the field label, and the noun in the add button ("Add a new category"). */
  label: string
  noun: string
  options: readonly PickerOption[]
  value: number | null
  onChange: (id: number) => void
  /** Creates the row and answers its real id, or null when it could not be created. */
  onAdd: (name: string) => Promise<number | null>
  error?: string
}

const normalise = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()

export function AddablePicker({
  label,
  noun,
  options,
  value,
  onChange,
  onAdd,
  error,
}: AddablePickerProps) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const adds = useRef(false)
  const reachable = useIsReachable()
  const openerId = `add-${noun}`

  /** Closes the add block and puts focus back on the button that opened it. */
  const close = () => {
    setAdding(false)
    setName('')
    setProblem(null)
    requestAnimationFrame(() => document.getElementById(openerId)?.focus())
  }

  const add = async () => {
    if (adds.current) return // Enter twice, or Enter and a tap: one add
    const trimmed = name.trim().replace(/\s+/g, ' ')
    if (trimmed === '') {
      setProblem(`Enter a name for the ${noun}.`)
      return
    }
    // A name she already has is picked, not created twice.
    const existing = options.find((o) => normalise(o.label) === normalise(trimmed))
    if (existing) {
      onChange(existing.id)
      close()
      return
    }
    adds.current = true
    setBusy(true)
    setProblem(null)
    const id = await onAdd(trimmed)
    adds.current = false
    setBusy(false)
    if (id === null) {
      setProblem(`Couldn't add the ${noun}. Check your connection and try again.`)
      return
    }
    onChange(id)
    close()
  }

  return (
    <div className="flex flex-col gap-2">
      <Select
        label={`${label} (required)`}
        options={options.map((o) => ({ id: String(o.id), label: o.label }))}
        value={value === null ? null : String(value)}
        onChange={(id) => onChange(Number(id))}
        isInvalid={error !== undefined}
        errorMessage={error}
      />
      <Button
        id={openerId}
        aria-expanded={adding}
        isDisabled={!reachable}
        onPress={() => setAdding((open) => !open)}
        className="self-start"
      >
        {`Add a new ${noun}`}
      </Button>
      {!reachable && <p className="text-sm text-muted">Adding a {noun} needs a connection.</p>}
      {adding && reachable && (
        <div
          role="group"
          aria-label={`Add a new ${noun}`}
          className="flex flex-col gap-2 rounded-card border border-line p-3"
        >
          <Field
            label={`New ${noun} name`}
            value={name}
            onChange={setName}
            isInvalid={problem !== null}
            errorMessage={problem ?? undefined}
            autoComplete="off"
            autoFocus
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault() // the item form must not see this Enter
                void add()
              }
            }}
          />
          <div className="flex gap-2">
            <Button variant="primary" isDisabled={busy} onPress={() => void add()}>
              {`Add ${noun}`}
            </Button>
            <Button variant="ghost" onPress={close}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
