// Live updates for the Fire shell (roadmap 5.9): every production build also writes
//   dist/live/<version>.zip   the whole web build, zipped (index.html at the root, as the updater expects)
//   dist/version.json         { version, url } for the shell to compare against what it runs
// The version is "<date>.<HHmm>-<commit>": later builds sort later (core/native/live-update.ts isNewer).
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { createHash, sign } from 'node:crypto'
import { join, relative, sep } from 'node:path'
import { zipSync } from 'fflate'

/**
 * @param {Record<string, string | undefined>} [env]
 * @param {Date} [now]
 * @returns {string}
 */
export function buildVersion(env = process.env, now = new Date()) {
  const iso = now.toISOString()
  const sha = (env.VERCEL_GIT_COMMIT_SHA || env.GITHUB_SHA || env.BUILD_COMMIT || 'local')
    .slice(0, 7)
    .toLowerCase()
  const clean = /^[0-9a-z]+$/.test(sha) ? sha : 'local'
  return `${iso.slice(0, 10)}.${iso.slice(11, 13)}${iso.slice(14, 16)}-${clean}`
}

/** @param {string} dir @returns {string[]} */
function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : [path]
  })
}

/** Zips `outDir` (minus live/ and version.json) and writes the version list next to it. */
/** What the signature covers; the shell builds the same text (core/native/live-update.ts signedText). */
const signedText = (/** @type {{version: string, url: string, sha256: string}} */ l) =>
  `${l.version}\n${l.url}\n${l.sha256}`

/**
 * A PEM as it arrives from a dashboard field: quotes around it, literal \n instead of line breaks, or every line
 * break turned into a space. The base64 body is taken out and wrapped again. Returns null when it is not a PEM.
 * @param {string} raw
 */
export function normalizePem(raw) {
  const text = raw
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\\n/g, '\n')
  const match = /-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/.exec(text)
  if (!match) return null
  const body = (match[2] ?? '').replace(/\s+/g, '')
  if (!body) return null
  const lines = body.match(/.{1,64}/g) ?? []
  return `-----BEGIN ${match[1]}-----\n${lines.join('\n')}\n-----END ${match[1]}-----\n`
}

/**
 * @param {string | undefined} privateKeyPem
 * @param {{ version: string, url: string, sha256: string }} listing
 * @returns {string | undefined}
 */
function signature(privateKeyPem, listing) {
  if (!privateKeyPem) return undefined
  const key = normalizePem(privateKeyPem)
  try {
    if (!key) throw new Error('it is not a PEM private key')
    return sign('sha256', Buffer.from(signedText(listing)), {
      key,
      dsaEncoding: 'ieee-p1363',
    }).toString('base64')
  } catch (error) {
    // A bad key must not stop every deploy of the website: the list goes out unsigned, which no shell accepts.
    console.warn(
      `Live update: LIVE_UPDATE_SIGNING_KEY could not be used (${error instanceof Error ? error.message : error}). ` +
        'The version list is published UNSIGNED, so tablets will not update until the key is fixed.',
    )
    return undefined
  }
}

/**
 * @param {string} outDir
 * @param {string} version
 * @param {string} [privateKeyPem] ECDSA P-256 key (PEM): when given, version.json is signed. A build without a key
 *   writes an unsigned list, which no shell accepts.
 */
export function writeLiveUpdate(outDir, version, privateKeyPem) {
  /** @type {Record<string, Uint8Array>} */
  const entries = {}
  for (const path of files(outDir)) {
    const name = relative(outDir, path).split(sep).join('/')
    if (name === 'version.json' || name.startsWith('live/')) continue
    entries[name] = new Uint8Array(readFileSync(path))
  }
  if (Object.keys(entries).length === 0)
    throw new Error(`Live update: ${outDir} has nothing to zip.`)
  mkdirSync(join(outDir, 'live'), { recursive: true })
  const zip = zipSync(entries, { level: 6 })
  writeFileSync(join(outDir, 'live', `${version}.zip`), zip)
  const listing = {
    version,
    url: `/live/${version}.zip`,
    sha256: createHash('sha256').update(zip).digest('hex'),
  }
  const sig = signature(privateKeyPem, listing)
  writeFileSync(
    join(outDir, 'version.json'),
    JSON.stringify({ ...listing, ...(sig ? { sig } : {}) }) + '\n',
  )
}

/** @param {string} version */
export function liveUpdatePlugin(version) {
  let outDir = 'dist'
  return {
    name: 'chatchiu-live-update',
    apply: 'build',
    /** @param {{ build: { outDir: string } }} config */
    configResolved(config) {
      outDir = config.build.outDir
    },
    closeBundle() {
      // The signing key is a secret kept outside the repository (apps/fire-shell/README.md); without it the list is unsigned.
      writeLiveUpdate(outDir, version, process.env.LIVE_UPDATE_SIGNING_KEY)
    },
  }
}
