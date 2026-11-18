// Step 6.1 (SPEC-AP-001 NC-AP-BUDGET): the react-aria slider is not in the initial JS. A row first
// draws a static bar of the same size (no layout shift), loads the slider after first paint, and
// offers a visible retry if that chunk cannot be fetched (a silent dead bar would hide the failure).
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const PROPS = {
  label: 'How much Whole milk is left',
  value: 60,
  mode: 'down-only' as const,
  onCommit: () => undefined,
}

// A fresh copy of the modules, so their "loaded" state is the cold start the browser sees.
async function fresh() {
  vi.resetModules()
  const [{ UsageSlider }, loader] = await Promise.all([
    import('./UsageSlider'),
    import('./usage-slider-loader'),
  ])
  return { UsageSlider, ...loader }
}

// The slider chunk fails to load for its first `failFirst` attempts.
function failChunk(failFirst: number) {
  let calls = 0
  vi.doMock('./UsageSliderImpl', async (importOriginal) => {
    calls += 1
    if (calls <= failFirst) throw new Error('Failed to fetch dynamically imported module')
    return importOriginal()
  })
}

const RETRY_NAME = /couldn't load\. tap to retry: how much whole milk is left/i

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.doUnmock('./UsageSliderImpl')
  vi.resetModules()
  vi.restoreAllMocks()
})

describe('UsageSlider loading (NC-AP-BUDGET)', () => {
  it('draws a static bar with no slider role before the chunk has loaded, then the slider', async () => {
    const { UsageSlider } = await fresh()
    render(<UsageSlider {...PROPS} />)

    expect(document.querySelector('[data-usage-static]')).toBeInTheDocument()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()

    expect(await screen.findByRole('slider', { name: PROPS.label })).toBeInTheDocument()
    expect(document.querySelector('[data-usage-static]')).not.toBeInTheDocument()
  })

  it('keeps the static bar the same height as the slider (no layout shift)', async () => {
    const { UsageSlider } = await fresh()
    render(<UsageSlider {...PROPS} />)
    expect(document.querySelector('[data-usage-static]')).toHaveClass('h-touch')
    await screen.findByRole('slider')
    expect(document.querySelector('[data-usage-track]')).toHaveClass('h-touch')
  })

  it('renders the slider on the first render once the chunk is loaded', async () => {
    const { UsageSlider, loadUsageSlider } = await fresh()
    await loadUsageSlider()
    render(<UsageSlider {...PROPS} />)
    expect(screen.getByRole('slider', { name: PROPS.label })).toBeInTheDocument()
  })

  it('shows a visible retry when the chunk fails, logs the cause, and the slider appears after a retry', async () => {
    failChunk(1)
    const { UsageSlider } = await fresh()
    render(<UsageSlider {...PROPS} />)

    const retry = await screen.findByRole('button', { name: RETRY_NAME })
    expect(retry).toHaveTextContent("Couldn't load. Tap to retry")
    expect(console.warn).toHaveBeenCalled()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()

    await userEvent.click(retry)
    expect(await screen.findByRole('slider', { name: PROPS.label })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: /couldn't load/i })).toBeNull())
  })

  it('moves focus to the slider when the retry button had focus', async () => {
    failChunk(1)
    const { UsageSlider } = await fresh()
    render(<UsageSlider {...PROPS} />)
    const retry = await screen.findByRole('button', { name: RETRY_NAME })

    await userEvent.click(retry) // a click focuses the button
    const slider = await screen.findByRole('slider', { name: PROPS.label })
    expect(slider).toHaveFocus()
  })

  it('turns every failed row into a slider when one retry succeeds', async () => {
    failChunk(1)
    const { UsageSlider } = await fresh()
    render(
      <>
        <UsageSlider {...PROPS} label="How much Milk is left" />
        <UsageSlider {...PROPS} label="How much Eggs are left" />
      </>,
    )
    const retries = await screen.findAllByRole('button', { name: /couldn't load/i })
    expect(retries).toHaveLength(2)

    await userEvent.click(retries[0]!)
    expect(await screen.findAllByRole('slider')).toHaveLength(2)
  })

  it('announces a failed retry and asks for a reload after the second failure', async () => {
    failChunk(2)
    const { UsageSlider } = await fresh()
    render(<UsageSlider {...PROPS} />)
    await userEvent.click(await screen.findByRole('button', { name: RETRY_NAME }))

    const reload = await screen.findByRole('button', { name: /tap to reload/i })
    expect(screen.getByRole('status')).toHaveTextContent("Still couldn't load the control")
    expect(reload).toBeInTheDocument()
  })

  it('does nothing on a retry press while the row is disabled', async () => {
    failChunk(1)
    const { UsageSlider } = await fresh()
    render(<UsageSlider {...PROPS} isDisabled />)
    const retry = await screen.findByRole('button', { name: RETRY_NAME })
    expect(retry).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(retry)
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  })
})
