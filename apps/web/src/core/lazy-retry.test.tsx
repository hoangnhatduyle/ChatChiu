// 7.0.30c: React.lazy remembers a failed import for good, so "try again" after one failed chunk load
// failed until a reload. lazyRetry makes the next mount load the chunk again.
import { render, screen } from '@testing-library/react'
import { Component, Suspense, type ComponentType, type ReactNode } from 'react'
import { vi } from 'vitest'
import { lazyRetry, type RetryableLazy } from './lazy-retry'

class Catch extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  override render() {
    return this.state.failed ? <p>failed</p> : this.props.children
  }
}

const mount = (Lazy: RetryableLazy<{ name: string }>) =>
  render(
    <Catch>
      <Suspense fallback={<p>loading</p>}>
        <Lazy name="Milk" />
      </Suspense>
    </Catch>,
  )

describe('lazyRetry', () => {
  it('a load that keeps failing reaches the boundary and does not loop', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const load = vi
      .fn<() => Promise<{ default: ComponentType<{ name: string }> }>>()
      .mockRejectedValue(new Error('offline'))
    mount(lazyRetry(load))
    expect(await screen.findByText('failed')).toBeInTheDocument()
    expect(load.mock.calls.length).toBeLessThanOrEqual(2)
  })

  it('loads the component and passes its props', async () => {
    const Lazy = lazyRetry(() =>
      Promise.resolve({ default: ({ name }: { name: string }) => <p>hi {name}</p> }),
    )
    mount(Lazy)
    expect(await screen.findByText('hi Milk')).toBeInTheDocument()
  })

  it('a failed load shows the failure, and mounting it again loads the chunk again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const load = vi
      .fn<() => Promise<{ default: ComponentType<{ name: string }> }>>()
      .mockRejectedValueOnce(new Error('chunk gone'))
      .mockResolvedValue({ default: ({ name }: { name: string }) => <p>hi {name}</p> })
    const Lazy = lazyRetry(load)
    const first = mount(Lazy)
    expect(await screen.findByText('failed')).toBeInTheDocument()
    Lazy.reset() // what the error boundary does when it catches the failure
    first.unmount()
    mount(Lazy)
    expect(await screen.findByText('hi Milk')).toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(2)
  })
})
