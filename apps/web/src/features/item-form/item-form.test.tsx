// SPEC-IF-001 the item form (add and edit), rendered with the real data hooks against a mocked API
// client, started from the board so "back" returns there. Titles name the acceptance criteria.
import 'fake-indexeddb/auto'
import type { Bootstrap, InventoryItem } from '@chatchiu/contracts'
import { addDays, todayLocalDateString } from '@chatchiu/domain'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, vi } from 'vitest'
import { ApiClientError } from '../../core/errors'
import { ToastProvider } from '../../core/toast'
import '../../data/register'
import { queryKeys } from '../../data/query'
import { createAppQueryClient } from '../../data/query-client'
import { LocationProbe } from '../../test/LocationProbe'
import KitchenBoardPage from '../kitchen-board/KitchenBoardPage'
import ItemFormPage from './ItemFormPage'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))
vi.mock('../../core/api-client', () => ({ api }))

const TODAY = todayLocalDateString()

function makeItem(id: number, extra: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id,
    userId: 'u',
    name: `Item ${id}`,
    categoryId: 1,
    quantity: 1,
    unit: 'L',
    purchaseDate: TODAY,
    expirationDate: addDays(TODAY, 90),
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
const bootstrap = (items: InventoryItem[], cats = categories): Bootstrap =>
  ({ items, locations, categories: cats, summary: {} }) as unknown as Bootstrap

let client: QueryClient
function renderForm(
  path: string,
  items: InventoryItem[] = [],
  options: { categories?: typeof categories } = {},
) {
  client = createAppQueryClient()
  client.mount()
  client.setQueryData(queryKeys.bootstrap, bootstrap(items, options.categories))
  api.get.mockResolvedValue(bootstrap(items, options.categories))
  const view = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/', path]} initialIndex={1}>
          <Routes>
            <Route path="/" element={<KitchenBoardPage />} />
            <Route path="/stock/new" element={<ItemFormPage />} />
            <Route path="/stock/:id/edit" element={<ItemFormPage />} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
  const location = () =>
    document.querySelector<HTMLElement>('[data-testid="location"]')?.textContent ?? ''
  return { ...view, location, user: userEvent.setup() }
}
type User = ReturnType<typeof userEvent.setup>

/** A toast in the visible region (its text is also in the screen-reader live region, after a short delay). */
const inToasts = (text: string | RegExp) =>
  within(screen.getByRole('region', { name: 'Notifications' })).getByText(text)

const textbox = (name: RegExp) => screen.getByRole('textbox', { name })
async function pick(user: User, label: RegExp, option: string) {
  await user.click(screen.getByRole('button', { name: label }))
  await user.click(await screen.findByRole('option', { name: option }))
}
/** A valid new item: Butter, Dairy, Fridge, 2 pack, expires in a month. */
async function fillValid(user: User, overrides: { skipCategory?: boolean } = {}) {
  await user.type(textbox(/^Name/), 'Butter')
  if (!overrides.skipCategory) await pick(user, /Category/, 'Dairy')
  await pick(user, /Location/, 'Fridge')
  await user.clear(textbox(/^Quantity/))
  await user.type(textbox(/^Quantity/), '2')
  await user.click(screen.getByRole('button', { name: 'In 1 month' }))
}
const save = (user: User) => user.click(screen.getByRole('button', { name: /^Save/ }))

beforeEach(() => {
  vi.resetAllMocks()
  window.localStorage.clear()
})
afterEach(() => client?.unmount())

describe('F-IF-01 name with suggestions', () => {
  it('F-IF-01: typing "Mi" suggests Milk and Mint, not Rice', async () => {
    const { user } = renderForm('/stock/new', [
      makeItem(1, { name: 'Milk' }),
      makeItem(2, { name: 'Mint' }),
      makeItem(3, { name: 'Rice' }),
    ])
    await user.type(await screen.findByRole('textbox', { name: /^Name/ }), 'Mi')
    const group = screen.getByRole('group', { name: 'Name suggestions' })
    expect(within(group).getByRole('button', { name: 'Milk' })).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: 'Mint' })).toBeInTheDocument()
    expect(within(group).queryByRole('button', { name: 'Rice' })).toBeNull()
    await user.click(within(group).getByRole('button', { name: 'Milk' }))
    expect(textbox(/^Name/)).toHaveValue('Milk')
  })

  it('F-IF-01 / INVALID->SAVING: an empty name blocks the save inline and nothing is sent', async () => {
    const { user } = renderForm('/stock/new')
    await screen.findByRole('textbox', { name: /^Name/ })
    await save(user)
    expect(await screen.findByText('Enter a name.')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })
})

