// SPEC-SE-001 F-SE-06 and roadmap 7.0.16: the chosen theme reaches the document and the browser bar.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyTheme } from './apply-theme'

beforeEach(() => {
  document.head.innerHTML =
    '<meta name="theme-color" data-scheme="light" media="(prefers-color-scheme: light)" content="#0b6e75">' +
    '<meta name="theme-color" data-scheme="dark" media="(prefers-color-scheme: dark)" content="#17130e">'
})
afterEach(() => document.documentElement.removeAttribute('data-theme'))

const bar = () =>
  [...document.querySelectorAll('meta[name="theme-color"]')].filter(
    (m) => m.getAttribute('media') !== 'not all',
  )

describe('applyTheme', () => {
  it('F-SE-06: Dark and Light set data-theme at once', () => {
    applyTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    applyTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })
  it('F-SE-06: System removes data-theme so the device decides', () => {
    applyTheme('dark')
    applyTheme('system')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })
  it('7.0.16: Dark on a light device leaves only the dark browser-bar colour; System restores both', () => {
    applyTheme('dark')
    expect(bar().map((m) => m.getAttribute('content'))).toEqual(['#17130e'])
    applyTheme('system')
    expect(bar()).toHaveLength(2)
    expect(bar()[0]!.getAttribute('media')).toBe('(prefers-color-scheme: light)')
  })
})
