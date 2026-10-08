/**
 * smoke-test.js – run with: node smoke-test.js
 * Tests processImage() locally without starting the full server.
 */
import sharp from 'sharp';
import { processImage } from './imageProcessor.js';

async function main() {
  // 1. Generate a valid 2000x1500 green JPEG in memory (above MAX_DIMENSION)
  const bigJpeg = await sharp({
    create: {
      width:      2000,
      height:     1500,
      channels:   3,
      background: { r: 60, g: 140, b: 40 },
    },
  })
    .jpeg()
    .toBuffer();

  console.log(`Input : ${bigJpeg.length} bytes  (2000 × 1500)`);

  const result = await processImage(bigJpeg);
  const meta   = await sharp(result).metadata();

  console.log(`Output: ${result.length} bytes  (${meta.width} × ${meta.height})`);
  console.log(
    'Longest edge ≤ 1024?',
    Math.max(meta.width, meta.height) <= 1024 ? 'YES ✓' : 'NO ✗'
  );
  console.log(`Format: ${meta.format}  (expected jpeg)`);

  // 2. Test that a fake "image" is rejected
  try {
    await processImage(Buffer.from('this is not an image'));
    console.log('Fake rejection: FAILED ✗');
  } catch (e) {
    console.log(`Fake image rejected: "${e.message}"  ✓`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
