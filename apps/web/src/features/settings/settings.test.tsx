// SPEC-SE-001 (Settings) and SPEC-NT-001 (the Notifications section), rendered with the real data hooks
// against a mocked API client. Titles name the acceptance criteria and negative constraints.
import 'fake-indexeddb/auto'
import type { Bootstrap, Preferences } from '@chatchiu/contracts'
import { hydrate, QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, vi } from 'vitest'
import { ApiClientError } from '../../core/errors'
import { ToastProvider } from '../../core/toast'
import '../../data/register'
import { FailedWriteToasts } from '../../data/failed-write-toasts'
import { createIdbPersister, resetPersistenceStatus } from '../../data/persistence'
import { createAppQueryClient } from '../../data/query-client'
import { ThemeSync } from '../../data/ThemeSync'
import SettingsPage from './SettingsPage'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))
vi.mock('../../core/api-client', () => ({ api }))
const session = vi.hoisted(() => ({ signOut: vi.fn(), user: { id: 'u1' } }))
vi.mock('../../core/session-context', () => ({ useSession: () => session }))
const push = vi.hoisted(() => ({
  defaultPushEnv: vi.fn(() => ({})),
  readDeviceState: vi.fn(),
  enableDevice: vi.fn(),
  disableDevice: vi.fn(),
}))
vi.mock('../../core/notify/webPush', () => push)
const download = vi.hoisted(() => ({ downloadTextFile: vi.fn() }))
vi.mock('./download', () => download)
const cache = vi.hoisted(() => ({ resetAppCache: vi.fn() }))
vi.mock('../../data/cache', () => cache)

const HOLD_WINDOW_WAIT_MS = 7000
const item = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  name: `Item ${id}`,
  categoryId: 1,
  locationId: 1,
  quantity: 1,
  unit: 'pcs',
  expirationDate: '2026-12-01',
  notes: null,
  ...over,
})
const category = (id: number, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  icon: null,
  color: null,
  userId: 'u',
  isSystem: false,
  ...over,
})

let bootstrap: Bootstrap
let preferences: Preferences
let client: QueryClient

function renderPage(
  init: { bootstrap?: Partial<Bootstrap>; preferences?: Partial<Preferences> } = {},
) {
  bootstrap = {
    items: Array.from({ length: 7 }, (_, i) => item(i + 1)),
    locations: [{ id: 1, userId: 'u', name: 'Fridge', subLocation: null, createdAt: '' }],
    categories: [category(1, 'Dairy'), category(2, 'Pantry')],
    summary: {},
    ...init.bootstrap,
  } as unknown as Bootstrap
  preferences = {
    timezone: 'America/Toronto',
    notifyHour: 9,
    expiryAlerts: true,
    lowStockAlerts: true,
    theme: 'system',
    ...init.preferences,
  }
  api.get.mockImplementation((route: string) =>
    Promise.resolve(route === '/api/preferences' ? preferences : bootstrap),
  )
  api.patch.mockImplementation((_route: string, body: Partial<Preferences>) =>
    Promise.resolve({ ...preferences, ...body }),
  )
  client = createAppQueryClient()
  client.mount()
  const view = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <FailedWriteToasts />
        <ThemeSync />
        <MemoryRouter initialEntries={['/settings']}>
          <Routes>
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
  return { ...view, user: userEvent.setup() }
}

const inToasts = (text: string | RegExp) =>
  within(screen.getByRole('region', { name: 'Notifications' })).findByText(text)
const section = (name: string) => screen.getByRole('region', { name })
const loaded = () => screen.findByRole('region', { name: 'Locations' })
const refused = (message: string) =>
  new ApiClientError({ status: 400, code: 'BAD_REQUEST', message })

beforeEach(() => {
  vi.resetAllMocks()
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  push.readDeviceState.mockResolvedValue({ state: 'OFF' })
})
afterEach(() => client?.unmount())

