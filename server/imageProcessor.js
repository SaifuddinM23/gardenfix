/**
 * imageProcessor.js
 *
 * Validates that uploaded data is a real JPEG, PNG, or WebP image
 * (checked by magic bytes, not just the Content-Type header), then
 * resizes it so the longest edge is ≤ MAX_DIMENSION pixels while
 * preserving the original aspect ratio.
 *
 * All processing is done in memory; the original buffer is never
 * written to disk and its contents are never logged.
 */

import sharp from 'sharp';

// Largest edge (px) we'll send to the model. Anything bigger wastes
// tokens and slows inference without improving answer quality.
const MAX_DIMENSION = 1024;

// Magic-byte signatures for the three accepted formats.
const MAGIC = [
  { name: 'jpeg', bytes: [0xff, 0xd8, 0xff] },
  { name: 'png',  bytes: [0x89, 0x50, 0x4e, 0x47] },
  // WebP: "RIFF" at 0 + "WEBP" at 8
  { name: 'webp', bytes: null, check: webpCheck },
];

function webpCheck(buf) {
  if (buf.length < 12) return false;
  return (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && // RIFF
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50   // WEBP
  );
}

/**
 * detectImageFormat(buffer)
 * Returns 'jpeg' | 'png' | 'webp', or throws if the buffer is not a
 * recognised image format.
 */
function detectImageFormat(buffer) {
  for (const sig of MAGIC) {
    if (sig.check) {
      if (sig.check(buffer)) return sig.name;
      continue;
    }
    if (buffer.length < sig.bytes.length) continue;
    if (sig.bytes.every((b, i) => buffer[i] === b)) return sig.name;
  }
  throw Object.assign(
    new Error('File does not appear to be a JPEG, PNG, or WebP image.'),
    { code: 'INVALID_IMAGE_FORMAT', status: 415 }
  );
}

/**
 * processImage(buffer)
 * Validates the image, resizes it if needed, and returns a Buffer
 * containing JPEG data ready for base64 encoding.
 *
 * Throws an error (with .status / .code) if validation fails.
 */
export async function processImage(buffer) {
  // 1. Validate by magic bytes
  detectImageFormat(buffer);

  // 2. Decode with sharp to catch corrupt / truncated files
  let image = sharp(buffer);
  let meta;
  try {
    meta = await image.metadata();
  } catch (err) {
    throw Object.assign(
      new Error('Image could not be decoded – the file may be corrupt.'),
      { code: 'IMAGE_DECODE_ERROR', status: 422 }
    );
  }

  const { width = 0, height = 0 } = meta;

  // 3. Resize if either dimension exceeds the limit
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    image = image.resize({
      width:  MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit:    'inside',      // preserves aspect ratio; never crops
      withoutEnlargement: true,
    });
  }

  // 4. Re-encode as JPEG (consistent format for the model, no metadata)
  const outBuffer = await image
    .jpeg({ quality: 85, mozjpeg: false })
    .toBuffer();

  return outBuffer;
}
