// SPEC-RS-001 F-RS-01 / NC-RS-NO-RAW-UPLOAD: a photo is shrunk on the device to under the API's 5 MiB limit.
import { describe, expect, it, vi } from 'vitest'
import { compressImage, MAX_UPLOAD_BYTES, type ImageDeps } from './imageCompress'

const MIB = 1024 * 1024
const photo = (size: number) =>
  new File([new Uint8Array(size)], 'receipt.jpg', { type: 'image/jpeg' })

/** An encoder whose output size grows with scale squared and quality, like a real JPEG. */
const deps = (fullSizeBytes: number): ImageDeps & { encode: ReturnType<typeof vi.fn> } => ({
  decode: vi.fn(async () => ({ width: 4000, height: 3000, close: () => undefined })),
  // Only the size matters, so no real bytes are allocated (a "never fits" photo would be gigabytes).
  encode: vi.fn(
    async (_b: unknown, scale: number, quality: number) =>
      ({ size: Math.round(fullSizeBytes * scale * scale * quality), type: 'image/jpeg' }) as Blob,
  ),
})

describe('compressImage', () => {
  it('F-RS-01: a 12 MB photo comes out under 5 MiB, as a JPEG', async () => {
    const d = deps(12 * MIB)
    const out = await compressImage(photo(12 * MIB), d)
    expect(out.size).toBeLessThan(MAX_UPLOAD_BYTES)
    expect(out.type).toBe('image/jpeg')
  })
  it('keeps the first try when it already fits (no needless shrinking)', async () => {
    const d = deps(1 * MIB)
    await compressImage(photo(2 * MIB), d)
    expect(d.encode).toHaveBeenCalledTimes(1)
  })
  it('NC-RS-NO-RAW-UPLOAD: an image that never fits is refused with a readable error, never passed through', async () => {
    const d = deps(10_000 * MIB)
    await expect(compressImage(photo(12 * MIB), d)).rejects.toThrow(/too large/i)
  })
  it('a file the browser cannot decode is refused with a readable error', async () => {
    const d = { ...deps(MIB), decode: vi.fn().mockRejectedValue(new Error('bad')) }
    await expect(compressImage(photo(MIB), d)).rejects.toThrow(/couldn.t be read/i)
  })
  it('an encoder that fails is reported in plain words, not as a raw error', async () => {
    const d = { ...deps(MIB), encode: vi.fn().mockRejectedValue(new Error('Encoding failed')) }
    await expect(compressImage(photo(MIB), d)).rejects.toThrow(/couldn.t shrink/i)
  })
  it('a file that is not an image is refused before decoding', async () => {
    const d = deps(MIB)
    await expect(
      compressImage(new File(['x'], 'a.pdf', { type: 'application/pdf' }), d),
    ).rejects.toThrow(/photo/i)
    expect(d.decode).not.toHaveBeenCalled()
  })
})
