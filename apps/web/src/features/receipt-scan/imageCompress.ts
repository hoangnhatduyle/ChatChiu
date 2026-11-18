// On-device shrinking of a receipt photo (F-RS-01, NC-RS-NO-RAW-UPLOAD): the API takes at most 5 MiB, camera
// photos are often 10 MB+. The photo is decoded (which also applies its EXIF rotation), drawn smaller and
// re-encoded as JPEG, lowering quality and then size until it fits. A photo that cannot be decoded or never
// fits is refused with a readable error; the original bytes are never uploaded instead.
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
/** Longest edge of the first attempt: plenty for the AI to read small print. */
export const MAX_EDGE_PX = 2400
const QUALITIES = [0.85, 0.7, 0.55] as const
const SCALE_STEP = 0.75
const MIN_SCALE = 0.2
/** Leave room under the limit for the request's own overhead. */
const TARGET_BYTES = MAX_UPLOAD_BYTES - 64 * 1024

export type DecodedImage = { width: number; height: number; close?: () => void }
export type ImageDeps = {
  decode: (file: File) => Promise<DecodedImage>
  /** Draws the image at `scale` of its full size and returns it as JPEG at `quality`. */
  encode: (image: DecodedImage, scale: number, quality: number) => Promise<Blob>
}

export class ImageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImageError'
  }
}

const browserDeps: ImageDeps = {
  decode: async (file) => {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // A browser that does not know the option: every modern one applies the photo's rotation by default.
      return createImageBitmap(file)
    }
  },
  encode: async (image, scale, quality) => {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('No canvas')
    context.drawImage(image as ImageBitmap, 0, 0, canvas.width, canvas.height)
    return new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Encoding failed'))),
        'image/jpeg',
        quality,
      ),
    )
  },
}

export async function compressImage(file: File, deps: ImageDeps = browserDeps): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new ImageError('That file is not a photo. Choose a picture of the receipt.')
  }
  let image: DecodedImage
  try {
    image = await deps.decode(file)
  } catch {
    throw new ImageError("That photo couldn't be read. Try taking it again.")
  }
  try {
    let scale = Math.min(1, MAX_EDGE_PX / Math.max(image.width, image.height))
    while (scale >= MIN_SCALE) {
      for (const quality of QUALITIES) {
        let blob: Blob
        try {
          blob = await deps.encode(image, scale, quality)
        } catch {
          throw new ImageError("This device couldn't shrink that photo. Try a smaller one.")
        }
        if (blob.size <= TARGET_BYTES) return blob
      }
      scale *= SCALE_STEP
    }
    throw new ImageError('That photo is too large to use. Try a smaller one.')
  } finally {
    image.close?.()
  }
}
