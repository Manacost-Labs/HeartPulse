import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const expectedPngs = [
  ['favicon-16.png', 16],
  ['favicon-32.png', 32],
  ['favicon-96.png', 96],
  ['favicon-192.png', 192],
  ['apple-touch-icon.png', 180],
];

for (const [filename, expectedSize] of expectedPngs) {
  const png = readFileSync(join(root, 'public', filename));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${filename} must be a PNG`);
  assert.equal(png.readUInt32BE(16), expectedSize, `${filename} width must match its declared size`);
  assert.equal(png.readUInt32BE(20), expectedSize, `${filename} height must match its declared size`);
}

const ico = readFileSync(join(root, 'public', 'favicon.ico'));
assert.equal(ico.readUInt16LE(0), 0, 'ICO reserved field must be zero');
assert.equal(ico.readUInt16LE(2), 1, 'favicon.ico must contain icon images');
assert.equal(ico.readUInt16LE(4), 3, 'favicon.ico must bundle all three supplied sizes');
assert.deepEqual(
  [0, 1, 2].map(index => {
    const width = ico[6 + index * 16];
    const height = ico[7 + index * 16];
    return [width || 256, height || 256];
  }),
  [[16, 16], [32, 32], [96, 96]],
);

const iconMarkup = [
  ['favicon-16.png', '16x16'],
  ['favicon-32.png', '32x32'],
  ['favicon-96.png', '96x96'],
];
const sourceFiles = [
  'index.html',
  'server/constructedCardSeoRoutes.ts',
  'server/battlegroundSeoRoutes.ts',
  'server/battlegroundLibrarySeoRoutes.ts',
];
for (const sourceFile of sourceFiles) {
  const source = readFileSync(join(root, sourceFile), 'utf8');
  for (const [filename, size] of iconMarkup) {
    assert.match(source, new RegExp(`${filename.replace('.', '\\.')}[^\\n>]*sizes=["']${size}["']`),
      `${sourceFile} must advertise the ${size} favicon`);
  }
  assert.match(source, /favicon\.ico\?v=hearthstone-cute-20260727/,
    `${sourceFile} must expose the multi-size ICO fallback`);
}

console.log('favicon asset and markup contracts passed');
