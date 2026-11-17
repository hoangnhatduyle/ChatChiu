// Step 3.3: the shell, routes and navigation (SPEC-AP-001 F-AP-02, F-AP-05).
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { routes } from '../routes'
import { AppShell } from './AppShell'
import { RouteError } from './RouteError'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

const rail = () => screen.getByRole('navigation', { name: 'Main' })
const bottom = () => screen.getByRole('navigation', { name: 'Main (phone)' })
const names = (nav: HTMLElement) =>
  within(nav)
    .getAllByRole('link')
    .map((a) => a.textContent?.trim())

describe('AppShell', () => {
  it('F-AP-02: the tablet rail links Kitchen, Stock, Shopping, Meals, Stats and Settings', async () => {
    renderAt('/')
    await screen.findByRole('heading', { level: 1, name: 'Kitchen' })
    expect(names(rail())).toEqual(['Kitchen', 'Stock', 'Shopping', 'Meals', 'Stats', 'Settings'])
    expect(
      within(rail())
        .getAllByRole('link')
        .map((a) => a.getAttribute('href')),
    ).toEqual(['/', '/stock', '/shopping', '/meals', '/stats', '/settings'])
  })

  it('F-AP-02: the phone bar links Kitchen, Stock, Shopping, Meals and More', async () => {
    renderAt('/')
    await screen.findByRole('heading', { level: 1, name: 'Kitchen' })
    expect(names(bottom())).toEqual(['Kitchen', 'Stock', 'Shopping', 'Meals', 'More'])
  })

  it('F-AP-02: the current destination is marked aria-current="page" in both navs', async () => {
    renderAt('/shopping')
    await screen.findByRole('heading', { level: 1, name: 'Shopping' })
    expect(within(rail()).getByRole('link', { name: 'Shopping' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(bottom()).getByRole('link', { name: 'Shopping' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(rail()).getByRole('link', { name: 'Kitchen' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('F-AP-02: on the phone, More is the current page on /more', async () => {
    renderAt('/more')
    await screen.findByRole('heading', { level: 1, name: 'More' })
    expect(within(bottom()).getByRole('link', { name: 'More' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it.each(['/stats', '/settings'])(
    'F-AP-02: on the phone, More is marked current (not "page") on %s, which it leads to',
    async (path) => {
      renderAt(path)
      await screen.findByRole('heading', { level: 1 })
      expect(within(bottom()).getByRole('link', { name: 'More' })).toHaveAttribute(
        'aria-current',
        'true',
      )
    },
  )

  it('F-AP-02: every destination is reachable, including Waste & Stats and Settings via More', async () => {
    const router = renderAt('/more')
    await screen.findByRole('heading', { level: 1, name: 'More' })
    const main = screen.getByRole('main')
    await userEvent.click(within(main).getByRole('link', { name: /Waste & Stats/ }))
    expect(router.state.location.pathname).toBe('/stats')
    expect(await screen.findByRole('heading', { level: 1, name: 'Waste & Stats' })).toBeVisible()
  })

  it('F-AP-05: the brand reads "Chắt Chiu" with its diacritics', async () => {
    renderAt('/')
    await screen.findByRole('heading', { level: 1, name: 'Kitchen' })
    expect(within(rail()).getByRole('img', { name: 'Chắt Chiu' })).toBeInTheDocument()
  })

  it('CS-ACCESSIBLE-UI: a skip link jumps to the main content', async () => {
    renderAt('/')
    await screen.findByRole('heading', { level: 1, name: 'Kitchen' })
    const skip = screen.getByRole('link', { name: 'Skip to content' })
    expect(skip).toHaveAttribute('href', '#main')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
  })

  it('CS-ACCESSIBLE-UI: after a nav link, focus moves to the new page heading (react review HIGH)', async () => {
    renderAt('/')
    const kitchen = await screen.findByRole('heading', { level: 1, name: 'Kitchen' })
    expect(kitchen).not.toHaveFocus()
    await userEvent.click(within(rail()).getByRole('link', { name: 'Stock' }))
    const stock = await screen.findByRole('heading', { level: 1, name: 'Stock' })
    await waitFor(() => expect(stock).toHaveFocus())
  })

  it('a page that fails to load shows an error inside the shell with Reload (react review HIGH)', async () => {
    function Boom(): never {
      throw new Error('Failed to fetch dynamically imported module')
    }
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <AppShell />,
          children: [
            { errorElement: <RouteError />, children: [{ index: true, element: <Boom /> }] },
          ],
        },
      ],
      { initialEntries: ['/'] },
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<RouterProvider router={router} />)
    expect(
      await screen.findByRole('heading', { level: 1, name: "This page didn't load" }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })

  it('routes.tsx wraps every page in the RouteError boundary', () => {
    const shell = routes[0]
    expect(shell?.children?.[0]?.errorElement).toBeDefined()
  })

  it('an unknown path shows a not-found page with a way back to the kitchen', async () => {
    renderAt('/nope')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: /kitchen/i }),
    ).toHaveAttribute('href', '/')
  })
})
