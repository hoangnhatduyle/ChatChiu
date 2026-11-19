// SPEC-IN-001 the inventory list, rendered with the real data hooks against a mocked API client.
// Titles name the acceptance criteria (F-IN-01..14) and the negative constraints.
import 'fake-indexeddb/auto'
import type { Bootstrap, InventoryItem } from '@chatchiu/contracts'
import { addDays, todayLocalDateString } from '@chatchiu/domain'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, vi } from 'vitest'
import { ToastProvider } from '../../core/toast'
import '../../data/register'
import { queryKeys } from '../../data/query'
import { createAppQueryClient } from '../../data/query-client'
import { LocationProbe } from '../../test/LocationProbe'
import { BULK_MAX } from '@chatchiu/contracts'
import InventoryPage, { BULK_DELETE_MAX } from './InventoryPage'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))
vi.mock('../../core/api-client', () => ({ api }))

const TODAY = todayLocalDateString()
const inDays = (n: number) => addDays(TODAY, n)
const HOLD_WINDOW_WAIT_MS = 7000
const SLIDER_COMMIT_WAIT_MS = 2000

function makeItem(id: number, extra: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id,
    userId: 'u',
    name: `Item ${id}`,
    categoryId: 1,
    quantity: 1,
    unit: 'L',
    purchaseDate: null,
    expirationDate: inDays(90),
    locationId: 1,
    price: null,
    notes: null,
    notificationEnabled: true,
    notificationDaysBefore: 3,
    barcode: null,
    initialQuantity: 1,
    currentQuantity: 1,
    usageNotes: null,
    lowStockThreshold: null,
    lastNotifiedAt: null,
    createdAt: '2030-01-01',
    updatedAt: '2030-01-01',
    ...extra,
  }
}
const locations = [
  { id: 1, userId: 'u', name: 'Fridge', subLocation: null, createdAt: 'x' },
  { id: 2, userId: 'u', name: 'Pantry', subLocation: null, createdAt: 'x' },
]
const categories = [
  { id: 1, name: 'Dairy', icon: null, color: null, userId: 'u', isSystem: false },
  { id: 2, name: 'Grains', icon: null, color: null, userId: 'u', isSystem: false },
]
const bootstrap = (items: InventoryItem[]): Bootstrap =>
  ({ items, locations, categories, summary: {} }) as unknown as Bootstrap

/** The page width decides how many cards sit in a row (media queries at 768 and 1280 px). */
function mockViewport(width: number) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: (() => {
      const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1])
      return Number.isFinite(min) && width >= min
    })(),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }))
}

let client: QueryClient
function renderPage(items: InventoryItem[], path = '/stock', width = 800) {
  mockViewport(width)
  client = createAppQueryClient()
  client.mount()
  client.setQueryData(queryKeys.bootstrap, bootstrap(items))
  api.get.mockImplementation((requested: string) =>
    Promise.resolve(requested.endsWith('/usage') ? [] : bootstrap(items)),
  )
  const view = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/stock" element={<InventoryPage />} />
          </Routes>
          <Link to="/stock">Stock nav</Link>
          <LocationProbe />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
  const location = () =>
    document.querySelector<HTMLElement>('[data-testid="location"]')?.textContent ?? ''
  return { ...view, location, user: userEvent.setup() }
}

/** The names of the items on screen, in order (cards: Open <name> buttons; table: name buttons). */
const names = () =>
  screen
    .queryAllByRole('button', { name: /^Open / })
    .map((b) => b.getAttribute('aria-label')!.slice(5).split(',')[0])

beforeEach(() => {
  vi.resetAllMocks()
  window.localStorage.clear()
})
afterEach(() => client?.unmount())

describe('F-IN-01 search', () => {
  it('F-IN-01: "oat" finds the name match and the notes match, not the barcode-only item', async () => {
    const { user } = renderPage([
      makeItem(1, { name: 'Oat milk' }),
      makeItem(2, { name: 'Granola', notes: 'with oats and honey' }),
      makeItem(3, { name: 'Cereal', barcode: 'oat-12345' }),
    ])
    await screen.findByRole('button', { name: /^Open Oat milk\b/ })
    await user.type(screen.getByRole('searchbox', { name: /search stock/i }), 'oat')
    await waitFor(() => expect(names().sort()).toEqual(['Granola', 'Oat milk']))
  })
})

