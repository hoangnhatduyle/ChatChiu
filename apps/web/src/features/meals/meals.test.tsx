// SPEC-MP-001 the meal plan page, rendered with the real data hooks against a mocked API client.
// Titles name the acceptance criteria (F-MP-01..12) and the negative constraints. Drag-and-drop with a
// real pointer is checked in e2e/meals.spec.ts; here the drop handler (copy) is tested directly.
import 'fake-indexeddb/auto'
import type { MealPlan, Recipe, RecipeSuggestion } from '@chatchiu/contracts'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, vi } from 'vitest'
import { ApiClientError } from '../../core/errors'
import { ToastProvider } from '../../core/toast'
import '../../data/register'
import { FailedWriteToasts } from '../../data/failed-write-toasts'
import { createAppQueryClient } from '../../data/query-client'
import { DESTINATIONS } from '../../shell/nav'
import { LocationProbe } from '../../test/LocationProbe'
import MealsPage from './MealsPage'
import { useMealActions, type MealDraft } from './use-meal-actions'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))
vi.mock('../../core/api-client', () => ({ api }))

const HOLD_WINDOW_WAIT_MS = 7000
const WEEK = '2026-11-18' // a Wednesday; its week is 16–22 Nov 2026

let nextId = 1
const plan = (
  planDate: string,
  mealType: MealPlan['mealType'],
  mealName: string,
  extra: Partial<MealPlan> = {},
): MealPlan => ({
  id: nextId++,
  userId: 'u',
  planDate,
  mealType,
  mealName,
  recipeId: null,
  isFavorite: false,
  notes: null,
  createdAt: 'x',
  updatedAt: 'x',
  ...extra,
})
const recipe = (id: number, name: string, ingredients: string, extra: Partial<Recipe> = {}) =>
  ({
    id,
    userId: 'u',
    name,
    ingredients,
    prepTime: null,
    servings: null,
    instructions: null,
    createdAt: 'x',
    updatedAt: 'x',
    ...extra,
  }) as Recipe

type StockRow = { id: number; name: string; expirationDate: string; quantity: number }
type Server = {
  plans: MealPlan[]
  recipes: Recipe[]
  suggestions: RecipeSuggestion[]
  items: StockRow[]
}
let server: Server
let client: QueryClient

function mockServer() {
  api.get.mockImplementation(
    (path: string, options?: { query?: { from?: string; to?: string } }) => {
      if (path === '/api/meal-plans') {
        const { from, to } = options?.query ?? {}
        return Promise.resolve(
          server.plans.filter((p) => (!from || p.planDate >= from) && (!to || p.planDate <= to)),
        )
      }
      if (path === '/api/recipes/suggestions') return Promise.resolve(server.suggestions)
      if (path === '/api/recipes') return Promise.resolve(server.recipes)
      return Promise.resolve({ items: server.items, locations: [], categories: [], summary: {} })
    },
  )
}

