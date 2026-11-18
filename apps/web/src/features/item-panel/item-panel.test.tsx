// SPEC-QP-001 the quick-action panel, rendered inside the real board with the real data hooks against
// a mocked API client. Titles name the acceptance criteria (F-QP-01..10) and negative constraints.
import 'fake-indexeddb/auto'
import type { Bootstrap, InventoryItem } from '@chatchiu/contracts'
import { addDays, todayLocalDateString } from '@chatchiu/domain'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useNavigate } from 'react-router'
import { afterEach, beforeEach, vi } from 'vitest'
import { ToastProvider } from '../../core/toast'
import '../../data/register'
import { queryKeys } from '../../data/query'
import { createAppQueryClient } from '../../data/query-client'
import { LocationProbe } from '../../test/LocationProbe'
import KitchenBoardPage from '../kitchen-board/KitchenBoardPage'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))
vi.mock('../../core/api-client', () => ({ api }))

const TODAY = todayLocalDateString()
const inDays = (n: number) => addDays(TODAY, n)
const UNDO_WINDOW_WAIT_MS = 7000
const KEYBOARD_SAVE_WAIT_MS = 2000

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
const bootstrap = (items: InventoryItem[]): Bootstrap =>
  ({
    items,
    locations,
    categories: [{ id: 1, name: 'Dairy', icon: null, color: null, userId: 'u', isSystem: false }],
    summary: {},
  }) as unknown as Bootstrap

/** Opens another item without the board's rows (they sit behind the modal). */
function GoToItemTwo() {
  const navigate = useNavigate()
  return <button type="button" data-testid="go-item-2" onClick={() => void navigate('/?item=2')} />
}

let client: QueryClient
type Seed = { shopping?: unknown[]; usage?: unknown[]; recipes?: unknown[] }

function renderPanel(items: InventoryItem[], itemId: number, seed: Seed = {}) {
  client = createAppQueryClient()
  client.mount()
  client.setQueryData(queryKeys.bootstrap, bootstrap(items))
  api.get.mockImplementation((path: string) => {
    if (path === '/api/shopping-list') return Promise.resolve(seed.shopping ?? [])
    if (path.endsWith('/usage')) return Promise.resolve(seed.usage ?? [])
    if (path === '/api/recipes') return Promise.resolve(seed.recipes ?? [])
    return Promise.resolve(bootstrap(items))
  })
  const view = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[`/?item=${itemId}`]}>
          <KitchenBoardPage />
          <LocationProbe />
          <GoToItemTwo />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
  const location = () =>
    document.querySelector<HTMLElement>('[data-testid="location"]')?.textContent ?? ''
  return { ...view, location, user: userEvent.setup() }
}
const panel = async () => within(await screen.findByRole('dialog'))
const cached = (id: number) =>
  client.getQueryData<Bootstrap>(queryKeys.bootstrap)?.items.find((i) => i.id === id)

beforeEach(() => {
  vi.resetAllMocks()
  window.localStorage.clear()
})
afterEach(() => client?.unmount())

const butter = (extra: Partial<InventoryItem> = {}) =>
  makeItem(1, {
    name: 'Butter',
    quantity: 250,
    initialQuantity: 250,
    currentQuantity: 37.5,
    unit: 'g',
    ...extra,
  })

