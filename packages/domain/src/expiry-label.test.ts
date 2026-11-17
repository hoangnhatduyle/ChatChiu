import { describe, expect, it } from 'vitest'
import { EXPIRY_CHIPS } from './expiry.js'
import {
  EXPIRY_CHIP_DAYS_MAX,
  expiryChipLabel,
  expiryDescription,
  expiryOffsetPhrase,
} from './expiry-label.js'

describe('expiry chip label', () => {
  it('F-KB-03: expired, today, 2 days and 3 months read Expired, Today, 2d and 3 mo', () => {
    expect(expiryChipLabel(-1)).toBe('Expired')
    expect(expiryChipLabel(-30)).toBe('Expired')
    expect(expiryChipLabel(0)).toBe('Today')
    expect(expiryChipLabel(2)).toBe('2d')
    expect(expiryChipLabel(90)).toBe('3 mo')
  })

  it('counts days up to 45 and switches to months after (prototype)', () => {
    expect(EXPIRY_CHIP_DAYS_MAX).toBe(45)
    expect(expiryChipLabel(45)).toBe('45d')
    expect(expiryChipLabel(46)).toBe('2 mo')
    expect(expiryChipLabel(365)).toBe('12 mo')
  })
})

describe('expiry description (screen readers, panel subtitle)', () => {
  it('F-KB-03: spells the status out in words', () => {
    expect(expiryDescription(-1)).toBe('Expired 1 day ago')
    expect(expiryDescription(-3)).toBe('Expired 3 days ago')
    expect(expiryDescription(0)).toBe('Expires today')
    expect(expiryDescription(1)).toBe('Expires in 1 day')
    expect(expiryDescription(12)).toBe('Expires in 12 days')
  })
})

describe('expiry offset in words (quick-chip names for screen readers)', () => {
  it('F-IF-06: names every quick chip in words, not "1 m"', () => {
    expect(EXPIRY_CHIPS.map((c) => expiryOffsetPhrase(c.amount, c.unit))).toEqual([
      'In 3 days',
      'In 1 week',
      'In 2 weeks',
      'In 1 month',
      'In 3 months',
      'In 6 months',
      'In 1 year',
    ])
  })
})
