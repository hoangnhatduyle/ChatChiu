// @vitest-environment node
// SPEC-NT-001 / roadmap 5.9: the Fire app bundles the web build and, on launch, fetches /version.json from the live
// site and downloads a newer web bundle. The bundle is code that runs with her login, so the list must be signed.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  checkForUpdate,
  isNewer,
  signedText,
  verifyListing,
  type Listing,
  type Updater,
} from './live-update'

const SHA = 'a'.repeat(64)
const ORIGIN = 'https://chatchiu-zeta.vercel.app'
const NOW = new Date('2026-11-19T12:00:00Z')
let publicKey = ''
let privateKey: CryptoKey

const toBase64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])
  privateKey = pair.privateKey
  publicKey = toBase64(await crypto.subtle.exportKey('spki', pair.publicKey))
})

async function listing(over: Partial<Listing> = {}, signWith?: CryptoKey): Promise<Listing> {
  const base = {
    version: '2026-11-19.1000-def',
    url: '/live/2026-11-19.1000-def.zip',
    sha256: SHA,
    ...over,
  }
  const sig = toBase64(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      signWith ?? privateKey,
      new TextEncoder().encode(signedText(base)),
    ),
  )
  return { ...base, sig: over.sig ?? sig }
}
const respond = (body: unknown, ok = true) =>
  vi.fn(async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  })) as unknown as typeof fetch
const updater = (current: string) =>
  ({
    current: vi.fn(async () => ({ bundle: { version: current } })),
    download: vi.fn(async ({ version }: { version: string }) => ({ id: `b-${version}`, version })),
    set: vi.fn(async () => undefined),
    notifyAppReady: vi.fn(async () => undefined),
  }) satisfies Updater
const check = (u: Updater, body: unknown, extra: Record<string, unknown> = {}, ok = true) =>
  checkForUpdate(u, ORIGIN, { fetchImpl: respond(body, ok), publicKey, now: NOW, ...extra })

describe('isNewer', () => {
  it('compares build versions (a date then a number), never lexically by accident', () => {
    expect(isNewer('2026-11-19.1-abc', '2026-11-18.9-zzz')).toBe(true)
    expect(isNewer('2026-11-18.1-abc', '2026-11-18.1-abc')).toBe(false)
    expect(isNewer('2026-11-17.5-abc', '2026-11-18.1-abc')).toBe(false)
  })
})

describe('verifyListing', () => {
  it('accepts a listing signed by the key and refuses a changed one, another key, or junk', async () => {
    const good = await listing()
    expect(await verifyListing(good, publicKey)).toBe(true)
    expect(await verifyListing({ ...good, sha256: 'b'.repeat(64) }, publicKey)).toBe(false)
    const other = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])
    expect(await verifyListing(await listing({}, other.privateKey), publicKey)).toBe(false)
    expect(await verifyListing({ ...good, sig: 'not base64 !!' }, publicKey)).toBe(false)
    expect(await verifyListing(good, 'not a key')).toBe(false)
  })
})

describe('checkForUpdate', () => {
  it('downloads (with the listed sha256 as its checksum) and applies a newer, signed bundle', async () => {
    const u = updater('2026-11-18.1000-abc')
    expect(await check(u, await listing())).toEqual({
      status: 'updated',
      version: '2026-11-19.1000-def',
    })
    expect(u.download).toHaveBeenCalledWith({
      url: `${ORIGIN}/live/2026-11-19.1000-def.zip`,
      version: '2026-11-19.1000-def',
      checksum: SHA,
    })
    expect(u.set).toHaveBeenCalledWith({
      id: 'b-2026-11-19.1000-def',
      version: '2026-11-19.1000-def',
    })
  })
  it('does nothing when the bundle is already the newest', async () => {
    const u = updater('2026-11-19.1000-def')
    expect(await check(u, await listing())).toEqual({ status: 'current' })
    expect(u.download).not.toHaveBeenCalled()
  })
  it('compares against the version the APK was built with, not the word "builtin"', async () => {
    const newer = updater('builtin')
    expect(
      await check(newer, await listing(), { builtinVersion: '2026-11-18.1000-abc' }),
    ).toMatchObject({ status: 'updated' })
    const same = updater('builtin')
    expect(await check(same, await listing(), { builtinVersion: '2026-11-19.1000-def' })).toEqual({
      status: 'current',
    })
  })
  it('a running version that cannot be compared never re-downloads on every launch', async () => {
    const u = updater('builtin')
    expect(await check(u, await listing(), { builtinVersion: '' })).toEqual({ status: 'current' })
    expect(u.download).not.toHaveBeenCalled()
  })
  it('SECURITY: no key in the build, no signature, a wrong signature or a changed hash means nothing is downloaded', async () => {
    const u = updater('2026-11-18.1000-abc')
    expect(await check(u, await listing(), { publicKey: '' })).toMatchObject({
      status: 'failed',
      message: expect.stringContaining('update key'),
    })
    const { sig: _unused, ...unsigned } = await listing()
    void _unused
    expect(await check(u, unsigned)).toMatchObject({
      status: 'failed',
      message: expect.stringContaining('signed'),
    })
    const tampered = { ...(await listing()), sha256: 'c'.repeat(64) }
    expect(await check(u, tampered)).toMatchObject({ status: 'failed' })
    expect(u.download).not.toHaveBeenCalled()
  })
  it('SECURITY: a bundle url on another origin is refused even when the listing is signed', async () => {
    const u = updater('2026-11-18.1000-abc')
    const result = await check(u, await listing({ url: 'https://evil.example/a.zip' }))
    expect(result).toMatchObject({ status: 'failed' })
    expect(u.download).not.toHaveBeenCalled()
  })
  it('SECURITY: a version dated far in the future is refused (it would pin the tablet to one bundle)', async () => {
    const u = updater('2026-11-18.1000-abc')
    const result = await check(
      u,
      await listing({ version: '2099-01-01.0000-def', url: '/live/x.zip' }),
    )
    expect(result).toMatchObject({ status: 'failed', message: expect.stringContaining('future') })
    expect(u.download).not.toHaveBeenCalled()
  })
  it('NC-NT-NO-SILENT-FAILURE: a failed list or download is reported, and the running bundle is left alone', async () => {
    const u = updater('2026-11-18.1000-abc')
    expect(await check(u, {}, {}, false)).toMatchObject({ status: 'failed' })
    u.download.mockRejectedValue(new Error('disk full'))
    expect(await check(u, await listing())).toMatchObject({
      status: 'failed',
      message: expect.stringContaining('disk full'),
    })
    expect(u.set).not.toHaveBeenCalled()
  })
  it('refuses a malformed version.json', async () => {
    expect(await check(updater('1'), { nope: true })).toMatchObject({ status: 'failed' })
  })
})
