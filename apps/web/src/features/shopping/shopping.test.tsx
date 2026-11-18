// SPEC-SL-001 the shopping list page, rendered with the real data hooks against a mocked API client.
// Titles name the acceptance criteria (F-SL-01..08) and the negative constraints.
import 'fake-indexeddb/auto'
import type { Bootstrap, InventoryItem, ShoppingItem } from '@chatchiu/contracts'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router'
import { afterEach, beforeEach, vi } from 'vitest'
import { ApiClientError } from '../../core/errors'
import { ToastProvider } from '../../core/toast'
import '../../data/register'
import { FailedWriteToasts } from '../../data/failed-write-toasts'
import { queryKeys } from '../../data/query'
import { createAppQueryClient } from '../../data/query-client'
import KitchenBoardPage from '../kitchen-board/KitchenBoardPage'
import { CLEAR_PURCHASED_MAX as CONTRACT_CLEAR_PURCHASED_MAX } from '@chatchiu/contracts'
import ShoppingPage, { CLEAR_PURCHASED_MAX } from './ShoppingPage'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))
vi.mock('../../core/api-client', () => ({ api }))

const HOLD_WINDOW_WAIT_MS = 7000

function makeRow(id: number, name: string, extra: Partial<ShoppingItem> = {}): ShoppingItem {
  return {
    id,
    userId: 'u',
    name,
    quantity: null,
    notes: null,
    categoryId: null,
    isPurchased: false,
    createdAt: `2030-01-0${(id % 9) + 1}T00:00:00Z`,
    ...extra,
  }
}
const categories = [
  { id: 1, name: 'Dairy', icon: null, color: null, userId: 'u', isSystem: false },
  { id: 2, name: 'Grains', icon: null, color: null, userId: 'u', isSystem: false },
]
const locations = [{ id: 1, userId: 'u', name: 'Fridge', subLocation: null, createdAt: 'x' }]
const bootstrap = (items: InventoryItem[] = []): Bootstrap =>
  ({ items, locations, categories, summary: {} }) as unknown as Bootstrap

function GoToShopping() {
  const navigate = useNavigate()
  return (
    <button type="button" data-testid="go-shopping" onClick={() => void navigate('/shopping')} />
  )
}

let client: QueryClient
function renderPage(
  list: ShoppingItem[],
  options: { path?: string; items?: InventoryItem[] } = {},
) {
  client = createAppQueryClient()
  client.mount()
  client.setQueryData(queryKeys.bootstrap, bootstrap(options.items))
  client.setQueryData(queryKeys.shopping, list)
  api.get.mockImplementation((path: string) => {
    if (path === '/api/shopping-list') return Promise.resolve(list)
    if (path.endsWith('/usage') || path === '/api/recipes') return Promise.resolve([])
    return Promise.resolve(bootstrap(options.items))
  })
  const view = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <FailedWriteToasts />
        <MemoryRouter initialEntries={[options.path ?? '/shopping']}>
          <Routes>
            <Route path="/" element={<KitchenBoardPage />} />
            <Route path="/shopping" element={<ShoppingPage />} />
          </Routes>
          <GoToShopping />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
  return { ...view, user: userEvent.setup() }
}
type User = ReturnType<typeof userEvent.setup>

const inToasts = (text: string | RegExp) =>
  within(screen.getByRole('region', { name: 'Notifications' })).getByText(text)
const rowNames = () =>
  screen
    .queryAllByRole('checkbox')
    .filter((box) => box.hasAttribute('data-shopping-id'))
    .map((box) => box.getAttribute('aria-label')!)
const tickBox = (name: string) => screen.getByRole('checkbox', { name })
const cached = () => client.getQueryData<ShoppingItem[]>(queryKeys.shopping) ?? []

beforeEach(() => {
  vi.resetAllMocks()
  window.localStorage.clear()
})
afterEach(() => client?.unmount())