function wrap(children: ReactNode, path: string) {
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <FailedWriteToasts />
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/meals" element={children} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}
function renderPage(init: Partial<Server> = {}, path = `/meals?date=${WEEK}`) {
  server = { plans: [], recipes: [], suggestions: [], items: [], ...init }
  mockServer()
  client = createAppQueryClient()
  client.mount()
  const view = render(wrap(<MealsPage />, path))
  return { ...view, user: userEvent.setup() }
}
type User = ReturnType<typeof userEvent.setup>

const inToasts = (text: string | RegExp) =>
  within(screen.getByRole('region', { name: 'Notifications' })).findByText(text)

beforeEach(() => {
  vi.resetAllMocks()
  window.localStorage.clear()
  nextId = 1
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-18T12:00:00') })
})
afterEach(() => {
  vi.useRealTimers()
  client?.unmount()
})

async function openAdd(user: User, type = 'dinner', day = 'Wed 18 Nov') {
  await user.click(await screen.findByRole('button', { name: new RegExp(`Add ${type}, ${day}`) }))
  return screen.findByRole('dialog', { name: 'Add a meal' })
}

describe('F-MP-01 the week', () => {
  it('F-MP-01: shows 7 days × breakfast, lunch and dinner, with previous, next and Today', async () => {
    const { user } = renderPage()
    expect(await screen.findByRole('heading', { name: /16.*22 Nov 2026/ })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Add (breakfast|lunch|dinner), / })).toHaveLength(
      21,
    )
    await user.click(screen.getByRole('button', { name: 'Next week' }))
    expect(await screen.findByRole('heading', { name: /23.*29 Nov 2026/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Previous week' }))
    await user.click(screen.getByRole('button', { name: 'Previous week' }))
    expect(await screen.findByRole('heading', { name: /9.*15 Nov 2026/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Today' }))
    expect(await screen.findByRole('heading', { name: /16.*22 Nov 2026/ })).toBeInTheDocument()
  })

  it('F-MP-01: a planned meal shows in its slot and the week is kept in the URL', async () => {
    const { user } = renderPage({ plans: [plan('2026-11-18', 'dinner', 'Pho bo')] })
    expect(await screen.findByRole('button', { name: /^Pho bo/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next week' }))
    expect(screen.getByTestId('location')).toHaveTextContent('date=2026-11-25')
  })
})

describe('F-MP-02 the month', () => {
  it('F-MP-02: tapping a day opens the weekly view on that day’s week', async () => {
    const { user } = renderPage({ plans: [plan('2026-11-25', 'lunch', 'Salad')] })
    await user.click(await screen.findByRole('radio', { name: 'Month' }))
    expect(await screen.findByRole('heading', { name: 'November 2026' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Wed 25 Nov, 1 meal/ }))
    expect(await screen.findByRole('heading', { name: /23.*29 Nov 2026/ })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('date=2026-11-25')
    expect(screen.getByTestId('location')).not.toHaveTextContent('tab=month')
  })
})

describe('F-MP-03 add a meal', () => {
  it('F-MP-03: a meal added to an empty slot shows at once and is sent with its date, type, name and notes', async () => {
    api.post.mockReturnValue(new Promise(() => {})) // the server has not answered
    const { user } = renderPage({ recipes: [recipe(7, 'Omelette', 'eggs, milk')] })
    const panel = await openAdd(user)
    await user.type(within(panel).getByRole('combobox', { name: /Meal name/ }), 'Omel')
    await user.click(await screen.findByRole('option', { name: 'Omelette' }))
    await user.type(within(panel).getByRole('textbox', { name: /Notes/ }), 'with chives')
    await user.click(within(panel).getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('button', { name: /^Omelette/ })).toBeInTheDocument()
    expect(api.post).toHaveBeenCalledWith(
      '/api/meal-plans',
      expect.objectContaining({
        planDate: '2026-11-18',
        mealType: 'dinner',
        mealName: 'Omelette',
        recipeId: 7,
        notes: 'with chives',
      }),
      expect.anything(),
    )
  })
})

describe('F-MP-04 one meal per slot', () => {
  const existing = () => plan('2026-11-18', 'dinner', 'Soup', { notes: 'old' })

  async function fillAndSave(user: User, panel: HTMLElement, name: string) {
    await user.type(within(panel).getByRole('combobox', { name: /Meal name/ }), name)
    await user.click(within(panel).getByRole('button', { name: 'Save' }))
  }

  it('F-MP-04: a slot that already has a meal asks Replace or Cancel, and Replace changes that meal', async () => {
    const soup = existing()
    api.patch.mockResolvedValue({ ...soup, mealName: 'Stew' })
    const { user } = renderPage({ plans: [soup] })
    await screen.findByRole('button', { name: /^Soup/ })
    await user.click(screen.getByRole('button', { name: 'Add meal' }))
    const panel = await screen.findByRole('dialog', { name: 'Add a meal' })
    await fillAndSave(user, panel, 'Stew')
    const prompt = await screen.findByRole('alertdialog')
    expect(within(prompt).getByText(/already has Soup/)).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
    await user.click(within(prompt).getByRole('button', { name: 'Replace' }))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        `/api/meal-plans/${soup.id}`,
        expect.objectContaining({ mealName: 'Stew' }),
        expect.anything(),
      ),
    )
    expect(await screen.findByRole('button', { name: /^Stew/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Soup/ })).not.toBeInTheDocument()
  })

  it('NC-MP-NO-UNHANDLED-409: a 409 from the server asks Replace or Cancel, with no failed-write toast', async () => {
    const soup = existing()
    // The screen did not know the slot was taken (another device added it a moment ago).
    api.post.mockRejectedValue(
      new ApiClientError({ status: 409, code: 'CONFLICT', message: 'taken', existingId: soup.id }),
    )
    const { user } = renderPage()
    const panel = await openAdd(user)
    await fillAndSave(user, panel, 'Stew')
    const prompt = await screen.findByRole('alertdialog')
    expect(within(prompt).getByRole('button', { name: 'Replace' })).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Notifications' })).queryByText(/Couldn.t save/),
    ).toBeNull()
    expect(screen.queryByRole('button', { name: /^Stew/ })).not.toBeInTheDocument() // only one meal per slot
  })

  it('FORBID CONFLICT_PROMPT -> EMPTY: Cancel keeps the meal that was there', async () => {
    const { user } = renderPage({ plans: [existing()] })
    await screen.findByRole('button', { name: /^Soup/ })
    await user.click(screen.getByRole('button', { name: 'Add meal' }))
    const panel = await screen.findByRole('dialog', { name: 'Add a meal' })
    await fillAndSave(user, panel, 'Stew')
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }),
    )
    expect(await screen.findByRole('button', { name: /^Soup/ })).toBeInTheDocument()
    expect(api.patch).not.toHaveBeenCalled()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('F-MP-04: Replace waits until the meal in the way is known', async () => {
    api.post.mockRejectedValue(
      new ApiClientError({ status: 409, code: 'CONFLICT', message: 'taken', existingId: 999 }),
    )
    const { user } = renderPage()
    const panel = await openAdd(user)
    await fillAndSave(user, panel, 'Stew')
    const prompt = await screen.findByRole('alertdialog')
    expect(within(prompt).getByRole('button', { name: 'Replace' })).toBeDisabled()
  })

  it('F-MP-04: when the meal being replaced was deleted elsewhere, the new meal is created instead', async () => {
    const soup = existing()
    api.patch.mockRejectedValue(
      new ApiClientError({ status: 404, code: 'NOT_FOUND', message: 'gone' }),
    )
    api.post.mockResolvedValue(plan('2026-11-18', 'dinner', 'Stew'))
    const { user } = renderPage({ plans: [soup] })
    await screen.findByRole('button', { name: /^Soup/ })
    await user.click(screen.getByRole('button', { name: 'Add meal' }))
    const panel = await screen.findByRole('dialog', { name: 'Add a meal' })
    await fillAndSave(user, panel, 'Stew')
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Replace' }),
    )
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/meal-plans',
        expect.objectContaining({ mealName: 'Stew', planDate: '2026-11-18', mealType: 'dinner' }),
        expect.anything(),
      ),
    )
  })

  it('FORBID CONFLICT_PROMPT -> EMPTY: a refused Replace puts the old meal back', async () => {
    const soup = existing()
    api.patch.mockRejectedValue(
      new ApiClientError({ status: 500, code: 'INTERNAL', message: 'nope' }),
    )
    const { user } = renderPage({ plans: [soup] })
    await screen.findByRole('button', { name: /^Soup/ })
    await user.click(screen.getByRole('button', { name: 'Add meal' }))
    const panel = await screen.findByRole('dialog', { name: 'Add a meal' })
    await fillAndSave(user, panel, 'Stew')
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Replace' }),
    )
    expect(await screen.findByRole('button', { name: /^Soup/ })).toBeInTheDocument()
    expect(await inToasts(/Couldn.t save/)).toBeInTheDocument()
  })
})

describe('F-MP-05 typed names go to the library', () => {
  it('F-MP-05: a typed "Pho bo" is sent without a recipe and the Recipes list is read again', async () => {
    api.post.mockImplementation((_path: string, body: MealPlanBody) => {
      const saved = plan(body.planDate, body.mealType, body.mealName)
      server.plans.push(saved)
      server.recipes.push(recipe(50, 'Pho bo', ''))
      return Promise.resolve(saved)
    })
    const { user } = renderPage()
    const panel = await openAdd(user)
    await user.type(within(panel).getByRole('combobox', { name: /Meal name/ }), 'Pho bo')
    await user.click(within(panel).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0]![1]).toMatchObject({ mealName: 'Pho bo' })
    expect(api.post.mock.calls[0]![1].recipeId ?? null).toBeNull()
    await user.click(await screen.findByRole('radio', { name: 'Recipes' }))
    expect(await screen.findByText('Pho bo')).toBeInTheDocument()
  })

  it('NC-MP-NO-SWALLOWED-ERRORS: a refused save is reported and the slot goes back to empty', async () => {
    api.post.mockRejectedValue(new ApiClientError({ status: 500, code: 'INTERNAL', message: 'no' }))
    const { user } = renderPage()
    const panel = await openAdd(user)
    await user.type(within(panel).getByRole('combobox', { name: /Meal name/ }), 'Pho bo')
    await user.click(within(panel).getByRole('button', { name: 'Save' }))
    expect(await inToasts(/Couldn.t save/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Pho bo/ })).toBeNull())
  })
})
type MealPlanBody = {
  planDate: string
  mealType: MealPlan['mealType']
  mealName: string
  recipeId?: number | null
}