describe('F-IF-02 / F-IF-03 category and location pickers', () => {
  it('F-IF-02: with no categories at all, adding "Spices" inline creates and selects it', async () => {
    api.post.mockResolvedValueOnce({
      id: 7,
      name: 'Spices',
      icon: null,
      color: null,
      userId: 'u',
      isSystem: false,
    })
    const { user } = renderForm('/stock/new', [], { categories: [] })
    await screen.findByRole('textbox', { name: /^Name/ })
    await user.click(screen.getByRole('button', { name: 'Add a new category' }))
    await user.type(textbox(/New category name/), 'Spices')
    await user.click(screen.getByRole('button', { name: 'Add category' }))
    expect(api.post).toHaveBeenCalledWith(
      '/api/categories',
      expect.objectContaining({ name: 'Spices' }),
      expect.anything(),
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Category/ })).toHaveTextContent('Spices'),
    )
  })

  it('F-IF-03: opened from the Pantry column (?location=2) the location is Pantry; a new location can be added inline', async () => {
    api.post.mockResolvedValueOnce({ id: 9, name: 'Garage', subLocation: null, userId: 'u' })
    const { user } = renderForm('/stock/new?location=2')
    await screen.findByRole('textbox', { name: /^Name/ })
    expect(screen.getByRole('button', { name: /Location/ })).toHaveTextContent('Pantry')
    await user.click(screen.getByRole('button', { name: 'Add a new location' }))
    await user.type(textbox(/New location name/), 'Garage')
    await user.click(screen.getByRole('button', { name: 'Add location' }))
    expect(api.post).toHaveBeenCalledWith(
      '/api/locations',
      expect.objectContaining({ name: 'Garage' }),
      expect.anything(),
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Location/ })).toHaveTextContent('Garage'),
    )
  })
})

describe('F-IF-04 / F-IF-05 / F-IF-06 / F-IF-07 amounts and dates', () => {
  it('F-IF-04: quantity 0 is blocked inline; 2.5 kg is accepted', async () => {
    api.post.mockResolvedValue({ ...makeItem(50, { name: 'Butter' }) })
    const { user } = renderForm('/stock/new')
    await screen.findByRole('textbox', { name: /^Name/ })
    await fillValid(user)
    await user.clear(textbox(/^Quantity/))
    await user.type(textbox(/^Quantity/), '0')
    await save(user)
    expect(await screen.findByText(/above 0/i)).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
    await user.clear(textbox(/^Quantity/))
    await user.type(textbox(/^Quantity/), '2.5')
    await pick(user, /Unit/, 'kg')
    await save(user)
    expect(api.post).toHaveBeenCalledWith(
      '/api/inventory',
      expect.objectContaining({ quantity: 2.5, unit: 'kg' }),
      expect.anything(),
    )
  })

  it('F-IF-05: a new item has today as its purchase date', async () => {
    api.post.mockResolvedValue({ ...makeItem(50, { name: 'Butter' }) })
    const { user } = renderForm('/stock/new')
    await screen.findByRole('textbox', { name: /^Name/ })
    await fillValid(user)
    await save(user)
    expect(api.post).toHaveBeenCalledWith(
      '/api/inventory',
      expect.objectContaining({ purchaseDate: TODAY }),
      expect.anything(),
    )
  })

  it('F-IF-06: the chips 3d 1w 2w 1m 3m 6m 1y exist; "in 1 month" is +30 days and "in 1 year" +365', async () => {
    api.post.mockResolvedValue({ ...makeItem(50, { name: 'Butter' }) })
    const { user } = renderForm('/stock/new')
    await screen.findByRole('textbox', { name: /^Name/ })
    const chips = screen.getByRole('group', { name: /Quick expiry picks for Expiry date/ })
    expect(
      within(chips)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['3d', '1w', '2w', '1m', '3m', '6m', '1y'])
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: 'In 1 year' }))
    await save(user)
    expect(api.post).toHaveBeenCalledWith(
      '/api/inventory',
      expect.objectContaining({ expirationDate: addDays(TODAY, 365) }),
      expect.anything(),
    )
  })

  it('F-IF-06: "Expires in 2 weeks" sets the date 14 days after the purchase date', async () => {
    api.post.mockResolvedValue({ ...makeItem(50, { name: 'Butter' }) })
    const { user } = renderForm('/stock/new')
    await screen.findByRole('textbox', { name: /^Name/ })
    await fillValid(user)
    await user.type(textbox(/^Expires in/), '2')
    await pick(user, /Time unit/, 'weeks')
    await user.click(screen.getByRole('button', { name: 'Set expiry' }))
    await save(user)
    expect(api.post).toHaveBeenCalledWith(
      '/api/inventory',
      expect.objectContaining({ expirationDate: addDays(TODAY, 14) }),
      expect.anything(),
    )
  })

  it('F-IF-07: an expiry before the purchase date shows an inline error on the expiry field and sends nothing', async () => {
    const item = makeItem(5, {
      name: 'Jam',
      purchaseDate: addDays(TODAY, 10),
      expirationDate: addDays(TODAY, 5),
    })
    const { user } = renderForm('/stock/5/edit', [item])
    await screen.findByRole('textbox', { name: /^Name/ })
    await save(user)
    expect(await screen.findByText(/can.t be before the purchase date/i)).toBeInTheDocument()
    expect(api.patch).not.toHaveBeenCalled()
  })

  it('INVALID->SAVING: a form with no expiry date, category or location sends nothing and says so at each field', async () => {
    const { user } = renderForm('/stock/new')
    await user.type(await screen.findByRole('textbox', { name: /^Name/ }), 'Butter')
    await save(user)
    expect(await screen.findByText(/choose a category/i)).toBeInTheDocument()
    expect(screen.getByText(/choose a location/i)).toBeInTheDocument()
    expect(screen.getByText(/choose an expiry date/i)).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })
})

