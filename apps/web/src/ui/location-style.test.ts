// UI refresh foundation: the icon and tint a location shows, chosen or guessed from its name.
import * as contracts from '@chatchiu/contracts'
import {
  guessLocationStyle,
  LOCATION_COLORS,
  LOCATION_ICONS,
  locationStyle,
} from './location-style'

describe('location lists', () => {
  it('are the same as the contracts lists the API validates with', () => {
    expect([...LOCATION_ICONS]).toEqual([...contracts.LOCATION_ICONS])
    expect([...LOCATION_COLORS]).toEqual([...contracts.LOCATION_COLORS])
  })
})

describe('locationStyle', () => {
  it.each([
    ['Freezer', 'snow', 'ice'],
    ['Chest freezer', 'snow', 'ice'],
    ['Fridge - Top shelf', 'fridge', 'mint'],
    ['Refrigerator', 'fridge', 'mint'],
    ['Counter', 'counter', 'sand'],
    ['Refills', 'refill', 'teal'],
    ['Snacks & Drinks', 'cookie', 'rose'],
    ['Spices', 'spice', 'saffron'],
    ['Pantry', 'shelf', 'clay'],
    ['Open Shelf', 'shelf', 'sand'],
    ['Garage', 'pin', 'sand'],
  ] as const)('guesses %s as %s / %s', (name, icon, color) => {
    expect(guessLocationStyle(name)).toEqual({ icon, color })
    expect(locationStyle({ name })).toEqual({ icon, color })
  })

  it('uses what she chose over the guess', () => {
    expect(locationStyle({ name: 'Freezer', icon: 'bowl', color: 'lilac' })).toEqual({
      icon: 'bowl',
      color: 'lilac',
    })
  })

  it('falls back per field when a stored value is null, unknown or missing', () => {
    expect(locationStyle({ name: 'Freezer', icon: null, color: 'lilac' })).toEqual({
      icon: 'snow',
      color: 'lilac',
    })
    expect(locationStyle({ name: 'Freezer', icon: 'rocket', color: '#fff' })).toEqual({
      icon: 'snow',
      color: 'ice',
    })
  })
})