describe('F-MP-06 edit and delete', () => {
  it('F-MP-06: an edit of the notes is saved', async () => {
    const soup = plan('2026-11-18', 'dinner', 'Soup')
    api.patch.mockResolvedValue({ ...soup, notes: 'hot' })
    const { user } = renderPage({ plans: [soup] })
    await user.click(await screen.findByRole('button', { name: /^Soup/ }))
    const panel = await screen.findByRole('dialog', { name: 'Edit meal' })
    await user.type(within(panel).getByRole('textbox', { name: /Notes/ }), 'hot')
    await user.click(within(panel).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        `/api/meal-plans/${soup.id}`,
        { notes: 'hot' },
        expect.anything(),
      ),
    )
  })

  it('F-MP-06 / NC-MP-NO-CONFIRM-DELETE: delete hides the meal with Undo and sends only after the window', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    const soup = plan('2026-11-18', 'dinner', 'Soup')
    api.delete.mockResolvedValue({ deleted: true })
    const { user } = renderPage({ plans: [soup] })
    await user.click(await screen.findByRole('button', { name: /^Soup/ }))
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Edit meal' })).getByRole('button', {
        name: 'Delete',
      }),
    )
    expect(screen.queryByRole('button', { name: /^Soup/ })).not.toBeInTheDocument()
    expect(await inToasts('Soup removed')).toBeInTheDocument()
    expect(api.delete).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
    await waitFor(() => expect(api.delete).toHaveBeenCalled(), { timeout: HOLD_WINDOW_WAIT_MS })
    expect(api.delete.mock.calls[0]![0]).toBe(`/api/meal-plans/${soup.id}`)
  }, 15_000)

  it('F-MP-06: Undo puts the meal back and nothing is sent', async () => {
    const soup = plan('2026-11-18', 'dinner', 'Soup')
    const { user } = renderPage({ plans: [soup] })
    await user.click(await screen.findByRole('button', { name: /^Soup/ }))
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Edit meal' })).getByRole('button', {
        name: 'Delete',
      }),
    )
    await user.click(
      within(screen.getByRole('region', { name: 'Notifications' })).getByRole('button', {
        name: 'Undo',
      }),
    )
    expect(await screen.findByRole('button', { name: /^Soup/ })).toBeInTheDocument()
    expect(api.delete).not.toHaveBeenCalled()
  })
})

