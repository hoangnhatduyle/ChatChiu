// The always-visible quick add (F-SL-01): name (required), quantity (free text such as "10" or "2 bags")
// and notes. The row shows at once; an empty name is blocked inline. The fields clear and the name field
// takes focus again, ready for the next item.
import { useId, useState } from 'react'
import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'

export type NewItem = { name: string; quantity?: string; notes?: string }

/** The contract's caps (packages/contracts shopping.ts): a longer text is stopped at the field, not by the server later. */
export const NAME_MAX = 200
export const QUANTITY_MAX = 60
export const NOTES_MAX = 500

export function QuickAdd({ onAdd }: { onAdd: (item: NewItem) => void }) {
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [notes, setNotes] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const nameId = useId()

  const submit = () => {
    const trimmed = name.trim()
    if (trimmed === '') {
      setProblem('Enter a name.')
      document.getElementById(nameId)?.focus()
      return
    }
    onAdd({
      name: trimmed,
      ...(quantity.trim() ? { quantity: quantity.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    })
    setName('')
    setQuantity('')
    setNotes('')
    setProblem(null)
    document.getElementById(nameId)?.focus()
  }

  return (
    <form
      noValidate
      aria-label="Add to the shopping list"
      className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4 shadow-card md:flex-row md:items-end"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <Field
        id={nameId}
        maxLength={NAME_MAX}
        label="Name"
        isRequired
        validationBehavior="aria"
        autoComplete="off"
        value={name}
        onChange={(value) => {
          setName(value)
          setProblem(null)
        }}
        isInvalid={problem !== null}
        errorMessage={problem ?? undefined}
        className="md:flex-[2]"
      />
      <Field
        label="Quantity (optional)"
        maxLength={QUANTITY_MAX}
        autoComplete="off"
        value={quantity}
        onChange={setQuantity}
        className="md:flex-1"
      />
      <Field
        label="Notes (optional)"
        maxLength={NOTES_MAX}
        autoComplete="off"
        value={notes}
        onChange={setNotes}
        className="md:flex-[2]"
      />
      <Button type="submit" variant="primary" className="self-start">
        Add
      </Button>
      {/* The inline error is linked to the field; this makes sure it is also spoken. */}
      <p role="alert" className="sr-only">
        {problem}
      </p>
    </form>
  )
}
