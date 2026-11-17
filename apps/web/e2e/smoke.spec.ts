import { expect, test } from './support/test'

test('F-AP-05: the app shell loads with the brand "Chắt Chiu"', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Kitchen' })).toBeVisible()
  // The rail's logo (hidden on the phone, where the board header carries the brand in 5.1).
  await expect(page.locator('img[alt="Chắt Chiu"]')).toBeAttached()
  await expect(page).toHaveTitle('Kitchen · Chắt Chiu')
})
