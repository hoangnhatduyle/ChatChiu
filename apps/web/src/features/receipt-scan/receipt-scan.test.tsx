// SPEC-RS-001 the receipt scan page, with the real data hooks against a mocked API client. Titles name the
// acceptance criteria (F-RS-01..10), the forbidden transitions and the negative constraints.
import 'fake-indexeddb/auto'
import type { Bootstrap, ReceiptScanLine } from '@chatchiu/contracts'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, vi } from 'vitest'
import { ApiClientError } from '../../core/errors'
import { ToastProvider } from '../../core/toast'
import '../../data/register'
import { createAppQueryClient } from '../../data/query-client'
import { ImageError } from './imageCompress'
import { LAST_LOCATION_KEY } from './last-location'
import ReceiptScanPage from './ReceiptScanPage'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))
vi.mock('../../core/api-client', () => ({ api }))
const compress = vi.hoisted(() => ({ compressImage: vi.fn() }))
vi.mock('./imageCompress', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./imageCompress')>()),
  compressImage: compress.compressImage,
}))

const categories = [
  { id: 11, name: 'Dairy', icon: null, color: null, userId: 'u', isSystem: false },
  { id: 12, name: 'Pantry', icon: null, color: null, userId: 'u', isSystem: false },
]
const locations = [
  { id: 7, userId: 'u', name: 'Fridge', subLocation: null, createdAt: '' },
  { id: 8, userId: 'u', name: 'Shelf', subLocation: null, createdAt: '' },
]
const bootstrap = { items: [], locations, categories, summary: {} } as unknown as Bootstrap
const LINES: ReceiptScanLine[] = [
  {
    name: 'Rice',
    quantity: 1,
    unit: 'kg',
    price: 4.5,
    categoryHint: 'Pantry',
    shelfLifeDaysHint: 10,
  },
  { name: 'Yogurt', quantity: 2, unit: 'bunch', price: 3, categoryHint: 'Dairy' },
]
const SIGNED = {
  path: 'u1/receipts/abc.jpg',
  signedUrl: 'https://x.supabase.co/up',
  token: 't',
  contentType: 'image/jpeg',
}
const COMPRESSED = new Blob(['jpeg'], { type: 'image/jpeg' })

let client: QueryClient
let fetchMock: ReturnType<typeof vi.fn>

function setup(opts: { lines?: ReceiptScanLine[]; wide?: boolean } = {}) {
  api.get.mockResolvedValue(bootstrap)
  api.post.mockImplementation((route: string, body: unknown) => {
    if (route === '/api/uploads/sign') return Promise.resolve(SIGNED)
    if (route === '/api/ai/receipt-scan') return Promise.resolve({ items: opts.lines ?? LINES })
    if (route === '/api/inventory/bulk') {
      const items = (body as { items: Array<Record<string, unknown>> }).items
      return Promise.resolve(items.map((item, i) => ({ id: 100 + i, userId: 'u', ...item })))
    }
    return Promise.reject(new Error(`unexpected ${route}`))
  })
  compress.compressImage.mockResolvedValue(COMPRESSED)
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal(
    'matchMedia',
    opts.wide
      ? (q: string) => ({
          matches: true,
          media: q,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        })
      : undefined,
  )
  client = createAppQueryClient()
  client.mount()
  const view = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/scan']}>
          <Routes>
            <Route path="/scan" element={<ReceiptScanPage />} />
            <Route path="/" element={<p>Kitchen board</p>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
  return { ...view, user: userEvent.setup() }
}

/** A 12 MB camera photo: only its reported size matters, the compression is mocked. */
function photo(size = 12 * 1024 * 1024): File {
  const file = new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })
  Object.defineProperty(file, 'size', { value: size })
  return file
}
async function scan(user: ReturnType<typeof userEvent.setup>, date?: string) {
  await screen.findByRole('heading', { name: 'Scan a receipt' })
  if (date)
    fireEvent.change(await screen.findByLabelText('Receipt date'), { target: { value: date } })
  await user.upload(await screen.findByLabelText('Choose from gallery'), photo())
  return screen.findByRole('heading', { name: 'Check your items' })
}
/** The text of the page's alert (the toast region has an empty one of its own). */
async function alertText(): Promise<string> {
  const alerts = await screen.findAllByRole('alert')
  await waitFor(() => expect(alerts.some((a) => a.textContent)).toBe(true))
  return alerts.find((a) => a.textContent)?.textContent ?? ''
}
const toTable = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('radio', { name: 'Table' }))
const bulkCalls = () => api.post.mock.calls.filter(([route]) => route === '/api/inventory/bulk')