describe('F-MP-07 favourites belong to the meal', () => {
  it('F-MP-07: favouriting a meal marks every plan of that meal at once and saves one change', async () => {
    const a = plan('2026-11-17', 'dinner', 'Pho bo')
    const b = plan('2026-11-19', 'lunch', 'pho bo ')
    api.patch.mockResolvedValue({ ...a, isFavorite: true })
    const { user } = renderPage({ plans: [a, b] })
    await user.click(await screen.findByRole('button', { name: /^Pho bo, dinner/ }))
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Edit meal' })).getByText('Favourite'),
    )
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        `/api/meal-plans/${a.id}`,
        { isFavorite: true },
        expect.anything(),
      ),
    )
    expect(api.patch).toHaveBeenCalledTimes(1)
    const cached = client
      .getQueriesData<MealPlan[]>({ queryKey: ['meal-plans'] })
      .flatMap(([, rows]) => rows ?? [])
    expect(
      cached
        .filter((p) => p.isFavorite)
        .map((p) => p.id)
        .sort(),
    ).toEqual([a.id, b.id].sort())
  })

  it('F-MP-07: planning a meal that is a favourite elsewhere starts as a favourite', async () => {
    api.post.mockReturnValue(new Promise(() => {}))
    const { user } = renderPage({
      plans: [plan('2026-11-10', 'dinner', 'Pho bo', { isFavorite: true })],
    })
    await screen.findByRole('heading', { name: /16.*22 Nov 2026/ })
    const panel = await openAdd(user)
    await user.type(within(panel).getByRole('combobox', { name: /Meal name/ }), 'Pho bo')
    await user.click(within(panel).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0]![1]).toMatchObject({ mealName: 'Pho bo', isFavorite: true })
  })
})

