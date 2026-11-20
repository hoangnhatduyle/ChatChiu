// SPEC-ST-001 the Waste & Stats page, rendered with the real data hooks against a mocked API client.
// Titles name the acceptance criteria (F-ST-01..08) and the negative constraints.
import 'fake-indexeddb/auto'
import type { Bootstrap, StatsOverview, WasteEntry } from '@chatchiu/contracts'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, vi } from 'vitest'
import { ApiClientError } from '../../core/errors'
import { ToastProvider } from '../../core/toast'
import '../../data/register'
import { FailedWriteToasts } from '../../data/failed-write-toasts'
import { queryKeys } from '../../data/query'
import { createAppQueryClient } from '../../data/query-client'
import StatsPage from './StatsPage'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))
vi.mock('../../core/api-client', () => ({ api }))

const HOLD_WINDOW_WAIT_MS = 7000

const categories = [
  { id: 1, name: 'Dairy', icon: null, color: null, userId: 'u', isSystem: false },
  { id: 2, name: 'Meat', icon: null, color: null, userId: 'u', isSystem: false },
]
const bootstrap = { items: [], locations: [], categories, summary: {} } as unknown as Bootstrap

let nextId = 1
const entry = (
  itemName: string,
  wastedDate: string,
  extra: Partial<WasteEntry> = {},
): WasteEntry => ({
  id: nextId++,
  userId: 'u',
  itemName,
  categoryId: 1,
  categoryName: 'Dairy',
  quantity: 1,
  unit: 'pcs',
  price: 1,
  wastedDate,
  ...extra,
})

function makeOverview(extra: Partial<StatsOverview> = {}): StatsOverview {
  return {
    range: 'all',
    stock: { totalItems: 12, totalValue: 2.4, expiringCount: 3, expiredCount: 1 },
    byCategory: [{ categoryId: 1, category: 'Dairy', count: 7, value: 2.4 }],
    byLocation: [{ locationId: 1, location: 'Fridge', count: 9 }],
    recentlyAdded: [],
    waste: {
      totalItems: 2,
      totalValue: 5.4,
      last30dCount: 4,
      last30dValue: 7.5,
      byMonth: [
        { month: '2026-10', itemsWasted: 1, valueLost: 3 },
        { month: '2026-11', itemsWasted: 1, valueLost: 2.4 },
      ],
      byCategory: [
        { categoryId: 1, categoryName: 'Dairy', itemsWasted: 1, valueLost: 2.4 },
        { categoryId: null, categoryName: null, itemsWasted: 1, valueLost: 3 },
      ],
      mostWastedByCount: [],
      mostWastedByValue: [],
    },
    lowStock: [],
    ...extra,
  }
}

type Server = { overview: StatsOverview; waste: WasteEntry[]; items: object[] }
let server: Server
let client: QueryClient

function renderPage(init: Partial<Server> = {}, path = '/stats') {
  server = { overview: makeOverview(), waste: [], items: [], ...init }
  api.get.mockImplementation((route: string) => {
    if (route === '/api/stats/overview') return Promise.resolve(server.overview)
    if (route === '/api/waste') return Promise.resolve(server.waste)
    if (route === '/api/preferences') return Promise.resolve({ timezone: 'UTC' })
    return Promise.resolve({ ...bootstrap, items: server.items })
  })
  client = createAppQueryClient()
  client.mount()
  const view = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <FailedWriteToasts />
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/stats" element={<StatsPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
  return { ...view, user: userEvent.setup() }
}

const inToasts = (text: string | RegExp) =>
  within(screen.getByRole('region', { name: 'Notifications' })).findByText(text)
const stat = (label: string) => screen.getByText(label).closest('div')!
const log = () => screen.getByRole('group', { name: 'Waste log' })

beforeEach(() => {
  vi.resetAllMocks()
  window.localStorage.clear()
  nextId = 1
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-18T12:00:00Z') })
})
afterEach(() => {
  vi.useRealTimers()
  client?.unmount()
})

