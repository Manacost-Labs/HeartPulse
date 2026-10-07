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
    body,
  };
});
const publicFile = url => new URL(`../public${url}`, import.meta.url);
// Local-only faces are the metric-matched fallbacks, not downloads.
const selfHosted = faces.filter(face => !/src:\s*local\(/.test(face.body));
const fallbacks = faces.filter(face => /src:\s*local\(/.test(face.body));

test('every self-hosted face points at an existing WOFF2 file', () => {
  assert.ok(selfHosted.length > 0);
  for (const face of selfHosted) {
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

test('web fonts have metric-matched local fallbacks in every font token', () => {
  const families = new Set(fallbacks.map(face => face.family));
  assert.deepEqual([...families].sort(), ['HSDisplay Fallback', 'HSDisplay Fallback Android', 'Inter Fallback']);
  for (const face of fallbacks) {
    assert.equal(face.url, undefined, `${face.family} must not download a file`);
    for (const descriptor of ['size-adjust', 'ascent-override', 'descent-override', 'line-gap-override']) {
      assert.match(face.body, new RegExp(`${descriptor}:\\s*\\d+(\\.\\d+)?%;`), `${face.family} ${face.weight ?? ''} ${descriptor}`);
    }
  }
  // Inter's regular and bold cuts differ in width, so each has its own fallback.
  assert.deepEqual(fallbacks.filter(face => face.family === 'Inter Fallback').map(face => face.weight), ['100 500', '600 900']);
  const token = name => css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].replace(/\s+/g, ' ').trim();
  assert.equal(token('font-body'), '"Inter", "Inter Fallback", sans-serif');
  assert.equal(token('font-display'), '"HSDisplay", "HSDisplay Fallback", "HSDisplay Fallback Android", serif');
  assert.equal(token('font-hs'), '"HSDisplay", "Cinzel", "HSDisplay Fallback", "HSDisplay Fallback Android", serif');
});
