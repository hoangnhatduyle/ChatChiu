// The chosen theme (SPEC-SE-001 F-SE-06): System follows the device, Light and Dark override it. It is
// applied on <html data-theme> (tokens.css) and to the browser-bar colour (roadmap 7.0.16), from the
// shell, so it holds on every page and not only in Settings.
import { useEffect } from 'react'
import { usePreferencesQuery } from './preferences'
import { applyTheme } from '../shell/apply-theme'
import { rememberTheme } from '../shell/theme-memory'

/** Keeps the document in step with her saved theme. A choice shows at once: the preferences write is optimistic. */
export function ThemeSync() {
  const theme = usePreferencesQuery().data?.theme
  useEffect(() => {
    if (!theme) return
    applyTheme(theme)
    rememberTheme(theme)
  }, [theme])
  return null
}