describe('F-MP-08 drop to copy', () => {
  function renderActions(plans: MealPlan[]) {
    server = { plans, recipes: [], suggestions: [], items: [] }
    mockServer()
    client = createAppQueryClient()
    client.mount()
    return renderHook(() => useMealActions(plans), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>
          <ToastProvider>{children}</ToastProvider>
        </QueryClientProvider>
      ),
    })
  }
  const draftOf = (p: MealPlan, planDate: string, mealType: MealDraft['mealType']): MealDraft => ({
    planDate,
    mealType,
    mealName: p.mealName,
    recipeId: p.recipeId,
    notes: p.notes,
    isFavorite: p.isFavorite,
  })

  it('F-MP-08: dropping a meal on an empty slot copies it and the original stays', async () => {
    const soup = plan('2026-11-18', 'dinner', 'Soup', { notes: 'hot', recipeId: 4 })
    api.post.mockResolvedValue(plan('2026-11-19', 'lunch', 'Soup'))
    const { result } = renderActions([soup])
    const outcome = await result.current.copyTo(soup, '2026-11-19', 'lunch')
    expect(outcome).toEqual({ status: 'started' })
    expect(api.post).toHaveBeenCalledWith(
      '/api/meal-plans',
      { ...draftOf(soup, '2026-11-19', 'lunch') },
      expect.anything(),
    )
    expect(api.delete).not.toHaveBeenCalled()
    expect(api.patch).not.toHaveBeenCalled()
  })

  it('F-MP-08: dropping on a filled slot asks Replace or Cancel and sends nothing', async () => {
    const soup = plan('2026-11-18', 'dinner', 'Soup')
    const stew = plan('2026-11-19', 'lunch', 'Stew')
    const { result } = renderActions([soup, stew])
    const outcome = await result.current.copyTo(soup, '2026-11-19', 'lunch')
    expect(outcome).toMatchObject({ status: 'conflict', existingId: stew.id })
    expect(api.post).not.toHaveBeenCalled()
  })

  it('F-MP-08: dropping a meal on its own slot does nothing', async () => {
    const soup = plan('2026-11-18', 'dinner', 'Soup')
    const { result } = renderActions([soup])
    expect(await result.current.copyTo(soup, '2026-11-18', 'dinner')).toEqual({
      status: 'same-slot',
    })
    expect(api.post).not.toHaveBeenCalled()
  })
})

