// @vitest-environment node
// Step 3.4: the web app manifest, icons and theme colours (SPEC-AP-001 F-AP-01, F-AP-05; roadmap 3.4).
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseThemes } from './check-contrast.mjs'

const web = join(dirname(fileURLToPath(import.meta.url)), '..')
const pub = join(web, 'public')
/** @typedef {{ src: string, sizes: string, type: string, purpose?: string }} Icon */
/** @type {{ [k: string]: unknown, icons: Icon[], theme_color: string, background_color: string, name: string, short_name: string }} */
const manifest = JSON.parse(readFileSync(join(pub, 'manifest.webmanifest'), 'utf8'))
const html = readFileSync(join(web, 'index.html'), 'utf8')
const themes = parseThemes(readFileSync(join(web, 'src/styles/tokens.css'), 'utf8'))

/** Width and height from a PNG's IHDR chunk. @param {string} file */
function pngSize(file) {
  const buf = readFileSync(file)
  expect(buf.subarray(1, 4).toString('latin1')).toBe('PNG')
  return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`
}

describe('manifest.webmanifest', () => {
  it('F-AP-05: names the app "Chắt Chiu" and opens standalone at /', () => {
    expect(manifest.short_name).toBe('Chắt Chiu')
    expect(manifest.name).toMatch(/^Chắt Chiu/)
    expect(manifest).toMatchObject({ id: '/', start_url: '/', scope: '/', display: 'standalone' })
  })

  it('F-AP-01: theme_color is the teal accent token, not the old #1976d2', () => {
    expect(manifest.theme_color.toLowerCase()).toBe(themes.light.accent?.toLowerCase())
    expect(manifest.theme_color.toLowerCase()).not.toBe('#1976d2')
  })

  it('F-AP-01: the splash background is the page background token', () => {
    expect(manifest.background_color.toLowerCase()).toBe(themes.light.bg?.toLowerCase())
  })

  it('F-AP-01: has 192 and 512 px icons, plain and maskable, as installability needs', () => {
    /** @type {(size: string, purpose: string) => boolean} */
    const has = (size, purpose) =>
      manifest.icons.some((i) => i.sizes === size && (i.purpose ?? 'any') === purpose)
    for (const size of ['192x192', '512x512']) {
      expect(has(size, 'any')).toBe(true)
      expect(has(size, 'maskable')).toBe(true)
    }
  })

  it('F-AP-01: every icon file exists and is the size the manifest says', () => {
    for (const icon of manifest.icons) {
      const file = join(pub, icon.src.replace(/^\//, ''))
      expect(existsSync(file), icon.src).toBe(true)
      expect(pngSize(file), icon.src).toBe(icon.sizes)
    }
  })
})

describe('index.html', () => {
  it('F-AP-01: the theme-color meta tags follow the light and dark page tokens', () => {
    const meta = [...html.matchAll(/<meta\s+name="theme-color"([^>]*)>/g)].map((m) => m[1] ?? '')
    const light = meta.find((m) => /prefers-color-scheme: light/.test(m))
    const dark = meta.find((m) => /prefers-color-scheme: dark/.test(m))
    expect(light).toMatch(new RegExp(`content="${themes.light.accent}"`, 'i'))
    expect(dark).toMatch(new RegExp(`content="${themes.dark.bg}"`, 'i'))
  })

  it('F-AP-01: links the manifest, the favicon and the apple-touch-icon, and they exist', () => {
    expect(html).toMatch(/<link rel="manifest" href="\/manifest\.webmanifest"/)
    for (const href of [
      ...html.matchAll(/<link rel="(?:icon|apple-touch-icon)"[^>]*href="\/([^"]+)"/g),
    ].map((m) => m[1] ?? '')) {
      expect(existsSync(join(pub, href)), href).toBe(true)
    }
    expect(pngSize(join(pub, 'apple-touch-icon.png'))).toBe('180x180')
  })
})

describe('brand assets (roadmap 3.4)', () => {
  it('F-AP-05: the original chef-pig artwork is kept in public/', () => {
    expect(existsSync(join(pub, 'chac-chiu-icon.png'))).toBe(true)
  })

  it('F-AP-05: the rail logo uses a small icon, not the 1.5 MB artwork', () => {
    const brand = readFileSync(join(web, 'src/ui/brand.ts'), 'utf8')
    const src = brand.match(/BRAND_ICON_SMALL = '\/([^']+)'/)?.[1]
    expect(src).toBe('icons/icon-96x96.png')
    expect(existsSync(join(pub, src ?? ''))).toBe(true)
  })
})