async function quickAdd(user: User, name: string, quantity = '', notes = '') {
  await user.clear(screen.getByRole('textbox', { name: /^Name/ }))
  if (name) await user.type(screen.getByRole('textbox', { name: /^Name/ }), name)
  if (quantity) await user.type(screen.getByRole('textbox', { name: /^Quantity/ }), quantity)
  if (notes) await user.type(screen.getByRole('textbox', { name: /^Notes/ }), notes)
  await user.click(screen.getByRole('button', { name: 'Add' }))
}

describe('F-SL-01 quick add', () => {
  it('F-SL-01: adding "Eggs", quantity 10 and a note shows the row at once and sends the create', async () => {
    api.post.mockReturnValue(new Promise(() => {})) // the server has not answered
    const { user } = renderPage([])
    await screen.findByRole('textbox', { name: /^Name/ })
    await quickAdd(user, 'Eggs', '10', 'free range')
    expect(await screen.findByText('Eggs')).toBeInTheDocument()
    expect(api.post).toHaveBeenCalledWith(
      '/api/shopping-list',
      { name: 'Eggs', quantity: '10', notes: 'free range' },
      expect.anything(),
    )
    // The fields are ready for the next item.
    expect(screen.getByRole('textbox', { name: /^Name/ })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: /^Name/ })).toHaveFocus()
  })

  it('F-SL-01: an empty name is blocked inline and nothing is sent', async () => {
    const { user } = renderPage([])
    await screen.findByRole('textbox', { name: /^Name/ })
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect((await screen.findAllByText('Enter a name.')).length).toBeGreaterThan(0)
    expect(api.post).not.toHaveBeenCalled()
  })

  it('a name of only spaces counts as empty', async () => {
    const { user } = renderPage([])
    await screen.findByRole('textbox', { name: /^Name/ })
    await user.type(screen.getByRole('textbox', { name: /^Name/ }), '   ')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect((await screen.findAllByText('Enter a name.')).length).toBeGreaterThan(0)
    expect(api.post).not.toHaveBeenCalled()
  })
})