describe('F-MP-09 the recipe library', () => {
  const recipes = [recipe(1, 'Omelette', 'eggs, milk, cheese'), recipe(2, 'Toast', 'bread, butter')]

  it('F-MP-09: searching by name or by ingredient narrows the list', async () => {
    const { user } = renderPage({ recipes }, '/meals?tab=recipes')
    expect(await screen.findByText('Omelette')).toBeInTheDocument()
    await user.type(screen.getByRole('searchbox', { name: /Search recipes/ }), 'butter')
    expect(screen.queryByText('Omelette')).not.toBeInTheDocument()
    expect(screen.getByText('Toast')).toBeInTheDocument()
  })

  it('F-MP-09: adding a recipe sends its name, ingredients, prep time, servings and instructions', async () => {
    api.post.mockReturnValue(new Promise(() => {}))
    const { user } = renderPage({ recipes }, '/meals?tab=recipes')
    await user.click(await screen.findByRole('button', { name: 'Add recipe' }))
    const panel = await screen.findByRole('dialog', { name: 'Add a recipe' })
    await user.type(within(panel).getByRole('textbox', { name: /^Name/ }), 'Salad')
    await user.type(within(panel).getByRole('textbox', { name: /^Ingredients/ }), 'lettuce, tomato')
    await user.type(within(panel).getByRole('textbox', { name: /^Prep time/ }), '10 min')
    await user.type(within(panel).getByRole('textbox', { name: /^Servings/ }), '2')
    await user.type(within(panel).getByRole('textbox', { name: /^Instructions/ }), 'Mix')
    await user.click(within(panel).getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Salad')).toBeInTheDocument()
    expect(api.post).toHaveBeenCalledWith(
      '/api/recipes',
      expect.objectContaining({
        name: 'Salad',
        ingredients: 'lettuce, tomato',
        prepTime: '10 min',
        servings: 2,
        instructions: 'Mix',
      }),
      expect.anything(),
    )
  })

  it('F-MP-09: an edit changes only what she changed, and delete hides the recipe with Undo', async () => {
    api.patch.mockResolvedValue({ ...recipes[1], name: 'Toast!' })
    const { user } = renderPage({ recipes }, '/meals?tab=recipes')
    await user.click(await screen.findByRole('button', { name: 'Edit Toast' }))
    const panel = await screen.findByRole('dialog', { name: 'Edit recipe' })
    const name = within(panel).getByRole('textbox', { name: /^Name/ })
    await user.clear(name)
    await user.type(name, 'Toast!')
    await user.click(within(panel).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/api/recipes/2',
        { name: 'Toast!' },
        expect.anything(),
      ),
    )
    await user.click(await screen.findByRole('button', { name: 'Delete Omelette' }))
    expect(screen.queryByText('Omelette')).not.toBeInTheDocument()
    expect(api.delete).not.toHaveBeenCalled()
    await user.click(
      within(screen.getByRole('region', { name: 'Notifications' })).getByRole('button', {
        name: 'Undo',
      }),
    )
    expect(await screen.findByText('Omelette')).toBeInTheDocument()
  })
})

