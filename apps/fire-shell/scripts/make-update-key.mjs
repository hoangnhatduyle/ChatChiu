// Makes the signing key pair for live updates (roadmap 5.9). Run once:
//   node apps/fire-shell/scripts/make-update-key.mjs
// - the PRIVATE key is written to .toolchain/live-update-signing-key.pem (git-ignored). It is a secret: keep a backup,
//   never commit it. To sign the bundles Vercel builds, add it to the Vercel project as LIVE_UPDATE_SIGNING_KEY.
// - the PUBLIC key is printed: pass it as FIRE_UPDATE_PUBLIC_KEY to build-apk.sh. It is not a secret.
import { generateKeyPairSync } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const target = join(root, '.toolchain', 'live-update-signing-key.pem')
if (existsSync(target)) {
  console.error(
    `${target} already exists: not overwritten (a new key would stop every installed app from updating).`,
  )
  process.exit(1)
}
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 })
console.log(`Private key written to ${target}`)
console.log('Public key (FIRE_UPDATE_PUBLIC_KEY):')
console.log(publicKey.export({ type: 'spki', format: 'der' }).toString('base64'))