describe('F-ST-01 the waste log', () => {
  const milk = () => entry('Milk', '2026-11-10T09:00:00Z', { quantity: 6, unit: 'pcs', price: 0.4 })

  it('F-ST-01: each entry shows its name, quantity, unit, value and date', async () => {
    renderPage({
      waste: [milk(), entry('Cheese', '2026-11-12T09:00:00Z', { quantity: 1, price: 3 })],
    })
    const row = (
      await within(await screen.findByRole('group', { name: 'Waste log' })).findByText('Milk')
    ).closest('li')!
    expect(row).toHaveTextContent('6 pcs')
    expect(row).toHaveTextContent('$2.40')
    expect(row).toHaveTextContent('10 Nov 2026')
  })

  it('F-ST-01: delete hides the entry with Undo and sends only after the window; Undo sends nothing', async () => {
    api.delete.mockResolvedValue({ deleted: true })
    const m = milk()
    const { user } = renderPage({ waste: [m, entry('Cheese', '2026-11-12T09:00:00Z')] })
    await within(await screen.findByRole('group', { name: 'Waste log' })).findByText('Milk')
    await user.click(screen.getByRole('button', { name: /^Delete Milk, / }))
    expect(within(log()).queryByText('Milk')).not.toBeInTheDocument()
    expect(await inToasts('Milk removed')).toBeInTheDocument()
    expect(api.delete).not.toHaveBeenCalled()
    await user.click(
      within(screen.getByRole('region', { name: 'Notifications' })).getByRole('button', {
        name: 'Undo',
      }),
    )
    expect(await within(log()).findByText('Milk')).toBeInTheDocument()
    expect(api.delete).not.toHaveBeenCalled()
  })

  it('FORBID DELETED -> LISTED: once the window closes the delete is sent and the entry stays gone', async () => {
    api.delete.mockResolvedValue({ deleted: true })
    const m = milk()
    const { user } = renderPage({ waste: [m] })
    await within(await screen.findByRole('group', { name: 'Waste log' })).findByText('Milk')
    await user.click(screen.getByRole('button', { name: /^Delete Milk, / }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(1), {
      timeout: HOLD_WINDOW_WAIT_MS,
    })
    expect(api.delete.mock.calls[0]![0]).toBe(`/api/waste/${m.id}`)
    expect(within(log()).queryByText('Milk')).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Notifications' })).queryByRole('button', {
        name: 'Undo',
      }),
    ).not.toBeInTheDocument()
  }, 15_000)

  it('NC-ST-NO-UNKNOWN-CATEGORY: an entry shows its real category name, and "No category" when it has none', async () => {
    renderPage({
      waste: [
        entry('Milk', '2026-11-10T09:00:00Z', { categoryId: 1, categoryName: undefined }),
        entry('Steak', '2026-11-11T09:00:00Z', { categoryId: 2, categoryName: 'Meat' }),
        entry('Mystery', '2026-11-12T09:00:00Z', { categoryId: null, categoryName: null }),
      ],
    })
    const list = within(await screen.findByRole('group', { name: 'Waste log' }))
    expect((await list.findByText('Milk')).closest('li')).toHaveTextContent('Dairy')
    expect(list.getByText('Steak').closest('li')).toHaveTextContent('Meat')
    expect(list.getByText('Mystery').closest('li')).toHaveTextContent('No category')
    expect(screen.queryByText(/unknown/i)).not.toBeInTheDocument()
  })

  it("NC-ST-NO-RAW-PRICE-SUM: an entry's value is price × quantity, never the per-unit price", async () => {
    renderPage({
      waste: [
        entry('Eggs', '2026-11-10T09:00:00Z', { quantity: 6, price: 0.4 }),
        entry('Cheese', '2026-11-11T09:00:00Z', { quantity: 1, price: 3 }),
        entry('Gift', '2026-11-12T09:00:00Z', { quantity: 2, price: null }),
      ],
    })
    const list = within(await screen.findByRole('group', { name: 'Waste log' }))
    expect((await list.findByText('Eggs')).closest('li')).toHaveTextContent('$2.40')
    expect(list.getByText('Eggs').closest('li')).not.toHaveTextContent('$0.40')
    expect(list.getByText('Cheese').closest('li')).toHaveTextContent('$3.00')
    expect(list.getByText('Gift').closest('li')).toHaveTextContent('No price')
  })
})

