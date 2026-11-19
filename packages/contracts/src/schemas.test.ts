import { describe, expect, it } from 'vitest'
import * as contracts from './index.js'
import { inventoryItemCreate } from './index.js'
import {
  categoryUpdate,
  clearPurchased,
  defaultPreferences,
  locationUpdate,
  mealPlanCreate,
  mealPlanListQuery,
  mealPlanUpdate,
  preferencesQuery,
  preferencesUpdate,
  pushSubscribe,
  pushSubscribeLocal,
  receiptScanRequest,
  recipeUpdate,
  shoppingItemCreate,
  shoppingItemUpdate,
  signUploadRequest,
  statsOverviewQuery,
  wasteCreate,
  wasteFromItem,
  isAllowedPushEndpoint,
} from './index.js'

describe('update schemas (CS-ZOD4-NO-UPDATE-DEFAULTS)', () => {
  const updates = {
    inventoryItemUpdate: contracts.inventoryItemUpdate,
    shoppingItemUpdate,
    locationUpdate,
    categoryUpdate,
    mealPlanUpdate,
    recipeUpdate,
    preferencesUpdate,
  }

  it.each(Object.entries(updates))('AC-API-03: %s parses {} to {}', (_name, schema) => {
    expect(schema.parse({})).toEqual({})
  })

  it('AC-API-03: mealPlanUpdate does not inject isFavorite', () => {
    expect(mealPlanUpdate.parse({ notes: 'x' })).toEqual({ notes: 'x' })
  })
})

describe('shopping', () => {
  it('accepts free-text quantity and blocks an empty name', () => {
    expect(shoppingItemCreate.parse({ name: 'Eggs', quantity: '10' }).quantity).toBe('10')
    expect(shoppingItemCreate.safeParse({ name: '   ' }).success).toBe(false)
  })

  it('AC-API-11: clear-purchased takes a non-empty list of ids', () => {
    expect(clearPurchased.parse({ ids: [1, 2, 3] })).toEqual({ ids: [1, 2, 3] })
    expect(clearPurchased.safeParse({ ids: [] }).success).toBe(false)
    expect(clearPurchased.safeParse({}).success).toBe(false)
  })
})

describe('meals', () => {
  it('defaults isFavorite to false on create only', () => {
    const parsed = mealPlanCreate.parse({
      planDate: '2026-11-16',
      mealType: 'dinner',
      mealName: 'Pho bo',
    })
    expect(parsed.isFavorite).toBe(false)
  })

  it('rejects an unknown meal type', () => {
    expect(
      mealPlanCreate.safeParse({ planDate: '2026-11-16', mealType: 'brunch', mealName: 'x' })
        .success,
    ).toBe(false)
  })

  it('list query takes optional from/to dates', () => {
    expect(mealPlanListQuery.parse({ from: '2026-11-16' })).toEqual({ from: '2026-11-16' })
    expect(mealPlanListQuery.safeParse({ to: 'tomorrow' }).success).toBe(false)
  })
})

describe('waste', () => {
  it('accepts an ad-hoc waste entry and the from-item body', () => {
    expect(wasteCreate.parse({ itemName: 'Milk', quantity: 1, unit: 'L' }).itemName).toBe('Milk')
    expect(wasteFromItem.parse({ itemId: '5' })).toEqual({ itemId: 5 })
  })
})

describe('ai and uploads', () => {
  it('AC-API-22: receipt imagePath must be inside a <uid>/<scope>/ folder with an image extension', () => {
    expect(receiptScanRequest.safeParse({ imagePath: 'abc-123/receipts/f00d.jpg' }).success).toBe(
      true,
    )
    expect(receiptScanRequest.safeParse({ imagePath: '../etc/passwd' }).success).toBe(false)
    expect(receiptScanRequest.safeParse({ imagePath: 'abc/receipts/x.gif' }).success).toBe(false)
  })

  it('sign-upload only allows the three image types', () => {
    expect(
      signUploadRequest.safeParse({ scope: 'receipts', contentType: 'image/png', ext: 'png' })
        .success,
    ).toBe(true)
    expect(
      signUploadRequest.safeParse({ scope: 'receipts', contentType: 'image/gif', ext: 'gif' })
        .success,
    ).toBe(false)
  })
})

describe('stats', () => {
  it('AC-API-16: overview range defaults to all and accepts week|month|year|all', () => {
    expect(statsOverviewQuery.parse({})).toEqual({ range: 'all' })
    expect(statsOverviewQuery.parse({ range: 'week', categoryId: '3' })).toEqual({
      range: 'week',
      categoryId: 3,
    })
    expect(statsOverviewQuery.safeParse({ range: 'decade' }).success).toBe(false)
  })
})