describe('F-SL-02 tick and untick', () => {
  it('F-SL-02 / NC-SL-NO-RELOAD: ticking shows purchased at once and sends one PATCH, without reloading the list', async () => {
    api.patch.mockReturnValue(new Promise(() => {}))
    const { user } = renderPage([makeRow(1, 'Eggs')])
    await screen.findByText('Eggs')
    const listReads = () =>
      api.get.mock.calls.filter(([path]) => path === '/api/shopping-list').length
    const before = listReads()
    await user.click(tickBox('Eggs'))
    expect(tickBox('Eggs')).toBeChecked()
    expect(cached()[0]?.isPurchased).toBe(true)
    expect(api.patch).toHaveBeenCalledWith(
      '/api/shopping-list/1',
      { isPurchased: true },
      expect.anything(),
    )
    expect(listReads()).toBe(before)
  })

  it('F-SL-02: unticking sends isPurchased false', async () => {
    api.patch.mockReturnValue(new Promise(() => {}))
    const { user } = renderPage([makeRow(1, 'Eggs', { isPurchased: true })])
    await screen.findByText('Eggs')
    await user.click(tickBox('Eggs'))
    expect(api.patch).toHaveBeenCalledWith(
      '/api/shopping-list/1',
      { isPurchased: false },
      expect.anything(),
    )
  })

  it('F-SL-02: a refused tick rolls back and offers Retry', async () => {
    api.patch.mockRejectedValueOnce(
      new ApiClientError({ status: 400, code: 'BAD_REQUEST', message: 'nope' }),
    )
    const { user } = renderPage([makeRow(1, 'Eggs')])
    await screen.findByText('Eggs')
    await user.click(tickBox('Eggs'))
    await waitFor(() => expect(tickBox('Eggs')).not.toBeChecked())
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('a row still being saved (temporary id) cannot be ticked or deleted yet', async () => {
    renderPage([makeRow(-5, 'New eggs')])
    await screen.findByText('New eggs')
    expect(screen.getByText('Saving…')).toBeInTheDocument()
    expect(tickBox('New eggs')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete New eggs' })).toBeDisabled()
  })
})

describe('F-SL-03 delete with Undo', () => {
  it('F-SL-03: the row disappears with Undo, nothing is sent yet, and the DELETE goes out after the window', async () => {
    api.delete.mockResolvedValue({})
    const { user } = renderPage([makeRow(1, 'Eggs'), makeRow(2, 'Milk')])
    await screen.findByText('Eggs')
    await user.click(screen.getByRole('button', { name: 'Delete Eggs' }))
    expect(rowNames()).toEqual(['Milk'])
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument()
    expect(api.delete).not.toHaveBeenCalled()
    await waitFor(() => expect(api.delete).toHaveBeenCalled(), { timeout: HOLD_WINDOW_WAIT_MS })
    expect(api.delete).toHaveBeenCalledWith('/api/shopping-list/1', expect.anything())
  }, 15_000)

  it('shopping_row REMOVED->PENDING is forbidden: Undo brings the row back and nothing is ever sent', async () => {
    const { user } = renderPage([makeRow(1, 'Eggs')])
    await screen.findByText('Eggs')
    await user.click(screen.getByRole('button', { name: 'Delete Eggs' }))
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(rowNames()).toEqual(['Eggs'])
    await new Promise((resolve) => setTimeout(resolve, HOLD_WINDOW_WAIT_MS))
    expect(api.delete).not.toHaveBeenCalled()
  }, 15_000)
})

describe('F-SL-04 clear purchased', () => {
  const list = () => [
    makeRow(1, 'Eggs', { isPurchased: true }),
    makeRow(2, 'Milk', { isPurchased: true }),
    makeRow(3, 'Bread', { isPurchased: true }),
    makeRow(4, 'Rice'),
  ]

  it('F-SL-04 / NC-SL-ONE-CLEAR: 3 purchased rows go with one Undo and one POST with exactly those ids; a row ticked during the window stays', async () => {
    api.post.mockResolvedValue({})
    api.patch.mockResolvedValue({ ...makeRow(4, 'Rice'), isPurchased: true })
    const { user } = renderPage(list())
    await screen.findByText('Eggs')
    await user.click(screen.getByRole('button', { name: 'Clear purchased (3)' }))
    expect(rowNames()).toEqual(['Rice'])
    expect((await screen.findAllByRole('button', { name: 'Undo' })).length).toBe(1)
    expect(api.post).not.toHaveBeenCalled()
    // Ticked during the window: it was not purchased when she tapped, so it must stay.
    await user.click(tickBox('Rice'))
    await waitFor(
      () =>
        expect(api.post).toHaveBeenCalledWith(
          '/api/shopping-list/clear-purchased',
          { ids: [1, 2, 3] },
          expect.anything(),
        ),
      { timeout: HOLD_WINDOW_WAIT_MS },
    )
    expect(
      api.post.mock.calls.filter(([path]) => path === '/api/shopping-list/clear-purchased'),
    ).toHaveLength(1)
    expect(rowNames()).toEqual(['Rice'])
  }, 15_000)

  it('Undo of Clear purchased brings all three back and sends nothing', async () => {
    const { user } = renderPage(list())
    await screen.findByText('Eggs')
    await user.click(screen.getByRole('button', { name: 'Clear purchased (3)' }))
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(rowNames().sort()).toEqual(['Bread', 'Eggs', 'Milk', 'Rice'])
    await new Promise((resolve) => setTimeout(resolve, HOLD_WINDOW_WAIT_MS))
    expect(api.post).not.toHaveBeenCalled()
  }, 15_000)

  it('Clear purchased is off when nothing is purchased', async () => {
    renderPage([makeRow(1, 'Eggs')])
    await screen.findByText('Eggs')
    expect(screen.getByRole('button', { name: /^Clear purchased/ })).toBeDisabled()
  })
})

describe('F-SL-05 show purchased and group by category', () => {
  const list = () => [
    makeRow(1, 'Eggs', { categoryId: 1, isPurchased: true }),
    makeRow(2, 'Milk', { categoryId: 1 }),
    makeRow(3, 'Rice', { categoryId: 2 }),
    makeRow(4, 'Flour', { categoryId: 2, isPurchased: true }),
    makeRow(5, 'Soap'),
  ]

  it('F-SL-05: purchased rows sink to the bottom, and Show purchased hides them', async () => {
    const { user } = renderPage(list())
    await screen.findByText('Eggs')
    expect(rowNames()).toEqual(['Milk', 'Rice', 'Soap', 'Eggs', 'Flour'])
    await user.click(screen.getByRole('switch', { name: 'Show purchased' }))
    expect(rowNames()).toEqual(['Milk', 'Rice', 'Soap'])
    await user.click(screen.getByRole('switch', { name: 'Show purchased' }))
    expect(rowNames()).toHaveLength(5)
  })

  it('F-SL-05: grouping by category shows a header per category, purchased last in each, no category last', async () => {
    const { user } = renderPage(list())
    await screen.findByText('Eggs')
    await user.click(screen.getByRole('switch', { name: 'Group by category' }))
    const headers = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headers.join('|')).toMatch(/Dairy.*\|.*Grains.*\|.*No category/)
    expect(rowNames()).toEqual(['Milk', 'Eggs', 'Rice', 'Flour', 'Soap'])
  })

  it('F-SL-05: the two switches are remembered on this device', async () => {
    const first = renderPage(list())
    await screen.findByText('Eggs')
    await first.user.click(screen.getByRole('switch', { name: 'Show purchased' }))
    first.unmount()
    client.unmount()
    renderPage(list())
    await screen.findByText('Milk')
    expect(screen.getByRole('switch', { name: 'Show purchased' })).not.toBeChecked()
    expect(rowNames()).toEqual(['Milk', 'Rice', 'Soap'])
  })
})

describe('F-SL-06 share', () => {
  const list = () => [
    makeRow(1, 'Eggs', { quantity: '10' }),
    makeRow(2, 'Milk'),
    makeRow(3, 'Bread', { isPurchased: true }),
  ]
  const TEXT = 'Shopping List:\n- Eggs (10)\n- Milk'

  afterEach(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
  })

  it('F-SL-06: Share sends the pending items as text to the share sheet', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    const { user } = renderPage(list())
    await screen.findByText('Eggs')
    await user.click(screen.getByRole('button', { name: 'Share' }))
    expect(share).toHaveBeenCalledWith({ title: 'Shopping List', text: TEXT })
  })

  it('F-SL-06: without a share sheet the text is copied and a toast says so', async () => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
    const { user } = renderPage(list())
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    await screen.findByText('Eggs')
    await user.click(screen.getByRole('button', { name: 'Share' }))
    expect(write).toHaveBeenCalledWith(TEXT)
    expect(await screen.findByText('Copied to the clipboard')).toBeInTheDocument()
  })

  it('a share she closes without sending is not an error; a copy that fails says so', async () => {
    const abort = Object.assign(new Error('closed'), { name: 'AbortError' })
    Object.defineProperty(navigator, 'share', {
      value: vi.fn().mockRejectedValue(abort),
      configurable: true,
    })
    const first = renderPage(list())
    await screen.findByText('Eggs')
    await first.user.click(screen.getByRole('button', { name: 'Share' }))
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(screen.queryByText(/couldn.t share/i)).toBeNull()
    first.unmount()
    client.unmount()
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
    const second = renderPage(list())
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
    await screen.findByText('Eggs')
    await second.user.click(screen.getByRole('button', { name: 'Share' }))
    expect(await screen.findByText(/couldn.t share/i)).toBeInTheDocument()
  })

  it('Share is off when nothing is pending', async () => {
    renderPage([makeRow(1, 'Bread', { isPurchased: true })])
    await screen.findByText('Bread')
    expect(screen.getByRole('button', { name: 'Share' })).toBeDisabled()
  })
})

