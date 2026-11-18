/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_DIAGNOSTICS?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_API_BASE_URL?: string
  /** The live site a Fire shell fetches web updates from (apps/fire-shell/README.md). */
  readonly VITE_LIVE_SITE_URL?: string
  /** This build's version (scripts/live-update-plugin.mjs): what the Fire shell was built with. */
  readonly VITE_APP_VERSION?: string
  /** Public key (base64 SPKI, ECDSA P-256) the Fire shell checks live-update signatures with. */
  readonly VITE_LIVE_UPDATE_PUBLIC_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
