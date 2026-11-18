// Live updates for the Fire shell (architecture.md §6.2, roadmap 5.9): the APK bundles one build of the web app.
// On launch it fetches /version.json from the live site and, when a newer bundle is listed, downloads it and
// switches to it, so a web change reaches the tablet without reinstalling the APK (only native changes need one).
// Built on @capgo/capacitor-updater in its manual mode; this file is pure over an `Updater` interface.
//
// A bundle is code that runs with her login, so it is never taken on the site's word alone: version.json carries the
// zip's sha256 and a signature (ECDSA P-256) made at build time with a private key that is not in this repository.
// The app checks the signature with the public key it was built with, and the updater checks the download against
// the sha256. No key in the build means no updates (nothing is downloaded).
export interface Updater {
  current(): Promise<{ bundle: { version: string } }>
  download(options: { url: string; version: string; checksum?: string }): Promise<{
    id: string
    version: string
  }>
  set(options: { id: string; version?: string }): Promise<void>
  notifyAppReady(): Promise<unknown>
}

export type UpdateResult =
  | { status: 'current' }
  | { status: 'updated'; version: string }
  | { status: 'failed'; message: string }

const VERSION_PATTERN = /^(\d{4}-\d{2}-\d{2})\.(\d+)-([0-9a-z]+)$/i
const DAY_MS = 86_400_000
const SHA256_PATTERN = /^[0-9a-f]{64}$/
/** How long the update list may take. */
const LIST_TIMEOUT_MS = 15_000

/** "2026-11-19.1-abc": a build date, a number that day, a commit. Newer = later date, then higher number. */
export function isNewer(candidate: string, current: string): boolean {
  const a = VERSION_PATTERN.exec(candidate)
  const b = VERSION_PATTERN.exec(current)
  if (!a || !b) return false
  if (a[1] !== b[1]) return a[1]! > b[1]!
  return Number(a[2]) > Number(b[2])
}

export type Listing = { version: string; url: string; sha256: string; sig: string }

/** What the signature covers: the version, where the zip is and what it must hash to. */
export const signedText = (l: Pick<Listing, 'version' | 'url' | 'sha256'>): string =>
  `${l.version}\n${l.url}\n${l.sha256}`

const fromBase64 = (text: string): Uint8Array<ArrayBuffer> => {
  const raw = atob(text)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/** True when `sig` (base64, IEEE P1363) is the listing's signature by the key `publicKey` (base64 SPKI). */
export async function verifyListing(
  listing: Listing,
  publicKey: string,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<boolean> {
  try {
    const key = await subtle.importKey(
      'spki',
      fromBase64(publicKey),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )
    return await subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      fromBase64(listing.sig),
      new TextEncoder().encode(signedText(listing)),
    )
  } catch {
    return false
  }
}

const failed = (message: string): UpdateResult => ({ status: 'failed', message })

export type CheckOptions = {
  fetchImpl?: typeof fetch
  /** The version the APK was built with: the updater calls its own bundle "builtin". */
  builtinVersion?: string
  /** The public key (base64 SPKI) this build trusts; without one no update is taken. */
  publicKey?: string
  now?: Date
  subtle?: SubtleCrypto
}

export async function checkForUpdate(
  updater: Updater,
  origin: string,
  options: CheckOptions = {},
): Promise<UpdateResult> {
  const { fetchImpl = fetch, builtinVersion = '', publicKey = '', now = new Date() } = options
  try {
    if (!publicKey)
      return failed('This app was built without an update key, so it takes no updates.')
    const response = await fetchImpl(`${origin}/version.json`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
    })
    if (!response.ok) return failed(`The update list answered ${response.status}.`)
    const listed: unknown = await response.json()
    const { version, url, sha256, sig } = (listed ?? {}) as Record<string, unknown>
    if (
      typeof version !== 'string' ||
      typeof url !== 'string' ||
      typeof sha256 !== 'string' ||
      typeof sig !== 'string' ||
      !VERSION_PATTERN.test(version) ||
      !SHA256_PATTERN.test(sha256)
    ) {
      return failed('The update list is not in the expected form (or is not signed).')
    }
    const listing: Listing = { version, url, sha256, sig }
    if (!(await verifyListing(listing, publicKey, options.subtle))) {
      return failed("The update list is not signed by this app's key, so it was not used.")
    }
    const bundleUrl = new URL(url, origin)
    // Only a bundle from the app's own site: a version.json cannot point the app at another origin.
    if (bundleUrl.origin !== new URL(origin).origin) {
      return failed("The update is not from the app's own site.")
    }
    // A date far ahead would make every real build look older (pinning the tablet to one bundle).
    const builtOn = Date.parse(`${version.slice(0, 10)}T00:00:00Z`)
    if (builtOn > now.getTime() + DAY_MS)
      return failed('The update is dated in the future, so it was not used.')

    const { bundle } = await updater.current()
    const running = bundle.version === 'builtin' ? builtinVersion : bundle.version
    // A running version that cannot be compared (a build made without one) never re-downloads on every launch.
    if (!VERSION_PATTERN.test(running) || !isNewer(version, running)) return { status: 'current' }
    const downloaded = await updater.download({ url: bundleUrl.href, version, checksum: sha256 })
    await updater.set({ id: downloaded.id, version: downloaded.version })
    return { status: 'updated', version }
  } catch (error) {
    return failed(error instanceof Error ? error.message : 'The update could not be checked.')
  }
}
