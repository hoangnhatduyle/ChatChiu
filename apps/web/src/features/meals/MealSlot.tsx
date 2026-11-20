'use no memo' // dnd-kit hands out objects whose contents change without their identity changing
// One meal slot: a drop target that holds one meal (draggable) or an Add button (SPEC-MP-001 F-MP-03,
// F-MP-08). A meal still being created (temporary id) cannot be opened or dragged yet (7.0.20a).
import type { MealPlan } from '@chatchiu/contracts'
import { slotKey, type MealSlotType } from '@chatchiu/domain'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { cx } from '../../ui/cx'
import { Icon } from '../../ui/Icon'
import { dayLabel, MEAL_TYPE_LABEL } from './format'
import { MEAL_TONE } from './meal-style'

export type SlotTarget = { date: string; type: MealSlotType }

function DraggableMeal({ plan, onOpen }: { plan: MealPlan; onOpen: (plan: MealPlan) => void }) {
  const saving = plan.id < 0
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `meal-${plan.id}`,
    data: { plan },
    disabled: saving,
  })
  const label = `${plan.mealName}, ${plan.mealType}, ${dayLabel(plan.planDate)}${plan.isFavorite ? ', favourite' : ''}${plan.notes ? `, note: ${plan.notes}` : ''}${saving ? ', saving' : ''}`
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      aria-label={label}
      aria-disabled={saving || undefined}
      onClick={() => !saving && onOpen(plan)}
      data-meal-type={plan.mealType}
      className={cx(
        'flex min-h-touch w-full flex-1 cursor-grab flex-col items-start gap-0.5 rounded-control lg:justify-center lg:px-3',
        MEAL_TONE[plan.mealType],
        'px-2.5 py-2 text-left shadow-card outline-none transition-transform duration-fast',
        // A touch hold starts the drag: no text selection or system menu, and scrolling still works.
        'touch-manipulation select-none [-webkit-touch-callout:none]',
        'hover:-translate-y-px hover:shadow-lift focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98]',
        isDragging && 'opacity-40',
      )}
    >
      <span className="line-clamp-2 text-md font-bold lg:line-clamp-4 lg:text-base">
        {plan.isFavorite && (
          <span aria-hidden="true" className="mr-1">
            ★
          </span>
        )}
        {plan.mealName}
      </span>
      {saving ? (
        <span className="text-sm">Saving…</span>
      ) : (
        plan.notes && <span className="line-clamp-1 text-sm lg:line-clamp-3">{plan.notes}</span>
      )}
    </button>
  )
}

export function MealSlot({
  date,
  type,
  plan,
  onAdd,
  onOpen,
}: {
  date: string
  type: MealSlotType
  plan: MealPlan | undefined
  onAdd: (target: SlotTarget) => void
  onOpen: (plan: MealPlan) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: slotKey(date, type), data: { date, type } })
  return (
    <div
      ref={setNodeRef}
      className={cx(
        'flex flex-1 flex-col rounded-control p-0.5 transition-colors duration-fast',
        isOver && 'bg-chip-on/15 outline-2 outline-accent',
      )}
    >
      <p className="px-1 pb-0.5 text-sm font-semibold text-muted">{MEAL_TYPE_LABEL[type]}</p>
      {plan ? (
        <DraggableMeal plan={plan} onOpen={onOpen} />
      ) : (
        <button
          type="button"
          aria-label={`Add ${type}, ${dayLabel(date)}`}
          onClick={() => onAdd({ date, type })}
          className={cx(
            'flex min-h-touch w-full flex-1 cursor-pointer items-center justify-center rounded-control',
            'border border-dashed border-field-line text-muted outline-none',
            'hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2',
          )}
        >
          <Icon name="plus" size={18} />
        </button>
      )}
    </div>
  )
}
