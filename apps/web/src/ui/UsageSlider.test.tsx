// Step 3.2: UsageSlider (SPEC-KB-001 F-KB-04, SPEC-QP-001 F-QP-01). Pointer drags are also covered
// in a real browser by e2e/ui/usage-slider.spec.ts; here: keyboard, ARIA and the 4 px guard.
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { TAP_GUARD_PX, USAGE_STEP_PERCENT } from '@chatchiu/domain'
import { act } from '@testing-library/react'
import { KEYBOARD_COMMIT_DELAY_MS, UsageSlider, type UsageSliderProps } from './UsageSlider'

const TRACK_WIDTH = 200

// A parent that applies the commit, as the board's cache update will (AR-WRITE-PATTERN).
function Board(props: Omit<UsageSliderProps, 'onCommit'> & { onCommit: (v: number) => void }) {
  const [value, setValue] = useState(props.value)
  return (
    <UsageSlider
      {...props}
      value={value}
      onCommit={(v) => {
        setValue(v)
        props.onCommit(v)
      }}
    />
  )
}

function setup(props: Partial<UsageSliderProps> = {}) {
  const onCommit = vi.fn()
  render(
    <Board
      label="How much Whole milk is left"
      value={60}
      onCommit={onCommit}
      mode="down-only"
      description="0.6 of 1 L"
      {...props}
    />,
  )
  const slider = screen.getByRole('slider', { name: 'How much Whole milk is left' })
  const track = document.querySelector('[data-usage-track]') as HTMLElement
  track.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: TRACK_WIDTH,
      height: 30,
      right: TRACK_WIDTH,
      bottom: 30,
      x: 0,
      y: 0,
    }) as DOMRect
  return { onCommit, slider, track }
}

const xAt = (percent: number) => (percent / 100) * TRACK_WIDTH

describe('UsageSlider off-grid values (board review)', () => {
  it('NC-KB-NO-UP-DRAG: a bar at 98% never snaps up to 100% (the amount can only go down)', async () => {
    const { onCommit, slider } = setup({ value: 98 })
    slider.focus()
    await userEvent.setup().keyboard('{ArrowRight}')
    await new Promise((resolve) => setTimeout(resolve, KEYBOARD_COMMIT_DELAY_MS + 100))
    expect(onCommit).not.toHaveBeenCalled()
  })
})

describe('UsageSlider isDisabled', () => {
  it('7.0.20: a disabled bar cannot be moved and says so to assistive tech', async () => {
    const { onCommit, slider } = setup({ isDisabled: true })
    expect(slider).toBeDisabled()
    slider.focus()
    await userEvent.setup().keyboard('{ArrowLeft}')
    await new Promise((resolve) => setTimeout(resolve, KEYBOARD_COMMIT_DELAY_MS + 100))
    expect(onCommit).not.toHaveBeenCalled()
  })
})

