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
  const sig = privateKeyPem
    ? sign('sha256', Buffer.from(signedText(listing)), {
        key: privateKeyPem.replace(/\\n/g, '\n'),
        dsaEncoding: 'ieee-p1363',
      }).toString('base64')
    : undefined
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