describe('after a delete and on partial failures', () => {
  it('a delete that is sent refreshes the totals and charts, which the server computes', async () => {
    api.delete.mockResolvedValue({ deleted: true })
    const m = entry('Milk', '2026-11-10T09:00:00Z', { quantity: 1, price: 2 })
    const { user } = renderPage({ waste: [m] })
    await within(await screen.findByRole('group', { name: 'Waste log' })).findByText('Milk')
    const before = api.get.mock.calls.filter((c) => c[0] === '/api/stats/overview').length
    await user.click(screen.getByRole('button', { name: /^Delete Milk, / }))
    await waitFor(() => expect(api.delete).toHaveBeenCalled(), { timeout: HOLD_WINDOW_WAIT_MS })
    await waitFor(() =>
      expect(
        api.get.mock.calls.filter((c) => c[0] === '/api/stats/overview').length,
      ).toBeGreaterThan(before),
    )
  }, 15_000)

  it("moves focus to the next entry's delete button when one is deleted", async () => {
    const { user } = renderPage({
      waste: [entry('Milk', '2026-11-10T09:00:00Z'), entry('Cheese', '2026-11-09T09:00:00Z')],
    })
    await within(await screen.findByRole('group', { name: 'Waste log' })).findByText('Milk')
    await user.click(screen.getByRole('button', { name: /^Delete Milk, / }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Delete Cheese, / })).toHaveFocus(),
    )
  })

  it('says so, with Retry, when the figures for a filter cannot be loaded (no endless skeleton)', async () => {
    renderPage({}, '/stats?range=week')
    await screen.findByText('Stock value')
    api.get.mockImplementation((route: string, options?: { query?: { range?: string } }) => {
      if (route === '/api/stats/overview' && options?.query?.range === 'month')
        return Promise.reject(new ApiClientError({ status: 500, code: 'INTERNAL', message: 'no' }))
      if (route === '/api/stats/overview') return Promise.resolve(server.overview)
      if (route === '/api/waste') return Promise.resolve([])
      if (route === '/api/preferences') return Promise.resolve({ timezone: 'UTC' })
      return Promise.resolve(bootstrap)
    })
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Month' }))
    expect(await screen.findByText(/Couldn.t load the waste figures/)).toBeInTheDocument()
  })

  it('7.0.31a: a failed background refresh of the waste log says so, since the log may be older than the totals', async () => {
    renderPage({ waste: [entry('Milk', '2026-11-10T09:00:00Z')] }, '/stats')
    await within(await screen.findByRole('group', { name: 'Waste log' })).findByText('Milk')
    api.get.mockImplementation((route: string) => {
      if (route === '/api/waste')
        return Promise.reject(new ApiClientError({ status: 500, code: 'INTERNAL', message: 'no' }))
      if (route === '/api/stats/overview') return Promise.resolve(server.overview)
      if (route === '/api/preferences') return Promise.resolve({ timezone: 'UTC' })
      return Promise.resolve(bootstrap)
    })
    // A background refresh of the log fails; the old rows stay on screen and she is told.
    await act(() => client.invalidateQueries({ queryKey: queryKeys.waste }))
    expect(await screen.findByText(/Couldn.t refresh/)).toBeInTheDocument()
    expect(screen.getByText('Milk')).toBeInTheDocument()
  })

  it('ignores a category id that cannot exist (0)', async () => {
    renderPage({}, '/stats?category=0')
    await screen.findByText('Stock value')
    expect(
      api.get.mock.calls.some(
        (c) => c[0] === '/api/stats/overview' && c[1]?.query?.categoryId === 0,
      ),
    ).toBe(false)
  })
})