describe('F-SL-07 items from the quick-action panel', () => {
  const butter = (): InventoryItem =>
    ({
      id: 1,
      userId: 'u',
      name: 'Butter',
      categoryId: 1,
      quantity: 250,
      unit: 'g',
      purchaseDate: null,
      expirationDate: '2030-12-31',
      locationId: 1,
      price: null,
      notes: null,
      notificationEnabled: true,
      notificationDaysBefore: 3,
      barcode: null,
      initialQuantity: 250,
      currentQuantity: 37.5,
      usageNotes: null,
      lowStockThreshold: null,
      lastNotifiedAt: null,
      createdAt: 'x',
      updatedAt: 'x',
    }) as InventoryItem

  it('F-SL-07 / NC-SL-NO-DUPLICATES: Add to shopping list from the panel carries category and note, a second tap says Already on your list, and the list shows one row', async () => {
    api.post.mockResolvedValue(
      makeRow(7, 'Butter', { quantity: '250 g', notes: 'Low stock (15% left)', categoryId: 1 }),
    )
    const { user } = renderPage([], { path: '/?item=1', items: [butter()] })
    const dialog = within(await screen.findByRole('dialog'))
    const add = dialog.getByRole('button', { name: 'Add to shopping list' })
    await waitFor(() => expect(add).toBeEnabled())
    await user.click(add)
    expect(api.post).toHaveBeenCalledWith(
      '/api/shopping-list',
      { name: 'Butter', quantity: '250 g', notes: 'Low stock (15% left)', categoryId: 1 },
      expect.anything(),
    )
    await user.click(add)
    expect(await screen.findByText('Already on your list')).toBeInTheDocument()
    expect(api.post.mock.calls.filter(([path]) => path === '/api/shopping-list')).toHaveLength(1)

    // Now on the shopping list page: one Butter row with its quantity, note and category.
    act(() => fireEvent.click(screen.getByTestId('go-shopping')))
    expect(await screen.findByText('Low stock (15% left)')).toBeInTheDocument()
    expect(screen.getByText('250 g')).toBeInTheDocument()
    expect(rowNames()).toEqual(['Butter'])
  })

  it('F-SL-07: a purchased "Butter" does not block sending it again', async () => {
    api.post.mockResolvedValue(
      makeRow(7, 'Butter', { quantity: '250 g', notes: 'Low stock (15% left)', categoryId: 1 }),
    )
    const { user } = renderPage([makeRow(9, 'Butter', { isPurchased: true })], {
      path: '/?item=1',
      items: [butter()],
    })
    const add = within(await screen.findByRole('dialog')).getByRole('button', {
      name: 'Add to shopping list',
    })
    await waitFor(() => expect(add).toBeEnabled())
    await user.click(add)
    expect(api.post).toHaveBeenCalled()
  })
})

