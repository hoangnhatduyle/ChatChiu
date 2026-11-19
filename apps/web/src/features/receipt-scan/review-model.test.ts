// SPEC-RS-001: what review opens with (F-RS-04/05/06) and what is added (F-RS-08/09).
import { describe, expect, it } from 'vitest'
import {
  addProblems,
  buildReviewItems,
  matchCategory,
  toBulkItems,
  type ReviewContext,
} from './review-model'

const categories = [
  { id: 11, name: 'Dairy' },
  { id: 12, name: 'Pantry' },
]
const ctx = (over: Partial<ReviewContext> = {}): ReviewContext => ({
  purchaseDate: '2026-11-10',
  categories,
  defaultLocationId: 7,
  ...over,
})

describe('buildReviewItems', () => {
  it('F-RS-04: every item gets the receipt date as its purchase date', () => {
    const items = buildReviewItems([{ name: 'A' }, { name: 'B' }], ctx())
    expect(items.map((i) => i.purchaseDate)).toEqual(['2026-11-10', '2026-11-10'])
  })

  it('F-RS-05: the AI unit and shelf-life hint win; with no hint the category default applies and an unknown unit is piece', () => {
    const [rice, yogurt] = buildReviewItems(
      [
        { name: 'Rice', unit: 'kg', shelfLifeDaysHint: 10, categoryHint: 'Pantry' },
        { name: 'Yogurt', unit: 'bunch', categoryHint: 'Dairy' },
      ],
      ctx(),
    )
    expect(rice).toMatchObject({ unit: 'kg', expirationDate: '2026-11-20', categoryId: 12 })
    expect(yogurt).toMatchObject({ unit: 'piece', expirationDate: '2026-11-24', categoryId: 11 })
  })

  it('F-RS-05: a hint that matches none of her categories picks no category and uses no category default', () => {
    const [item] = buildReviewItems([{ name: 'Odd', categoryHint: 'frozen' }], ctx())
    expect(item?.categoryId).toBeNull()
    expect(item?.expirationDate).toBe('2026-12-10')
  })

  it('F-RS-06 / NC-RS-NO-HARDCODED-LOCATION: the default location is the one given, and none when there is none', () => {
    expect(buildReviewItems([{ name: 'A' }], ctx())[0]?.locationId).toBe(7)
    const none = buildReviewItems([{ name: 'A' }], ctx({ defaultLocationId: null }))
    expect(none[0]?.locationId).toBeNull()
    expect(none[0]?.categoryId).toBeNull()
  })

  it('keeps the quantity (default 1) and the line price as the total', () => {
    const [a, b] = buildReviewItems([{ name: 'A', quantity: 3, price: 6 }, { name: 'B' }], ctx())
    expect(a).toMatchObject({ quantity: 3, totalPrice: 6, included: true, notify: true })
    expect(b).toMatchObject({ quantity: 1, totalPrice: null })
  })
})

describe('addProblems', () => {
  const ok = () => buildReviewItems([{ name: 'Rice', categoryHint: 'Pantry' }], ctx())
  it('is empty when every included item is complete', () => expect(addProblems(ok())).toEqual([]))
  it('F-RS-06: an included item with no location blocks adding; a skipped one does not', () => {
    const [item] = buildReviewItems(
      [{ name: 'Rice', categoryHint: 'Pantry' }],
      ctx({ defaultLocationId: null }),
    )
    expect(addProblems([item!])).toContain('Choose a location for every item you are adding.')
    expect(addProblems([{ ...item!, included: false }])).toEqual([
      'Select at least one item to add.',
    ])
  })
  it('blocks a date that is not a four-digit-year calendar date', () => {
    const [item] = ok()
    expect(addProblems([{ ...item!, expirationDate: '+032004-11-10' }])).toContain(
      'Check the dates: one is not valid.',
    )
  })
  it('blocks a missing category, an empty name, a zero quantity and an expiry before the purchase date', () => {
    const [item] = ok()
    expect(addProblems([{ ...item!, categoryId: null }])).toContain(
      'Choose a category for every item you are adding.',
    )
    expect(addProblems([{ ...item!, name: ' ' }])).toContain('Every item needs a name.')
    expect(addProblems([{ ...item!, quantity: 0 }])).toContain(
      'Every quantity must be more than zero.',
    )
    expect(addProblems([{ ...item!, expirationDate: '2026-11-01' }])).toContain(
      'An expiry date is before its purchase date.',
    )
  })
})

describe('toBulkItems', () => {
  it('F-RS-08 / CS-PER-UNIT-PRICE: the total price is stored per unit, and only included items are sent', () => {
    const items = buildReviewItems(
      [
        { name: 'Yogurt', quantity: 2, price: 3, categoryHint: 'Dairy' },
        { name: 'Skip me', categoryHint: 'Dairy' },
      ],
      ctx(),
    )
    const body = toBulkItems([items[0]!, { ...items[1]!, included: false }])
    expect(body).toHaveLength(1)
    expect(body[0]).toMatchObject({
      name: 'Yogurt',
      quantity: 2,
      price: 1.5,
      categoryId: 11,
      locationId: 7,
      purchaseDate: '2026-11-10',
      initialQuantity: 2,
      currentQuantity: 2,
    })
  })
})

describe('matchCategory (7.0.33e: a hint may name her category loosely)', () => {
  const mine = [
    { id: 1, name: 'Dairy & Eggs' },
    { id: 2, name: 'Frozen Veg' },
    { id: 3, name: 'Frozen Meat' },
    { id: 4, name: 'Pantry' },
  ]

  it('matches exactly, ignoring case and spaces', () => {
    expect(matchCategory(' PANTRY ', mine)?.id).toBe(4)
  })

  it('matches a hint that is a whole word of her category name', () => {
    expect(matchCategory('dairy', mine)?.id).toBe(1)
    expect(matchCategory('Eggs', mine)?.id).toBe(1)
  })

  it('matches a longer hint that contains her category name', () => {
    expect(matchCategory('pantry staples', mine)?.id).toBe(4)
  })

  it('prefers an exact name over a loose one', () => {
    const both = [
      { id: 1, name: 'Dairy' },
      { id: 2, name: 'Dairy & Eggs' },
    ]
    expect(matchCategory('dairy', both)?.id).toBe(1)
  })

  it('picks nothing when two of her categories fit equally well, or none does', () => {
    expect(matchCategory('frozen', mine)).toBeUndefined()
    expect(matchCategory('bakery', mine)).toBeUndefined()
    expect(matchCategory('', mine)).toBeUndefined()
  })

  it('does not match part of a word ("pan" is not "pantry")', () => {
    expect(matchCategory('pan', mine)).toBeUndefined()
  })

  it('feeds the review: "dairy" fills "Dairy & Eggs" and its shelf-life default', () => {
    const [item] = buildReviewItems([{ name: 'Milk', categoryHint: 'dairy' }], {
      purchaseDate: '2026-11-10',
      categories: mine,
      defaultLocationId: null,
    })
    expect(item?.categoryId).toBe(1)
    expect(item?.expirationDate).toBe('2026-11-24')
  })
})
