// 7.0.32d: the last theme is applied before React starts.
import { beforeEach, vi } from 'vitest'
import { applyRememberedTheme, rememberTheme } from './theme-memory'

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('theme memory', () => {
  it('applies nothing when no theme was remembered', () => {
    expect(applyRememberedTheme()).toBeNull()
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('puts the remembered dark theme on <html> at once', () => {
    rememberTheme('dark')
    expect(applyRememberedTheme()).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('ignores a value it does not know and survives blocked storage', () => {
    window.localStorage.setItem('chatchiu.theme', 'purple')
    expect(applyRememberedTheme()).toBeNull()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(applyRememberedTheme()).toBeNull()
    vi.restoreAllMocks()
  })
})
