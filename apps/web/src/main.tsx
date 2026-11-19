import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyRememberedTheme } from './shell/theme-memory'

// Before the first paint: a Dark user must not see one light frame (7.0.32d).
applyRememberedTheme()

// Dev-only spike page (roadmap 0.6). The flag is replaced at build time, so production builds
// without VITE_ENABLE_DIAGNOSTICS=true drop this import entirely. App routes everything else (step 3.3);
// this gate is removed by roadmap 7.0.3.
const DiagnosticsPage =
  import.meta.env.VITE_ENABLE_DIAGNOSTICS === 'true'
    ? lazy(() => import('./features/diagnostics/DiagnosticsPage.tsx'))
    : null

const showDiagnostics = DiagnosticsPage !== null && window.location.pathname === '/diagnostics'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {showDiagnostics && DiagnosticsPage ? (
      <Suspense fallback={null}>
        <DiagnosticsPage />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
