// Component screenshots in Market stall (light) and Market stall Dark (dark), at phone and tablet
// widths (roadmap 3.2, architecture.md §4).
import { expect, test } from '@playwright/test'

const THEMES = ['light', 'dark'] as const
const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 1280, height: 800 },
] as const

for (const theme of THEMES) {
  for (const size of SIZES) {
    test.describe(`${theme} · ${size.name}`, () => {
      test.use({ viewport: { width: size.width, height: size.height }, colorScheme: theme })

      test.beforeEach(async ({ page }) => {
        await page.goto(`/ui-gallery.html?theme=${theme}`)
        // Wait for React to mount (so the fonts are requested), then for them to load.
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await expect
          .poll(() => page.evaluate(() => document.fonts.check('800 1em "Inter Tight"')))
          .toBe(true)
        await page.evaluate(() => document.fonts.ready)
      })

      test('CS-TOKENS / CS-ACCESSIBLE-UI: every component matches its baseline', async ({
        page,
      }) => {
        await expect(page).toHaveScreenshot(`gallery-${theme}-${size.name}.png`, { fullPage: true })
      })

      test('SPEC-QP-001: panel is a bottom sheet on the phone and a side panel on the tablet', async ({
        page,
      }) => {
        // A DOM click, not a pointer click: no scroll-into-view, so the page behind the scrim is
        // always at the top and the screenshot is deterministic.
        await page.getByRole('button', { name: 'Open Whole milk' }).dispatchEvent('click')
        const dialog = page.getByRole('dialog', { name: 'Whole milk' })
        await expect(dialog).toBeVisible()
        // Measure once the entrance animation has settled.
        const edges = async () => {
          const box = await page.locator('[data-panel]').boundingBox()
          if (!box) return null
          return {
            width: Math.round(box.width),
            right: Math.round(box.x + box.width),
            bottom: Math.round(box.y + box.height),
          }
        }
        if (size.name === 'phone') {
          await expect.poll(edges).toMatchObject({ width: size.width, bottom: size.height })
        } else {
          await expect.poll(edges).toMatchObject({ width: 400, right: size.width })
        }
        await expect(page).toHaveScreenshot(`panel-${theme}-${size.name}.png`)
      })
    })
  }
}

test('F-SE-06: data-theme overrides the device setting in both directions', async ({ page }) => {
  const bodyBg = async (scheme: 'light' | 'dark', theme?: 'light' | 'dark') => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto(`/ui-gallery.html${theme ? `?theme=${theme}` : ''}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    return page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  }
  const deviceDark = await bodyBg('dark')
  const deviceLight = await bodyBg('light')
  expect(deviceDark).not.toBe(deviceLight)
  expect(await bodyBg('light', 'dark')).toBe(deviceDark)
  expect(await bodyBg('dark', 'light')).toBe(deviceLight)
})

test('CS-ACCESSIBLE-UI: every button and control in the gallery is at least 44 px tall', async ({
  page,
}) => {
  await page.goto('/ui-gallery.html')
  const small = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        'button, input:not([type=range]):not([tabindex="-1"]), [role=slider], [data-usage-track]',
      ),
    ]
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => ({ el: el.outerHTML.slice(0, 60), h: el.getBoundingClientRect().height }))
      .filter((r) => r.h < 44),
  )
  expect(small).toEqual([])
})

test('CS-ACCESSIBLE-UI: in forced-colors mode the usage bar fill and the selected chip stay visible', async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: 'active' })
  await page.goto('/ui-gallery.html')
  const fill = page.locator('[data-demo="Whole milk"] [data-usage-track] span span').first()
  const track = page.locator('[data-demo="Whole milk"] [data-usage-track] > span').first()
  const bg = (l: typeof fill) => l.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(await bg(fill)).not.toBe(await bg(track))
  const chip = page.getByRole('button', { name: /^All/ })
  const other = page.getByRole('button', { name: /^Use soon/ })
  expect(await chip.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
    await other.evaluate((el) => getComputedStyle(el).backgroundColor),
  )
})
