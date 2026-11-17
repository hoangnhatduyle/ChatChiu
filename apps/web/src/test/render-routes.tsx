// Renders the real route table the way production does: a (memory) router around <AppRoutes />.
// `location()` reads where the router currently is.
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { AppRoutes } from '../AppRoutes'
import { LocationProbe } from './LocationProbe'

export function renderRoutesAt(path: string, wrap: (children: ReactNode) => ReactNode = (c) => c) {
  const view = render(
    wrap(
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
        <LocationProbe />
      </MemoryRouter>,
    ),
  )
  const probe = () => document.querySelector<HTMLElement>('[data-testid="location"]')
  return {
    ...view,
    /** The router's current path and search. */
    location: () => probe()?.textContent ?? '',
    /** The router state of the current entry (for example the guard's `from`). */
    locationState: (): unknown => JSON.parse(probe()?.dataset.state ?? 'null'),
  }
}