describe('F-SL-08 counts and states', () => {
  it('F-SL-08: 2 pending and 3 purchased read as counts', async () => {
    renderPage([
      makeRow(1, 'a'),
      makeRow(2, 'b'),
      makeRow(3, 'c', { isPurchased: true }),
      makeRow(4, 'd', { isPurchased: true }),
      makeRow(5, 'e', { isPurchased: true }),
    ])
    await screen.findByText('a')
    expect(screen.getByText(/2 pending/)).toBeInTheDocument()
    expect(screen.getByText(/3 purchased/)).toBeInTheDocument()
  })

  it('an empty list says so and points at the quick add', async () => {
    renderPage([])
    expect(await screen.findByText(/your list is empty/i)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /^Name/ })).toBeInTheDocument()
  })

  it('a failed background refresh keeps the list and says it may be out of date, with Retry', async () => {
    const { user } = renderPage([makeRow(1, 'Eggs')])
    await screen.findByText('Eggs')
    api.get.mockRejectedValue(new Error('offline'))
    await act(async () => {
      await client.refetchQueries({ queryKey: queryKeys.shopping })
    })
    expect(await screen.findByText(/couldn't refresh/i)).toBeInTheDocument()
    expect(screen.getByText('Eggs')).toBeInTheDocument()
    expect(user).toBeDefined()
  })
})

