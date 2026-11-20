// The plain-language headline above the stats (F-ST-10): what needs attention now, then what the kitchen holds and
// what has been thrown away. Every figure is the API's (nothing is recomputed), and no sentence claims more than the
// numbers say: "Nice." only for a month with nothing thrown away.
import type { StatsOverview } from '@chatchiu/contracts'
import { money } from './format'

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

function attention(expired: number, soon: number): string {
  if (expired === 0 && soon === 0)
    return 'Nothing is past its date and nothing needs using this week.'
  const past =
    expired > 0
      ? `${expired} ${plural(expired, 'thing is past its date', 'things are past their date')}`
      : ''
  if (soon === 0) return `${past}.`
  if (expired === 0) return `${soon} ${plural(soon, 'thing needs', 'things need')} using this week.`
  return `${past}, ${soon} more ${plural(soon, 'needs', 'need')} using this week.`
}

function wasteSentence(waste: StatsOverview['waste']): string {
  if (waste.totalItems === 0) return 'You have not thrown anything away.'
  const total = `Over time you have thrown away ${waste.totalItems} ${plural(waste.totalItems, 'item', 'items')} (${money(waste.totalValue)})`
  if (waste.last30dCount === 0) return `${total}; none in the last 30 days. Nice.`
  const cost = waste.last30dValue > 0 ? ` (${money(waste.last30dValue)})` : ''
  return `${total}; ${waste.last30dCount} of them in the last 30 days${cost}.`
}

export function statsHeadline(overview: StatsOverview): { title: string; detail: string } {
  const { stock, waste } = overview
  const held =
    stock.totalItems === 0
      ? 'Your kitchen is empty.'
      : `You have ${money(stock.totalValue)} in the kitchen across ${stock.totalItems} ${plural(stock.totalItems, 'item', 'items')}.`
  return {
    title: attention(stock.expiredCount, stock.expiringCount),
    detail: `${held} ${wasteSentence(waste)}`,
  }
}