describe('F-SE-01 locations', () => {
  it('F-SE-01 / NC-SE-NO-ORPHAN-SURPRISE: each row says how many items will move to No location before she deletes', async () => {
    renderPage()
    await loaded()
    const row = (await within(section('Locations')).findByText('Fridge')).closest('li')!
    expect(row).toHaveTextContent('7 items')
    expect(
      within(row).getByRole('button', { name: 'Delete Fridge, 7 items will move to No location' }),
    ).toBeInTheDocument()
  })

  it('F-SE-01: delete hides the row with Undo, never deletes items, and Undo sends nothing', async () => {
    const { user } = renderPage()
    await within(await loaded()).findByText('Fridge')
    await user.click(screen.getByRole('button', { name: /^Delete Fridge/ }))
    expect(within(section('Locations')).queryByText('Fridge')).not.toBeInTheDocument()
    expect(await inToasts(/Fridge deleted.*7 items.*No location/)).toBeInTheDocument()
    expect(client.getQueryData<Bootstrap>(['bootstrap'])?.items).toHaveLength(7)
    expect(api.delete).not.toHaveBeenCalled()
    await user.click(
      within(screen.getByRole('region', { name: 'Notifications' })).getByRole('button', {
        name: 'Undo',
      }),
    )
    expect(await within(section('Locations')).findByText('Fridge')).toBeInTheDocument()
    expect(api.delete).not.toHaveBeenCalled()
  })

  it('FORBID DELETED -> LISTED: after the window the delete is sent, the row stays gone and Undo is gone', async () => {
    api.delete.mockResolvedValue({ deleted: true })
    const { user } = renderPage()
    await within(await loaded()).findByText('Fridge')
    await user.click(screen.getByRole('button', { name: /^Delete Fridge/ }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(1), {
      timeout: HOLD_WINDOW_WAIT_MS,
    })
    expect(api.delete.mock.calls[0]![0]).toBe('/api/locations/1')
    expect(within(section('Locations')).queryByText('Fridge')).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Notifications' })).queryByRole('button', {
        name: 'Undo',
      }),
    ).not.toBeInTheDocument()
  }, 15_000)

  it('F-SE-01: adds a location with an optional sub-location, and edits a name', async () => {
    api.post.mockResolvedValue({
      id: 5,
      userId: 'u',
      name: 'Garage',
      subLocation: 'Shelf',
      createdAt: '',
    })
    api.patch.mockImplementation((route: string, body: Record<string, unknown>) =>
      Promise.resolve(
        route === '/api/preferences'
          ? preferences
          : { id: 1, userId: 'u', name: 'Fridge', subLocation: null, createdAt: '', ...body },
      ),
    )
    const { user } = renderPage()
    await within(await loaded()).findByText('Fridge')
    await user.type(screen.getByRole('textbox', { name: 'Location name' }), 'Garage')
    await user.type(screen.getByRole('textbox', { name: /Sub-location/ }), 'Shelf')
    await user.click(screen.getByRole('button', { name: 'Add location' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/locations',
        { name: 'Garage', subLocation: 'Shelf' },
        expect.anything(),
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Edit Fridge' }))
    const name = screen.getByRole('textbox', { name: 'Name of Fridge' })
    await user.clear(name)
    await user.type(name, 'Big fridge')
    await user.click(screen.getByRole('button', { name: 'Save Fridge' }))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/api/locations/1',
        { name: 'Big fridge', subLocation: null },
        expect.anything(),
      ),
    )
  })

  it('F-SE-01: a blank name is refused inline and nothing is sent', async () => {
    const { user } = renderPage()
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Add location' }))
    expect(await screen.findByText(/Enter a name/)).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })
})

