'use no memo' // see MealSlot.tsx
// The week (F-MP-01): seven days, each with breakfast, lunch and dinner, laid out as seven columns on a
// tablet and one day after another on a phone. A meal can be dragged to another slot to copy it (F-MP-08):
// with a mouse, by touch (hold a moment, so scrolling still works) or from the keyboard (Space, arrows, Space).
import type { MealPlan } from '@chatchiu/contracts'
import { MEAL_TYPES, slotKey, weekDates } from '@chatchiu/domain'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useState } from 'react'
import { cx } from '../../ui/cx'
import { ScrollFade } from '../../ui/ScrollFade'
import { dayLabel, MEAL_TYPE_LABEL } from './format'
import { MealSlot, type SlotTarget } from './MealSlot'
import { slotKeyboardCoordinates } from './slot-keyboard'
import type { MealSlotType } from '@chatchiu/domain'

const MOUSE_DRAG_DISTANCE_PX = 6
const TOUCH_HOLD_MS = 250
const TOUCH_TOLERANCE_PX = 8

const planOf = (event: { active: { data: { current?: Record<string, unknown> } } }) =>
  event.active.data.current?.plan as MealPlan | undefined

export function WeekGrid({
  date,
  today,
  plans,
  onAdd,
  onOpen,
  onDrop,
}: {
  date: string
  today: string
  plans: readonly MealPlan[]
  onAdd: (target: SlotTarget) => void
  onOpen: (plan: MealPlan) => void
  onDrop: (plan: MealPlan, date: string, type: MealSlotType) => void
}) {
  const [dragging, setDragging] = useState<MealPlan | null>(null)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: MOUSE_DRAG_DISTANCE_PX } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: TOUCH_HOLD_MS, tolerance: TOUCH_TOLERANCE_PX },
    }),
    useSensor(KeyboardSensor, {
      // Enter opens the meal (a plain button press); only Space picks it up.
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
      coordinateGetter: slotKeyboardCoordinates,
    }),
  )
  const bySlot = new Map(plans.map((p) => [slotKey(p.planDate, p.mealType), p]))

  const end = (event: DragEndEvent) => {
    setDragging(null)
    const plan = planOf(event)
    const target = event.over?.data.current as SlotTarget | undefined
    if (plan && target) onDrop(plan, target.date, target.type)
  }
  const nameOf = (event: { active: { data: { current?: Record<string, unknown> } } }) =>
    planOf(event)?.mealName ?? 'meal'

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e: DragStartEvent) => setDragging(planOf(e) ?? null)}
      onDragEnd={end}
      onDragCancel={() => setDragging(null)}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            'To copy this meal to another slot, press Space, move with the arrow keys, then press Space again. Escape cancels.',
        },
        announcements: {
          onDragStart: (e) => `Picked up ${nameOf(e)}.`,
          onDragOver: (e) => {
            const over = e.over?.data.current as SlotTarget | undefined
            if (!over) return `${nameOf(e)} is not over a slot.`
            const there = bySlot.get(slotKey(over.date, over.type))
            return `${nameOf(e)} is over ${MEAL_TYPE_LABEL[over.type]} on ${dayLabel(over.date)}, ${there ? `which has ${there.mealName}` : 'which is empty'}.`
          },
          onDragEnd: (e) => {
            const over = e.over?.data.current as SlotTarget | undefined
            return over
              ? `Dropped ${nameOf(e)} on ${MEAL_TYPE_LABEL[over.type]} on ${dayLabel(over.date)}.`
              : `${nameOf(e)} was not dropped on a slot.`
          },
          onDragCancel: (e) => `Cancelled. ${nameOf(e)} was not copied.`,
        },
      }}
    >
      {/* Seven columns from 768 px (a swipe row only if the window is narrower than that, with a quiet bar); one day after another on a phone. */}
      <ScrollFade
        label="Week"
        tone="bg"
        axis="x"
        scrollerClassName="-mx-1.5 -mt-1.5 -mb-6 px-1.5 pt-1.5 pb-8"
      >
        {/* From 1024 px the columns stretch to the bottom of the window, so the slots are big enough to read a whole meal. */}
        <ol className="grid gap-3 md:grid-cols-[repeat(7,minmax(112px,1fr))] md:gap-2.5 lg:min-h-[calc(100dvh-16rem)]">
          {weekDates(date).map((day) => (
            <li
              key={day}
              aria-current={day === today ? 'date' : undefined}
              className={cx(
                'flex min-w-0 flex-col rounded-panel p-2.5',
                day === today
                  ? 'border-2 border-accent bg-tint-teal shadow-lift'
                  : 'border border-line bg-surface shadow-card',
              )}
            >
              <h3 className="flex items-center gap-1.5 px-1 pb-1.5 font-display text-md font-bold text-ink">
                {dayLabel(day)}
                {day === today && (
                  <span className="ml-auto rounded-pill bg-accent px-2 text-xs font-bold text-accent-ink">
                    Today
                  </span>
                )}
              </h3>
              <div className="flex flex-1 flex-col gap-1.5">
                {MEAL_TYPES.map((type) => (
                  <MealSlot
                    key={type}
                    date={day}
                    type={type}
                    plan={bySlot.get(slotKey(day, type))}
                    onAdd={onAdd}
                    onOpen={onOpen}
                  />
                ))}
              </div>
            </li>
          ))}
        </ol>
      </ScrollFade>
      <DragOverlay>
        {dragging && (
          <div className="rounded-control border border-accent bg-surface px-3 py-2 text-md font-bold shadow-pop">
            {dragging.mealName}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