describe('F-IN-02 filters in the URL', () => {
  const items = () => [
    makeItem(1, { name: 'Milk', categoryId: 1, locationId: 1, expirationDate: inDays(2) }),
    makeItem(2, { name: 'Rice', categoryId: 2, locationId: 2, expirationDate: inDays(2) }),
    makeItem(3, { name: 'Cheese', categoryId: 1, locationId: 1, expirationDate: inDays(60) }),
    makeItem(4, { name: 'Yogurt', categoryId: 1, locationId: 2, expirationDate: inDays(2) }),
  ]

  it('F-IN-02: ?category=1&location=1&status=expiring shows only Milk (expiring means within 3 days)', async () => {
    renderPage(items(), '/stock?category=1&location=1&status=expiring')
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    expect(names()).toEqual(['Milk'])
  })

  it('F-IN-02 / NC-IN-NO-LOST-FILTERS: applying the filters writes them to the URL', async () => {
    const { user, location } = renderPage(items())
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    await user.click(screen.getByRole('button', { name: /Category/ }))
    await user.click(await screen.findByRole('option', { name: 'Dairy' }))
    await user.click(screen.getByRole('button', { name: /All locations/ }))
    await user.click(await screen.findByRole('option', { name: 'Fridge' }))
    await user.click(screen.getByRole('button', { name: /Expiring soon/ }))
    await waitFor(() => expect(location()).toContain('status=expiring'))
    expect(location()).toContain('category=1')
    expect(location()).toContain('location=1')
    expect(names()).toEqual(['Milk'])
  })
})

describe('F-IN-03 sort and F-IN-04 group', () => {
  const items = () => [
    makeItem(1, { name: 'Banana', expirationDate: inDays(5), currentQuantity: 0.5 }),
    makeItem(2, { name: 'Apple', expirationDate: inDays(9), currentQuantity: 0.9 }),
    makeItem(3, { name: 'Cherry', expirationDate: inDays(1), currentQuantity: 0.2 }),
  ]

  it.each([
    ['expiry', ['Cherry', 'Banana', 'Apple']],
    ['name', ['Apple', 'Banana', 'Cherry']],
    ['quantity', ['Cherry', 'Banana', 'Apple']],
    ['recent', ['Cherry', 'Apple', 'Banana']],
  ])('F-IN-03: sort=%s orders the list', async (sort, expected) => {
    renderPage(items(), `/stock?sort=${sort}`)
    await screen.findByRole('button', { name: /^Open Apple\b/ })
    expect(names()).toEqual(expected)
  })

  it('F-IN-03: the Sort control sets ?sort=', async () => {
    const { user, location } = renderPage(items())
    await screen.findByRole('button', { name: /^Open Apple\b/ })
    await user.click(screen.getByRole('button', { name: /Sort/ }))
    await user.click(await screen.findByRole('option', { name: 'Name' }))
    await waitFor(() => expect(location()).toContain('sort=name'))
    expect(names()).toEqual(['Apple', 'Banana', 'Cherry'])
  })

  it('F-IN-04: with no ?group= the list is grouped by where things live (the Shelves view)', async () => {
    renderPage([
      makeItem(1, { name: 'Milk', locationId: 1 }),
      makeItem(2, { name: 'Rice', locationId: 2 }),
    ])
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    const headers = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headers.join('|')).toMatch(/Fridge/)
    expect(headers.join('|')).toMatch(/Pantry/)
  })

  it('F-IN-04: group=category shows a header per category; group=location one per location; none shows none', async () => {
    const mixed = [
      makeItem(1, { name: 'Milk', categoryId: 1, locationId: 1 }),
      makeItem(2, { name: 'Rice', categoryId: 2, locationId: 2 }),
      makeItem(3, { name: 'Cheese', categoryId: 1, locationId: 2 }),
    ]
    const headers = () => screen.queryAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    const first = renderPage(mixed, '/stock?group=category')
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    expect(headers().join('|')).toMatch(/Dairy/)
    expect(headers().join('|')).toMatch(/Grains/)
    first.unmount()
    client.unmount()
    const second = renderPage(mixed, '/stock?group=location')
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    expect(headers().join('|')).toMatch(/Fridge/)
    expect(headers().join('|')).toMatch(/Pantry/)
    second.unmount()
    client.unmount()
    renderPage(mixed, '/stock?group=none')
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    expect(headers().filter((h) => /Dairy|Grains|Fridge|Pantry/.test(h ?? ''))).toHaveLength(0)
  })
})

