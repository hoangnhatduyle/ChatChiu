import { useLocation } from 'react-router'

/** Shows the router's location for tests (see render-routes.tsx). */
export function LocationProbe() {
  const { pathname, search, state } = useLocation()
  return (
    <output data-testid="location" data-state={JSON.stringify(state)}>
      {pathname + search}
    </output>
  )
}
