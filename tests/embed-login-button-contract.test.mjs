import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { gzipSync } from 'node:zlib';

// The edge caches *.js for 30 days as immutable, so a published embed file can
// never be fixed in place. Changing hearthpulse-login-v1.js fails this test on
// purpose: ship the change as hearthpulse-login-v2.js (new file, new test) and
// leave v1 byte-for-byte as it was released.
const V1_SHA256 = '56b970d3bc1be4298e9be26a7bee2e31a9e41804645e28b0737024afe67e50fa';
const V1_GZIP_LIMIT_BYTES = 4096;
const file = new URL('../public/embed/hearthpulse-login-v1.js', import.meta.url);

test('hearthpulse-login-v1.js is frozen: the published bytes do not change', () => {
  const bytes = readFileSync(file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), V1_SHA256,
    'v1 is published and immutable on the edge; add hearthpulse-login-v2.js instead of editing it');
});

test('hearthpulse-login-v1.js stays within the 4 KiB gzip budget', () => {
  const gzipped = gzipSync(readFileSync(file), { level: 9 }).length;
  assert.ok(gzipped <= V1_GZIP_LIMIT_BYTES, `${gzipped} bytes gzip exceeds ${V1_GZIP_LIMIT_BYTES}`);
});
