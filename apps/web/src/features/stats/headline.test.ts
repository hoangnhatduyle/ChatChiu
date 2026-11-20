// F-ST-10: the plain-language headline above the stats.
import type { StatsOverview } from '@chatchiu/contracts'
import { statsHeadline } from './headline'

const overview = (
  stock: Partial<StatsOverview['stock']> = {},
  waste: Partial<StatsOverview['waste']> = {},
): StatsOverview =>
  ({
    stock: { totalItems: 71, totalValue: 289.56, expiringCount: 3, expiredCount: 7, ...stock },
    waste: { totalItems: 16, totalValue: 16.96, last30dCount: 4, last30dValue: 0, ...waste },
  }) as unknown as StatsOverview

describe('statsHeadline', () => {
  it('says how many things are past their date and how many more need using this week', () => {
    expect(statsHeadline(overview()).title).toBe(
      '7 things are past their date, 3 more need using this week.',
    )
  })

  it('uses the singular where there is one', () => {
    expect(statsHeadline(overview({ expiredCount: 1, expiringCount: 1 })).title).toBe(
      '1 thing is past its date, 1 more needs using this week.',
    )
  })

  it('leaves out the half that is zero', () => {
    expect(statsHeadline(overview({ expiringCount: 0 })).title).toBe(
      '7 things are past their date.',
    )
    expect(statsHeadline(overview({ expiredCount: 0 })).title).toBe(
      '3 things need using this week.',
    )
    expect(statsHeadline(overview({ expiredCount: 0, expiringCount: 1 })).title).toBe(
      '1 thing needs using this week.',
    )
  })

  it('is calm when nothing needs attention', () => {
    expect(statsHeadline(overview({ expiredCount: 0, expiringCount: 0 })).title).toBe(
      'Nothing is past its date and nothing needs using this week.',
    )
  })

  it('the detail gives the stock value and count, then the waste, truthfully', () => {
    expect(statsHeadline(overview()).detail).toBe(
      'You have $289.56 in the kitchen across 71 items. Over time you have thrown away 16 items ($16.96); 4 of them in the last 30 days.',
    )
  })

  it('adds the recent cost only when there was one, and says "Nice." for a clean month', () => {
    expect(statsHeadline(overview({}, { last30dCount: 2, last30dValue: 5 })).detail).toMatch(
      /2 of them in the last 30 days \(\$5\.00\)\.$/,
    )
    expect(statsHeadline(overview({}, { last30dCount: 0 })).detail).toMatch(
      /none in the last 30 days\. Nice\.$/,
    )
  })

  it('handles no waste at all and an empty kitchen', () => {
    expect(
      statsHeadline(overview({}, { totalItems: 0, totalValue: 0, last30dCount: 0 })).detail,
    ).toBe('You have $289.56 in the kitchen across 71 items. You have not thrown anything away.')
    expect(
      statsHeadline(overview({ totalItems: 0, totalValue: 0, expiredCount: 0, expiringCount: 0 }))
        .detail,
    ).toMatch(/^Your kitchen is empty\./)
  })

  it('writes one item as "1 item"', () => {
    expect(
      statsHeadline(overview({ totalItems: 1, totalValue: 2 }, { totalItems: 1, last30dCount: 1 }))
        .detail,
    ).toBe(
      'You have $2.00 in the kitchen across 1 item. Over time you have thrown away 1 item ($16.96); 1 of them in the last 30 days.',
    )
  })
})
