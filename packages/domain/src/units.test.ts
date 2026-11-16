import { describe, expect, it } from 'vitest'
import { UNITS, isUnit, normalizeUnit } from './units.js'

describe('units (F-IF-04, F-RS-05)', () => {
  it('lists the 14 units of the item form', () => {
    expect(UNITS).toEqual([
      'piece',
      'kg',
      'g',
      'lb',
      'oz',
      'L',
      'ml',
      'gallon',
      'cup',
      'box',
      'can',
      'bottle',
      'bag',
      'pack',
    ])
  })

  it('F-IF-04: accepts listed units only', () => {
    expect(isUnit('kg')).toBe(true)
    expect(isUnit('L')).toBe(true)
    expect(isUnit('bunch')).toBe(false)
  })

  it('F-RS-05: an AI unit in our list is kept; unknown units become piece', () => {
    expect(normalizeUnit('kg')).toBe('kg')
    expect(normalizeUnit('KG')).toBe('kg')
    expect(normalizeUnit('bunch')).toBe('piece')
    expect(normalizeUnit(undefined)).toBe('piece')
  })

  it('maps common spellings and the old app plurals onto the list', () => {
    expect(normalizeUnit('pieces')).toBe('piece')
    expect(normalizeUnit('lbs')).toBe('lb')
    expect(normalizeUnit('liters')).toBe('L')
    expect(normalizeUnit('l')).toBe('L')
    expect(normalizeUnit('gallons')).toBe('gallon')
    expect(normalizeUnit(' Bottles ')).toBe('bottle')
    expect(normalizeUnit('grams')).toBe('g')
    expect(normalizeUnit('kilograms')).toBe('kg')
    expect(normalizeUnit('ounces')).toBe('oz')
    expect(normalizeUnit('pounds')).toBe('lb')
  })

  it('AI text that names an Object property becomes piece', () => {
    expect(normalizeUnit('constructor')).toBe('piece')
    expect(normalizeUnit('__proto__')).toBe('piece')
  })
})