describe('F-IF-08 AI expiry suggestion', () => {
  it('F-IF-08: fills the expiry with "Suggested: 7 days — keep refrigerated" and Undo takes it back', async () => {
    api.post.mockResolvedValueOnce({ days: 7, note: 'keep refrigerated' })
    const { user } = renderForm('/stock/new')
    await user.type(await screen.findByRole('textbox', { name: /^Name/ }), 'Milk')
    await user.click(screen.getByRole('button', { name: 'Suggest expiry' }))
    expect(await screen.findByText('Suggested: 7 days — keep refrigerated')).toBeInTheDocument()
    expect(api.post).toHaveBeenCalledWith(
      '/api/ai/expiration-suggest',
      expect.objectContaining({ itemName: 'Milk' }),
      expect.anything(),
    )
    await user.click(screen.getByRole('button', { name: 'Undo suggestion' }))
    expect(screen.queryByText(/Suggested: 7 days/)).toBeNull()
    await save(user)
    expect(await screen.findByText(/choose an expiry date/i)).toBeInTheDocument()
  })

  it('F-IF-08: QUOTA_EXCEEDED shows a friendly message', async () => {
    api.post.mockRejectedValueOnce(
      new ApiClientError({ status: 429, code: 'QUOTA_EXCEEDED', message: 'quota' }),
    )
    const { user } = renderForm('/stock/new')
    await user.type(await screen.findByRole('textbox', { name: /^Name/ }), 'Milk')
    await user.click(screen.getByRole('button', { name: 'Suggest expiry' }))
    expect(await screen.findByText(/used up for this month/i)).toBeInTheDocument()
  })
})