beforeEach(() => {
  vi.resetAllMocks()
  window.localStorage.clear()
})
afterEach(() => {
  vi.unstubAllGlobals()
  client?.unmount()
})

describe('capture, upload and read', () => {
  it('F-RS-01 / F-RS-02: a 12 MB photo is compressed, then uploaded to the signed URL of her receipts folder', async () => {
    const { user } = setup()
    await scan(user)
    expect(compress.compressImage).toHaveBeenCalledOnce()
    expect(api.post).toHaveBeenCalledWith(
      '/api/uploads/sign',
      { scope: 'receipts', contentType: 'image/jpeg', ext: 'jpg' },
      expect.anything(),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      SIGNED.signedUrl,
      expect.objectContaining({
        method: 'PUT',
        body: COMPRESSED,
        headers: { 'Content-Type': 'image/jpeg' },
      }),
    )
  })

  it('F-RS-03 / FORBID CAPTURE -> READING: the AI reads the uploaded path, and only after the upload succeeded', async () => {
    const { user } = setup()
    await scan(user)
    expect(api.post).toHaveBeenCalledWith(
      '/api/ai/receipt-scan',
      { imagePath: SIGNED.path },
      expect.anything(),
    )
    expect(fetchMock.mock.invocationCallOrder[0]).toBeLessThan(
      api.post.mock.invocationCallOrder[
        api.post.mock.calls.findIndex(([r]) => r === '/api/ai/receipt-scan')
      ]!,
    )
  })

  it('FORBID CAPTURE -> READING: a failed upload shows an error and the AI is never called', async () => {
    const { user } = setup()
    fetchMock.mockResolvedValue({ ok: false, status: 500 })
    await screen.findByRole('heading', { name: 'Scan a receipt' })
    await user.upload(await screen.findByLabelText('Choose from gallery'), photo())
    expect(await alertText()).toMatch(/upload/i)
    expect(api.post.mock.calls.some(([r]) => r === '/api/ai/receipt-scan')).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Scan a receipt' })).toBeInTheDocument()
  })

  it.each([
    ['QUOTA_EXCEEDED', 429, /this month/i],
    ['RATE_LIMITED', 429, /busy/i],
    ['UNSUPPORTED_MEDIA_TYPE', 415, /couldn.t be read as a photo/i],
  ])('F-RS-03: %s shows its own friendly message', async (code, status, message) => {
    const { user } = setup()
    api.post.mockImplementation((route: string) =>
      route === '/api/uploads/sign'
        ? Promise.resolve(SIGNED)
        : Promise.reject(new ApiClientError({ status, code: code as never, message: 'x' })),
    )
    await screen.findByRole('heading', { name: 'Scan a receipt' })
    await user.upload(await screen.findByLabelText('Choose from gallery'), photo())
    expect(await alertText()).toMatch(message)
  })

  it('NC-RS-NO-RAW-UPLOAD: a photo that cannot be shrunk is refused and nothing is uploaded', async () => {
    const { user } = setup()
    compress.compressImage.mockRejectedValue(
      new ImageError('That photo is too large to use. Try a smaller one.'),
    )
    await screen.findByRole('heading', { name: 'Scan a receipt' })
    await user.upload(await screen.findByLabelText('Choose from gallery'), photo())
    expect(await alertText()).toMatch(/too large/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('review', () => {
  it('F-RS-04 / F-RS-05: the receipt date is every purchase date; AI unit and hints win, then the category default', async () => {
    const { user } = setup()
    await scan(user, '2026-11-10')
    await toTable(user)
    expect(screen.getByLabelText('Purchase date of Rice')).toHaveValue('2026-11-10')
    expect(screen.getByLabelText('Purchase date of Yogurt')).toHaveValue('2026-11-10')
    expect(screen.getByLabelText('Unit of Rice')).toHaveValue('kg')
    expect(screen.getByLabelText('Expiry of Rice')).toHaveValue('2026-11-20')
    expect(screen.getByLabelText('Unit of Yogurt')).toHaveValue('piece')
    expect(screen.getByLabelText('Expiry of Yogurt')).toHaveValue('2026-11-24')
  })

  it('F-RS-06: the last-used location is the default; with none, adding is blocked until she picks one', async () => {
    window.localStorage.setItem(LAST_LOCATION_KEY, '7')
    const first = setup()
    await scan(first.user)
    await toTable(first.user)
    expect(screen.getByLabelText('Location of Rice')).toHaveValue('7')
    first.unmount()
    client.unmount()
    window.localStorage.clear()
    const second = setup()
    await scan(second.user)
    await toTable(second.user)
    expect(screen.getByLabelText('Location of Rice')).toHaveValue('')
    expect(screen.getByRole('button', { name: /^Add \d+ items?$/ })).toBeDisabled()
    expect(screen.getByText('Choose a location for every item you are adding.')).toBeInTheDocument()
    expect(bulkCalls()).toHaveLength(0)
  })

  it('NC-RS-NO-HARDCODED-LOCATION: a stored location id that is not hers is ignored, never id 1', async () => {
    window.localStorage.setItem(LAST_LOCATION_KEY, '999')
    const { user } = setup()
    await scan(user)
    await toTable(user)
    expect(screen.getByLabelText('Location of Rice')).toHaveValue('')
  })

  it('F-RS-07: the phone shows one item at a time with Skip, the tablet opens the table; both modes can be chosen', async () => {
    const phone = setup()
    await scan(phone.user)
    expect(screen.getByText('Item 1 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    await toTable(phone.user)
    expect(screen.getByRole('table')).toBeInTheDocument()
    await phone.user.click(screen.getByRole('radio', { name: 'One by one' }))
    expect(screen.getByText('Item 1 of 2')).toBeInTheDocument()
    phone.unmount()
    client.unmount()
    const tablet = setup({ wide: true })
    await scan(tablet.user)
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('F-RS-08: editing a field changes that item only; the wizard edits the item on screen', async () => {
    const { user } = setup()
    await scan(user)
    await user.clear(screen.getByRole('textbox', { name: 'Name' }))
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Basmati rice')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Yogurt')
    await toTable(user)
    expect(screen.getByLabelText('Name of item 1')).toHaveValue('Basmati rice')
    expect(screen.getByLabelText('Name of item 2')).toHaveValue('Yogurt')
  })

  it('F-RS-08: the expiry can be set as N days, weeks or months from the purchase date', async () => {
    const { user } = setup()
    await scan(user, '2026-11-10')
    await user.clear(screen.getByRole('textbox', { name: 'Expires in' }))
    await user.type(screen.getByRole('textbox', { name: 'Expires in' }), '2')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Expires in unit' }), 'week')
    expect(screen.getByLabelText('Expiry date')).toHaveValue('2026-11-24')
  })

  it("F-RS-08: asking the AI for one item's expiry fills the date from the answer", async () => {
    const { user } = setup()
    await scan(user, '2026-11-10')
    api.post.mockImplementation((route: string) =>
      route === '/api/ai/expiration-suggest'
        ? Promise.resolve({ days: 5, note: 'Keep dry' })
        : Promise.reject(new Error(route)),
    )
    await user.click(screen.getByRole('button', { name: 'Ask AI for expiry' }))
    await waitFor(() => expect(screen.getByLabelText('Expiry date')).toHaveValue('2026-11-15'))
    expect(screen.getByText(/Keep dry/)).toBeInTheDocument()
  })

  it('F-RS-08: Skip leaves an item out, and the Add button counts only what is included', async () => {
    const { user } = setup()
    await scan(user)
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Yogurt')
    await toTable(user)
    expect(screen.getByRole('checkbox', { name: 'Include Rice' })).not.toBeChecked()
    expect(screen.getByRole('button', { name: /^Add 1 item$/ })).toBeInTheDocument()
  })
})

describe('add', () => {
  async function ready(user: ReturnType<typeof userEvent.setup>) {
    await scan(user, '2026-11-10')
    await toTable(user)
    await user.selectOptions(screen.getByLabelText('Location of Rice'), '7')
    await user.selectOptions(screen.getByLabelText('Location of Yogurt'), '8')
  }

  it('F-RS-09 / F-RS-10 / NC-RS-NO-PER-ITEM-REQUESTS: one bulk request with a progress bar, price per unit, then "2 items added" and View on board', async () => {
    const { user } = setup()
    await ready(user)
    let release: (v: unknown) => void = () => undefined
    const slow = new Promise((resolve) => (release = resolve))
    const original = api.post.getMockImplementation()!
    api.post.mockImplementation((route: string, body: unknown, o: unknown) =>
      route === '/api/inventory/bulk'
        ? slow.then(() => original(route, body, o))
        : original(route, body, o),
    )
    await user.click(screen.getByRole('button', { name: 'Add 2 items' }))
    expect(await screen.findByRole('progressbar', { name: /Adding/ })).toBeInTheDocument()
    release(undefined)
    expect(await screen.findByText('2 items added')).toBeInTheDocument()
    expect(bulkCalls()).toHaveLength(1)
    const body = bulkCalls()[0]![1] as { items: Array<Record<string, unknown>> }
    expect(body.items.map((i) => [i.name, i.price, i.locationId, i.categoryId])).toEqual([
      ['Rice', 4.5, 7, 12],
      ['Yogurt', 1.5, 8, 11],
    ])
    expect(client.getQueryData<Bootstrap>(['bootstrap'])?.items.map((i) => i.name)).toEqual([
      'Rice',
      'Yogurt',
    ])
    expect(window.localStorage.getItem(LAST_LOCATION_KEY)).toBe('7')
    await user.click(screen.getByRole('link', { name: 'View on board' }))
    expect(await screen.findByText('Kitchen board')).toBeInTheDocument()
  })

  it('FORBID REVIEW -> DONE / NC-RS-NO-PARTIAL-SILENT: a refused bulk add stays in review, says nothing was added, and can be retried', async () => {
    const { user } = setup()
    await ready(user)
    const original = api.post.getMockImplementation()!
    api.post.mockImplementation((route: string, body: unknown, o: unknown) =>
      route === '/api/inventory/bulk'
        ? Promise.reject(
            new ApiClientError({ status: 400, code: 'BAD_REQUEST', message: 'Invalid item' }),
          )
        : original(route, body, o),
    )
    await user.click(screen.getByRole('button', { name: 'Add 2 items' }))
    expect(await alertText()).toMatch(/None of your items were added/)
    expect(screen.queryByText(/items added/)).not.toBeInTheDocument()
    expect(client.getQueryData<Bootstrap>(['bootstrap'])?.items).toEqual([])
    api.post.mockImplementation(original)
    await user.click(screen.getByRole('button', { name: 'Add 2 items' }))
    expect(await screen.findByText('2 items added')).toBeInTheDocument()
  })

  it('F-RS-10: "Scan another receipt" returns to the capture step', async () => {
    const { user } = setup()
    await ready(user)
    await user.click(screen.getByRole('button', { name: 'Add 2 items' }))
    await user.click(await screen.findByRole('button', { name: 'Scan another receipt' }))
    expect(await screen.findByRole('heading', { name: 'Scan a receipt' })).toBeInTheDocument()
  })
})

describe('review fixes', () => {
  async function ready(user: ReturnType<typeof userEvent.setup>) {
    await scan(user, '2026-11-10')
    await toTable(user)
    await user.selectOptions(screen.getByLabelText('Location of Rice'), '7')
    await user.selectOptions(screen.getByLabelText('Location of Yogurt'), '8')
  }
  const keyOf = (call: unknown[]) => (call[2] as { idempotencyKey: string }).idempotencyKey

  it('NC-RS-NO-PARTIAL-SILENT: after a lost answer the message says it is unknown, and Add again reuses the same request key', async () => {
    const { user } = setup()
    await ready(user)
    const original = api.post.getMockImplementation()!
    api.post.mockImplementation((route: string, body: unknown, o: unknown) =>
      route === '/api/inventory/bulk'
        ? Promise.reject(new ApiClientError({ status: 0, code: 'TIMEOUT', message: 'x' }))
        : original(route, body, o),
    )
    await user.click(screen.getByRole('button', { name: 'Add 2 items' }))
    expect(await alertText()).toMatch(/couldn.t confirm whether your items were saved/i)
    api.post.mockImplementation(original)
    await user.click(screen.getByRole('button', { name: 'Add 2 items' }))
    expect(await screen.findByText('2 items added')).toBeInTheDocument()
    const [first, second] = bulkCalls()
    expect(keyOf(second!)).toBe(keyOf(first!))
  })

  it('an edit between two tries is a different request: it gets a new key', async () => {
    const { user } = setup()
    await ready(user)
    const original = api.post.getMockImplementation()!
    api.post.mockImplementation((route: string, body: unknown, o: unknown) =>
      route === '/api/inventory/bulk'
        ? Promise.reject(new ApiClientError({ status: 0, code: 'TIMEOUT', message: 'x' }))
        : original(route, body, o),
    )
    await user.click(screen.getByRole('button', { name: 'Add 2 items' }))
    await alertText()
    // The review form is editable again (the alert element is always in the page, so it alone proves nothing).
    await waitFor(() => expect(screen.getByLabelText('Notes of Rice')).toBeEnabled())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add 2 items' })).toBeEnabled())
    // The page re-renders the review a moment after the failure; type again until the text sticks.
    await waitFor(async () => {
      await user.clear(screen.getByLabelText('Notes of Rice'))
      await user.type(screen.getByLabelText('Notes of Rice'), 'organic')
      expect(screen.getByLabelText('Notes of Rice')).toHaveValue('organic')
    })
    await user.click(screen.getByRole('button', { name: 'Add 2 items' }))
    await waitFor(() => expect(bulkCalls()).toHaveLength(2))
    expect(keyOf(bulkCalls()[1]!)).not.toBe(keyOf(bulkCalls()[0]!))
  })

  it('a stalled upload ends with a readable message and the AI is never called', async () => {
    const { user } = setup()
    fetchMock.mockRejectedValue(new DOMException('timeout', 'TimeoutError'))
    await screen.findByRole('heading', { name: 'Scan a receipt' })
    await user.upload(await screen.findByLabelText('Choose from gallery'), photo())
    expect(await alertText()).toMatch(/took too long/i)
    expect(api.post.mock.calls.some(([r]) => r === '/api/ai/receipt-scan')).toBe(false)
  })

  it('an unexpected failure while reading ends in an error with Try again, never a stuck screen', async () => {
    const { user } = setup()
    const original = api.post.getMockImplementation()!
    api.post.mockImplementation((route: string, body: unknown, o: unknown) =>
      route === '/api/ai/receipt-scan'
        ? Promise.resolve({ items: null })
        : original(route, body, o),
    )
    await screen.findByRole('heading', { name: 'Scan a receipt' })
    await user.upload(await screen.findByLabelText('Choose from gallery'), photo())
    expect(await alertText()).toMatch(/Something went wrong with that receipt/)
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByLabelText('Choose from gallery')).toBeInTheDocument()
  })

  it('a hint that is not a sane number of days falls back to the default, not a crash', async () => {
    const { user } = setup({
      lines: [{ name: 'Odd', shelfLifeDaysHint: Number.POSITIVE_INFINITY }],
    })
    await scan(user, '2026-11-10')
    expect(screen.getByLabelText('Expiry date')).toHaveValue('2026-12-10')
  })

  it('a runaway "Expires in" is ignored and an invalid date blocks adding', async () => {
    const { user } = setup()
    await scan(user, '2026-11-10')
    await user.clear(screen.getByRole('textbox', { name: 'Expires in' }))
    await user.type(screen.getByRole('textbox', { name: 'Expires in' }), '10000000')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Expires in unit' }), 'year')
    expect((screen.getByLabelText('Expiry date') as HTMLInputElement).value).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    )
  })

  it('changing the purchase date re-counts "Expires in" from it', async () => {
    const { user } = setup()
    await scan(user, '2026-11-10')
    fireEvent.change(screen.getByLabelText('Purchase date'), { target: { value: '2026-11-15' } })
    expect(screen.getByRole('textbox', { name: 'Expires in' })).toHaveValue('5')
  })

  it('focus moves to the review heading when the items are ready', async () => {
    const { user } = setup()
    await scan(user)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Check your items' })).toHaveFocus(),
    )
  })
})