describe('F-ST-02 filters', () => {
  it('F-ST-02: filtering by month and by Dairy leaves only matching entries, with their category names', async () => {
    const { user } = renderPage({
      waste: [
        entry('Milk', '2026-11-10T09:00:00Z'),
        entry('Steak', '2026-11-12T09:00:00Z', { categoryId: 2, categoryName: 'Meat' }),
        entry('Yogurt', '2026-09-01T09:00:00Z'),
      ],
    })
    const list = within(await screen.findByRole('group', { name: 'Waste log' }))
    expect(await list.findByText('Yogurt')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Month' }))
    await waitFor(() => expect(list.queryByText('Yogurt')).not.toBeInTheDocument())
    expect(list.getByText('Milk')).toBeInTheDocument()
    expect(list.getByText('Steak')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Category/ }))
    await user.click(await screen.findByRole('option', { name: 'Dairy' }))
    await waitFor(() => expect(list.queryByText('Steak')).not.toBeInTheDocument())
    expect(list.getByText('Milk').closest('li')).toHaveTextContent('Dairy')
    // The totals and charts follow the same filters (the server computes them).
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        '/api/stats/overview',
        expect.objectContaining({
          query: expect.objectContaining({ range: 'month', categoryId: 1 }),
        }),
      ),
    )
  })

  it('F-ST-02: the range and category are kept in the URL', async () => {
    renderPage({ waste: [entry('Milk', '2026-11-10T09:00:00Z')] }, '/stats?range=week&category=1')
    expect(await screen.findByRole('radio', { name: 'Week', checked: true })).toBeInTheDocument()
  })
})

describe('F-ST-03 totals', () => {
  it('F-ST-03: 6 × 0.40 and 1 × 3.00 show 2 items wasted and $5.40 lost', async () => {
    renderPage()
    expect(await screen.findByText('Items wasted')).toBeInTheDocument()
    expect(stat('Items wasted')).toHaveTextContent('2')
    expect(stat('Value lost')).toHaveTextContent('$5.40')
  })
})

describe('F-ST-04 charts', () => {
  it('F-ST-04: two charts show waste by month and by category, each with its values written out and a table', async () => {
    const { user } = renderPage()
    const byMonth = await screen.findByRole('figure', { name: 'Waste by month' })
    expect(within(byMonth).getByText('Oct 2026')).toBeInTheDocument()
    expect(within(byMonth).getByText('Nov 2026')).toBeInTheDocument()
    const byCategory = screen.getByRole('figure', { name: 'Waste by category' })
    expect(within(byCategory).getByText('Dairy')).toBeInTheDocument()
    expect(within(byCategory).getByText('No category')).toBeInTheDocument()
    await user.click(within(byMonth).getByRole('button', { name: /table/i }))
    expect(within(byMonth).getByRole('table')).toBeInTheDocument()
  })

  it('NC-ST-NO-COLOUR-ONLY-CHARTS: marks are labelled with their values and use theme tokens, not fixed colours', async () => {
    renderPage()
    const byMonth = await screen.findByRole('figure', { name: 'Waste by month' })
    expect(within(byMonth).getByText('$3.00')).toBeInTheDocument()
    expect(within(byMonth).getByText('$2.40')).toBeInTheDocument()
    for (const figure of screen.getAllByRole('figure')) {
      expect(figure.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i)
      expect(figure.innerHTML).not.toMatch(/rgb\(/i)
    }
  })
})

describe('F-ST-05 overview', () => {
  it('F-ST-05: shows the stock value and counts, by category, by location, recently added and waste over 30 days', async () => {
    renderPage({
      overview: makeOverview({
        recentlyAdded: [
          {
            id: 9,
            name: 'Eggs',
            quantity: 10,
            currentQuantity: 6,
            unit: 'pcs',
            categoryId: 1,
            createdAt: '2026-11-17T09:00:00Z',
          } as unknown as StatsOverview['recentlyAdded'][number],
        ],
      }),
    })
    expect(await screen.findByText('Stock value')).toBeInTheDocument()
    expect(stat('Total items')).toHaveTextContent('12')
    expect(stat('Stock value')).toHaveTextContent('$2.40')
    expect(stat('Expiring in 7 days')).toHaveTextContent('3')
    expect(stat('Expired')).toHaveTextContent('1')
    expect(stat('Wasted in 30 days')).toHaveTextContent('4')
    expect(stat('Wasted in 30 days')).toHaveTextContent('$7.50')
    const byCategory = screen.getByRole('group', { name: 'Stock by category' })
    expect(within(byCategory).getByText('Dairy')).toBeInTheDocument()
    expect(byCategory).toHaveTextContent('$2.40')
    expect(
      within(screen.getByRole('group', { name: 'Stock by location' })).getByText('Fridge'),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('group', { name: 'Recently added' })).getByText('Eggs'),
    ).toBeInTheDocument()
  })
})

