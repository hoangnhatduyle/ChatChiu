// Applies the chosen theme to <html data-theme> and the browser-bar colour (F-SE-06, 7.0.16).
import type { Theme } from '@chatchiu/contracts'

type Scheme = 'light' | 'dark'

/** Sets the document theme and leaves exactly the matching browser-bar colour (or both, for System). */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.dataset.theme = theme
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const scheme = meta.dataset.scheme as Scheme | undefined
    if (!scheme) continue
    meta.setAttribute(
      'media',
      theme === 'system'
        ? `(prefers-color-scheme: ${scheme})`
        : scheme === theme
          ? 'all'
          : 'not all',
    )
  }
}
