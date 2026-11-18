// Step 5.6 e2e (SPEC-MP-001) in a real browser with the real API router and local Supabase: a typed meal
// reaches the server and its name appears in the recipe library, dragging a meal copies it (the original
// stays; a filled slot asks Replace or Cancel), a held delete is sent after the Undo window, and the page
// never scrolls sideways. The week is fixed (7-13 Jan 2030, a Monday) so the test does not depend on the clock.
import type { BrowserContext, Page } from '@playwright/test'
import { startApiServer, type ApiServer } from './support/api-server'
import { signInRest, type Account } from './support/supabase'
import { expect, test } from './support/test'

let api: ApiServer
test.beforeAll(async () => {
  api = await startApiServer('meals.spec')
})
test.afterAll(async () => {
  await api.close()
})

const HOLD_WINDOW_MS = 8_000
const WEEK = '/meals?date=2030-01-09'
type Plan = {
  id: number
  planDate: string
  mealType: string
  mealName: string
  notes: string | null
}
type RecipeRow = { id: number; name: string }

async function call<T>(account: Account, method: string, path: string, body?: unknown): Promise<T> {
  const { access_token } = await signInRest(account)
  const res = await fetch(`${api.baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`)
  const text = await res.text()
  return (text ? (JSON.parse(text) as { data: T }).data : undefined) as T
}

const serverPlans = (account: Account) => call<Plan[]>(account, 'GET', '/api/meal-plans')

async function seed(
  account: Account,
  plans: Array<Omit<Plan, 'id' | 'notes'> & { notes?: string }>,
) {
  for (const old of await serverPlans(account))
    await call(account, 'DELETE', `/api/meal-plans/${old.id}`)
  for (const old of await call<RecipeRow[]>(account, 'GET', '/api/recipes'))
    await call(account, 'DELETE', `/api/recipes/${old.id}`)
  for (const plan of plans) await call(account, 'POST', '/api/meal-plans', plan)
}

async function routeApi(context: BrowserContext) {
  await context.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    try {
      const response = await route.fetch({ url: `${api.baseUrl}${url.pathname}${url.search}` })
      await route.fulfill({ response })
    } catch {
      // The test ended while this request was still in flight: nothing is left to answer.
    }
  })
}

const SHOTS = process.env.E2E_SHOTS

/** Mouse drag with real intermediate moves: dnd-kit starts a drag after the pointer moves a few pixels. */
async function drag(
  page: Page,
  from: ReturnType<Page['locator']>,
  to: ReturnType<Page['locator']>,
) {
  const a = (await from.boundingBox())!
  const b = (await to.boundingBox())!
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 12, { steps: 4 })
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 })
  await page.mouse.up()
}

test('F-MP-03 / F-MP-05: a typed meal reaches the server, and its name appears under Recipes', async ({
  page,
  context,
  account,
}) => {
  await seed(account, [])
  await routeApi(context)
  await page.goto(WEEK)
  await page.getByRole('button', { name: 'Add dinner, Wed 9 Jan' }).click()
  await page.getByRole('combobox', { name: /Meal name/ }).fill('Pho bo')
  await page.getByRole('textbox', { name: /Notes/ }).fill('extra herbs')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('button', { name: /^Pho bo, dinner, Wed 9 Jan/ })).toBeVisible()
  await expect
    .poll(async () => (await serverPlans(account)).map((p) => [p.mealName, p.notes]))
    .toEqual([['Pho bo', 'extra herbs']])
  await page.getByRole('radio', { name: 'Recipes' }).click()
  await expect(page.getByText('Pho bo', { exact: true })).toBeVisible()
})

const SOUP_AND_STEW = [
  { planDate: '2030-01-09', mealType: 'dinner', mealName: 'Soup' },
  { planDate: '2030-01-10', mealType: 'lunch', mealName: 'Stew' },
]
const planLines = async (account: Account) =>
  (await serverPlans(account)).map((p) => `${p.planDate} ${p.mealType} ${p.mealName}`).sort()

test('F-MP-08: dragging a meal onto an empty slot copies it and the original stays', async ({
  page,
  context,
  account,
}, info) => {
  test.skip(
    info.project.name === 'phone',
    'the days are stacked on a phone: drop targets are off screen',
  )
  await seed(account, SOUP_AND_STEW)
  await routeApi(context)
  await page.goto(WEEK)
  const soup = page.getByRole('button', { name: /^Soup, dinner/ })
  await expect(soup).toBeVisible()
  await drag(page, soup, page.getByRole('button', { name: 'Add breakfast, Fri 11 Jan' }))
  await expect(page.getByRole('button', { name: /^Soup, breakfast, Fri 11 Jan/ })).toBeVisible()
  await expect(soup).toBeVisible()
  await expect
    .poll(() => planLines(account))
    .toEqual(['2030-01-09 dinner Soup', '2030-01-10 lunch Stew', '2030-01-11 breakfast Soup'])
})

test('F-MP-04 / F-MP-08: dropping on a filled slot asks first, and Cancel changes nothing', async ({
  page,
  context,
  account,
}, info) => {
  test.skip(
    info.project.name === 'phone',
    'the days are stacked on a phone: drop targets are off screen',
  )
  await seed(account, SOUP_AND_STEW)
  await routeApi(context)
  await page.goto(WEEK)
  const soup = page.getByRole('button', { name: /^Soup, dinner/ })
  await expect(soup).toBeVisible()
  await drag(page, soup, page.getByRole('button', { name: /^Stew, lunch, Thu 10 Jan/ }))
  const prompt = page.getByRole('alertdialog')
  await expect(prompt).toContainText('already has Stew')
  await prompt.getByRole('button', { name: 'Cancel' }).click()
  await expect(prompt).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Stew, lunch/ })).toBeVisible()
  expect(await planLines(account)).toEqual(['2030-01-09 dinner Soup', '2030-01-10 lunch Stew'])
})

