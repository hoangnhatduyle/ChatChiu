// SPEC-KB-001 the kitchen board, rendered with the real data hooks against a mocked API client:
// columns, ordering, chips, the usage drag with Undo, the used-up toast, filters, search, the hint,
// and the states of 7.0.20 (a row still being saved, a failed load).
import 'fake-indexeddb/auto'
import type { Bootstrap, InventoryItem } from '@chatchiu/contracts'
import { addDays, todayLocalDateString } from '@chatchiu/domain'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, vi } from 'vitest'
import { ApiClientError } from '../../core/errors'
import { ToastProvider } from '../../core/toast'
import '../../data/register'
import { createAppQueryClient } from '../../data/query-client'
import { queryKeys } from '../../data/query'
import { LocationProbe } from '../../test/LocationProbe'
import KitchenBoardPage from './KitchenBoardPage'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))
vi.mock('../../core/api-client', () => ({ api }))

const TODAY = todayLocalDateString()
const inDays = (n: number) => addDays(TODAY, n)
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
  { id: 1, userId: 'u', name: 'Fridge', subLocation: 'Top shelf', createdAt: 'x' },
  { id: 2, userId: 'u', name: 'Pantry', subLocation: null, createdAt: 'x' },
]
const bootstrap = (items: InventoryItem[]): Bootstrap =>
  ({
    items,
    locations,
    categories: [{ id: 1, name: 'Dairy', icon: null, color: null, userId: 'u', isSystem: false }],
    summary: {},
  }) as unknown as Bootstrap

