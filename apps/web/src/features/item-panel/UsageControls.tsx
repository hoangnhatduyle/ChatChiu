// The "how much is left" part of the panel: the big slider (F-QP-01), the quick Used buttons
// (F-QP-02, also the single-tap way to log a use, WCAG 2.5.7) and the exact amount with a note (F-QP-03).
import type { InventoryItem } from '@chatchiu/contracts'
import { isUsedUp, lowStockLevel, percentLeft, QUICK_USED, quantityLabel } from '@chatchiu/domain'
import { useState } from 'react'
import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'
import { Segmented } from '../../ui/Segmented'
import { UsageSlider } from '../../ui/UsageSlider'
import { NOTE_MAX_LENGTH, parseAmount } from './amounts'
import type { AmountProblem, ExactAmount } from './use-panel-actions'

export type UsageControlsProps = {
  item: InventoryItem
  /** A row still being saved cannot change yet (7.0.20a). */
  isDisabled: boolean
  onLevel: (percent: number) => void
  onQuick: (points: number) => void
  onExact: (amount: ExactAmount) => AmountProblem | null
}

const MODES = [
  { id: 'used', label: 'Used' },
  { id: 'left', label: 'Left' },
] as const

export function UsageControls({ item, isDisabled, onLevel, onQuick, onExact }: UsageControlsProps) {
  const [exactOpen, setExactOpen] = useState(false)
  const left = percentLeft(item)
  const percent = left > 0 ? Math.max(1, Math.round(left)) : 0
  const usedUp = isUsedUp(item)
  const low = !usedUp && lowStockLevel(item) !== 'normal'
  const amount = quantityLabel(item)
  return (
    <section aria-labelledby="panel-left-heading" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="panel-left-heading" className="text-sm font-semibold text-muted">
          How much is left
        </h3>
        <p className="text-md text-muted">
          <span className="font-mono text-xl font-extrabold text-ink">{percent}%</span> · {amount}
          {usedUp && ' · Used up'}
          {low && ' · Low'}
        </p>
      </div>
      <UsageSlider
        label={`How much ${item.name} is left`}
        value={percent}
        mode="free"
        size="big"
        description={amount}
        tone={low ? 'low' : 'normal'}
        isDisabled={isDisabled}
        onCommit={onLevel}
      />
      <p className="-mt-1 text-sm text-muted">
        Drag, or use the arrow keys. Up corrects a mistake.
      </p>
      <div role="group" aria-label="Quick use" className="grid grid-cols-2 gap-2">
        {QUICK_USED.map((quick) => (
          <Button
            key={quick.id}
            isDisabled={isDisabled || usedUp}
            onPress={() => onQuick(quick.points)}
          >
            {quick.label}
          </Button>
        ))}
      </div>
      <Button
        aria-expanded={exactOpen}
        isDisabled={isDisabled || usedUp}
        onPress={() => setExactOpen((open) => !open)}
        className="self-start"
      >
        Enter an exact amount
      </Button>
      {exactOpen && !usedUp && (
        <ExactAmountForm item={item} isDisabled={isDisabled} onExact={onExact} />
      )}
    </section>
  )
}

function ExactAmountForm({
  item,
  isDisabled,
  onExact,
}: {
  item: InventoryItem
  isDisabled: boolean
  onExact: (amount: ExactAmount) => AmountProblem | null
}) {
  const [mode, setMode] = useState<'used' | 'left'>('used')
  const [text, setText] = useState('')
  const [notes, setNotes] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const save = () => {
    const amount = parseAmount(text)
    if (!(amount > 0 || (mode === 'left' && amount === 0))) {
      setProblem('Enter an amount.')
      return
    }
    const refused = onExact({ mode, amount, notes: notes.trim() || undefined })
    setProblem(refused)
    if (refused === null) {
      setText('')
      setNotes('')
    }
  }

  return (
    <form
      className="flex flex-col gap-2 rounded-card border border-line p-3"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <Segmented label="Exact amount" options={MODES} value={mode} onChange={setMode} />
      <div className="flex gap-2">
        <Field
          label={`Amount (${item.unit})`}
          inputMode="decimal"
          value={text}
          onChange={setText}
          isDisabled={isDisabled}
          errorMessage={problem ?? undefined}
          isInvalid={problem !== null}
          className="flex-1"
        />
        <Field
          label="Note (optional)"
          maxLength={NOTE_MAX_LENGTH}
          value={notes}
          onChange={setNotes}
          isDisabled={isDisabled}
          className="flex-1"
        />
      </div>
      <Button type="submit" isDisabled={isDisabled} className="self-start">
        Save amount
      </Button>
    </form>
  )
}