describe('preferences', () => {
  it('AC-API-17: defaults use the device timezone when valid, else UTC', () => {
    expect(defaultPreferences('Asia/Ho_Chi_Minh')).toEqual({
      timezone: 'Asia/Ho_Chi_Minh',
      notifyHour: 9,
      expiryAlerts: true,
      lowStockAlerts: true,
      theme: 'system',
    })
    expect(defaultPreferences(undefined).timezone).toBe('UTC')
  })

  it('AC-API-17: an invalid ?tz= falls back instead of failing the GET', () => {
    expect(preferencesQuery.parse({ tz: 'Not/AZone' })).toEqual({})
    expect(preferencesQuery.parse({ tz: 'Europe/Berlin' })).toEqual({ tz: 'Europe/Berlin' })
  })

  it('AC-API-17: PATCH validates each field and keeps only the ones sent', () => {
    expect(preferencesUpdate.parse({ notifyHour: 7 })).toEqual({ notifyHour: 7 })
    expect(preferencesUpdate.safeParse({ notifyHour: 24 }).success).toBe(false)
    expect(preferencesUpdate.safeParse({ timezone: 'Mars/Base' }).success).toBe(false)
    expect(preferencesUpdate.safeParse({ theme: 'sepia' }).success).toBe(false)
  })

  it.each([
    'https://web.push.apple.com/QGx',
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/x',
    'https://wns2-bl2p.notify.windows.com/w/?token=x',
  ])('SSRF guard: accepts the push service %s', (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true)
    expect(pushSubscribe.safeParse({ endpoint, keys: { p256dh: 'p', auth: 'a' } }).success).toBe(
      true,
    )
  })

  it.each([
    'http://web.push.apple.com/x',
    'https://web.push.apple.com.evil.example/x',
    'https://169.254.169.254/latest/meta-data',
    'https://localhost/x',
    'https://web.push.apple.com:8443/x',
    'https://push.invalid/x',
    'not a url',
  ])('SSRF guard: rejects %s', (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false)
    expect(pushSubscribe.safeParse({ endpoint, keys: { p256dh: 'p', auth: 'a' } }).success).toBe(
      false,
    )
  })

  it('push subscribe needs an endpoint and both keys', () => {
    const sub = { endpoint: 'https://web.push.apple.com/x', keys: { p256dh: 'p', auth: 'a' } }
    expect(pushSubscribe.safeParse(sub).success).toBe(true)
    expect(pushSubscribe.safeParse({ ...sub, keys: { p256dh: 'p' } }).success).toBe(false)
  })

  it('SPEC-NT-001: a Fire shell registers as a local device with a uuid and no push keys', () => {
    const deviceId = '8d0f3a7e-0c3e-4a58-9d2b-1d9a6a6a4f11'
    expect(pushSubscribeLocal.safeParse({ channel: 'local', deviceId }).success).toBe(true)
    expect(pushSubscribeLocal.safeParse({ channel: 'local', deviceId: 'not-a-uuid' }).success).toBe(
      false,
    )
    expect(pushSubscribeLocal.safeParse({ channel: 'web-push', deviceId }).success).toBe(false)
    // A web-push body is still the old shape and is not a local one.
    expect(pushSubscribe.safeParse({ channel: 'local', deviceId }).success).toBe(false)
  })
})

describe('7.0.13e: upper bounds on the old schemas', () => {
  const item = { name: 'Milk', categoryId: 1, unit: 'L', expirationDate: '2026-12-01' }

  it('accept ordinary amounts and prices (including 0)', () => {
    expect(inventoryItemCreate.safeParse({ ...item, quantity: 2.5, price: 0 }).success).toBe(true)
  })

  it.each([
    ['quantity', 1e12],
    ['price', 1e12],
    ['initialQuantity', 1e12],
    ['currentQuantity', 1e12],
    ['lowStockThreshold', 1e12],
  ])('refuse an absurd %s', (field, value) => {
    expect(inventoryItemCreate.safeParse({ ...item, quantity: 1, [field]: value }).success).toBe(
      false,
    )
  })

  it('refuse an absurd waste quantity and recipe servings', () => {
    expect(wasteCreate.safeParse({ itemName: 'Milk', quantity: 1e12, unit: 'L' }).success).toBe(
      false,
    )
    expect(recipeUpdate.safeParse({ servings: 1e6 }).success).toBe(false)
  })
})