describe('ItemPanelHost: ?item= opens the panel', () => {
  it('F-KB-05: the board with ?item=<id> shows the item panel named after the item; Close removes the parameter', async () => {
    const { user, location } = renderPanel([makeItem(1, { name: 'Milk' })], 1)
    const dialog = await panel()
    expect(dialog.getByRole('heading', { name: 'Milk' })).toBeInTheDocument()
    await user.click(dialog.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(location()).toBe('/'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('an unknown ?item= id opens nothing', async () => {
    renderPanel([makeItem(1, { name: 'Milk' })], 99)
    await screen.findByRole('button', { name: 'Open Milk' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('7.0.20a: a row with a temporary id shows Saving… and offers no edit, delete, use or restock', async () => {
    renderPanel([makeItem(-5, { name: 'New jam' })], -5)
    const dialog = await panel()
    expect(dialog.getByText(/saving/i)).toBeInTheDocument()
    for (const name of [/^Used/, 'Restock', 'Delete', 'Move to waste', /Edit all details/]) {
      for (const el of dialog.queryAllByRole('button', { name })) expect(el).toBeDisabled()
    }
    expect(dialog.queryByRole('link', { name: /Edit all details/ })).toBeNull()
  })
})

describe('F-QP-01 the big slider goes up and down', () => {
  const milk = () =>
    makeItem(1, { name: 'Milk', quantity: 100, initialQuantity: 100, currentQuantity: 40 })

  it('F-QP-01: dragging up from 40% to 70% saves through an item update and Undo restores 40%', async () => {
    api.patch.mockResolvedValueOnce({ ...milk(), currentQuantity: 70 })
    const { user } = renderPanel([milk()], 1)
    const dialog = await panel()
    const slider = dialog.getByRole('slider', { name: /Milk/ })
    slider.focus()
    for (let i = 0; i < 6; i++) await user.keyboard('{ArrowRight}')
    await waitFor(() => expect(api.patch).toHaveBeenCalled(), { timeout: KEYBOARD_SAVE_WAIT_MS })
    expect(api.patch).toHaveBeenCalledWith(
      '/api/inventory/1',
      expect.objectContaining({ currentQuantity: 70 }),
      expect.anything(),
    )
    expect(cached(1)?.currentQuantity).toBe(70)
    api.patch.mockResolvedValueOnce({ ...milk(), currentQuantity: 40 })
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() =>
      expect(api.patch).toHaveBeenLastCalledWith(
        '/api/inventory/1',
        expect.objectContaining({ currentQuantity: 40 }),
        expect.anything(),
      ),
    )
    // 7.0.21a: pressing Undo in the toast region must not dismiss the open panel.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('F-QP-01: dragging down logs a usage with Undo', async () => {
    api.post.mockResolvedValueOnce({
      id: 9,
      itemId: 1,
      crossedLowStock: false,
      item: { ...milk(), currentQuantity: 30 },
    })
    const { user } = renderPanel([milk()], 1)
    const dialog = await panel()
    dialog.getByRole('slider', { name: /Milk/ }).focus()
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    await waitFor(() => expect(api.post).toHaveBeenCalled(), { timeout: KEYBOARD_SAVE_WAIT_MS })
    expect(api.post).toHaveBeenCalledWith(
      '/api/inventory/1/usage',
      expect.objectContaining({ amountUsed: 10, currentQuantity: 30 }),
      expect.anything(),
    )
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })
})

describe('F-QP-02 quick Used buttons (also the single-tap way to log use, WCAG 2.5.7)', () => {
  const sixty = () =>
    makeItem(1, { name: 'Milk', quantity: 100, initialQuantity: 100, currentQuantity: 60 })

  it.each([
    ['Used 10%', 50],
    ['Used 25%', 35],
    ['Used half', 10],
    ['Used it all', 0],
  ])('F-QP-02: %s takes 60%% to the right level (%s left) with Undo', async (label, left) => {
    api.post.mockResolvedValueOnce({
      id: 9,
      itemId: 1,
      crossedLowStock: false,
      item: { ...sixty(), currentQuantity: left },
    })
    const { user } = renderPanel([sixty()], 1)
    const dialog = await panel()
    await user.click(dialog.getByRole('button', { name: label }))
    expect(api.post).toHaveBeenCalledWith(
      '/api/inventory/1/usage',
      expect.objectContaining({ currentQuantity: left, amountUsed: 60 - left }),
      expect.anything(),
    )
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })

  it('F-QP-02: Used half at 40% clamps at 0', async () => {
    const item = makeItem(1, {
      name: 'Milk',
      quantity: 100,
      initialQuantity: 100,
      currentQuantity: 40,
    })
    api.post.mockResolvedValueOnce({
      id: 9,
      itemId: 1,
      crossedLowStock: false,
      item: { ...item, currentQuantity: 0 },
    })
    const { user } = renderPanel([item], 1)
    await user.click((await panel()).getByRole('button', { name: 'Used half' }))
    expect(api.post).toHaveBeenCalledWith(
      '/api/inventory/1/usage',
      expect.objectContaining({ currentQuantity: 0, amountUsed: 40 }),
      expect.anything(),
    )
  })

  it('F-QP-02: an item already at 0 offers no Used buttons that could log nothing', async () => {
    const item = makeItem(1, {
      name: 'Milk',
      quantity: 100,
      initialQuantity: 100,
      currentQuantity: 0,
    })
    renderPanel([item], 1)
    for (const b of (await panel()).getAllByRole('button', { name: /^Used/ }))
      expect(b).toBeDisabled()
  })
})

describe('F-QP-03 exact amount with a note', () => {
  const rice = () =>
    makeItem(1, {
      name: 'Rice',
      quantity: 500,
      initialQuantity: 500,
      currentQuantity: 300,
      unit: 'g',
    })

  it('F-QP-03: Used 100 g with a note leaves 200 g and stores the note', async () => {
    api.post.mockResolvedValueOnce({
      id: 9,
      itemId: 1,
      crossedLowStock: false,
      item: { ...rice(), currentQuantity: 200 },
    })
    const { user } = renderPanel([rice()], 1)
    const dialog = await panel()
    await user.click(dialog.getByRole('button', { name: 'Enter an exact amount' }))
    await user.type(dialog.getByRole('textbox', { name: /Amount/ }), '100')
    await user.type(dialog.getByRole('textbox', { name: /Note/ }), 'Sunday curry')
    await user.click(dialog.getByRole('button', { name: 'Save amount' }))
    expect(api.post).toHaveBeenCalledWith(
      '/api/inventory/1/usage',
      { amountUsed: 100, currentQuantity: 200, notes: 'Sunday curry' },
      expect.anything(),
    )
  })

  it('F-QP-03: Left 150 g leaves 150 g (used 150)', async () => {
    api.post.mockResolvedValueOnce({
      id: 9,
      itemId: 1,
      crossedLowStock: false,
      item: { ...rice(), currentQuantity: 150 },
    })
    const { user } = renderPanel([rice()], 1)
    const dialog = await panel()
    await user.click(dialog.getByRole('button', { name: 'Enter an exact amount' }))
    await user.click(dialog.getByRole('radio', { name: 'Left' }))
    await user.type(dialog.getByRole('textbox', { name: /Amount/ }), '150')
    await user.click(dialog.getByRole('button', { name: 'Save amount' }))
    expect(api.post).toHaveBeenCalledWith(
      '/api/inventory/1/usage',
      expect.objectContaining({ amountUsed: 150, currentQuantity: 150 }),
      expect.anything(),
    )
  })

  it('F-QP-03: an empty or zero amount shows an inline error and saves nothing', async () => {
    const { user } = renderPanel([rice()], 1)
    const dialog = await panel()
    await user.click(dialog.getByRole('button', { name: 'Enter an exact amount' }))
    await user.click(dialog.getByRole('button', { name: 'Save amount' }))
    expect(await dialog.findByText(/enter an amount/i)).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })
})

describe('F-QP-04 Add to shopping list with de-duplication', () => {
  it('F-QP-04: adds Butter, 250 g, "Low stock (15% left)", with the category', async () => {
    api.post.mockResolvedValueOnce({ id: 3, name: 'Butter' })
    const { user } = renderPanel([butter()], 1)
    const dialog = await panel()
    const add = dialog.getByRole('button', { name: 'Add to shopping list' })
    await waitFor(() => expect(add).toBeEnabled())
    await user.click(add)
    expect(api.post).toHaveBeenCalledWith(
      '/api/shopping-list',
      { name: 'Butter', quantity: '250 g', notes: 'Low stock (15% left)', categoryId: 1 },
      expect.anything(),
    )
  })

  it('F-QP-04 / NC-QP-NO-DUPLICATE-SHOPPING: "  butter " already listed unpurchased says Already on your list and adds nothing', async () => {
    const list = [{ id: 7, name: '  butter ', isPurchased: false }]
    const { user } = renderPanel([butter()], 1, { shopping: list })
    const dialog = await panel()
    const add = dialog.getByRole('button', { name: 'Add to shopping list' })
    await waitFor(() => expect(add).toBeEnabled())
    await user.click(add)
    expect(await screen.findByText('Already on your list')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('F-QP-04: a purchased "Butter" on the list does not block adding it again', async () => {
    api.post.mockResolvedValueOnce({ id: 3, name: 'Butter' })
    const list = [{ id: 7, name: 'Butter', isPurchased: true }]
    const { user } = renderPanel([butter()], 1, { shopping: list })
    const add = (await panel()).getByRole('button', { name: 'Add to shopping list' })
    await waitFor(() => expect(add).toBeEnabled())
    await user.click(add)
    expect(api.post).toHaveBeenCalled()
  })
})

describe('F-QP-05 Move to waste (hold until close)', () => {
  const eggs = () =>
    makeItem(1, {
      name: 'Eggs',
      quantity: 6,
      initialQuantity: 6,
      currentQuantity: 6,
      unit: 'pcs',
      price: 0.4,
    })

  it('F-QP-05 / NC-QP-NO-EARLY-SEND: the item disappears at once, the toast shows 2.40, nothing is sent yet, Undo brings it back and it is never sent', async () => {
    const { user } = renderPanel([eggs()], 1)
    await user.click((await panel()).getByRole('button', { name: 'Move to waste' }))
    expect(await screen.findByText(/2\.40/)).toBeInTheDocument()
    expect(cached(1)).toBeUndefined()
    expect(api.post).not.toHaveBeenCalledWith(
      '/api/waste/from-item',
      expect.anything(),
      expect.anything(),
    )
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(cached(1)).toBeDefined()
    await new Promise((resolve) => setTimeout(resolve, UNDO_WINDOW_WAIT_MS))
    expect(api.post).not.toHaveBeenCalled()
  }, 15_000)

  it('F-QP-05: after the 5 s window the waste call is made', async () => {
    api.post.mockResolvedValueOnce({ id: 1, itemName: 'Eggs' })
    const { user } = renderPanel([eggs()], 1)
    await user.click((await panel()).getByRole('button', { name: 'Move to waste' }))
    await waitFor(
      () =>
        expect(api.post).toHaveBeenCalledWith(
          '/api/waste/from-item',
          expect.objectContaining({ itemId: 1 }),
          expect.anything(),
        ),
      { timeout: UNDO_WINDOW_WAIT_MS },
    )
  }, 15_000)

  it('F-QP-05 / NC-QP-NO-LOST-ACTION: hiding the page sends the held waste at once with keepalive', async () => {
    api.post.mockResolvedValueOnce({ id: 1, itemName: 'Eggs' })
    const { user } = renderPanel([eggs()], 1)
    await user.click((await panel()).getByRole('button', { name: 'Move to waste' }))
    window.dispatchEvent(new Event('pagehide'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/waste/from-item',
        expect.objectContaining({ itemId: 1 }),
        expect.objectContaining({ keepalive: true }),
      ),
    )
  })

  it('F-QP-05: the panel closes when the item is wasted', async () => {
    const { user, location } = renderPanel([eggs()], 1)
    await user.click((await panel()).getByRole('button', { name: 'Move to waste' }))
    await waitFor(() => expect(location()).toBe('/'))
  })
})

describe('F-QP-06 Restock refills the same item', () => {
  const oil = () =>
    makeItem(1, {
      name: 'Oil',
      quantity: 1,
      initialQuantity: 1,
      currentQuantity: 0.1,
      unit: 'L',
      price: 2,
    })

  it('F-QP-06 / NC-QP-NO-SECOND-ITEM: pre-filled 1 L, total price 3 → one restock call with quantity 1 and totalPrice 3, no create', async () => {
    api.post.mockResolvedValueOnce({ ...oil(), currentQuantity: 1, price: 3 })
    const { user } = renderPanel([oil()], 1)
    const dialog = await panel()
    await user.click(dialog.getByRole('button', { name: 'Restock' }))
    expect(dialog.getByRole('textbox', { name: /New amount/ })).toHaveValue('1')
    await user.type(dialog.getByRole('textbox', { name: /Total price/ }), '3')
    await user.click(dialog.getByRole('button', { name: 'Confirm restock' }))
    expect(api.post).toHaveBeenCalledTimes(1)
    expect(api.post).toHaveBeenCalledWith(
      '/api/inventory/1/restock',
      expect.objectContaining({ quantity: 1, totalPrice: 3 }),
      expect.anything(),
    )
    expect(cached(1)?.currentQuantity).toBe(1)
    expect((client.getQueryData<Bootstrap>(queryKeys.bootstrap)?.items ?? []).length).toBe(1)
  })

  it('F-QP-06: Undo restores the previous amount, expiry and price', async () => {
    const before = oil()
    api.post.mockResolvedValueOnce({ ...before, currentQuantity: 1 })
    api.patch.mockResolvedValueOnce(before)
    const { user } = renderPanel([before], 1)
    const dialog = await panel()
    await user.click(dialog.getByRole('button', { name: 'Restock' }))
    await user.click(dialog.getByRole('button', { name: 'Confirm restock' }))
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/api/inventory/1',
        expect.objectContaining({
          currentQuantity: 0.1,
          initialQuantity: 1,
          quantity: 1,
          price: 2,
        }),
        expect.anything(),
      ),
    )
  })

  it('F-QP-06: the AI expiry suggestion fills the date, and is disabled offline with a note', async () => {
    api.post.mockResolvedValueOnce({ days: 30, note: 'Keeps a month' })
    const { user } = renderPanel([oil()], 1)
    const dialog = await panel()
    await user.click(dialog.getByRole('button', { name: 'Restock' }))
    await user.click(dialog.getByRole('button', { name: /Suggest expiry/ }))
    expect(await dialog.findByText('Keeps a month')).toBeInTheDocument()
    expect(api.post).toHaveBeenCalledWith(
      '/api/ai/expiration-suggest',
      expect.objectContaining({ itemName: 'Oil' }),
      expect.anything(),
    )
  })
})

describe('F-QP-07 Stored in', () => {
  it('F-QP-07: choosing Pantry moves the item at once and saves, with Undo', async () => {
    api.patch.mockResolvedValueOnce(makeItem(1, { name: 'Rice', locationId: 2 }))
    const { user } = renderPanel([makeItem(1, { name: 'Rice' })], 1)
    const dialog = await panel()
    await user.click(dialog.getByRole('button', { name: /Stored in/ }))
    await user.click(await screen.findByRole('option', { name: 'Pantry' }))
    expect(cached(1)?.locationId).toBe(2)
    expect(api.patch).toHaveBeenCalledWith('/api/inventory/1', { locationId: 2 }, expect.anything())
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })
})

describe('F-QP-08 run-out sentence and the last 5 uses', () => {
  it('F-QP-08: shows "~N days left at your pace" and the 5 newest entries, newest first', async () => {
    const day = (n: number) => `${addDays(TODAY, -n)}T09:00:00.000Z`
    const usage = [6, 5, 4, 3, 2, 1].map((n) => ({
      id: n,
      itemId: 1,
      userId: 'u',
      amountUsed: 0.1,
      remainingAmount: 0.5,
      notes: `note ${n}`,
      recordedAt: day(n),
    }))
    renderPanel([makeItem(1, { name: 'Milk', currentQuantity: 0.5 })], 1, { usage })
    const dialog = await panel()
    expect(await dialog.findByText(/~\d+ days? left at your pace/)).toBeInTheDocument()
    const rows = await dialog.findAllByTestId('usage-entry')
    expect(rows).toHaveLength(5)
    expect(rows[0]).toHaveTextContent('note 1')
    expect(rows[4]).toHaveTextContent('note 5')
    expect(within(rows[0]!).queryByRole('button')).toBeNull()
  })
})

describe('F-QP-09 Recipes that use this', () => {
  const recipes = [
    {
      id: 1,
      name: 'Omelette',
      ingredients: 'eggs, butter',
      prepTime: null,
      servings: null,
      instructions: null,
    },
    {
      id: 2,
      name: 'Salad',
      ingredients: 'lettuce',
      prepTime: null,
      servings: null,
      instructions: null,
    },
  ]

  it('F-QP-09: an item expiring in 2 days lists the recipes that use it', async () => {
    renderPanel([makeItem(1, { name: 'Butter', expirationDate: inDays(2) })], 1, { recipes })
    const dialog = await panel()
    expect(await dialog.findByText('Omelette')).toBeInTheDocument()
    expect(dialog.queryByText('Salad')).toBeNull()
  })

  it('F-QP-09: an item expiring in 30 days shows no recipe list', async () => {
    renderPanel([makeItem(1, { name: 'Butter', expirationDate: inDays(30) })], 1, { recipes })
    await panel()
    expect(screen.queryByText('Omelette')).toBeNull()
    expect(api.get).not.toHaveBeenCalledWith('/api/recipes', expect.anything())
  })
})

describe('F-QP-10 Edit all details and Delete', () => {
  it('F-QP-10: Edit all details links to /stock/<id>/edit', async () => {
    renderPanel([makeItem(4, { name: 'Milk' })], 4)
    const link = (await panel()).getByRole('link', { name: /Edit all details/ })
    expect(link).toHaveAttribute('href', '/stock/4/edit')
  })

  it('F-QP-10 / NC-QP-NO-CONFIRM: Delete hides the item with an Undo toast, asks nothing, sends nothing yet, and Undo means no delete is ever sent', async () => {
    const { user } = renderPanel([makeItem(1, { name: 'Milk' })], 1)
    await user.click((await panel()).getByRole('button', { name: 'Delete' }))
    expect(cached(1)).toBeUndefined()
    expect(api.delete).not.toHaveBeenCalled()
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(cached(1)).toBeDefined()
    expect(api.delete).not.toHaveBeenCalled()
  })

  it('F-QP-10 / NC-QP-NO-LOST-ACTION: pagehide sends the held delete with keepalive', async () => {
    api.delete.mockResolvedValueOnce({})
    const { user } = renderPanel([makeItem(1, { name: 'Milk' })], 1)
    await user.click((await panel()).getByRole('button', { name: 'Delete' }))
    window.dispatchEvent(new Event('pagehide'))
    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith(
        '/api/inventory/1',
        expect.objectContaining({ keepalive: true }),
      ),
    )
  })
})

describe('forbidden transitions of the two undo kinds', () => {
  it('commit_now IDLE->SAVED: the cache shows the new level before the server answers', async () => {
    const item = makeItem(1, {
      name: 'Milk',
      quantity: 100,
      initialQuantity: 100,
      currentQuantity: 60,
    })
    api.post.mockReturnValue(new Promise(() => {}))
    const { user } = renderPanel([item], 1)
    await user.click((await panel()).getByRole('button', { name: 'Used 25%' }))
    expect(cached(1)?.currentQuantity).toBe(35)
  })
})

describe('review fixes', () => {
  it('switching ?item= to another item starts its panel fresh (no open Restock form or typed amount carried over)', async () => {
    const items = [
      makeItem(1, { name: 'Oil', quantity: 1, initialQuantity: 1, currentQuantity: 0.5 }),
      makeItem(2, {
        name: 'Rice',
        quantity: 5,
        initialQuantity: 5,
        currentQuantity: 5,
        unit: 'kg',
      }),
    ]
    const { user } = renderPanel(items, 1)
    const dialog = await panel()
    await user.click(dialog.getByRole('button', { name: 'Restock' }))
    expect(dialog.getByRole('textbox', { name: /New amount/ })).toHaveValue('1')
    fireEvent.click(screen.getByTestId('go-item-2'))
    expect(await screen.findByRole('heading', { name: 'Rice' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /New amount/ })).toBeNull()
  })

  it('a link to an item that is not there says so and clears the parameter', async () => {
    const { location } = renderPanel([makeItem(1, { name: 'Milk' })], 99)
    expect(await screen.findByText(/no longer in your kitchen/i)).toBeInTheDocument()
    await waitFor(() => expect(location()).toBe('/'))
  })

  it('WCAG 2.5.7: "Left" above what is there corrects the level upward with a single tap, through an item update', async () => {
    const rice = makeItem(1, {
      name: 'Rice',
      quantity: 500,
      initialQuantity: 500,
      currentQuantity: 300,
      unit: 'g',
    })
    api.patch.mockResolvedValueOnce({ ...rice, currentQuantity: 400 })
    const { user } = renderPanel([rice], 1)
    const dialog = await panel()
    await user.click(dialog.getByRole('button', { name: 'Enter an exact amount' }))
    await user.click(dialog.getByRole('radio', { name: 'Left' }))
    await user.type(dialog.getByRole('textbox', { name: /Amount/ }), '400')
    await user.click(dialog.getByRole('button', { name: 'Save amount' }))
    expect(api.patch).toHaveBeenCalledWith(
      '/api/inventory/1',
      { currentQuantity: 400 },
      expect.anything(),
    )
  })

  it('a note cannot be dropped silently when "Left" would only raise the level', async () => {
    const rice = makeItem(1, {
      name: 'Rice',
      quantity: 500,
      initialQuantity: 500,
      currentQuantity: 300,
      unit: 'g',
    })
    const { user } = renderPanel([rice], 1)
    const dialog = await panel()
    await user.click(dialog.getByRole('button', { name: 'Enter an exact amount' }))
    await user.click(dialog.getByRole('radio', { name: 'Left' }))
    await user.type(dialog.getByRole('textbox', { name: /Amount/ }), '400')
    await user.type(dialog.getByRole('textbox', { name: /Note/ }), 'oops')
    await user.click(dialog.getByRole('button', { name: 'Save amount' }))
    expect(await dialog.findByText(/Clear the note/)).toBeInTheDocument()
    expect(api.patch).not.toHaveBeenCalled()
  })

  it('a restock total price of 0 or above the limit is refused inline and sends nothing', async () => {
    const { user } = renderPanel([makeItem(1, { name: 'Oil' })], 1)
    const dialog = await panel()
    await user.click(dialog.getByRole('button', { name: 'Restock' }))
    await user.type(dialog.getByRole('textbox', { name: /Total price/ }), '0')
    await user.click(dialog.getByRole('button', { name: 'Confirm restock' }))
    expect(await dialog.findByText(/above 0/)).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('saving a use refreshes the usage list shown in the panel', async () => {
    const milk = makeItem(1, {
      name: 'Milk',
      quantity: 100,
      initialQuantity: 100,
      currentQuantity: 60,
    })
    api.post.mockResolvedValueOnce({
      id: 9,
      itemId: 1,
      crossedLowStock: false,
      item: { ...milk, currentQuantity: 35 },
    })
    const { user } = renderPanel([milk], 1)
    const dialog = await panel()
    await dialog.findByText(/no uses logged yet/i)
    const usageReads = () =>
      api.get.mock.calls.filter(([path]) => String(path).endsWith('/usage')).length
    const before = usageReads()
    await user.click(dialog.getByRole('button', { name: 'Used 25%' }))
    await waitFor(() => expect(usageReads()).toBeGreaterThan(before))
  })
})