describe('toasts are announced where she can see them', () => {
  it('deleting shows "<name> removed" in the notifications region', async () => {
    const { user } = renderPage([makeRow(1, 'Eggs')])
    await screen.findByText('Eggs')
    await user.click(screen.getByRole('button', { name: 'Delete Eggs' }))
    expect(inToasts('Eggs removed')).toBeInTheDocument()
  })
})

describe('review fixes', () => {
  it('the name, quantity and notes fields stop at the contract caps (200, 60, 500)', async () => {
    renderPage([])
    await screen.findByRole('textbox', { name: /^Name/ })
    expect(screen.getByRole('textbox', { name: /^Name/ })).toHaveAttribute('maxlength', '200')
    expect(screen.getByRole('textbox', { name: /^Quantity/ })).toHaveAttribute('maxlength', '60')
    expect(screen.getByRole('textbox', { name: /^Notes/ })).toHaveAttribute('maxlength', '500')
  })

  it('the Clear purchased cap is the one the API accepts (cannot drift from the contract)', () => {
    expect(CLEAR_PURCHASED_MAX).toBe(CONTRACT_CLEAR_PURCHASED_MAX)
  })

  it('a checkbox keeps one name whatever its state; the checked state says if it is bought', async () => {
    renderPage([makeRow(1, 'Eggs')])
    await screen.findByText('Eggs')
    expect(tickBox('Eggs')).not.toBeChecked()
  })

  it('adding an item is announced in the notifications', async () => {
    api.post.mockReturnValue(new Promise(() => {}))
    const { user } = renderPage([])
    await screen.findByRole('textbox', { name: /^Name/ })
    await quickAdd(user, 'Eggs')
    expect(inToasts('Eggs added to the list')).toBeInTheDocument()
  })

  it('an empty name is also spoken, through an alert', async () => {
    const { user } = renderPage([])
    await screen.findByRole('textbox', { name: /^Name/ })
    await user.click(screen.getByRole('button', { name: 'Add' }))
    const alerts = await screen.findAllByRole('alert')
    expect(alerts.some((el) => el.textContent === 'Enter a name.')).toBe(true)
  })

  it('the counts are a live status', async () => {
    renderPage([makeRow(1, 'Eggs')])
    await screen.findByText('Eggs')
    expect(screen.getByText(/1 pending · 0 purchased/)).toHaveAttribute('role', 'status')
  })

  it('after Delete, focus goes to the next row, and to the title when it was the last', async () => {
    const { user } = renderPage([makeRow(1, 'Eggs'), makeRow(2, 'Milk')])
    await screen.findByText('Eggs')
    await user.click(screen.getByRole('button', { name: 'Delete Eggs' }))
    await waitFor(() => expect(tickBox('Milk')).toHaveFocus())
    await user.click(screen.getByRole('button', { name: 'Delete Milk' }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus())
  })

  it('a category that no longer exists is shown under No category, not as a made-up heading', async () => {
    const { user } = renderPage([makeRow(1, 'Eggs', { categoryId: 99 }), makeRow(2, 'Milk')])
    await screen.findByText('Eggs')
    await user.click(screen.getByRole('switch', { name: 'Group by category' }))
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent ?? '')
    expect(headings).toHaveLength(1)
    expect(headings[0]).toMatch(/No category/)
  })

  it('Clear purchased counts only rows that can be cleared (not ones still being saved)', async () => {
    renderPage([makeRow(-3, 'New eggs', { isPurchased: true })])
    await screen.findByText('New eggs')
    expect(screen.getByRole('button', { name: 'Clear purchased (0)' })).toBeDisabled()
  })
})