describe('F-MP-10 summary', () => {
  it('F-MP-10: shows the numbers of the old getSummary, and tapping a recent meal opens its edit', async () => {
    const plans = [
      plan('2026-11-16', 'breakfast', 'Omelette'),
      plan('2026-11-17', 'dinner', 'Pho bo', { isFavorite: true }),
      plan('2026-11-18', 'dinner', 'Pho bo'),
      plan('2026-10-30', 'lunch', 'Salad'),
    ]
    const { user } = renderPage({ plans }, '/meals?tab=summary')
    expect(await screen.findByText('Total meals')).toBeInTheDocument()
    const stat = (label: string) => screen.getByText(label).closest('div')!
    expect(stat('Total meals')).toHaveTextContent('4')
    expect(stat('This week')).toHaveTextContent('3')
    expect(stat('Streak')).toHaveTextContent('3')
    expect(screen.getByRole('heading', { name: 'Top meals' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Favourites' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'By month' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Recent meals' })).toBeInTheDocument()
    await user.click(
      within(screen.getByRole('region', { name: 'Recent meals' })).getAllByRole('button', {
        name: /^Pho bo/,
      })[0]!,
    )
    expect(await screen.findByRole('dialog', { name: 'Edit meal' })).toBeInTheDocument()
  })
})

describe('F-MP-11 the recipe library lives under Meals', () => {
  it('F-MP-11: Recipes is a tab of Meals and there is no recipe-manager page', async () => {
    renderPage()
    expect(await screen.findByRole('radio', { name: 'Recipes' })).toBeInTheDocument()
    expect(DESTINATIONS.map((d) => d.path)).not.toContain('/recipe-manager')
  })
})

describe('F-MP-12 suggestions', () => {
  it('F-MP-12: suggests Omelette first from the use-soon items, not Toast, and calls no AI', async () => {
    const omelette = {
      ...recipe(1, 'Omelette', 'eggs, milk, cheese'),
      matchCount: 2,
      matchingItems: ['Eggs', 'Milk'],
    }
    renderPage({ suggestions: [omelette] })
    const region = await screen.findByRole('region', { name: 'Cook with what expires soon' })
    expect(within(region).getByText('Omelette')).toBeInTheDocument()
    expect(within(region).getByText(/Eggs, Milk/)).toBeInTheDocument()
    expect(within(region).queryByText('Toast')).not.toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
    expect(api.get.mock.calls.map((c) => c[0] as string).some((p) => p.startsWith('/api/ai'))).toBe(
      false,
    )
  })

  it('F-MP-12: says nothing when no recipe matches', async () => {
    renderPage({ suggestions: [] })
    await screen.findByRole('heading', { name: /16.*22 Nov 2026/ })
    expect(
      screen.queryByRole('region', { name: 'Cook with what expires soon' }),
    ).not.toBeInTheDocument()
  })
})

