// Keyboard drag between meal slots: an arrow key jumps to the nearest slot in that direction (left and
// right change the day, up and down the meal type) instead of moving 25 px at a time. Picks the slot
// whose centre is closest along the arrow, preferring ones in line with where the meal is now.
import type { KeyboardCoordinateGetter } from '@dnd-kit/core'

const DIRECTIONS: Record<string, readonly [number, number]> = {
  ArrowRight: [1, 0],
  ArrowLeft: [-1, 0],
  ArrowDown: [0, 1],
  ArrowUp: [0, -1],
}
const OFF_AXIS_WEIGHT = 2
const MIN_STEP_PX = 1

export const slotKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { context: { droppableRects, droppableContainers, collisionRect } },
) => {
  const direction = DIRECTIONS[event.code]
  if (!direction || !collisionRect) return undefined
  event.preventDefault()
  const fromX = collisionRect.left + collisionRect.width / 2
  const fromY = collisionRect.top + collisionRect.height / 2
  let best: { x: number; y: number } | undefined
  let bestScore = Number.POSITIVE_INFINITY
  for (const container of droppableContainers.getEnabled()) {
    const rect = droppableRects.get(container.id)
    if (!rect) continue
    const dx = rect.left + rect.width / 2 - fromX
    const dy = rect.top + rect.height / 2 - fromY
    const along = dx * direction[0] + dy * direction[1]
    if (along <= MIN_STEP_PX) continue
    const across = Math.abs(direction[0] === 0 ? dx : dy)
    const score = along + across * OFF_AXIS_WEIGHT
    if (score < bestScore) {
      bestScore = score
      best = { x: rect.left, y: rect.top }
    }
  }
  return best
}
