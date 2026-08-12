// Generates the PWA icon set from a source image into public/.
// Usage: node scripts/generate-icons.mjs <source-image-path>
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2];
if (!src) {
  console.error('Usage: node scripts/generate-icons.mjs <source-image-path>');
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public');

for (const size of [192, 512]) {
  const out = path.join(outDir, `icon-${size}.png`);
  await sharp(src).resize(size, size, { fit: 'cover' }).png().toFile(out);
  console.log(`wrote ${out}`);
}
