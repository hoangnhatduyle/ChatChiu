// One item at a time (F-RS-07, the phone's layout): Back and Next, Skip to leave an item out, and the item's fields.
// The counter is a heading that takes focus when the item changes, so a screen reader says which item it is on.
import { useEffect, useRef } from 'react'
import { Button } from '../../ui/Button'
import { Switch } from '../../ui/Switch'
import { ReviewFields, type Lists } from './ReviewFields'
import type { ItemPatch, ReviewItem } from './review-model'

export function ReviewWizard({
  items,
  index,
  onIndex,
  lists,
  onChange,
}: {
  items: readonly ReviewItem[]
  index: number
  onIndex: (index: number) => void
  lists: Lists
  onChange: (key: number, patch: ItemPatch) => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const first = useRef(true)
  useEffect(() => {
    // Not on first show (the page moves focus itself): only when Back, Next or Skip changed the item.
    if (first.current) first.current = false
    else heading.current?.focus()
  }, [index])
  const item = items[index]
  if (!item) return null
  const isLast = index === items.length - 1
  const skip = () => {
    onChange(item.key, { included: false })
    if (!isLast) onIndex(index + 1)
  }
  return (
    <section aria-label="Review one item" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h3 ref={heading} tabIndex={-1} className="text-md font-bold text-ink outline-none">
          {`Item ${index + 1} of ${items.length}`}
          <span className="sr-only">{`: ${item.name}${item.included ? '' : ', not being added'}`}</span>
        </h3>
        <Switch
          label="Add this item"
          isSelected={item.included}
          onChange={(included) => onChange(item.key, { included })}
        />
      </div>
      {/* Keyed by item, so each item starts with its own typed text. */}
      <ReviewFields
        key={item.key}
        item={item}
        lists={lists}
        onChange={(patch) => onChange(item.key, patch)}
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" isDisabled={index === 0} onPress={() => onIndex(index - 1)}>
          Back
        </Button>
        <Button variant="secondary" onPress={skip}>
          Skip
        </Button>
        <Button variant="secondary" isDisabled={isLast} onPress={() => onIndex(index + 1)}>
          Next
        </Button>
      </div>
      {isLast && !item.included && (
        <p role="status" className="text-md text-muted">
          {`${item.name} will not be added.`}
        </p>
      )}
    </section>
  )
}
