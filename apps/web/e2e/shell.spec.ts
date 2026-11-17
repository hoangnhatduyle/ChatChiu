// Step 3.3 e2e: navigation at 390, 768 and 1280 px in both themes, with screenshots
// (SPEC-AP-001 F-AP-02), and the installable shell's service worker (F-AP-01, shell part).
import { expect, test } from './support/test'

const SIZES = [
  { name: 'phone', width: 390, height: 844, nav: 'Main (phone)' },
  { name: 'portrait', width: 768, height: 1024, nav: 'Main' },
  { name: 'tablet', width: 1280, height: 800, nav: 'Main' },
] as const
const THEMES = ['light', 'dark'] as const

const DESTINATIONS = [
  { link: 'Stock', path: '/stock', heading: 'Stock' },
  { link: 'Shopping', path: '/shopping', heading: 'Shopping' },
  { link: 'Meals', path: '/meals', heading: 'Meals' },
  { link: 'Kitchen', path: '/', heading: 'Kitchen' },
] as const

// The sizes are set per test; the config runs this file in the tablet project only.

for (const theme of THEMES) {
  for (const size of SIZES) {
    test.describe(`${theme} · ${size.width}px`, () => {
      test.use({
        viewport: { width: size.width, height: size.height },
        colorScheme: theme,
        serviceWorkers: 'block',
      })

      test(`F-AP-02: ${size.name === 'phone' ? 'bottom bar' : '84 px rail'} reaches every destination`, async ({
        page,
      }) => {
        await page.goto('/')
        const nav = page.getByRole('navigation', { name: size.nav, exact: true })
        await expect(nav).toBeVisible()
        const other = size.name === 'phone' ? 'Main' : 'Main (phone)'
        await expect(page.getByRole('navigation', { name: other, exact: true })).toBeHidden()

        const box = await nav.boundingBox()
        if (!box) throw new Error('nav not laid out')
        if (size.name === 'phone') {
          expect(Math.round(box.y + box.height)).toBe(size.height)
        } else {
          expect(Math.round(box.width)).toBe(84)
        }

        for (const d of DESTINATIONS) {
          await nav.getByRole('link', { name: d.link, exact: true }).click()
          await expect(page).toHaveURL(d.path)
          await expect(page.getByRole('heading', { level: 1, name: d.heading })).toBeVisible()
        }

        // Waste & Stats and Settings: directly on the rail, through More on the phone.
        for (const [path, heading, railLabel] of [
          ['/stats', 'Waste & Stats', 'Stats'],
          ['/settings', 'Settings', 'Settings'],
        ] as const) {
          if (size.name === 'phone') {
            await nav.getByRole('link', { name: 'More', exact: true }).click()
            await page
              .getByRole('main')
              .getByRole('link', { name: new RegExp(heading) })
              .click()
          } else {
            await nav.getByRole('link', { name: railLabel, exact: true }).click()
          }
          await expect(page).toHaveURL(path)
          await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
        }

        await page.goto('/')
        await expect(page.getByRole('heading', { level: 1, name: 'Kitchen' })).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        await expect(page).toHaveScreenshot(`shell-${theme}-${size.width}.png`)
      })
    })
  }
}

test('a11y review H3: on a short landscape screen the rail scrolls, so Settings stays reachable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Main', exact: true })
  const settings = nav.getByRole('link', { name: 'Settings', exact: true })
  await settings.scrollIntoViewIfNeeded()
  await expect(settings).toBeInViewport()
  const heights = await nav
    .getByRole('link')
    .evaluateAll((links) => links.map((l) => l.getBoundingClientRect().height))
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(60)
  await settings.click()
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
})

test('F-AP-01 (shell): the app registers a service worker and opens offline', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Kitchen' })).toBeVisible()
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Kitchen' })).toBeVisible()
  await page.goto('/meals')
  await expect(page.getByRole('heading', { level: 1, name: 'Meals' })).toBeVisible()
  await context.setOffline(false)
})

test('F-AP-01 (roadmap 3.4): Chrome finds the app installable (no installability errors)', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Kitchen' })).toBeVisible()
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  const cdp = await page.context().newCDPSession(page)
  try {
    // The check Lighthouse's former PWA audit used (Lighthouse 12 dropped that category); polled,
    // because it can report errors while the worker and manifest settle.
    await expect
      .poll(async () => (await cdp.send('Page.getInstallabilityErrors')).installabilityErrors)
      .toEqual([])
    const { url, errors } = await cdp.send('Page.getAppManifest')
    expect(url).toMatch(/\/manifest\.webmanifest$/)
    expect(errors).toEqual([])
  } finally {
    await cdp.detach()
  }
})
