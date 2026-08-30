// Turning a camera roll photo into something worth syncing.
//
// The capture path is `<input type="file" accept="image/*" capture>`, which is
// the one camera that works inside an iOS Safari home-screen PWA - there is no
// getUserMedia still-capture worth relying on there.
//
// Re-encoding through a canvas drops EXIF, GPS included, as a side effect.
// That is the behaviour we want: proof of a walk should not carry the
// coordinates of the walk. Do not "optimise" this into a raw upload.

const MAX_EDGE = 900
const QUALITY = 0.72

const encode = (canvas, type) =>
  new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY))

/**
 * Downscales and re-encodes a picked file.
 * Returns `{ blob, width, height, ext }`, or null if the file wasn't an image.
 */
export async function prepare(file) {
  if (!file || !file.type.startsWith('image/')) return null

  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return null
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  // Safari quietly hands back a PNG when it can't encode the type it was
  // asked for, so trust the blob's own type rather than the argument.
  let blob = await encode(canvas, 'image/webp')
  if (blob?.type !== 'image/webp') blob = await encode(canvas, 'image/jpeg')
  if (!blob) return null

  return {
    blob,
    width,
    height,
    ext: blob.type === 'image/webp' ? 'webp' : 'jpg',
  }
}

/** Object URLs leak until revoked; components pair this with a cleanup. */
export const objectUrl = (blob) => (blob ? URL.createObjectURL(blob) : null)