describe('UsageSlider', () => {
  it('CS-ACCESSIBLE-UI: names the slider and speaks the amount left', () => {
    const { slider } = setup()
    expect(slider).toHaveValue('60')
    expect(slider).toHaveAttribute('aria-valuetext', '60%')
    expect(slider).toHaveAccessibleDescription(/^0\.6 of 1 L/)
  })

  describe('keyboard', () => {
    beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
    afterEach(() => vi.useRealTimers())

    it(`F-KB-04: moves in ${USAGE_STEP_PERCENT} % steps and saves once when the keys stop (a11y review H1)`, async () => {
      const { onCommit } = setup()
      const slider = screen.getByRole('slider')
      slider.focus()
      await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}')
      expect(slider).toHaveValue('35')
      expect(onCommit).not.toHaveBeenCalled()
      act(() => vi.advanceTimersByTime(KEYBOARD_COMMIT_DELAY_MS))
      expect(onCommit).toHaveBeenCalledOnce()
      expect(onCommit).toHaveBeenCalledWith(35)
    })

    it('F-KB-04: a pending keyboard change saves at once when focus leaves', async () => {
      const { onCommit } = setup()
      const slider = screen.getByRole('slider')
      slider.focus()
      await userEvent.keyboard('{ArrowLeft}')
      act(() => slider.blur())
      expect(onCommit).toHaveBeenCalledWith(55)
      act(() => vi.advanceTimersByTime(KEYBOARD_COMMIT_DELAY_MS))
      expect(onCommit).toHaveBeenCalledOnce()
    })
  })

  it('F-KB-04 / NC-KB-NO-UP-DRAG: down-only cannot go above the value it started at', async () => {
    const { slider, onCommit } = setup()
    slider.focus()
    await userEvent.keyboard('{ArrowRight}{End}')
    expect(slider).toHaveValue('60')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('F-QP-01: free mode can go up as well as down', async () => {
    const { onCommit } = setup({ mode: 'free', value: 40 })
    const slider = screen.getByRole('slider')
    slider.focus()
    await userEvent.keyboard('{ArrowRight}')
    act(() => slider.blur())
    expect(onCommit).toHaveBeenCalledWith(45)
  })

  it('7.0.25iii: the slider says only its own amount; "only goes down" is said once per list, not per row', () => {
    const { slider } = setup()
    expect(slider).toHaveAccessibleDescription('0.6 of 1 L')
  })

  it(`F-KB-04: a pointer that moves less than ${TAP_GUARD_PX} px is a tap and changes nothing`, () => {
    const { track, slider, onCommit } = setup()
    const at = xAt(30)
    fireEvent.pointerDown(track, {
      pointerId: 1,
      isPrimary: true,
      pointerType: 'touch',
      clientX: at,
      clientY: 10,
      button: 0,
    })
    fireEvent.pointerMove(track, {
      pointerId: 1,
      isPrimary: true,
      pointerType: 'touch',
      clientX: at + TAP_GUARD_PX - 1,
      clientY: 10,
    })
    fireEvent.pointerUp(track, {
      pointerId: 1,
      isPrimary: true,
      pointerType: 'touch',
      clientX: at + TAP_GUARD_PX - 1,
      clientY: 10,
    })
    expect(onCommit).not.toHaveBeenCalled()
    expect(slider).toHaveValue('60')
  })

  it('F-KB-04: a gesture the browser cancels (finger started scrolling) saves nothing (react review)', () => {
    const { track, slider, onCommit } = setup()
    const at = xAt(30)
    const ev = { pointerId: 1, isPrimary: true, pointerType: 'touch', clientY: 10 }
    fireEvent.pointerDown(track, { ...ev, clientX: at, button: 0 })
    fireEvent.pointerMove(track, { ...ev, clientX: at - 20 })
    fireEvent.pointerCancel(track, { ...ev, clientX: at - 20 })
    expect(onCommit).not.toHaveBeenCalled()
    expect(slider).toHaveValue('60')
  })

  it('7.0.39c: in down-only mode a press on the bar above the thumb does nothing, even if dragged down', () => {
    const { track, slider, onCommit } = setup() // 60 % left
    const ev = { pointerId: 1, isPrimary: true, pointerType: 'mouse', clientY: 10 }
    fireEvent.pointerDown(track, { ...ev, clientX: xAt(96), button: 0 })
    fireEvent.pointerMove(track, { ...ev, clientX: xAt(30) })
    fireEvent.pointerUp(track, { ...ev, clientX: xAt(30) })
    expect(onCommit).not.toHaveBeenCalled()
    expect(slider).toHaveValue('60')
  })

  it('7.0.39c: a press just beside the thumb still grabs it and drags down', () => {
    const { track, onCommit } = setup() // 60 % left; the thumb is about 12 % wide
    const ev = { pointerId: 1, isPrimary: true, pointerType: 'mouse', clientY: 10 }
    fireEvent.pointerDown(track, { ...ev, clientX: xAt(64), button: 0 })
    fireEvent.pointerMove(track, { ...ev, clientX: xAt(30) })
    fireEvent.pointerUp(track, { ...ev, clientX: xAt(30) })
    // The drag is relative to where the thumb was grabbed, so it lands a little below the pointer.
    expect(onCommit).toHaveBeenCalledWith(25)
  })

  it('tone: the bar uses the low colour when the item is running low', () => {
    setup({ tone: 'low' })
    expect(document.querySelector('[data-usage-track]')).toHaveAttribute('data-tone', 'low')
  })
})