describe('UI refresh: colours, today and the suggestions rail', () => {
  it('F-MP-01: today is marked (aria-current="date", a Today pill) and no other day is', async () => {
    renderPage({ plans: [] })
    await screen.findByRole('heading', { name: /16.*22 Nov 2026/ })
    const marked = document.querySelectorAll('li[aria-current="date"]')
    expect(marked).toHaveLength(1)
    expect(marked[0]).toHaveTextContent('Wed 18 Nov')
    expect(within(marked[0] as HTMLElement).getByText('Today')).toBeInTheDocument()
  })

  it('F-MP-01: a planned meal carries its type (colour by type, and the word stays in its name)', async () => {
    renderPage({
      plans: [
        plan('2026-11-18', 'breakfast', 'Toast'),
        plan('2026-11-18', 'lunch', 'Salad'),
        plan('2026-11-18', 'dinner', 'Pho bo'),
      ],
    })
    for (const [name, type] of [
      ['Toast', 'breakfast'],
      ['Salad', 'lunch'],
      ['Pho bo', 'dinner'],
    ] as const) {
      const button = await screen.findByRole('button', { name: new RegExp(`^${name}, ${type},`) })
      expect(button).toHaveAttribute('data-meal-type', type)
    }
  })

  it('F-MP-12: the suggestions are a rail above the week (before it in the page)', async () => {
    const omelette = {
      ...recipe(1, 'Omelette', 'eggs, milk'),
      matchCount: 1,
      matchingItems: ['Eggs'],
    }
    renderPage({ suggestions: [omelette] })
    const rail = await screen.findByRole('region', { name: 'Cook with what expires soon' })
    const week = screen.getByRole('region', { name: 'Week' })
    expect(rail.compareDocumentPosition(week) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('F-MP-09: a recipe card shows its tinted initial, serves and time, and its ingredients', async () => {
    renderPage(
      {
        recipes: [
          recipe(1, 'Omelette', 'eggs, milk', { servings: 2, prepTime: '10 min' }),
          recipe(2, 'Toast', 'bread'),
        ],
      },
      '/meals?tab=recipes',
    )
    expect(await screen.findByText('Serves 2')).toBeInTheDocument()
    expect(screen.getByText('10 min')).toBeInTheDocument()
    expect(screen.getByText('O')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Plan Toast' })).toBeInTheDocument()
  })

  const stocked = (id: number, name: string, expirationDate = '2026-12-31'): StockRow => ({
    id,
    name,
    expirationDate,
    quantity: 1,
  })

  it('F-MP-09: a card says how many ingredients are in stock and names the missing ones', async () => {
    renderPage(
      {
        recipes: [recipe(1, 'Omelette', 'eggs, milk, cheese')],
        items: [stocked(1, 'Eggs'), stocked(2, 'Milk')],
      },
      '/meals?tab=recipes',
    )
    expect(await screen.findByText('2 of 3 in stock')).toBeInTheDocument()
    expect(screen.getByText('Missing: cheese')).toBeInTheDocument()
  })

  it('F-MP-09: a card with every ingredient in stock says so and lists what it uses', async () => {
    renderPage(
      {
        recipes: [recipe(1, 'Toast', 'bread, butter')],
        items: [stocked(1, 'Bread'), stocked(2, 'Butter')],
      },
      '/meals?tab=recipes',
    )
    expect(await screen.findByText('All 2 in stock')).toBeInTheDocument()
    expect(screen.getByText('Uses bread, butter')).toBeInTheDocument()
    expect(screen.queryByText(/Missing:/)).not.toBeInTheDocument()
  })

  it('F-MP-09: an item past its date does not count as in stock', async () => {
    renderPage(
      { recipes: [recipe(1, 'Toast', 'bread')], items: [stocked(1, 'Bread', '2026-11-10')] },
      '/meals?tab=recipes',
    )
    expect(await screen.findByText('0 of 1 in stock')).toBeInTheDocument()
  })

  it('F-MP-09: a recipe with no ingredients shows no stock chip, only a nudge to add them', async () => {
    const { user } = renderPage({ recipes: [recipe(1, 'Domino', '')] }, '/meals?tab=recipes')
    await user.click(await screen.findByRole('button', { name: 'Add ingredients to Domino' }))
    expect(await screen.findByRole('dialog', { name: 'Edit recipe' })).toBeInTheDocument()
    expect(screen.queryByText(/in stock/)).not.toBeInTheDocument()
  })

  it('F-MP-02: a month day shows a dot for each meal type planned', async () => {
    renderPage(
      {
        plans: [plan('2026-11-18', 'breakfast', 'Toast'), plan('2026-11-18', 'dinner', 'Pho bo')],
      },
      '/meals?tab=month&date=2026-11-18',
    )
    const day = await screen.findByRole('button', { name: 'Wed 18 Nov, 2 meals' })
    expect(day.querySelectorAll('span[aria-hidden="true"] > span.rounded-pill')).toHaveLength(2)
  })
})
