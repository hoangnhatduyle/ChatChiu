// The last theme she chose, kept on this device so the first frame already has it (7.0.32d): preferences come
// from the network, and a Dark user would otherwise see one light frame on a cold start. Called from main.tsx
// before React renders (the page's CSP does not allow an inline script in index.html).
import type { Theme } from '@chatchiu/contracts'
import { applyTheme } from './apply-theme'

const KEY = 'chatchiu.theme'
const THEMES: ReadonlyArray<Theme> = ['system', 'light', 'dark']

export function rememberTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(KEY, theme)
  } catch {
    // Storage is blocked: the theme just applies a moment later, as before.
  }
}

/** Applies the remembered theme now. Returns it, or null when there is none. */
export function applyRememberedTheme(): Theme | null {
  try {
    const saved = window.localStorage.getItem(KEY)
    const theme = THEMES.find((t) => t === saved)
    if (!theme) return null
    applyTheme(theme)
    return theme
  } catch {
    return null
  }
}
