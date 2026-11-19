// UI refresh foundation: the Stock link carries the number of expired items, from the cached board data.
import 'fake-indexeddb/auto'
import type { Bootstrap, InventoryItem } from '@chatchiu/contracts'
import { addDays, todayLocalDateString } from '@chatchiu/domain'
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import { createAppQueryClient } from '../../data/query-client'
import { queryKeys } from '../../data/query'
import '../../data/register'
import { NavCountsContext } from '../../shell/nav-counts'
import { NavRail } from '../../shell/NavRail'
import { NavCountsProvider } from './NavCountsProvider'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))
vi.mock('../../core/api-client', () => ({ api }))

const TODAY = todayLocalDateString()
const item = (id: number, days: number) =>
  ({ id, name: `Item ${id}`, expirationDate: addDays(TODAY, days) }) as unknown as InventoryItem

describe('Stock count in the navigation', () => {
  it('shows the expired count on Stock and says it in the link name', () => {
    render(
      <MemoryRouter>
        <NavCountsContext value={{ expired: 7 }}>
          <NavRail />
        </NavCountsContext>
      </MemoryRouter>,
    )
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: /^Stock\s*, 7 expired$/ })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Kitchen' })).toBeInTheDocument()
  })

  it('shows no badge when nothing is expired', () => {
    render(
      <MemoryRouter>
        <NavRail />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Stock' })).toBeInTheDocument()
  })

  it('counts items past their date from the cached bootstrap, today and later are not expired', () => {
    const client = createAppQueryClient()
    client.mount()
    client.setQueryData(queryKeys.bootstrap, {
      items: [item(1, -3), item(2, -1), item(3, 0), item(4, 10)],
      locations: [],
      categories: [],
      summary: {},
    } as unknown as Bootstrap)
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <NavCountsProvider>
            <NavRail />
          </NavCountsProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByRole('link', { name: /^Stock\s*, 2 expired$/ })).toBeInTheDocument()
  })
})