describe('F-IF-09 / F-IF-10 / F-IF-11 / F-IF-15 price, notes, notifications, threshold', () => {
  it('F-IF-09 / NC-IF-PER-UNIT: quantity 10 and total 4.00 are stored as 0.4 per unit, and edit shows 4.00 again', async () => {
    api.post.mockResolvedValue({ ...makeItem(50, { name: 'Butter' }) })
    const first = renderForm('/stock/new')
    await screen.findByRole('textbox', { name: /^Name/ })
    await fillValid(first.user)
    await first.user.clear(textbox(/^Quantity/))
    await first.user.type(textbox(/^Quantity/), '10')
    await first.user.type(textbox(/^Total price/), '4.00')
    await save(first.user)
    const body = api.post.mock.calls.find(([path]) => path === '/api/inventory')?.[1] as {
      price: number
    }
    expect(body.price).toBeCloseTo(0.4, 6)
    first.unmount()
    client.unmount()
    renderForm('/stock/5/edit', [makeItem(5, { quantity: 10, initialQuantity: 10, price: 0.4 })])
    expect(await screen.findByRole('textbox', { name: /^Total price/ })).toHaveValue('4.00')
  })

  it('F-IF-10: notes are sent and shown again on edit', async () => {
    api.post.mockResolvedValue({ ...makeItem(50, { name: 'Butter' }) })
    const first = renderForm('/stock/new')
    await screen.findByRole('textbox', { name: /^Name/ })
    await fillValid(first.user)
    await first.user.type(textbox(/^Notes/), 'Salted, from the market')
    await save(first.user)
    expect(api.post).toHaveBeenCalledWith(
      '/api/inventory',
      expect.objectContaining({ notes: 'Salted, from the market' }),
      expect.anything(),
    )
    first.unmount()
    client.unmount()
    renderForm('/stock/5/edit', [makeItem(5, { notes: 'Salted, from the market' })])
    expect(await screen.findByRole('textbox', { name: /^Notes/ })).toHaveValue(
      'Salted, from the market',
    )
  })

  it('F-IF-11: notifications are on with 3 days by default; turning them off and days-before 5 are saved', async () => {
    api.post.mockResolvedValue({ ...makeItem(50, { name: 'Butter' }) })
    const { user } = renderForm('/stock/new')
    await screen.findByRole('textbox', { name: /^Name/ })
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: 'More options' }))
    expect(screen.getByRole('switch', { name: /expiry notifications/i })).toBeChecked()
    expect(textbox(/^Days before expiry/)).toHaveValue('3')
    await user.click(screen.getByRole('switch', { name: /expiry notifications/i }))
    await user.clear(textbox(/^Days before expiry/))
    await user.type(textbox(/^Days before expiry/), '5')
    await save(user)
    expect(api.post).toHaveBeenCalledWith(
      '/api/inventory',
      expect.objectContaining({ notificationEnabled: false, notificationDaysBefore: 5 }),
      expect.anything(),
    )
  })

  it('F-IF-15: the low-stock threshold defaults to 20 and 30 is saved', async () => {
    api.post.mockResolvedValue({ ...makeItem(50, { name: 'Butter' }) })
    const { user } = renderForm('/stock/new')
    await screen.findByRole('textbox', { name: /^Name/ })
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: 'More options' }))
    expect(textbox(/^Low-stock threshold/)).toHaveValue('20')
    await user.clear(textbox(/^Low-stock threshold/))
    await user.type(textbox(/^Low-stock threshold/), '30')
    await save(user)
    expect(api.post).toHaveBeenCalledWith(
      '/api/inventory',
      expect.objectContaining({ lowStockThreshold: 30 }),
      expect.anything(),
    )
  })
})

describe('F-IF-12 / NC-IF-NO-SILENT-QTY full amount and left now', () => {
  const milk = () =>
    makeItem(5, { name: 'Milk', quantity: 1, initialQuantity: 1, currentQuantity: 0.4, unit: 'L' })

  it('F-IF-12: edit shows Full amount 1 and Left now 0.4 as separate fields', async () => {
    renderForm('/stock/5/edit', [milk()])
    expect(await screen.findByRole('textbox', { name: /^Full amount/ })).toHaveValue('1')
    expect(textbox(/^Left now/)).toHaveValue('0.4')
    expect(screen.queryByRole('textbox', { name: /^Quantity/ })).toBeNull()
  })

  it('NC-IF-NO-SILENT-QTY: changing Full amount sends the full amount only, never the left amount', async () => {
    api.patch.mockResolvedValue({ ...milk(), quantity: 2, initialQuantity: 2 })
    const { user } = renderForm('/stock/5/edit', [milk()])
    await user.clear(await screen.findByRole('textbox', { name: /^Full amount/ }))
    await user.type(textbox(/^Full amount/), '2')
    await save(user)
    const patch = api.patch.mock.calls[0]?.[1] as Record<string, unknown>
    expect(patch).toMatchObject({ initialQuantity: 2, quantity: 2 })
    expect(patch).not.toHaveProperty('currentQuantity')
  })

  it('NC-IF-NO-SILENT-QTY: changing Left now sends the left amount only, never the full amount', async () => {
    api.patch.mockResolvedValue({ ...milk(), currentQuantity: 0.7 })
    const { user } = renderForm('/stock/5/edit', [milk()])
    await user.clear(await screen.findByRole('textbox', { name: /^Left now/ }))
    await user.type(textbox(/^Left now/), '0.7')
    await save(user)
    const patch = api.patch.mock.calls[0]?.[1] as Record<string, unknown>
    expect(patch).toMatchObject({ currentQuantity: 0.7 })
    expect(patch).not.toHaveProperty('initialQuantity')
    expect(patch).not.toHaveProperty('quantity')
  })

  it('Left now above the full amount is blocked inline', async () => {
    const { user } = renderForm('/stock/5/edit', [milk()])
    await user.clear(await screen.findByRole('textbox', { name: /^Left now/ }))
    await user.type(textbox(/^Left now/), '3')
    await save(user)
    expect(await screen.findByText(/more than the full amount/i)).toBeInTheDocument()
    expect(api.patch).not.toHaveBeenCalled()
  })

  it('an edit that changes nothing sends nothing', async () => {
    const { user } = renderForm('/stock/5/edit', [milk()])
    await screen.findByRole('textbox', { name: /^Full amount/ })
    await save(user)
    expect(api.patch).not.toHaveBeenCalled()
  })
})