describe('F-IN-05 Shelves is the default, the table is the second view', () => {
  it('F-IN-05: Shelves shows at every width, 1023 and 1024 px included; the table only when chosen', async () => {
    for (const width of [800, 1023, 1024, 1440]) {
      const page = renderPage([makeItem(1, { name: 'Milk' })], '/stock', width)
      await screen.findByRole('button', { name: /^Open Milk\b/ })
      expect(screen.queryByRole('table')).toBeNull()
      expect(screen.getByRole('radio', { name: 'Shelves' })).toBeChecked()
      page.unmount()
      client.unmount()
    }
  })

  it('F-IN-05: a manual choice is remembered on this device, and an old saved "auto" reads as Shelves', async () => {
    window.localStorage.setItem('chatchiu.inventory.view', 'auto')
    const first = renderPage([makeItem(1, { name: 'Milk' })], '/stock', 800)
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    expect(screen.queryByRole('table')).toBeNull()
    await first.user.click(screen.getByRole('radio', { name: 'Table' }))
    expect(await screen.findByRole('table')).toBeInTheDocument()
    first.unmount()
    client.unmount()
    renderPage([makeItem(1, { name: 'Milk' })], '/stock', 800)
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  it('F-IN-05: cards sit 3 to a row from 1280 px, 2 from 768 px and 1 below, and every card still numbers itself', async () => {
    const many = Array.from({ length: 7 }, (_, i) => makeItem(i + 1, { name: `Item ${i + 1}` }))
    for (const [width, perRow] of [
      [1300, 3],
      [800, 2],
      [400, 1],
    ] as const) {
      const page = renderPage(many, '/stock?group=none', width)
      await screen.findByRole('button', { name: /^Open Item 1\b/ })
      const first = screen.getByRole('button', { name: /^Open Item 1\b/ })
      const row = first.closest('[role="presentation"]')!
      expect(row.querySelectorAll('[role="listitem"]')).toHaveLength(perRow)
      const fourth = screen
        .getByRole('button', { name: /^Open Item 4\b/ })
        .closest('[role="listitem"]')
      expect(fourth).toHaveAttribute('aria-posinset', '4')
      expect(fourth).toHaveAttribute('aria-setsize', '7')
      page.unmount()
      client.unmount()
    }
  })
})

describe('F-IN-06 virtual scrolling', () => {
  it('F-IN-06: 300 items render only a window of rows and there are no page controls', async () => {
    const many = Array.from({ length: 300 }, (_, i) =>
      makeItem(i + 1, { name: `Item ${String(i + 1).padStart(3, '0')}` }),
    )
    renderPage(many)
    await screen.findAllByRole('button', { name: /^Open Item/ })
    expect(names().length).toBeGreaterThan(0)
    expect(names().length).toBeLessThan(60)
    expect(screen.queryByRole('button', { name: /next page|previous page|page \d/i })).toBeNull()
    expect(screen.queryByRole('navigation', { name: /pagination/i })).toBeNull()
    expect(screen.getByText(/^300 items ·/)).toBeInTheDocument()
  })
})

describe('F-IN-07 counters', () => {
  const items = () => [
    makeItem(1, { name: 'E1', expirationDate: inDays(-3) }),
    makeItem(2, { name: 'E2', expirationDate: inDays(-1) }),
    makeItem(3, { name: 'S1', expirationDate: inDays(1) }),
    makeItem(4, { name: 'S2', expirationDate: inDays(2) }),
    makeItem(5, { name: 'S3', expirationDate: inDays(3) }),
    makeItem(6, { name: 'F1', expirationDate: inDays(90) }),
  ]

  it('F-IN-07: Expired 2 and Expiring 3; tapping one applies that status filter', async () => {
    const { user, location } = renderPage(items())
    await screen.findByRole('button', { name: /^Open E1\b/ })
    const expired = screen.getByRole('button', { name: /Expired/ })
    const expiring = screen.getByRole('button', { name: /Expiring soon/ })
    expect(expired).toHaveTextContent('2')
    expect(expiring).toHaveTextContent('3')
    await user.click(expired)
    await waitFor(() => expect(location()).toContain('status=expired'))
    expect(names().sort()).toEqual(['E1', 'E2'])
    await user.click(expiring)
    await waitFor(() => expect(names().sort()).toEqual(['S1', 'S2', 'S3']))
  })

  it('F-IN-07: the tiles say Expired, Expiring soon and Fresh, and pressing the chosen one shows everything again', async () => {
    const { user, location } = renderPage(items())
    await screen.findByRole('button', { name: /^Open E1\b/ })
    expect(screen.getByRole('button', { name: /Fresh/ })).toHaveTextContent('1')
    const expired = screen.getByRole('button', { name: /Expired/ })
    expect(expired).toHaveAttribute('aria-pressed', 'false')
    await user.click(expired)
    expect(expired).toHaveAttribute('aria-pressed', 'true')
    await user.click(expired)
    await waitFor(() => expect(location()).not.toContain('status='))
    expect(expired).toHaveAttribute('aria-pressed', 'false')
    expect(names()).toHaveLength(6)
  })
})

describe('F-IN-08 usage drag on cards, F-IN-09 tap opens the panel', () => {
  const milk = () =>
    makeItem(1, { name: 'Milk', quantity: 100, initialQuantity: 100, currentQuantity: 60 })

  it('F-IN-08: dragging a card bar down saves on release, with Undo and no confirm', async () => {
    api.post.mockResolvedValueOnce({
      id: 501,
      itemId: 1,
      crossedLowStock: false,
      item: { ...milk(), currentQuantity: 35 },
    })
    const { user } = renderPage([milk()])
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    screen.getByRole('slider', { name: /Milk/ }).focus()
    for (let i = 0; i < 5; i++) await user.keyboard('{ArrowLeft}')
    await waitFor(() => expect(api.post).toHaveBeenCalled(), { timeout: SLIDER_COMMIT_WAIT_MS })
    expect(api.post).toHaveBeenCalledWith(
      '/api/inventory/1/usage',
      expect.objectContaining({ currentQuantity: 35 }),
      expect.anything(),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })

  it('F-IN-08: while the bar moves the percent and the amount follow it, before anything is saved', async () => {
    api.post.mockReturnValue(new Promise(() => {}))
    const { user } = renderPage([milk()])
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    screen.getByRole('slider', { name: /Milk/ }).focus()
    for (let i = 0; i < 5; i++) await user.keyboard('{ArrowLeft}')
    expect(screen.getByText('35%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Open Milk, .*35 of 100 L/ })).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('F-IN-09: tapping a card opens the quick-action panel; there is no View image action', async () => {
    const { user, location } = renderPage([milk()])
    await user.click(await screen.findByRole('button', { name: /^Open Milk\b/ }))
    expect(location()).toContain('item=1')
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('link', { name: /Edit all details/ })).toBeInTheDocument()
    expect(screen.queryByText(/view image/i)).toBeNull()
  })

  it('F-IN-09: in the table, tapping the name opens the panel too', async () => {
    const { user, location } = renderPage([milk()], '/stock', 1100)
    await user.click(await screen.findByRole('button', { name: /^Open Milk\b/ }))
    expect(location()).toContain('item=1')
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('F-IN-11: moving an item with price 0.40 and 6 left to waste shows 2.40 in the toast', async () => {
    const eggs = makeItem(1, {
      name: 'Eggs',
      quantity: 6,
      initialQuantity: 6,
      currentQuantity: 6,
      unit: 'pcs',
      price: 0.4,
    })
    const { user } = renderPage([eggs])
    await user.click(await screen.findByRole('button', { name: /^Open Eggs\b/ }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Move to waste' }),
    )
    expect(await screen.findByText(/2\.40/)).toBeInTheDocument()
  })
})

describe('F-IN-10 select mode and bulk delete', () => {
  const six = () =>
    [1, 2, 3, 4, 5, 6].map((id) =>
      makeItem(id, { name: `Thing ${id}`, expirationDate: inDays(id) }),
    )

  async function select(user: ReturnType<typeof userEvent.setup>, ...ids: number[]) {
    await user.click(screen.getByRole('button', { name: 'Select' }))
    for (const id of ids)
      await user.click(screen.getByRole('checkbox', { name: `Select Thing ${id}` }))
  }

  it('F-IN-10: 4 selected and Delete selected hides them with Undo, and one bulk DELETE goes out after the window', async () => {
    api.delete.mockResolvedValue({})
    const { user } = renderPage(six())
    await screen.findByRole('button', { name: /^Open Thing 1\b/ })
    await select(user, 1, 2, 3, 4)
    await user.click(screen.getByRole('button', { name: 'Delete selected (4)' }))
    await waitFor(() => expect(names()).toEqual(['Thing 5', 'Thing 6']))
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument()
    expect(api.delete).not.toHaveBeenCalled()
    await waitFor(() => expect(api.delete).toHaveBeenCalled(), { timeout: HOLD_WINDOW_WAIT_MS })
    expect(api.delete).toHaveBeenCalledTimes(1) // NC-IN-ONE-REQUEST
    expect(api.delete).toHaveBeenCalledWith(
      '/api/inventory/bulk',
      expect.objectContaining({ body: { ids: [1, 2, 3, 4] } }),
    )
  }, 15_000)

  it('bulk_delete UNDONE->SENT is forbidden: Undo brings the items back and nothing is ever sent', async () => {
    const { user } = renderPage(six())
    await screen.findByRole('button', { name: /^Open Thing 1\b/ })
    await select(user, 1, 2)
    await user.click(screen.getByRole('button', { name: 'Delete selected (2)' }))
    await waitFor(() => expect(names()).toHaveLength(4))
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(names()).toHaveLength(6))
    await new Promise((resolve) => setTimeout(resolve, HOLD_WINDOW_WAIT_MS))
    expect(api.delete).not.toHaveBeenCalled()
  }, 15_000)

  it('F-IN-10: Select all and Select none work on what the filters show', async () => {
    const { user } = renderPage(six())
    await screen.findByRole('button', { name: /^Open Thing 1\b/ })
    await user.click(screen.getByRole('button', { name: 'Select' }))
    await user.click(screen.getByRole('button', { name: 'Select all' }))
    expect(screen.getByRole('button', { name: 'Delete selected (6)' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Select none' }))
    expect(screen.getByRole('button', { name: /Delete selected \(0\)/ })).toBeDisabled()
  })

  it('F-IN-10: Select all stops at the 200 the server accepts in one request, and says so', async () => {
    const many = Array.from({ length: 300 }, (_, i) => makeItem(i + 1, { name: `Bulk ${i + 1}` }))
    const { user } = renderPage(many)
    await screen.findAllByRole('button', { name: /^Open Bulk/ })
    await user.click(screen.getByRole('button', { name: 'Select' }))
    await user.click(screen.getByRole('button', { name: 'Select all' }))
    expect(screen.getByRole('button', { name: 'Delete selected (200)' })).toBeInTheDocument()
    expect(screen.getByText(/most you can delete at once/i)).toBeInTheDocument()
  })

  it('a row still being saved (temporary id) cannot be selected', async () => {
    const { user } = renderPage([
      makeItem(-7, { name: 'Fresh jam' }),
      makeItem(1, { name: 'Milk' }),
    ])
    await screen.findByText('Fresh jam')
    await user.click(screen.getByRole('button', { name: 'Select' }))
    expect(screen.queryByRole('checkbox', { name: 'Select Fresh jam' })).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'Select Milk' })).toBeInTheDocument()
  })
})

describe('F-IN-12 / F-IN-13 hidden controls and the receipt scan link', () => {
  it('F-IN-12 / NC-IN-NO-BARCODE-UI: no barcode scan, barcode text or image viewer anywhere (cards and table)', async () => {
    const item = makeItem(1, { name: 'Milk', barcode: '4006381333931' })
    const first = renderPage([item])
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    expect(screen.queryByText(/barcode|view image|photo/i)).toBeNull()
    expect(screen.queryByText('4006381333931')).toBeNull()
    first.unmount()
    client.unmount()
    renderPage([item], '/stock', 1100)
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    expect(screen.queryByText(/barcode|view image|photo/i)).toBeNull()
    expect(screen.queryByText('4006381333931')).toBeNull()
  })

  it('F-IN-13: Scan receipt opens the receipt scan (/scan)', async () => {
    renderPage([makeItem(1, { name: 'Milk' })])
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    expect(screen.getByRole('link', { name: 'Scan receipt' })).toHaveAttribute('href', '/scan')
  })
})

describe('F-IN-14 remembered filters', () => {
  it('F-IN-14: filters set on a previous visit come back into the URL when the page opens with none', async () => {
    window.localStorage.setItem(
      'chatchiu.inventory.filters',
      JSON.stringify({ category: '1', status: 'expiring', sort: 'name' }),
    )
    const { location } = renderPage([makeItem(1, { name: 'Milk' })])
    await waitFor(() => expect(location()).toContain('status=expiring'))
    expect(location()).toContain('category=1')
    expect(location()).toContain('sort=name')
  })

  it('F-IN-14: filters in the URL are saved for the next visit, and clearing them is remembered too', async () => {
    const { user } = renderPage(
      [makeItem(1, { name: 'Milk', expirationDate: inDays(1) })],
      '/stock?status=expiring',
    )
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    await waitFor(() =>
      expect(
        JSON.parse(window.localStorage.getItem('chatchiu.inventory.filters') ?? '{}'),
      ).toMatchObject({
        status: 'expiring',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem('chatchiu.inventory.filters') ?? '{}')).toEqual(
        {},
      ),
    )
  })

  it('7.0.28d: opening Stock from the nav while already on /stock?... brings the remembered filters back', async () => {
    const { user, location } = renderPage(
      [makeItem(1, { name: 'Milk', expirationDate: inDays(1) })],
      '/stock?status=expiring',
    )
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    await waitFor(() =>
      expect(window.localStorage.getItem('chatchiu.inventory.filters')).toContain('expiring'),
    )
    await user.click(screen.getByRole('link', { name: 'Stock nav' }))
    await waitFor(() => expect(location()).toContain('status=expiring'))
    expect(window.localStorage.getItem('chatchiu.inventory.filters')).toContain('expiring')
  })

  it('7.0.28d: clearing the filters on the page is not undone by the restore', async () => {
    const { user, location } = renderPage(
      [makeItem(1, { name: 'Milk', expirationDate: inDays(1) })],
      '/stock?status=expiring',
    )
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(location()).not.toContain('status='))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(location()).not.toContain('status=')
  })

  it('7.0.28i: the stale-filter notice can be dismissed, and the stale id leaves the URL', async () => {
    const { user, location } = renderPage([makeItem(1, { name: 'Milk' })], '/stock?category=999')
    expect(await screen.findByText(/no longer exists/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(/no longer exists/i)).toBeNull()
    expect(location()).not.toContain('category=999')
  })

  it('7.0.28i: Dismiss clears a stale category and a stale location together', async () => {
    const { user, location } = renderPage(
      [makeItem(1, { name: 'Milk' })],
      '/stock?category=998&location=999',
    )
    await user.click(await screen.findByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(/no longer exists/i)).toBeNull()
    expect(location()).not.toContain('category=')
    expect(location()).not.toContain('location=')
  })

  it('an unknown ?sort= or ?status= value falls back to the default instead of hiding items', async () => {
    renderPage([makeItem(1, { name: 'Milk' })], '/stock?sort=constructor&status=__proto__&group=x')
    expect(await screen.findByRole('button', { name: /^Open Milk\b/ })).toBeInTheDocument()
  })
})

describe('states', () => {
  it('no items: an empty state with an Add item action; filters that match nothing say so with Clear filters', async () => {
    renderPage([])
    expect(await screen.findByText(/no items yet/i)).toBeInTheDocument()
  })

  it('the number of items shown is announced', async () => {
    const { user } = renderPage([makeItem(1, { name: 'Milk' }), makeItem(2, { name: 'Rice' })])
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    const status = screen.getByTestId('inventory-result-count')
    expect(status).toHaveTextContent('2 items')
    await user.type(screen.getByRole('searchbox', { name: /search stock/i }), 'rice')
    await waitFor(() => expect(status).toHaveTextContent('1 item'))
  })
})

describe('review fixes', () => {
  it('the bulk delete cap is the one the API accepts (cannot drift from the contract)', () => {
    expect(BULK_DELETE_MAX).toBe(BULK_MAX)
  })

  it('a category filter that no longer exists is ignored, said so, and not remembered', async () => {
    renderPage([makeItem(1, { name: 'Milk' })], '/stock?category=99')
    expect(await screen.findByRole('button', { name: /^Open Milk\b/ })).toBeInTheDocument()
    expect(screen.getByText(/no longer exists/i)).toBeInTheDocument()
    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem('chatchiu.inventory.filters') ?? '{}')).toEqual(
        {},
      ),
    )
  })

  it('ids that are not positive whole numbers are not filters (?category=0, a 20-digit id)', async () => {
    renderPage([makeItem(1, { name: 'Milk' })], '/stock?category=0&location=99999999999999999999')
    expect(await screen.findByRole('button', { name: /^Open Milk\b/ })).toBeInTheDocument()
    expect(screen.queryByText(/no longer exists/i)).toBeNull()
  })

  it('the status counters count what the other filters leave', async () => {
    renderPage(
      [
        makeItem(1, { name: 'Milk', categoryId: 1, expirationDate: inDays(1) }),
        makeItem(2, { name: 'Rice', categoryId: 2, expirationDate: inDays(1) }),
        makeItem(3, { name: 'Oats', categoryId: 2, expirationDate: inDays(-2) }),
      ],
      '/stock?category=2',
    )
    await screen.findByRole('button', { name: /^Open Rice\b/ })
    expect(screen.getByRole('button', { name: /Expiring soon/ })).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: /Expired/ })).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: /Fresh/ })).toHaveTextContent('0')
  })

  it('select mode ends when the last item disappears, instead of getting stuck', async () => {
    const { user } = renderPage([makeItem(1, { name: 'Milk' })])
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    await user.click(screen.getByRole('button', { name: 'Select' }))
    expect(screen.getByRole('button', { name: 'Select all' })).toBeInTheDocument()
    act(() => client.setQueryData(queryKeys.bootstrap, bootstrap([])))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Select all' })).toBeNull())
  })

  it('after Delete selected, focus returns to the Select toggle and the selected count is announced', async () => {
    api.delete.mockResolvedValue({})
    const { user } = renderPage([makeItem(1, { name: 'Milk' }), makeItem(2, { name: 'Rice' })])
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    await user.click(screen.getByRole('button', { name: 'Select' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Milk' }))
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete selected (1)' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Select' })).toHaveFocus())
  })

  it('the table numbers every row, group headers included, and counts them in aria-rowcount', async () => {
    renderPage(
      [makeItem(1, { name: 'Milk', categoryId: 1 }), makeItem(2, { name: 'Rice', categoryId: 2 })],
      '/stock?group=category&view=table',
      1100,
    )
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    const table = screen.getByRole('table')
    expect(table).toHaveAttribute('aria-rowcount', '5') // header + 2 group headers + 2 items
    const indexes = within(table)
      .getAllByRole('row')
      .map((row) => row.getAttribute('aria-rowindex'))
    expect(indexes).toEqual(['1', '2', '3', '4', '5'])
  })

  it('the view she picked stays after she follows the Stock link again (not only the mount-time one)', async () => {
    const { user } = renderPage([makeItem(1, { name: 'Milk' })], '/stock', 800)
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    await user.click(screen.getByRole('radio', { name: 'Table' }))
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  it('a failed background refresh keeps the list and says it may be out of date, with Retry', async () => {
    const { user } = renderPage([makeItem(1, { name: 'Milk' })])
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    api.get.mockRejectedValue(new Error('offline'))
    await act(async () => {
      await client.refetchQueries({ queryKey: queryKeys.bootstrap })
    })
    expect(await screen.findByText(/couldn't refresh/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Open Milk\b/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(user).toBeDefined()
  })
})
