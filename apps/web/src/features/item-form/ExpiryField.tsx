// Expiry (F-IF-06, F-IF-07, F-IF-08): a date picker with the quick chips (3d … 1y), "Expires in N
// days/weeks/months/years" from the purchase date (month = 30 days, year = 365, CS-DAY-MATHS), and the
// AI shelf-life suggestion: it fills the date, says what it did, and can be undone. The AI needs a
// connection (7.0.20d) and has a monthly quota.
import { addDays, addExpiryOffset, type OffsetUnit } from '@chatchiu/domain'
import { useEffect, useRef, useState } from 'react'
import { ApiClientError } from '../../core/errors'
import { expirationSuggest } from '../../data/ai'
import { useIsReachable } from '../../data/sync-status'
import { useWrite } from '../../data/write'
import { Button } from '../../ui/Button'
import { DateField } from '../../ui/DateField'
import { Field } from '../../ui/Field'
import { Select } from '../../ui/Select'
import { parseAmount } from '../item-panel/amounts'

const UNIT_OPTIONS: ReadonlyArray<{ id: OffsetUnit; label: string }> = [
  { id: 'day', label: 'days' },
  { id: 'week', label: 'weeks' },
  { id: 'month', label: 'months' },
  { id: 'year', label: 'years' },
]
const QUOTA_MESSAGE = 'Suggestions are used up for this month. Set the date yourself.'
const MAX_SUGGESTED_DAYS = 3650
const MAX_NOTE_LENGTH = 200
const SUGGEST_FAILED = "Couldn't get a suggestion. Set the date yourself."

export type ExpiryFieldProps = {
  value: string | null
  onChange: (value: string | null) => void
  /** The date the offsets count from: the purchase date, or today when there is none. */
  from: string
  purchaseDate: string | null
  itemName: string
  categoryName?: string
  locationName?: string
  error?: string
}

type Suggestion = { date: string; text: string; previous: string | null }

export function ExpiryField({
  value,
  onChange,
  from,
  purchaseDate,
  itemName,
  categoryName,
  locationName,
  error,
}: ExpiryFieldProps) {
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState<OffsetUnit>('week')
  const [amountProblem, setAmountProblem] = useState<string | null>(null)
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [suggestProblem, setSuggestProblem] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const reachable = useIsReachable()
  const suggest = useWrite(expirationSuggest)
  // What the form holds now, for an answer that arrives after she changed it.
  const latest = useRef({ value, from, itemName })
  useEffect(() => {
    latest.current = { value, from, itemName }
  })

  const setFromOffset = () => {
    const n = parseAmount(amount)
    if (!(n > 0)) {
      setAmountProblem('Enter a number above 0.')
      return
    }
    setAmountProblem(null)
    onChange(addExpiryOffset(from, n, unit))
  }

  const ask = async () => {
    const sent = { value, from, itemName: itemName.trim() }
    setAsking(true)
    setSuggestProblem(null)
    const result = await suggest({
      itemName: sent.itemName,
      categoryName,
      storageLocation: locationName,
      ...(purchaseDate ? { purchaseDate } : {}),
    }).result
    setAsking(false)
    // She changed the name or a date while it was thinking: the answer no longer fits, so it is dropped.
    const now = latest.current
    if (
      now.value !== sent.value ||
      now.from !== sent.from ||
      now.itemName.trim() !== sent.itemName
    ) {
      return
    }
    const days = result.status === 'saved' ? result.data.days : Number.NaN
    if (
      result.status === 'saved' &&
      Number.isInteger(days) &&
      days >= 1 &&
      days <= MAX_SUGGESTED_DAYS
    ) {
      const date = addDays(from, days)
      const clean = Array.from(result.data.note ?? '')
        .filter((c) => c >= ' ' && c !== '\u007f')
        .join('')
        .trim()
        .slice(0, MAX_NOTE_LENGTH)
      setSuggestion({
        date,
        text: `Suggested: ${days} ${days === 1 ? 'day' : 'days'}${clean ? ` — ${clean}` : ''}`,
        previous: value,
      })
      onChange(date)
    } else if (
      result.status === 'failed' &&
      result.error instanceof ApiClientError &&
      result.error.code === 'QUOTA_EXCEEDED'
    ) {
      setSuggestProblem(QUOTA_MESSAGE)
    } else {
      setSuggestProblem(SUGGEST_FAILED)
    }
  }

  // The line is only true while the date is still the suggested one.
  const shown = suggestion !== null && suggestion.date === value ? suggestion : null

  return (
    <div className="flex flex-col gap-3">
      <DateField
        label="Expiry date"
        value={value}
        onChange={onChange}
        quickFrom={from}
        isInvalid={error !== undefined}
        errorMessage={error}
      />
      <div className="flex flex-wrap items-end gap-2">
        <Field
          label="Expires in"
          inputMode="decimal"
          value={amount}
          onChange={setAmount}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault() // sets the date; it must not save the item
              setFromOffset()
            }
          }}
          isInvalid={amountProblem !== null}
          errorMessage={amountProblem ?? undefined}
          className="w-28"
        />
        <Select
          label="Time unit"
          options={UNIT_OPTIONS}
          value={unit}
          onChange={setUnit}
          className="w-32"
        />
        <Button onPress={setFromOffset}>Set expiry</Button>
      </div>
      <div className="flex flex-col gap-1">
        <Button
          id="suggest-expiry"
          isDisabled={!reachable || asking || itemName.trim() === ''}
          onPress={() => void ask()}
          className="self-start"
        >
          {asking ? 'Asking…' : 'Suggest expiry'}
        </Button>
        {!reachable && (
          <p className="text-sm text-muted">
            Suggestions need a connection. Set the date yourself.
          </p>
        )}
        {itemName.trim() === '' && reachable && (
          <p className="text-sm text-muted">Enter a name to get a suggestion.</p>
        )}
        <div role="status" className="min-h-5 text-sm text-muted">
          {suggestProblem}
          {shown && (
            <span className="flex items-center gap-2">
              {shown.text}
              <Button
                variant="ghost"
                aria-label="Undo suggestion"
                onPress={() => {
                  onChange(shown.previous)
                  setSuggestion(null)
                  // The Undo button is gone: keep focus on the button that asked.
                  requestAnimationFrame(() => document.getElementById('suggest-expiry')?.focus())
                }}
              >
                Undo
              </Button>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
