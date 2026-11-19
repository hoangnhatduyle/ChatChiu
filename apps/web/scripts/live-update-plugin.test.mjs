// @vitest-environment node
// The live-update bundle the Fire shell downloads: a zip of the web build with index.html at its root, and a
// version.json that names it. (SPEC-NT-001 / roadmap 5.9)
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash, generateKeyPairSync, verify } from 'node:crypto'
import { unzipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'
import { buildVersion, writeLiveUpdate } from './live-update-plugin.mjs'

describe('buildVersion', () => {
  it('is <date>.<HHmm>-<commit>, so later builds sort later', () => {
    expect(
      buildVersion({ VERCEL_GIT_COMMIT_SHA: '8fdf8b8aabbcc' }, new Date('2026-11-18T14:32:09Z')),
    ).toBe('2026-11-18.1432-8fdf8b8')
    expect(buildVersion({}, new Date('2026-11-18T09:05:00Z'))).toBe('2026-11-18.0905-local')
  })
  it('never lets a odd commit value into the version', () => {
    expect(buildVersion({ BUILD_COMMIT: '../../x' }, new Date('2026-11-18T09:05:00Z'))).toBe(
      '2026-11-18.0905-local',
    )
  })
})

describe('writeLiveUpdate', () => {
  it('zips the build with index.html at the root, leaves out live/ and version.json, and names the zip', () => {
    const out = mkdtempSync(join(tmpdir(), 'live-'))
    mkdirSync(join(out, 'assets'))
    writeFileSync(join(out, 'index.html'), '<html></html>')
    writeFileSync(join(out, 'assets', 'app.js'), 'console.log(1)')
    mkdirSync(join(out, 'live'))
    writeFileSync(join(out, 'live', 'old.zip'), 'old')
    writeLiveUpdate(out, '2026-11-18.1432-8fdf8b8')
    const list = JSON.parse(readFileSync(join(out, 'version.json'), 'utf8'))
    expect(list).toMatchObject({
      version: '2026-11-18.1432-8fdf8b8',
      url: '/live/2026-11-18.1432-8fdf8b8.zip',
    })
    expect(list.sig).toBeUndefined() // no key given: unsigned, and no shell takes an unsigned list
    const bytes = readFileSync(join(out, 'live', '2026-11-18.1432-8fdf8b8.zip'))
    expect(list.sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
    const zip = unzipSync(bytes)
    expect(Object.keys(zip).sort()).toEqual(['assets/app.js', 'index.html'])
  })

  it('with a key, version.json carries a signature over the version, the url and the zip hash that the public key verifies', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const out = mkdtempSync(join(tmpdir(), 'live-'))
    writeFileSync(join(out, 'index.html'), '<html></html>')
    writeLiveUpdate(
      out,
      '2026-11-18.1432-8fdf8b8',
      privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    )
    const list = JSON.parse(readFileSync(join(out, 'version.json'), 'utf8'))
    const text = `${list.version}\n${list.url}\n${list.sha256}`
    expect(
      verify(
        'sha256',
        Buffer.from(text),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(list.sig, 'base64'),
      ),
    ).toBe(true)
    expect(
      verify(
        'sha256',
        Buffer.from(text + 'x'),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(list.sig, 'base64'),
      ),
    ).toBe(false)
  })

  it('refuses to publish a bundle of nothing', () => {
    const out = mkdtempSync(join(tmpdir(), 'live-'))
    expect(() => writeLiveUpdate(out, '2026-11-18.1432-8fdf8b8')).toThrow(/nothing to zip/)
  })
})

// A key pasted into a Vercel field arrives in many shapes: real line breaks, literal \n, quotes, or every
// line break turned into a space. All must sign; a key that cannot be read must not fail the whole deploy.
describe('writeLiveUpdate with a key pasted into a dashboard', () => {
  const build = (key) => {
    const out = mkdtempSync(join(tmpdir(), 'live-'))
    writeFileSync(join(out, 'index.html'), '<html></html>')
    writeLiveUpdate(out, '2026-11-18.1432-8fdf8b8', key)
    return JSON.parse(readFileSync(join(out, 'version.json'), 'utf8'))
  }
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString().trim()

  it.each([
    ['real line breaks', pem],
    ['literal \\n sequences', pem.replace(/\n/g, '\\n')],
    ['a trailing line break lost', pem.replace(/\n$/, '')],
    ['line breaks turned into spaces', pem.replace(/\n/g, ' ')],
    ['wrapped in double quotes', `"${pem}"`],
    ['wrapped in quotes with literal \\n', `"${pem.replace(/\n/g, '\\n')}"`],
  ])('signs when the key has %s', (_name, key) => {
    expect(build(key).sig).toEqual(expect.any(String))
  })

  it('writes an unsigned list and warns, instead of failing the build, when the key cannot be read', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const list = build('not a key at all')
    expect(list.sig).toBeUndefined()
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/LIVE_UPDATE_SIGNING_KEY/))
    warn.mockRestore()
  })
})