let client: QueryClient
function renderBoard(items: InventoryItem[] | null, path = '/') {
  client = createAppQueryClient()
  client.mount()
  if (items) client.setQueryData(queryKeys.bootstrap, bootstrap(items))
  const view = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <KitchenBoardPage />
          <LocationProbe />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
  const probe = () => document.querySelector<HTMLElement>('[data-testid="location"]')?.textContent
  return { ...view, location: () => probe() ?? '', user: userEvent.setup() }
}
const rowOf = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^Open ${name}\\b`) }).closest('li') as HTMLElement
const sliderOf = (name: string) => screen.getByRole('slider', { name: new RegExp(`${name}`) })

beforeEach(() => {
  vi.resetAllMocks()
  window.localStorage.clear()
  api.get.mockResolvedValue(bootstrap([]))
})
afterEach(() => client?.unmount())

describe('F-KB-01 / F-KB-02 / NC-KB-NO-HIDDEN-ITEMS columns', () => {
  it('F-KB-01: shows a column per location with its items and a No location column for orphans', async () => {
    renderBoard([
      makeItem(1, { name: 'Milk' }),
      makeItem(2, { name: 'Rice', locationId: 2 }),
      makeItem(3, { name: 'Orphan', locationId: null }),
      makeItem(4, { name: 'Ghost', locationId: 99 }),
    ])
    for (const name of [/Fridge - Top shelf/, /Pantry/, /No location/]) {
      expect(await screen.findByRole('heading', { level: 2, name })).toBeInTheDocument()
    }
    const noLocation = screen
      .getByRole('heading', { level: 2, name: /No location/ })
      .closest('section')!
    expect(within(noLocation).getAllByRole('listitem')).toHaveLength(2)
    expect(within(noLocation).getByRole('button', { name: /^Open Orphan\b/ })).toBeInTheDocument()
  })

  it('F-KB-01: no No location column when every item has a location', async () => {
    renderBoard([makeItem(1, { name: 'Milk' })])
    await screen.findByRole('heading', { level: 2, name: /Pantry/ })
    expect(screen.queryByRole('heading', { level: 2, name: /No location/ })).toBeNull()
  })

  it('F-KB-02: soonest expiry first, then name', async () => {
    renderBoard([
      makeItem(1, { name: 'b', expirationDate: inDays(8) }),
      makeItem(2, { name: 'z', expirationDate: inDays(5) }),
      makeItem(3, { name: 'a', expirationDate: inDays(8) }),
    ])
    await screen.findByRole('button', { name: /^Open z\b/ })
    const names = screen.getAllByRole('button', { name: /^Open / }).map((b) => b.textContent)
    expect(names.map((t) => t?.charAt(0))).toEqual(['z', 'a', 'b'])
  })
})

describe('F-KB-03 / F-KB-05 / F-KB-07 what a row shows', () => {
  it('F-KB-03: chips read Expired, Today, 2d and 3 mo as text', async () => {
    renderBoard([
      makeItem(1, { name: 'A', expirationDate: inDays(-2) }),
      makeItem(2, { name: 'B', expirationDate: inDays(0) }),
      makeItem(3, { name: 'C', expirationDate: inDays(2) }),
      makeItem(4, { name: 'D', expirationDate: inDays(90) }),
    ])
    await screen.findByRole('button', { name: /^Open A\b/ })
    expect(within(rowOf('A')).getByText('Expired')).toBeInTheDocument()
    expect(within(rowOf('B')).getByText('Today')).toBeInTheDocument()
    expect(within(rowOf('C')).getByText('2d')).toBeInTheDocument()
    expect(within(rowOf('D')).getByText('3 mo')).toBeInTheDocument()
  })

  it('F-KB-05: shows 60% and "0.6 of 1 L"; the name opens the item panel through ?item=', async () => {
    const { user, location } = renderBoard([makeItem(1, { name: 'Milk', currentQuantity: 0.6 })])
    const row = rowOf('Milk')
    expect(await within(row).findByText('60%')).toBeInTheDocument()
    expect(within(row).getAllByText('0.6 of 1 L').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/can only go down/i)).toHaveLength(1) // said once per board (7.0.25iii)
    await user.click(screen.getByRole('button', { name: /^Open Milk\b/ }))
    expect(location()).toBe('/?item=1')
  })

  it('F-KB-06: there is no Edit or Track usage menu on a row', async () => {
    renderBoard([makeItem(1, { name: 'Milk' })])
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    expect(screen.queryByRole('button', { name: /edit|track usage|menu/i })).toBeNull()
  })

  it('F-KB-07 / NC-KB-NO-COLOUR-ONLY: low and very low stock carry a text cue', async () => {
    renderBoard([
      makeItem(1, { name: 'N20', quantity: 100, initialQuantity: 100, currentQuantity: 25 }),
      makeItem(2, { name: 'W18', quantity: 100, initialQuantity: 100, currentQuantity: 18 }),
      makeItem(3, { name: 'C8', quantity: 100, initialQuantity: 100, currentQuantity: 8 }),
      makeItem(4, {
        name: 'W30',
        quantity: 100,
        initialQuantity: 100,
        currentQuantity: 25,
        lowStockThreshold: 30,
      }),
    ])
    await screen.findByRole('button', { name: /^Open N20\b/ })
    expect(within(rowOf('N20')).queryByText(/low/i)).toBeNull()
    expect(within(rowOf('W18')).getByText('Low')).toBeInTheDocument()
    expect(within(rowOf('C8')).getByText('Very low')).toBeInTheDocument()
    expect(within(rowOf('W30')).getByText('Low')).toBeInTheDocument()
  })
})

describe('F-KB-04 / NC-KB-NO-CONFIRM / NC-KB-NO-UP-DRAG the usage drag', () => {
  const usageResult = (item: InventoryItem, currentQuantity: number, crossedLowStock = false) => ({
    id: 501,
    itemId: item.id,
    crossedLowStock,
    item: { ...item, currentQuantity },
  })

  async function dragTo(user: ReturnType<typeof userEvent.setup>, name: string, presses: number) {
    sliderOf(name).focus()
    for (let i = 0; i < presses; i++) await user.keyboard('{ArrowLeft}')
  }

  it('F-KB-04: 60% dragged to 35% saves without a dialog, shows an Undo toast, and Undo restores 60%', async () => {
    const milk = makeItem(1, {
      name: 'Milk',
      quantity: 100,
      initialQuantity: 100,
      currentQuantity: 60,
    })
    api.post.mockResolvedValueOnce(usageResult(milk, 35))
    const { user } = renderBoard([milk])
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    await dragTo(user, 'Milk', 5)
    await waitFor(() => expect(api.post).toHaveBeenCalled(), { timeout: SLIDER_COMMIT_WAIT_MS })
    expect(api.post).toHaveBeenCalledWith(
      '/api/inventory/1/usage',
      expect.objectContaining({ currentQuantity: 35 }),
      expect.anything(),
    )
    expect(screen.queryByRole('dialog')).toBeNull() // NC-KB-NO-CONFIRM
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument()
    expect(within(rowOf('Milk')).getByText('35%')).toBeInTheDocument()

    api.post.mockResolvedValueOnce({ ...milk, currentQuantity: 60 })
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/inventory/1/usage-undo',
        { usageId: 501 },
        expect.anything(),
      ),
    )
    await waitFor(() => expect(within(rowOf('Milk')).getByText('60%')).toBeInTheDocument())
  })

  it('SPEC-KB-001 forbidden DRAGGING->SAVED: the board shows 35% before the server has answered', async () => {
    const milk = makeItem(1, {
      name: 'Milk',
      quantity: 100,
      initialQuantity: 100,
      currentQuantity: 60,
    })
    api.post.mockReturnValue(new Promise(() => {})) // the server never answers
    const { user } = renderBoard([milk])
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    await dragTo(user, 'Milk', 5)
    await waitFor(() => expect(within(rowOf('Milk')).getByText('35%')).toBeInTheDocument(), {
      timeout: SLIDER_COMMIT_WAIT_MS,
    })
  })

  it('F-KB-18: while the bar moves the percent and the amount follow it, before anything is saved', async () => {
    const milk = makeItem(1, {
      name: 'Milk',
      quantity: 100,
      initialQuantity: 100,
      currentQuantity: 60,
    })
    api.post.mockReturnValue(new Promise(() => {}))
    const { user } = renderBoard([milk])
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    await dragTo(user, 'Milk', 5)
    expect(within(rowOf('Milk')).getByText('35%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Open Milk, 35 of 100 L/ })).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('NC-KB-NO-UP-DRAG: the board bar cannot go above the current amount', async () => {
    const { user } = renderBoard([makeItem(1, { name: 'Milk', currentQuantity: 0.6 })])
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    sliderOf('Milk').focus()
    await user.keyboard('{ArrowRight}{ArrowRight}')
    await new Promise((resolve) => setTimeout(resolve, 1000))
    expect(api.post).not.toHaveBeenCalled()
    expect(within(rowOf('Milk')).getByText('60%')).toBeInTheDocument()
  })

  it('F-KB-09: a save that crossed the low-stock line raises an in-app alert', async () => {
    const milk = makeItem(1, {
      name: 'Milk',
      quantity: 100,
      initialQuantity: 100,
      currentQuantity: 30,
    })
    api.post.mockResolvedValueOnce(usageResult(milk, 15, true))
    const { user } = renderBoard([milk])
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    await dragTo(user, 'Milk', 3)
    expect(
      await screen.findByText(/Milk is running low/i, {}, { timeout: 3000 }),
    ).toBeInTheDocument()
  })
})

describe('board review fixes', () => {
  it('NC-KB-NO-UP-DRAG: an item at 98% cannot be pushed up to 100% (no usage is logged)', async () => {
    const { user } = renderBoard([
      makeItem(1, { name: 'Oat milk', quantity: 100, initialQuantity: 100, currentQuantity: 98 }),
    ])
    await screen.findByRole('button', { name: /^Open Oat milk\b/ })
    sliderOf('Oat milk').focus()
    await user.keyboard('{ArrowRight}')
    await new Promise((resolve) => setTimeout(resolve, 1000))
    expect(api.post).not.toHaveBeenCalled()
  })

  it('NC-KB-NO-AUTO-DELETE: a sliver left (0.4%) shows 1%, not 0%, and can still be used up', async () => {
    const { user } = renderBoard([
      makeItem(1, { name: 'Salt', quantity: 1000, initialQuantity: 1000, currentQuantity: 4 }),
    ])
    expect(await within(rowOf('Salt')).findByText('1%')).toBeInTheDocument()
    api.post.mockResolvedValueOnce({
      id: 7,
      itemId: 1,
      crossedLowStock: false,
      item: makeItem(1, {
        name: 'Salt',
        quantity: 1000,
        initialQuantity: 1000,
        currentQuantity: 0,
      }),
    })
    sliderOf('Salt').focus()
    await user.keyboard('{ArrowLeft}')
    expect(
      await screen.findByText(/Salt used up/i, {}, { timeout: SLIDER_COMMIT_WAIT_MS }),
    ).toBeInTheDocument()
  })

  it('F-KB-08 / silent-failure review: if the usage save is refused, the used-up toast and its Remove button go away', async () => {
    const milk = makeItem(1, {
      name: 'Milk',
      quantity: 100,
      initialQuantity: 100,
      currentQuantity: 5,
    })
    api.post.mockRejectedValueOnce(
      new ApiClientError({ status: 400, code: 'BAD_REQUEST', message: 'nope' }),
    )
    const { user } = renderBoard([milk])
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    sliderOf('Milk').focus()
    await user.keyboard('{ArrowLeft}')
    await screen.findByText(/Milk used up/i, {}, { timeout: SLIDER_COMMIT_WAIT_MS })
    await waitFor(() => expect(screen.queryByText(/Milk used up/i)).toBeNull())
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add to shopping list' })).toBeNull()
  })

  it('F-KB-10: an unknown or old ?show= value (a prototype key, use-soon) filters nothing', async () => {
    for (const value of ['constructor', 'use-soon']) {
      const { unmount } = renderBoard([makeItem(1, { name: 'Milk' })], `/?show=${value}`)
      await screen.findByRole('button', { name: /^Open Milk\b/ })
      for (const tile of [/Expired/, /Use today/, /Running low/, /Fresh/]) {
        expect(screen.getByRole('button', { name: tile })).toHaveAttribute('aria-pressed', 'false')
      }
      unmount()
    }
  })

  it('F-KB-07 / NC-KB-NO-COLOUR-ONLY: "Very low" is drawn in the error text colour, not the red chip foreground (invisible on the card)', async () => {
    renderBoard([
      makeItem(1, { name: 'C8', quantity: 100, initialQuantity: 100, currentQuantity: 8 }),
    ])
    const cue = await within(await screen.findByRole('listitem')).findByText('Very low')
    expect(cue).toHaveClass('text-error')
  })

  it('4.1.3: the number of items shown is announced when a chip or the search changes it', async () => {
    const { user } = renderBoard([makeItem(1, { name: 'Milk' }), makeItem(2, { name: 'Rice' })])
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    const status = screen.getByTestId('board-result-count')
    expect(status).toHaveTextContent('2 items shown')
    await user.type(screen.getByRole('searchbox', { name: /search the board/i }), 'rice')
    expect(status).toHaveTextContent('1 item shown')
  })

  it('a failed background refresh keeps the board and says it may be out of date, with Retry', async () => {
    const { user } = renderBoard([makeItem(1, { name: 'Milk' })])
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    api.get.mockRejectedValue(new Error('offline'))
    await act(async () => {
      await client.refetchQueries({ queryKey: queryKeys.bootstrap })
    })
    expect(await screen.findByText(/couldn't refresh/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Open Milk\b/ })).toBeInTheDocument()
    api.get.mockResolvedValue(bootstrap([makeItem(1, { name: 'Milk' })]))
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.queryByText(/couldn't refresh/i)).toBeNull())
  })
})

describe('F-KB-08 / NC-KB-NO-AUTO-DELETE used up', () => {
  async function useUp() {
    const milk = makeItem(1, {
      name: 'Milk',
      quantity: 100,
      initialQuantity: 100,
      currentQuantity: 5,
    })
    api.post.mockResolvedValueOnce({
      id: 501,
      itemId: 1,
      crossedLowStock: false,
      item: { ...milk, currentQuantity: 0 },
    })
    const view = renderBoard([milk])
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    sliderOf('Milk').focus()
    await view.user.keyboard('{ArrowLeft}')
    await screen.findByText(/Milk used up/i, {}, { timeout: SLIDER_COMMIT_WAIT_MS })
    return view
  }

  it('F-KB-08: dragging to 0% shows "Milk used up" with Add to shopping list and Remove; Milk stays, greyed, at 0%', async () => {
    await useUp()
    expect(screen.getByRole('button', { name: 'Add to shopping list' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
    const row = rowOf('Milk')
    expect(within(row).getByText('0%')).toBeInTheDocument()
    expect(within(row).getByText('Used up')).toBeInTheDocument()
    expect(row).toHaveAttribute('data-used-up', 'true')
  })

  it('F-KB-08: Add to shopping list adds the item to the list and keeps the row', async () => {
    const { user } = await useUp()
    api.post.mockResolvedValue({ id: 9, name: 'Milk' })
    await user.click(screen.getByRole('button', { name: 'Add to shopping list' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/shopping-list',
        expect.objectContaining({ name: 'Milk' }),
        expect.anything(),
      ),
    )
    expect(rowOf('Milk')).toBeInTheDocument()
  })

  it('F-KB-08 / used_up_item REMOVED->ACTIVE: Remove hides the row and is held; Undo brings it back and nothing is deleted', async () => {
    const { user } = await useUp()
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.queryByRole('button', { name: /^Open Milk\b/ })).toBeNull()
    expect(api.delete).not.toHaveBeenCalled()
    const undos = await screen.findAllByRole('button', { name: 'Undo' })
    await user.click(undos[undos.length - 1]!)
    expect(await screen.findByRole('button', { name: /^Open Milk\b/ })).toBeInTheDocument()
    expect(api.delete).not.toHaveBeenCalled()
  })

  it('NC-KB-NO-AUTO-DELETE: an item at 0% stays on its card, greyed, and in the Fresh tile, until she chooses', async () => {
    const { user } = renderBoard([makeItem(1, { name: 'Milk', currentQuantity: 0 })])
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    expect(rowOf('Milk')).toHaveAttribute('data-used-up', 'true')
    await user.click(screen.getByRole('button', { name: /Fresh/ }))
    expect(rowOf('Milk')).toBeInTheDocument()
    expect(api.delete).not.toHaveBeenCalled()
  })
})

describe('F-KB-10 / F-KB-12 / F-KB-13 / F-KB-15 header, tiles and search', () => {
  const items = () => [
    makeItem(1, { name: 'Milk', expirationDate: inDays(1) }),
    makeItem(2, { name: 'Rice', locationId: 2 }),
    makeItem(3, { name: 'Jam', quantity: 100, initialQuantity: 100, currentQuantity: 10 }),
    makeItem(4, { name: 'Salt', currentQuantity: 0 }),
  ]

  it('F-KB-12: shows the title, the date, item and place count, search, the four tiles, Scan receipt and Add item', async () => {
    renderBoard(items())
    expect(await screen.findByRole('heading', { level: 1, name: 'Kitchen' })).toBeInTheDocument()
    expect(screen.getByText(/· 4 items in 2 places$/)).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: /search the board/i })).toBeInTheDocument()
    // Milk is due in 1 day, Jam is low, Rice and Salt (used up) are the rest.
    for (const [name, count] of [
      [/Expired/, '0'],
      [/Use today/, '1'],
      [/Running low/, '1'],
      [/Fresh/, '2'],
    ] as const) {
      expect(within(screen.getByRole('button', { name })).getByText(count)).toBeInTheDocument()
    }
    expect(
      screen.getByText(/Tap a card to see only those items, grouped by place\. Tap it again/),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Scan receipt' })).toHaveAttribute('href', '/scan')
    expect(screen.getByRole('link', { name: /Add item/ })).toHaveAttribute('href', '/stock/new')
  })

  it('F-KB-12: each card has a + that opens the item form with that location', async () => {
    renderBoard(items())
    expect(await screen.findByRole('link', { name: 'Add to Fridge - Top shelf' })).toHaveAttribute(
      'href',
      '/stock/new?location=1',
    )
    expect(screen.getByRole('link', { name: 'Add to Pantry' })).toHaveAttribute(
      'href',
      '/stock/new?location=2',
    )
  })

  it('F-KB-10: Running low shows only low items, a second press shows everything again (URL state ?show=)', async () => {
    const { user, location } = renderBoard(items())
    await screen.findByRole('button', { name: /^Open Jam\b/ })
    await user.click(screen.getByRole('button', { name: /Running low/ }))
    expect(location()).toBe('/?show=low')
    expect(screen.getByRole('button', { name: /Running low/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /^Open Jam\b/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Open Milk\b/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: /Running low/ }))
    expect(location()).toBe('/')
    expect(screen.getByRole('button', { name: /^Open Milk\b/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Running low/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('F-KB-12: there is no "Clear filter" bar; the live region says what is shown and where', async () => {
    const { user } = renderBoard(items())
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    await user.click(screen.getByRole('button', { name: /Running low/ }))
    expect(screen.queryByRole('button', { name: /clear filter/i })).toBeNull()
    expect(screen.getByTestId('board-result-count')).toHaveTextContent(
      'Showing 1 item running low in 1 place',
    )
  })

  it('F-KB-12: Use today shows items due today through 3 days and leaves out places with nothing to show', async () => {
    const { user } = renderBoard(items())
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    await user.click(screen.getByRole('button', { name: /Use today/ }))
    expect(screen.getByRole('button', { name: /^Open Milk\b/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Open Rice\b/ })).toBeNull()
    expect(screen.queryByRole('heading', { level: 2, name: /Pantry/ })).toBeNull()
  })

  it('F-KB-12: the tiles together cover every item (Expired, Use today, Fresh and a low item far from its date)', async () => {
    const { user } = renderBoard([
      makeItem(1, { name: 'Old', expirationDate: inDays(-2) }),
      makeItem(2, { name: 'Soon', expirationDate: inDays(3) }),
      makeItem(3, { name: 'Low far', quantity: 100, initialQuantity: 100, currentQuantity: 10 }),
      makeItem(4, { name: 'Plain' }),
    ])
    await screen.findByRole('button', { name: /^Open Old\b/ })
    const seen = new Set<string>()
    for (const tile of [/Expired/, /Use today/, /Running low/, /Fresh/]) {
      await user.click(screen.getByRole('button', { name: tile }))
      for (const b of screen.queryAllByRole('button', { name: /^Open / })) {
        seen.add(b.getAttribute('aria-label')?.split(',')[0] ?? '')
      }
      await user.click(screen.getByRole('button', { name: tile }))
    }
    expect(seen).toEqual(new Set(['Open Old', 'Open Soon', 'Open Low far', 'Open Plain']))
  })

  it('F-KB-15: typing in search filters in place and keeps every location column (URL state ?q=)', async () => {
    const { user, location } = renderBoard(items())
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    await user.type(screen.getByRole('searchbox', { name: /search the board/i }), 'rice')
    expect(screen.getByRole('button', { name: /^Open Rice\b/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Open Milk\b/ })).toBeNull()
    expect(
      screen.getByRole('heading', { level: 2, name: /Fridge - Top shelf/ }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Nothing here matches.').length).toBeGreaterThan(0)
    expect(location()).toBe('/?q=rice')
  })

  it('F-KB-13: there is no Board/Stats toggle on the board', async () => {
    renderBoard(items())
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    expect(screen.queryByRole('button', { name: /^(board|stats)$/i })).toBeNull()
  })
})

describe('F-KB-14 / F-KB-17 / F-KB-19 empty state, Show all and the place header', () => {
  it('F-KB-11 removed: there is no drag tip and nothing to dismiss', async () => {
    renderBoard([makeItem(1, { name: 'Milk' })])
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    expect(screen.queryByText(/drag any bar down/i)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Got it' })).toBeNull()
  })

  const crowded = () => [
    ...[1, 2, 3, 4, 5, 6].map((n) =>
      makeItem(n, { name: `Fresh ${n}`, expirationDate: inDays(20 + n) }),
    ),
    makeItem(7, { name: 'Gone', expirationDate: inDays(-2) }),
  ]
  const rowsIn = () =>
    within(
      screen.getByRole('heading', { level: 2, name: /Fridge/ }).closest('section')!,
    ).getAllByRole('listitem')

  it('F-KB-17: a card shows its 5 most urgent items; Show all 7 opens it in place and it is remembered', async () => {
    const { user, unmount } = renderBoard(crowded())
    await screen.findByRole('button', { name: /^Open Gone\b/ })
    expect(rowsIn()).toHaveLength(5)
    // The expired item is first even though it is last by name and id; the 6th and 7th by date are hidden.
    expect(rowsIn()[0]).toContainElement(screen.getByRole('button', { name: /^Open Gone\b/ }))
    expect(screen.queryByRole('button', { name: /^Open Fresh 6\b/ })).toBeNull()
    const more = screen.getByRole('button', { name: 'Show all 7' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    await user.click(more)
    expect(rowsIn()).toHaveLength(7)
    expect(screen.getByRole('button', { name: 'Show fewer' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    unmount()
    renderBoard(crowded())
    await screen.findByRole('button', { name: /^Open Gone\b/ })
    expect(rowsIn()).toHaveLength(7)
  })

  it('F-KB-17: a card with 5 or fewer items has no Show all button', async () => {
    renderBoard([makeItem(1, { name: 'Milk' })])
    await screen.findByRole('button', { name: /^Open Milk\b/ })
    expect(screen.queryByRole('button', { name: /^Show all/ })).toBeNull()
  })

  it('F-KB-19: a place with no icon or colour set takes them from its name', async () => {
    renderBoard([makeItem(1, { name: 'Milk' })])
    const fridge = (await screen.findByRole('heading', { level: 2, name: /Fridge/ })).closest(
      'section',
    )!
    expect(fridge.querySelector('[data-location-color="mint"]')).not.toBeNull()
    expect(fridge.querySelector('svg[data-icon="fridge"]')).not.toBeNull()
    const pantry = screen.getByRole('heading', { level: 2, name: /Pantry/ }).closest('section')!
    expect(pantry.querySelector('svg[data-icon="shelf"]')).not.toBeNull()
  })

  it('F-KB-19: a place with an icon and colour set shows them', async () => {
    renderBoard([makeItem(1, { name: 'Milk' })])
    client.setQueryData(queryKeys.bootstrap, {
      ...bootstrap([makeItem(1, { name: 'Milk' })]),
      locations: [{ ...locations[0], icon: 'bowl', color: 'lilac' }, locations[1]],
    })
    const fridge = (await screen.findByRole('heading', { level: 2, name: /Fridge/ })).closest(
      'section',
    )!
    await waitFor(() =>
      expect(fridge.querySelector('[data-location-color="lilac"]')).not.toBeNull(),
    )
    expect(fridge.querySelector('svg[data-icon="bowl"]')).not.toBeNull()
  })

  it('F-KB-14: with no items there is an empty state with Add first item', async () => {
    const { user, location } = renderBoard([])
    expect(await screen.findByRole('heading', { name: /no items yet/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add first item' }))
    expect(location()).toBe('/stock/new')
  })
})

describe('7.0.20 / F-KB-16 states the data layer leaves to the screen', () => {
  it('7.0.20(a): a row still being saved (temporary id) shows Saving…, cannot be dragged and cannot be opened', async () => {
    renderBoard([makeItem(-5, { name: 'Brand new yogurt' })])
    const row = (await screen.findByText('Brand new yogurt')).closest('li') as HTMLElement
    expect(within(row).getByText('Saving…')).toBeInTheDocument()
    expect(within(row).getByRole('slider')).toBeDisabled()
    expect(screen.queryByRole('button', { name: /^Open Brand new yogurt\b/ })).toBeNull()
  })

  it('shows a loading state while the first load is pending, and no empty-state flash', async () => {
    api.get.mockReturnValue(new Promise(() => {}))
    renderBoard(null)
    expect(await screen.findByRole('status', { name: /loading the kitchen/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /no items yet/i })).toBeNull()
  })

  it('a failed first load says so and offers Retry', async () => {
    api.get.mockRejectedValueOnce(new Error('offline'))
    const { user } = renderBoard(null)
    expect(await screen.findByText(/couldn't load the kitchen/i)).toBeInTheDocument()
    api.get.mockResolvedValueOnce(bootstrap([makeItem(1, { name: 'Milk' })]))
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('button', { name: /^Open Milk\b/ })).toBeInTheDocument()
  })

  it('F-KB-16: a change that arrives in the cache (live sync) shows on the board without a reload', async () => {
    renderBoard([makeItem(1, { name: 'Milk', currentQuantity: 0.6 })])
    expect(await within(rowOf('Milk')).findByText('60%')).toBeInTheDocument()
    act(() => {
      client.setQueryData(
        queryKeys.bootstrap,
        bootstrap([makeItem(1, { name: 'Milk', currentQuantity: 0.4 })]),
      )
    })
    expect(await within(rowOf('Milk')).findByText('40%')).toBeInTheDocument()
  })
})
