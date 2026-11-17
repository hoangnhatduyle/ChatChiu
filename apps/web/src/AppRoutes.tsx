// The route table as a component. Declarative routing (decision 815e65dc, roadmap 7.0.15): the
// data router (createBrowserRouter) costs about 18 KB gz more and nothing here needs loaders,
// since TanStack Query owns the data.
import { useRoutes } from 'react-router'
import { routes } from './routes'

export function AppRoutes() {
  return useRoutes(routes)
}
