// Rasterize the Open Graph image from SVG to a 1200x630 PNG.
// Run with: node scripts/generate-og.mjs
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public', 'og.svg'));

await sharp(svg, { density: 200 })
  .resize(1200, 630, { fit: 'fill' })
  .png()
  .toFile(join(root, 'public', 'og.png'));

console.log('Wrote public/og.png');
