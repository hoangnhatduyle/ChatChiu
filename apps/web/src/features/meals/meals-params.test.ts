import { mealsSearch, parseMealsParams } from './meals-params'

const today = '2026-11-18'
const parse = (query: string) => parseMealsParams(new URLSearchParams(query), today)

describe('meals URL state', () => {
  it('defaults to the week of today', () => {
    expect(parse('')).toEqual({ tab: 'week', date: today })
  })
  it('keeps a valid tab and date', () => {
    expect(parse('tab=recipes&date=2030-01-09')).toEqual({ tab: 'recipes', date: '2030-01-09' })
  })
  it('falls back for an unknown tab, an impossible date or a year no calendar shows', () => {
    expect(parse('tab=__proto__')).toEqual({ tab: 'week', date: today })
    expect(parse('date=2026-02-31').date).toBe(today)
    expect(parse('date=0050-03-15').date).toBe(today)
    expect(parse('date=9999-12-31').date).toBe(today)
  })
  it('leaves the default tab and today out of the URL', () => {
    expect(mealsSearch('week', today, today)).toBe('')
    expect(mealsSearch('month', '2030-01-09', today)).toBe('?tab=month&date=2030-01-09')
  })
})