describe('F-ST-06 low stock', () => {
  const row = (extra: object) => ({
    id: 1,
    name: 'Milk',
    unit: 'L',
    categoryId: 1,
    currentQuantity: 1,
    initialQuantity: 4,
    percentLeft: 25,
    lowStockThreshold: 30,
    avgDailyUse: 0.25,
    runOutDate: '2026-11-22',
    ...extra,
  })

  it('F-ST-06: each row shows % left, the average daily use and the predicted run-out date', async () => {
    renderPage({
      overview: makeOverview({
        lowStock: [row({}), row({ id: 2, name: 'Rice', avgDailyUse: null, runOutDate: null })],
      }),
    })
    const list = within(await screen.findByRole('group', { name: 'Running low' }))
    const milk = (await list.findByText('Milk')).closest('li')!
    expect(milk).toHaveTextContent('25% left')
    expect(milk).toHaveTextContent('0.25 L a day')
    expect(milk).toHaveTextContent('runs out Sun 22 Nov')
    expect(list.getByText('Rice').closest('li')).toHaveTextContent('No usage history yet')
  })

  it('NC-ST-NO-ABSOLUTE-LOW: the list shows the percentage the server gives, not an amount compared with a threshold', async () => {
    // 5 left of 20 is 25%: below a 30% threshold, although 5 is "more than 3" in absolute terms.
    renderPage({
      overview: makeOverview({
        lowStock: [row({ name: 'Flour', unit: 'kg', currentQuantity: 5, initialQuantity: 20 })],
      }),
    })
    const flour = (await screen.findByText('Flour')).closest('li')!
    expect(flour).toHaveTextContent('25% left')
    expect(flour).toHaveTextContent('5 of 20 kg')
  })
})

describe('F-ST-07 most wasted', () => {
  it('F-ST-07: lists the top 5 by count and the top 5 by value', async () => {
    const top = (n: number, base: number) =>
      Array.from({ length: n }, (_, i) => ({
        itemName: `Item${base + i}`,
        timesWasted: 10 - i,
        totalValue: (i + 1) * 2,
      }))
    const overview = makeOverview()
    overview.waste.mostWastedByCount = top(5, 0)
    overview.waste.mostWastedByValue = top(5, 10)
    renderPage({ overview })
    const byCount = within(await screen.findByRole('group', { name: 'Most wasted by count' }))
    expect(byCount.getAllByRole('listitem')).toHaveLength(5)
    expect(byCount.getByText('Item0').closest('li')).toHaveTextContent('×10')
    const byValue = within(screen.getByRole('group', { name: 'Most wasted by value' }))
    expect(byValue.getAllByRole('listitem')).toHaveLength(5)
    expect(byValue.getByText('Item14').closest('li')).toHaveTextContent('$10.00')
  })
})

describe('F-ST-08 no quick actions', () => {
  it('F-ST-08: there is no quick-actions card', async () => {
    renderPage()
    await screen.findByText('Stock value')
    expect(screen.queryByText(/quick actions?/i)).not.toBeInTheDocument()
  })
})

describe('loading and failure', () => {
  it('says so, with Retry, when the figures cannot be loaded', async () => {
    api.get.mockRejectedValue(new ApiClientError({ status: 500, code: 'INTERNAL', message: 'no' }))
    client = createAppQueryClient()
    client.mount()
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/stats']}>
            <Routes>
              <Route path="/stats" element={<StatsPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    )
    expect(await screen.findByText(/Couldn.t load the figures/)).toBeInTheDocument()
    api.get.mockImplementation((route: string) =>
      Promise.resolve(
        route === '/api/stats/overview' ? makeOverview() : route === '/api/waste' ? [] : bootstrap,
      ),
    )
    await user.click(screen.getAllByRole('button', { name: 'Retry' })[0]!)
    expect(await screen.findByText('Stock value')).toBeInTheDocument()
  })
})