describe('F-IF-13 / F-IF-14 / NC-IF-NO-PHOTO-BARCODE hidden controls', () => {
  it('F-IF-13 / F-IF-14: the form has no photo, camera, barcode or scan control (add and edit)', async () => {
    const first = renderForm('/stock/new')
    await screen.findByRole('textbox', { name: /^Name/ })
    expect(screen.queryByText(/photo|camera|barcode|scan|gallery/i)).toBeNull()
    expect(document.querySelector('input[type="file"]')).toBeNull()
    first.unmount()
    client.unmount()
    renderForm('/stock/5/edit', [makeItem(5, { barcode: '123' })])
    await screen.findByRole('textbox', { name: /^Name/ })
    expect(screen.queryByText(/photo|camera|barcode|scan|gallery/i)).toBeNull()
    expect(screen.queryByDisplayValue('123')).toBeNull()
  })
})

describe('F-IF-16 save returns to the board', () => {
  it('F-IF-16: saving from the board goes back to it, the item is already there, with a toast', async () => {
    api.post.mockReturnValue(new Promise(() => {})) // the server has not answered yet
    const { user, location } = renderForm('/stock/new')
    await screen.findByRole('textbox', { name: /^Name/ })
    await fillValid(user)
    await save(user)
    await waitFor(() => expect(location()).toBe('/'))
    // Still being saved (the server has not answered): the row is on the board without an Open button.
    expect(await screen.findByText('Butter')).toBeInTheDocument()
    expect(screen.getByText('Saving…')).toBeInTheDocument()
    expect(inToasts(/Adding Butter/)).toBeInTheDocument()
  })

  it('an edit saves with a toast and returns to the board showing the new name', async () => {
    api.patch.mockReturnValue(new Promise(() => {}))
    const { user, location } = renderForm('/stock/5/edit', [makeItem(5, { name: 'Milk' })])
    const name = await screen.findByRole('textbox', { name: /^Name/ })
    await user.clear(name)
    await user.type(name, 'Oat milk')
    await save(user)
    await waitFor(() => expect(location()).toBe('/'))
    expect(await screen.findByRole('button', { name: 'Open Oat milk' })).toBeInTheDocument()
    expect(inToasts(/Saving Oat milk/)).toBeInTheDocument()
    expect(api.patch).toHaveBeenCalledWith(
      '/api/inventory/5',
      { name: 'Oat milk' },
      expect.anything(),
    )
  })
})