describe('F-SE-02 categories', () => {
  it('NC-SE-NO-SYSTEM-EDIT: a system category is read-only, her own can be edited and deleted', async () => {
    renderPage({
      bootstrap: {
        categories: [category(1, 'Dairy', { userId: null, isSystem: true }), category(2, 'Pantry')],
      } as never,
    })
    await loaded()
    const system = (await within(section('Categories')).findByText('Dairy')).closest('li')!
    expect(system).toHaveTextContent('Built in')
    expect(within(system).queryByRole('button')).not.toBeInTheDocument()
    const own = within(section('Categories')).getByText('Pantry').closest('li')!
    expect(within(own).getByRole('button', { name: 'Edit Pantry' })).toBeInTheDocument()
    expect(within(own).getByRole('button', { name: /^Delete Pantry/ })).toBeInTheDocument()
  })

  it('NC-SE-NO-SYSTEM-ASSUMPTION: with no system categories (or none at all) the section still works', async () => {
    renderPage({ bootstrap: { categories: [] } as never })
    await loaded()
    expect(await within(section('Categories')).findByText(/No categories yet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add category' })).toBeInTheDocument()
  })

  it('F-SE-02: adds a category with a name, an icon and a colour', async () => {
    api.post.mockResolvedValue(category(9, 'Spices', { icon: '🧂', color: '#c0392b' }))
    const { user } = renderPage()
    await within(await loaded()).findByText('Fridge')
    await user.type(screen.getByRole('textbox', { name: 'Category name' }), 'Spices')
    await user.click(screen.getByRole('radio', { name: '🧂' }))
    await user.click(screen.getByRole('radio', { name: 'Red' }))
    await user.click(screen.getByRole('button', { name: 'Add category' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/categories',
        { name: 'Spices', icon: '🧂', color: '#c0392b' },
        expect.anything(),
      ),
    )
  })

  it('F-SE-02: a category still used by items says so, readably, and is not deleted', async () => {
    const { user } = renderPage()
    await within(await screen.findByRole('region', { name: 'Categories' })).findByText('Dairy')
    await user.click(screen.getByRole('button', { name: /^Delete Dairy/ }))
    expect(await within(section('Categories')).findByRole('alert')).toHaveTextContent(
      /Dairy is used by 7 items/,
    )
    expect(within(section('Categories')).getByText('Dairy')).toBeInTheDocument()
    expect(api.delete).not.toHaveBeenCalled()
  })

  it('F-SE-02: an unused category deletes with Undo', async () => {
    const { user } = renderPage()
    await within(await screen.findByRole('region', { name: 'Categories' })).findByText('Pantry')
    await user.click(screen.getByRole('button', { name: /^Delete Pantry/ }))
    expect(within(section('Categories')).queryByText('Pantry')).not.toBeInTheDocument()
    expect(await inToasts('Pantry deleted')).toBeInTheDocument()
    expect(api.delete).not.toHaveBeenCalled()
  })
})

describe('F-SE-03 / SPEC-NT-001 notifications', () => {
  it('F-NT-04: shows this device as off, turns it on, and reads "notifications on ✓"', async () => {
    push.enableDevice.mockResolvedValue({ state: 'ON', endpoint: 'https://web.push.apple.com/x' })
    const { user } = renderPage()
    await loaded()
    expect(
      await within(section('Reminders & alerts')).findByText('This device: notifications off'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Turn on for this device' }))
    expect(
      await within(section('Reminders & alerts')).findByText('This device: notifications on ✓'),
    ).toBeInTheDocument()
    expect(push.enableDevice).toHaveBeenCalledOnce()
  })

  it('F-NT-04: Send test posts to the test endpoint and says it was sent', async () => {
    push.readDeviceState.mockResolvedValue({
      state: 'ON',
      endpoint: 'https://web.push.apple.com/x',
    })
    api.post.mockResolvedValue({ sent: 1 })
    const { user } = renderPage()
    await loaded()
    await user.click(await screen.findByRole('button', { name: 'Send test notification' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/push/test',
        { endpoint: 'https://web.push.apple.com/x' },
        expect.anything(),
      ),
    )
    expect(await inToasts('Test notification sent')).toBeInTheDocument()
  })

  it('NC-NT-NO-SILENT-FAILURE: a failed test is said readably, not swallowed', async () => {
    push.readDeviceState.mockResolvedValue({
      state: 'ON',
      endpoint: 'https://web.push.apple.com/x',
    })
    api.post.mockRejectedValue(
      new ApiClientError({
        status: 500,
        code: 'INTERNAL',
        message: 'Could not deliver test notification',
      }),
    )
    const { user } = renderPage()
    await loaded()
    await user.click(await screen.findByRole('button', { name: 'Send test notification' }))
    expect(await within(section('Reminders & alerts')).findByRole('alert')).toHaveTextContent(
      /Couldn.t send the test/,
    )
  })

  it('FORBID NEEDS_HOME_SCREEN -> ON: a plain iPhone tab shows the Add to Home Screen steps and no Turn on button', async () => {
    push.readDeviceState.mockResolvedValue({ state: 'NEEDS_HOME_SCREEN' })
    renderPage()
    await loaded()
    expect(
      await within(section('Reminders & alerts')).findByText(/Add to Home Screen/),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Turn on for this device' }),
    ).not.toBeInTheDocument()
  })

  it('F-NT-04: says the exact reason when permission was denied or the device is unsupported', async () => {
    push.readDeviceState.mockResolvedValue({ state: 'PERMISSION_DENIED' })
    const { unmount } = renderPage()
    await loaded()
    expect(await within(section('Reminders & alerts')).findByText(/blocked/)).toBeInTheDocument()
    unmount()
    push.readDeviceState.mockResolvedValue({ state: 'UNSUPPORTED' })
    renderPage()
    await loaded()
    expect(
      await within(section('Reminders & alerts')).findByText(/does not support/),
    ).toBeInTheDocument()
  })

  it('KEY_MISMATCH -> ON: a mismatched subscription is offered a fix that subscribes again', async () => {
    push.readDeviceState.mockResolvedValue({ state: 'KEY_MISMATCH' })
    push.enableDevice.mockResolvedValue({ state: 'ON', endpoint: 'https://web.push.apple.com/x' })
    const { user } = renderPage()
    await loaded()
    await user.click(
      await screen.findByRole('button', { name: 'Fix notifications on this device' }),
    )
    expect(
      await within(section('Reminders & alerts')).findByText('This device: notifications on ✓'),
    ).toBeInTheDocument()
  })

  it('F-NT-02: timezone, reminder hour and the two alert toggles save as preferences', async () => {
    const { user } = renderPage()
    await loaded()
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Reminder hour' }), '7')
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/api/preferences',
        { notifyHour: 7 },
        expect.anything(),
      ),
    )
    await user.selectOptions(screen.getByRole('combobox', { name: 'Time zone' }), 'Europe/Paris')
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/api/preferences',
        { timezone: 'Europe/Paris' },
        expect.anything(),
      ),
    )
    await user.click(screen.getByRole('switch', { name: 'Expiry reminders' }))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/api/preferences',
        { expiryAlerts: false },
        expect.anything(),
      ),
    )
    await user.click(screen.getByRole('switch', { name: 'Low-stock alerts' }))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/api/preferences',
        { lowStockAlerts: false },
        expect.anything(),
      ),
    )
  })
})

