// Dev-only entry for ui-gallery.html. `?theme=dark|light` forces a theme the way the Settings
// override will ([data-theme]); without it the device setting applies.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import { Gallery } from './Gallery'

const theme = new URLSearchParams(window.location.search).get('theme')
if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme

const root = document.getElementById('root')
if (!root) throw new Error('#root missing in ui-gallery.html')

createRoot(root).render(
  <StrictMode>
    <Gallery />
  </StrictMode>,
)