describe('UI refresh: headline, tiles, ring, next two weeks, places', () => {
  it('F-ST-10: opens with a headline in plain words', async () => {
    renderPage()
    expect(
      await screen.findByText('1 thing is past its date, 3 more need using this week.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/You have \$2\.40 in the kitchen across 12 items\./),
    ).toBeInTheDocument()
  })

  it('F-ST-05: the stock-value ring is described by its legend: every category, its items and its value', async () => {
    renderPage({
      overview: makeOverview({
        byCategory: [
          { categoryId: 1, category: 'Dairy', count: 7, value: 2.4 },
          { categoryId: 2, category: 'Meat', count: 2, value: 7.6 },
        ],
      }),
    })
    const group = await screen.findByRole('group', { name: 'Stock by category' })
    const rows = within(group).getAllByRole('button', { pressed: false })
    expect(rows.map((b) => b.textContent)).toEqual(['Meat2 · $7.60', 'Dairy7 · $2.40'])
    // The picture itself is hidden from assistive tech; the legend and the table say the same in words.
    expect(within(group).getByTestId('value-ring')).toHaveAttribute('aria-hidden', 'true')
  })

  it('F-ST-05: tapping a legend row shows that category in the ring centre; tapping again goes back', async () => {
    const { user } = renderPage({
      overview: makeOverview({
        byCategory: [
          { categoryId: 1, category: 'Dairy', count: 7, value: 2.4 },
          { categoryId: 2, category: 'Meat', count: 2, value: 7.6 },
        ],
      }),
    })
    const ring = await screen.findByTestId('value-ring')
    expect(ring).toHaveTextContent('$2.40in stock')
    const meat = screen.getByRole('button', { name: /^Meat/ })
    await user.click(meat)
    expect(meat).toHaveAttribute('aria-pressed', 'true')
    expect(ring).toHaveTextContent('$7.60Meat')
    await user.click(meat)
    expect(ring).toHaveTextContent('in stock')
  })

  it('NC-ST-NO-COLOUR-ONLY-CHARTS: the ring has its figures as a table too', async () => {
    const { user } = renderPage()
    const group = await screen.findByRole('group', { name: 'Stock by category' })
    await user.click(within(group).getByRole('button', { name: 'Show as a table' }))
    const table = within(group).getByRole('table', { name: 'Stock by category' })
    expect(within(table).getByRole('rowheader', { name: 'Dairy' })).toBeInTheDocument()
    expect(table).toHaveTextContent('$2.40')
  })

  it('F-ST-09: the next two weeks show a cell per day with its count, and today is marked', async () => {
    const item = (id: number, expirationDate: string) => ({ id, expirationDate, categoryId: 1 })
    renderPage({
      items: [
        item(1, '2026-11-18'),
        item(2, '2026-11-18'),
        item(3, '2026-11-20'),
        item(4, '2026-12-30'),
      ],
    })
    const strip = await screen.findByRole('group', { name: 'The next two weeks' })
    const cells = within(strip).getAllByRole('listitem')
    expect(cells).toHaveLength(14)
    expect(cells[0]).toHaveAttribute('aria-current', 'date')
    expect(cells[0]).toHaveTextContent('Wed 18 Nov, 2 items, today')
    expect(cells[2]).toHaveTextContent('Fri 20 Nov, 1 item')
    expect(cells[1]).toHaveTextContent('Thu 19 Nov, 0 items')
  })

  it('F-ST-05: items by place carry the place name and count', async () => {
    renderPage()
    const places = await screen.findByRole('group', { name: 'Stock by location' })
    expect(within(places).getByText('Fridge')).toBeInTheDocument()
    expect(within(places).getByText('9')).toBeInTheDocument()
  })
})