describe('F-SE-04 export, F-SE-05 reset, sync', () => {
  it('F-SE-04: Export CSV downloads a file with the old columns and category names', async () => {
    const { user } = renderPage({ bootstrap: { items: [item(1, { name: 'Milk' })] } as never })
    await within(await loaded()).findByText('Fridge')
    await user.click(screen.getByRole('button', { name: 'Export inventory (CSV)' }))
    expect(download.downloadTextFile).toHaveBeenCalledOnce()
    const [name, text] = download.downloadTextFile.mock.calls[0] as [string, string]
    expect(name).toMatch(/^inventory_export_\d{4}-\d{2}-\d{2}\.csv$/)
    expect(text).toContain('Name,Category,Quantity,Unit,Expiration,Notes')
    expect(text).toContain('"Milk","Dairy"')
  })

  it('7.0.39a: a discarded queue is explained in Data and can be acknowledged', async () => {
    const queued = JSON.stringify({ clientState: { mutations: [{ requestId: 'r' }], queries: [] } })
    const store = new Map([['cache:u', queued]])
    const persister = createIdbPersister('u', {
      store: {
        getItem: (k) => Promise.resolve(store.get(k) ?? null),
        setItem: (k, v) => Promise.resolve(void store.set(k, v)),
        removeItem: (k) => Promise.resolve(void store.delete(k)),
      },
    })
    await persister.restoreClient()
    await persister.removeClient()
    const { user } = renderPage()
    await within(await loaded()).findByText('Fridge')
    const data = section('Data')
    expect(within(data).getByRole('status')).toHaveTextContent(/couldn't be restored/i)
    await user.click(within(data).getByRole('button', { name: 'Got it' }))
    expect(within(data).getByRole('status')).toHaveTextContent('All changes saved')
    resetPersistenceStatus()
  })

  it('7.0.39a: writes from an earlier version are named in Data, and can be discarded after a confirmation', async () => {
    const { user } = renderPage()
    await within(await loaded()).findByText('Fridge')
    hydrate(client, {
      mutations: [
        {
          mutationKey: ['write', 'gone/old-kind'],
          state: {
            status: 'pending',
            variables: { requestId: 'r1', input: {} },
            context: undefined,
            data: undefined,
            error: null,
            failureCount: 0,
            failureReason: null,
            isPaused: false,
            submittedAt: 1,
          },
        },
      ],
      queries: [],
    } as never)
    const data = section('Data')
    expect(await within(data).findByRole('status')).toHaveTextContent(
      "1 change from an earlier version can't be sent",
    )
    await user.click(
      within(data).getByRole('button', { name: "Discard changes that can't be sent" }),
    )
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard' }),
    )
    await waitFor(() =>
      expect(within(section('Data')).getByRole('status')).toHaveTextContent('All changes saved'),
    )
  })

  it('F-SE-05: Reset app cache asks first (it cannot be undone) and only then clears', async () => {
    cache.resetAppCache.mockResolvedValue(undefined)
    const { user } = renderPage()
    await within(await loaded()).findByText('Fridge')
    await user.click(screen.getByRole('button', { name: 'Reset app cache' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(/cannot be undone/i)
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(cache.resetAppCache).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Reset app cache' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Reset cache' }),
    )
    await waitFor(() => expect(cache.resetAppCache).toHaveBeenCalledOnce())
  })

  it('7.0.20b: a refused write is listed under Data with its reason, SYNC_FAILED, and Retry / Discard', async () => {
    api.post.mockRejectedValueOnce(refused('That location name is taken'))
    const { user } = renderPage()
    await within(await loaded()).findByText('Fridge')
    expect(within(section('Data')).getByRole('status')).toHaveTextContent('All changes saved')
    await user.type(screen.getByRole('textbox', { name: 'Location name' }), 'Garage')
    await user.click(screen.getByRole('button', { name: 'Add location' }))
    const list = await within(section('Data')).findByRole('list', {
      name: 'Changes that need attention',
    })
    expect(list).toHaveTextContent('Add "Garage"')
    expect(list).toHaveTextContent('That location name is taken')
    expect(within(section('Data')).getByRole('status')).toHaveTextContent(
      '1 change needs attention',
    )
    api.post.mockResolvedValue({
      id: 5,
      userId: 'u',
      name: 'Garage',
      subLocation: null,
      createdAt: '',
    })
    await user.click(within(list).getByRole('button', { name: 'Retry Add "Garage"' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(
        screen.queryByRole('list', { name: 'Changes that need attention' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('7.0.20b: Discard drops a refused write without sending it again', async () => {
    api.post.mockRejectedValue(refused('No'))
    const { user } = renderPage()
    await within(await loaded()).findByText('Fridge')
    await user.type(screen.getByRole('textbox', { name: 'Location name' }), 'Garage')
    await user.click(screen.getByRole('button', { name: 'Add location' }))
    await user.click(await screen.findByRole('button', { name: 'Discard Add "Garage"' }))
    expect(
      screen.queryByRole('list', { name: 'Changes that need attention' }),
    ).not.toBeInTheDocument()
    expect(api.post).toHaveBeenCalledTimes(1)
  })
})

describe('7.0.32 forms', () => {
  it('(b) arrowing through the time zone select saves once, with the value she stopped on', async () => {
    const { user } = renderPage()
    await within(await loaded()).findByText('Fridge')
    const zone = screen.getByLabelText('Time zone')
    await user.selectOptions(zone, 'UTC')
    await user.selectOptions(zone, 'Asia/Tokyo')
    expect(api.patch).not.toHaveBeenCalled()
    await user.tab() // leaving the select saves it at once
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1))
    expect(api.patch).toHaveBeenCalledWith(
      '/api/preferences',
      { timezone: 'Asia/Tokyo' },
      expect.anything(),
    )
  })

  it('(c) an empty location name is announced as an alert and focus goes to the name field', async () => {
    const { user } = renderPage()
    await within(await loaded()).findByText('Fridge')
    await user.click(screen.getByRole('button', { name: 'Add location' }))
    const alerts = await screen.findAllByRole('alert')
    expect(alerts.some((a) => a.textContent?.includes('Enter a name for the location.'))).toBe(true)
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Location name' })).toHaveFocus(),
    )
  })
})

describe('F-SE-06 appearance, F-SE-07 sign out', () => {
  it('F-SE-06: picking Dark applies at once, saves, and System follows the device', async () => {
    const { user } = renderPage()
    await loaded()
    const dark = await screen.findByRole('radio', { name: 'Dark' })
    await user.click(dark)
    expect(document.documentElement.dataset.theme).toBe('dark')
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/api/preferences',
        { theme: 'dark' },
        expect.anything(),
      ),
    )
    await user.click(screen.getByRole('radio', { name: 'Light' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    await user.click(screen.getByRole('radio', { name: 'System' }))
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('F-SE-07: Sign out turns off this device first, then ends only this session', async () => {
    push.readDeviceState.mockResolvedValue({
      state: 'ON',
      endpoint: 'https://web.push.apple.com/x',
    })
    push.disableDevice.mockResolvedValue(undefined)
    session.signOut.mockResolvedValue({ success: true })
    const { user } = renderPage()
    await loaded()
    await screen.findByText('This device: notifications on ✓')
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(session.signOut).toHaveBeenCalledOnce())
    expect(push.disableDevice).toHaveBeenCalledOnce()
    expect(push.disableDevice.mock.invocationCallOrder[0]).toBeLessThan(
      session.signOut.mock.invocationCallOrder[0]!,
    )
  })

  it('F-SE-07: a failed push removal stops the sign-out and says why; Sign out anyway goes ahead', async () => {
    push.readDeviceState.mockResolvedValue({
      state: 'ON',
      endpoint: 'https://web.push.apple.com/x',
    })
    push.disableDevice.mockRejectedValue(new Error('offline'))
    session.signOut.mockResolvedValue({ success: true })
    const { user } = renderPage()
    await loaded()
    await screen.findByText('This device: notifications on ✓')
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await within(section('Account')).findByRole('alert')).toHaveTextContent(
      /turn off notifications/,
    )
    expect(session.signOut).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Sign out anyway' }))
    await waitFor(() => expect(session.signOut).toHaveBeenCalledOnce())
  })

  it('F-SE-07: with notifications off, Sign out goes straight to the session', async () => {
    session.signOut.mockResolvedValue({ success: true })
    const { user } = renderPage()
    await loaded()
    await screen.findByText('This device: notifications off')
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(session.signOut).toHaveBeenCalledOnce())
    expect(push.disableDevice).not.toHaveBeenCalled()
  })
})

describe('review fixes', () => {
  it('after deleting a location, focus moves to the section heading (the row it was on is gone)', async () => {
    const { user } = renderPage()
    await within(await loaded()).findByText('Fridge')
    await user.click(screen.getByRole('button', { name: /^Delete Fridge/ }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Locations' })).toHaveFocus())
  })

  it("closing an editor returns focus to that row's Edit button, and opening it focuses the name", async () => {
    const { user } = renderPage()
    await within(await loaded()).findByText('Fridge')
    await user.click(screen.getByRole('button', { name: 'Edit Fridge' }))
    expect(screen.getByRole('textbox', { name: 'Name of Fridge' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Fridge' })).toHaveFocus())
  })

  it('NC-NT-NO-SILENT-FAILURE: a failed Reset app cache closes the dialog and says why in the section', async () => {
    cache.resetAppCache.mockRejectedValue(new Error('idb blocked'))
    const { user } = renderPage()
    await within(await loaded()).findByText('Fridge')
    await user.click(screen.getByRole('button', { name: 'Reset app cache' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Reset cache' }),
    )
    expect(await within(section('Data')).findByRole('alert')).toHaveTextContent(
      /Couldn.t reset the cache/,
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('F-SE-07: when this device cannot be checked, Sign out still tries to remove it first', async () => {
    push.readDeviceState.mockRejectedValue(new Error('sw failed'))
    push.disableDevice.mockResolvedValue(undefined)
    session.signOut.mockResolvedValue({ success: true })
    const { user } = renderPage()
    await loaded()
    expect(
      await within(section('Reminders & alerts')).findByText(/couldn.t check notifications/),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(session.signOut).toHaveBeenCalledOnce())
    expect(push.disableDevice).toHaveBeenCalledOnce()
  })

  it('F-SE-07: a refused sign-out says the real reason', async () => {
    session.signOut.mockResolvedValue({
      success: false,
      message: 'Too many attempts. Wait a minute.',
    })
    const { user } = renderPage()
    await loaded()
    await screen.findByText('This device: notifications off')
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await within(section('Account')).findByRole('alert')).toHaveTextContent(
      'Too many attempts',
    )
  })

  it('F-SE-04: Export before the inventory has loaded says so instead of "No items"', async () => {
    api.get.mockImplementation(() => new Promise(() => {}))
    client = createAppQueryClient()
    client.mount()
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <MemoryRouter>
            <SettingsPage />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    )
    await user.click(await screen.findByRole('button', { name: 'Export inventory (CSV)' }))
    expect(await inToasts(/hasn.t loaded yet/)).toBeInTheDocument()
    expect(download.downloadTextFile).not.toHaveBeenCalled()
  })
})
