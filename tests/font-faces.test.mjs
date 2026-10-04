import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(match => {
  const body = match[1];
  return {
    family: body.match(/font-family:\s*["']?([^"';]+)/)?.[1],
    weight: body.match(/font-weight:\s*([^;]+);/)?.[1].trim(),
    url: body.match(/url\(["']?([^"')]+)["']?\)/)?.[1],
    format: body.match(/format\(["']?([^"')]+)["']?\)/)?.[1],
    unicodeRange: body.match(/unicode-range:\s*([^;]+);/)?.[1].trim() ?? '',
  };
});
const publicFile = url => new URL(`../public${url}`, import.meta.url);

test('every self-hosted face points at an existing WOFF2 file', () => {
  assert.ok(faces.length > 0);
  for (const face of faces) {
    assert.match(face.url, /^\/fonts\/.+\.woff2$/, `${face.family} ${face.weight}`);
    assert.equal(face.format, 'woff2', `${face.family} ${face.url}`);
    assert.ok(existsSync(publicFile(face.url)), `${face.url} is missing from public/`);
  }
});

test('the display face is a compact WOFF2 and the OTF stays for the image generator', () => {
  const display = faces.filter(face => face.family === 'HSDisplay');
  assert.equal(display.length, 1);
  const file = readFileSync(publicFile(display[0].url));
  assert.equal(file.subarray(0, 4).toString('latin1'), 'wOF2');
  assert.ok(file.length <= 32_000, `HSDisplay is ${file.length} B`);
  // server/gen_legendary_image.py renders with the OTF and assets.md publishes its URL.
  assert.ok(existsSync(publicFile('/fonts/2318-font.otf')));
});

test('Inter latin and cyrillic use the 400-700 cut and keep one face per weight', () => {
  const ceilings = { latin: 37_000, cyrillic: 14_000 };
  for (const [subset, ceiling] of Object.entries(ceilings)) {
    const range = subset === 'latin' ? /^U\+0000-00FF/ : /^U\+0301, U\+0400-045F/;
    const subsetFaces = faces.filter(face => face.family === 'Inter' && range.test(face.unicodeRange));
    assert.deepEqual(subsetFaces.map(face => face.weight).sort(), ['400', '500', '600', '700'], subset);
    for (const face of subsetFaces) {
      assert.equal(face.url, `/fonts/google/inter-${subset}-400-700.woff2`);
      const size = statSync(publicFile(face.url)).size;
      assert.ok(size <= ceiling, `${face.url} is ${size} B`);
    }
  }
});