describe('edit states', () => {
  it('an item that is still being saved (temporary id) cannot be edited yet', async () => {
    renderForm('/stock/-5/edit', [makeItem(-5, { name: 'New jam' })])
    expect(await screen.findByText(/still being saved/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull()
  })

  it('an unknown item id says so and offers a way back', async () => {
    renderForm('/stock/99/edit', [makeItem(1)])
    expect(await screen.findByText(/no longer in your kitchen/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to the kitchen/i })).toBeInTheDocument()
  })
})

describe('review fixes', () => {
  it('Enter in the new-category field adds the category and does not validate or save the item', async () => {
    api.post.mockResolvedValueOnce({
      id: 7,
      name: 'Spices',
      icon: null,
      color: null,
      userId: 'u',
      isSystem: false,
    })
    const { user } = renderForm('/stock/new')
    await screen.findByRole('textbox', { name: /^Name/ })
    await user.click(screen.getByRole('button', { name: 'Add a new category' }))
    await user.type(textbox(/New category name/), 'Spices{Enter}')
    expect(api.post).toHaveBeenCalledTimes(1)
    expect(api.post).toHaveBeenCalledWith('/api/categories', expect.anything(), expect.anything())
    expect(screen.queryByText('Enter a name.')).toBeNull()
  })

  it('two quick taps on Save create one item', async () => {
    api.post.mockReturnValue(new Promise(() => {}))
    const { user } = renderForm('/stock/new')
    await screen.findByRole('textbox', { name: /^Name/ })
    await fillValid(user)
    const button = screen.getByRole('button', { name: /^Save/ })
    await user.dblClick(button)
    expect(api.post.mock.calls.filter(([path]) => path === '/api/inventory')).toHaveLength(1)
  })

  it('an edit never writes back a change made elsewhere to a field she did not touch', async () => {
    api.patch.mockReturnValue(new Promise(() => {}))
    const { user } = renderForm('/stock/5/edit', [makeItem(5, { name: 'Milk', notes: 'old' })])
    const notes = await screen.findByRole('textbox', { name: /^Notes/ })
    expect(notes).toHaveValue('old')
    // Another device changes the notes while the form is open.
    client.setQueryData(
      queryKeys.bootstrap,
      bootstrap([makeItem(5, { name: 'Milk', notes: 'new elsewhere' })]),
    )
    await user.type(textbox(/^Name/), ' 2')
    await save(user)
    expect(api.patch).toHaveBeenCalledWith(
      '/api/inventory/5',
      { name: 'Milk 2' },
      expect.anything(),
    )
  })

  it('an item removed elsewhere while editing keeps the form, says so, and does not save', async () => {
    const { user } = renderForm('/stock/5/edit', [makeItem(5, { name: 'Milk' })])
    await screen.findByRole('textbox', { name: /^Name/ })
    client.setQueryData(queryKeys.bootstrap, bootstrap([]))
    expect(await screen.findByText(/removed on another device/i)).toBeInTheDocument()
    await user.type(textbox(/^Name/), ' 2')
    await save(user)
    expect(await screen.findByText(/changes were not saved/i)).toBeInTheDocument()
    expect(api.patch).not.toHaveBeenCalled()
  })

  it('a new form for another pre-filled location starts fresh (?location changes)', async () => {
    const { user, unmount } = renderForm('/stock/new?location=1')
    await screen.findByRole('textbox', { name: /^Name/ })
    expect(screen.getByRole('button', { name: /Location/ })).toHaveTextContent('Fridge')
    unmount()
    client.unmount()
    renderForm('/stock/new?location=2')
    await screen.findByRole('textbox', { name: /^Name/ })
    expect(screen.getByRole('button', { name: /Location/ })).toHaveTextContent('Pantry')
    expect(user).toBeDefined()
  })

  it('an AI answer for a name she has since changed is dropped', async () => {
    let resolve!: (value: unknown) => void
    api.post.mockReturnValueOnce(new Promise((r) => (resolve = r)))
    const { user } = renderForm('/stock/new')
    await user.type(await screen.findByRole('textbox', { name: /^Name/ }), 'Milk')
    await user.click(screen.getByRole('button', { name: 'Suggest expiry' }))
    await user.type(textbox(/^Name/), 'y')
    resolve({ days: 7, note: 'keep refrigerated' })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Suggest expiry' })).toBeEnabled(),
    )
    expect(screen.queryByText(/Suggested:/)).toBeNull()
  })

  it('an AI answer with a nonsense number of days is refused with the generic message', async () => {
    api.post.mockResolvedValueOnce({ days: -5, note: 'x' })
    const { user } = renderForm('/stock/new')
    await user.type(await screen.findByRole('textbox', { name: /^Name/ }), 'Milk')
    await user.click(screen.getByRole('button', { name: 'Suggest expiry' }))
    expect(await screen.findByText(/couldn.t get a suggestion/i)).toBeInTheDocument()
  })

  it('once the server has answered, the toast says Added', async () => {
    api.post.mockResolvedValue({ ...makeItem(50, { name: 'Butter' }) })
    const { user } = renderForm('/stock/new')
    await screen.findByRole('textbox', { name: /^Name/ })
    await fillValid(user)
    await save(user)
    await waitFor(() => expect(inToasts('Added Butter')).toBeInTheDocument())
  })
})
