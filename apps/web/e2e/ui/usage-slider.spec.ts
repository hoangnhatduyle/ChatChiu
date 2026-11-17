// Real-pointer checks of UsageSlider on the gallery (SPEC-KB-001 F-KB-04, SPEC-QP-001 F-QP-01).
import { expect, test, type Locator, type Page } from '@playwright/test'

const demo = (page: Page, name: string) => page.locator(`[data-demo="${name}"]`).first()

/** Drags from the thumb centre to `percent` of the track, in small steps like a finger. */
async function dragTo(page: Page, slider: Locator, percent: number) {
  const track = slider.locator('[data-usage-track]')
  await expect(track).toBeVisible()
  const box = await track.boundingBox()
  const thumb = await slider.locator('[data-usage-thumb]').boundingBox()
  if (!box || !thumb) throw new Error('slider not laid out')
  const y = thumb.y + thumb.height / 2
  await page.mouse.move(thumb.x + thumb.width / 2, y)
  await page.mouse.down()
  await page.mouse.move(box.x + (box.width * percent) / 100, y, { steps: 12 })
  await page.mouse.up()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/ui-gallery.html')
})

test('F-KB-04: dragging the board bar from 60 % down to 35 % saves 35 on release', async ({
  page,
}) => {
  const milk = demo(page, 'Whole milk')
  await dragTo(page, milk, 35)
  await expect(milk.locator('[data-commits]')).toHaveText('saved: 35')
  await expect(milk.getByRole('slider')).toHaveValue('35')
})

test('F-KB-04 / NC-KB-NO-UP-DRAG: the board bar cannot be dragged above where it started', async ({
  page,
}) => {
  const milk = demo(page, 'Whole milk')
  await dragTo(page, milk, 90)
  await expect(milk.locator('[data-commits]')).toHaveText('no saves')
  await expect(milk.getByRole('slider')).toHaveValue('60')
})

test('F-KB-04: a tap on the track (moved under 4 px) changes nothing', async ({ page }) => {
  const milk = demo(page, 'Whole milk')
  const box = await milk.locator('[data-usage-track]').boundingBox()
  if (!box) throw new Error('track not laid out')
  const x = box.x + box.width * 0.2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 3, y)
  await page.mouse.up()
  await expect(milk.locator('[data-commits]')).toHaveText('no saves')
  await expect(milk.getByRole('slider')).toHaveValue('60')
})

test('F-QP-01: the panel bar can be dragged up and saves on release', async ({ page }) => {
  const rice = demo(page, 'Jasmine rice')
  await dragTo(page, rice, 70)
  await expect(rice.locator('[data-commits]')).toHaveText('saved: 70')
})

test('F-KB-04: keyboard moves in 5 % steps and saves once when the keys stop', async ({ page }) => {
  const milk = demo(page, 'Whole milk')
  await milk.getByRole('slider').focus()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await expect(milk.getByRole('slider')).toHaveValue('50')
  await expect(milk.locator('[data-commits]')).toHaveText('saved: 50')
})

test('F-KB-04: a mouse drag that leaves the row still saves where it was released', async ({
  page,
}) => {
  const milk = demo(page, 'Whole milk')
  const track = milk.locator('[data-usage-track]')
  const thumb = milk.locator('[data-usage-thumb]')
  await expect(track).toBeVisible()
  const box = await track.boundingBox()
  const t = await thumb.boundingBox()
  if (!box || !t) throw new Error('slider not laid out')
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2)
  await page.mouse.down()
  // Leave the 44 px row upwards while moving left, as a quick mouse drag does.
  await page.mouse.move(box.x + box.width * 0.3, box.y - 80, { steps: 10 })
  await page.mouse.up()
  await expect(milk.locator('[data-commits]')).toHaveText('saved: 30')
})
