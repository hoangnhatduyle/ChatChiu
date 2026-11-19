// React.lazy keeps a rejected import forever, so after one failed chunk load (offline, or a chunk a new
// deployment removed) every later open failed too until a reload (7.0.30c). `lazyRetry` renders the current
// lazy component; the error boundary that catches the failure calls `reset()`, and the next mount loads the
// chunk again. Nothing resets on its own: a fresh lazy during the same render would retry in a loop while the
// chunk stays unreachable.
import { createElement, lazy, type ComponentType } from 'react'

export type RetryableLazy<P> = ComponentType<P> & { reset: () => void }

export function lazyRetry<P extends object>(
  load: () => Promise<{ default: ComponentType<P> }>,
): RetryableLazy<P> {
  let current = lazy(load)
  const LazyRetry = (props: P) => createElement(current as ComponentType<P>, props)
  return Object.assign(LazyRetry, {
    reset: () => {
      current = lazy(load)
    },
  })
}