test('F-MP-04 / F-MP-08: Replace changes the meal in the filled slot, so the slot is never empty', async ({
  page,
  context,
  account,
}, info) => {
  test.skip(
    info.project.name === 'phone',
    'the days are stacked on a phone: drop targets are off screen',
  )
  await seed(account, SOUP_AND_STEW)
  await routeApi(context)
  await page.goto(WEEK)
  const soup = page.getByRole('button', { name: /^Soup, dinner/ })
  await expect(soup).toBeVisible()
  await drag(page, soup, page.getByRole('button', { name: /^Stew, lunch, Thu 10 Jan/ }))
  await page.getByRole('alertdialog').getByRole('button', { name: 'Replace' }).click()
  await expect(page.getByRole('button', { name: /^Soup, lunch, Thu 10 Jan/ })).toBeVisible()
  await expect
    .poll(() => planLines(account))
    .toEqual(['2030-01-09 dinner Soup', '2030-01-10 lunch Soup'])
})

test('F-MP-08: from the keyboard, Space picks a meal up, an arrow moves to the next day, Space copies it; Enter opens it', async ({
  page,
  context,
  account,
}, info) => {
  test.skip(info.project.name === 'phone', 'the keyboard layout check is for the seven-column week')
  await seed(account, [{ planDate: '2030-01-09', mealType: 'dinner', mealName: 'Soup' }])
  await routeApi(context)
  await page.goto(WEEK)
  const soup = page.getByRole('button', { name: /^Soup, dinner, Wed 9 Jan/ })
  await soup.focus()
  // Each key waits for the announcement of the one before: the drag has to be under way first.
  const live = page.locator('[id^="DndLiveRegion"]')
  await page.keyboard.press('Space')
  await expect(live).toContainText('is over Dinner on Wed 9 Jan')
  await page.keyboard.press('ArrowRight')
  await expect(live).toContainText('is over Dinner on Thu 10 Jan, which is empty')
  await page.keyboard.press('Space')
  await expect(live).toContainText('Dropped Soup on Dinner on Thu 10 Jan')
  // Saved: its label loses the ", saving" ending.
  await expect(page.getByRole('button', { name: /^Soup, dinner, Thu 10 Jan$/ })).toBeVisible()
  await expect
    .poll(async () => (await serverPlans(account)).map((p) => p.planDate).sort())
    .toEqual(['2030-01-09', '2030-01-10'])
  await soup.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Edit meal' })).toBeVisible()
})

test('F-MP-06 / NC-MP-NO-CONFIRM-DELETE: delete hides the meal and the server hears about it after the Undo window', async ({
  page,
  context,
  account,
}) => {
  await seed(account, [{ planDate: '2030-01-09', mealType: 'dinner', mealName: 'Soup' }])
  await routeApi(context)
  page.on('dialog', () => {
    throw new Error('delete must not use confirm()')
  })
  await page.goto(WEEK)
  await page.getByRole('button', { name: /^Soup, dinner/ }).click()
  await page
    .getByRole('dialog', { name: 'Edit meal' })
    .getByRole('button', { name: 'Delete' })
    .click()
  await expect(page.getByRole('button', { name: /^Soup/ })).toHaveCount(0)
  expect((await serverPlans(account)).length).toBe(1) // not sent yet
  await expect
    .poll(async () => (await serverPlans(account)).length, { timeout: HOLD_WINDOW_MS })
    .toBe(0)
})

test('F-MP-01 / F-MP-02 / F-MP-10: week, month and summary show without sideways scroll; screenshots', async ({
  page,
  context,
  account,
}, info) => {
  await seed(account, [
    { planDate: '2030-01-07', mealType: 'breakfast', mealName: 'Omelette' },
    { planDate: '2030-01-08', mealType: 'dinner', mealName: 'Pho bo' },
    { planDate: '2030-01-09', mealType: 'lunch', mealName: 'Salad' },
    { planDate: '2030-01-10', mealType: 'dinner', mealName: 'Pho bo' },
  ])
  await routeApi(context)
  await page.goto(WEEK)
  await expect(page.getByRole('heading', { level: 2, name: '7 – 13 Jan 2030' })).toBeVisible()
  const noSideways = () =>
    page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  expect(await noSideways()).toBe(true)
  const shoot = async (name: string) => {
    if (!SHOTS) return
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await page.screenshot({ path: `${SHOTS}/meals-${name}-${info.project.name}-${scheme}.png` })
    }
  }
  await shoot('week')

  await page.getByRole('radio', { name: 'Month' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'January 2030' })).toBeVisible()
  expect(await noSideways()).toBe(true)
  await shoot('month')
  await page.getByRole('button', { name: /^Thu 10 Jan, 1 meal/ }).click()
  await expect(page.getByRole('heading', { level: 2, name: '7 – 13 Jan 2030' })).toBeVisible()

  await page.getByRole('radio', { name: 'Summary' }).click()
  await expect(page.getByText('Total meals')).toBeVisible()
  expect(await noSideways()).toBe(true)
  await shoot('summary')

  await page.getByRole('radio', { name: 'Recipes' }).click()
  expect(await noSideways()).toBe(true)
  await shoot('recipes')
})
