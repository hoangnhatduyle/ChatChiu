// "I bought this again" (F-QP-06, D13): one simple mode. The same item is refilled to 100% with the
// amount she enters (pre-filled with its full amount); an optional new expiry (the AI can suggest one;
// it needs a connection) and the total paid, which the server stores per unit (CS-PER-UNIT-PRICE).
import type { InventoryItem } from '@chatchiu/contracts'
import { addDays, getFullQuantity, roundQuantity, todayLocalDateString } from '@chatchiu/domain'
import { useState } from 'react'
import { useIsReachable } from '../../data/sync-status'
import { expirationSuggest } from '../../data/ai'
import { useWrite } from '../../data/write'
import { Button } from '../../ui/Button'
import { DateField } from '../../ui/DateField'
import { Field } from '../../ui/Field'
import { MAX_AMOUNT, parseAmount } from './amounts'
import type { RestockRequest } from './use-panel-actions'

const SUGGEST_FAILED = "Couldn't get a suggestion. Set the date yourself."

export type RestockFormProps = {
  item: InventoryItem
  categoryName?: string
  locationName?: string
  onRestock: (request: RestockRequest) => void
  onDone: () => void
}

export function RestockForm({
  item,
  categoryName,
  locationName,
  onRestock,
  onDone,
}: RestockFormProps) {
  const [amount, setAmount] = useState(String(roundQuantity(getFullQuantity(item))))
  const [expiry, setExpiry] = useState<string | null>(null)
  const [total, setTotal] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<{ field: 'amount' | 'total'; text: string } | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const reachable = useIsReachable()
  const suggest = useWrite(expirationSuggest)
  const today = todayLocalDateString()

  const askForSuggestion = async () => {
    setSuggesting(true)
    setNote(null)
    const result = await suggest({
      itemName: item.name,
      categoryName,
      storageLocation: locationName,
      purchaseDate: today,
    }).result
    setSuggesting(false)
    if (result.status === 'saved' && Number.isFinite(result.data.days)) {
      const date = addDays(today, result.data.days)
      // A date she picked while the answer was on its way is kept.
      setExpiry((picked) => picked ?? date)
      setNote(result.data.note || `Suggested ${date}`)
    } else {
      setNote(SUGGEST_FAILED)
    }
  }

  const confirm = () => {
    const quantity = parseAmount(amount)
    if (!(quantity > 0) || quantity > MAX_AMOUNT) {
      setError({ field: 'amount', text: 'Enter the amount you have now, above 0.' })
      return
    }
    const totalPrice = total.trim() === '' ? null : parseAmount(total)
    if (totalPrice !== null && !(totalPrice > 0 && totalPrice <= MAX_AMOUNT)) {
      setError({ field: 'total', text: 'Enter the total you paid, above 0, or leave it empty.' })
      return
    }
    onRestock({
      quantity,
      ...(expiry ? { expirationDate: expiry } : {}),
      ...(totalPrice !== null ? { totalPrice } : {}),
    })
    onDone()
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-card border border-line p-3"
      onSubmit={(event) => {
        event.preventDefault()
        confirm()
      }}
    >
      <Field
        label={`New amount (${item.unit})`}
        inputMode="decimal"
        value={amount}
        onChange={setAmount}
        isInvalid={error?.field === 'amount'}
        errorMessage={error?.field === 'amount' ? error.text : undefined}
      />
      <DateField
        label="New expiry date (optional)"
        value={expiry}
        onChange={setExpiry}
        quickFrom={today}
      />
      <div className="flex flex-col gap-1">
        <Button
          isDisabled={!reachable || suggesting}
          onPress={() => void askForSuggestion()}
          className="self-start"
        >
          {suggesting ? 'Asking…' : 'Suggest expiry'}
        </Button>
        {!reachable && (
          <p className="text-sm text-muted">
            Suggestions need a connection. Set the date yourself.
          </p>
        )}
        <p role="status" className="min-h-5 text-sm text-muted">
          {note}
        </p>
      </div>
      <Field
        label="Total price (optional)"
        inputMode="decimal"
        value={total}
        onChange={setTotal}
        isInvalid={error?.field === 'total'}
        errorMessage={error?.field === 'total' ? error.text : undefined}
      />
      <div className="flex gap-2">
        <Button type="submit" variant="primary">
          Confirm restock
        </Button>
        <Button variant="ghost" onPress={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
