import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRuntimeClientConfigReader, DISABLED_RUNTIME_CLIENT_CONFIG,
  parseRuntimeClientConfig } from '../apps/public-web/lib/runtimeClientConfigData';

const ENABLED = { cardImageCdn: { enabled: true, origin: 'https://cdn.hearthpulse.net' }, webVitals: { enabled: true } };
const shipped = readFileSync('public/runtime-config.js', 'utf8');

test('the shipped switch file enables the public card-image CDN and Web Vitals reporting', () => {
  assert.deepEqual(parseRuntimeClientConfig(shipped), ENABLED);
});

test('only a literal true enables delivery, and a missing origin falls back to the approved one', () => {
  assert.deepEqual(parseRuntimeClientConfig('window.__ARENA_RUNTIME_CONFIG__ = { cardImageCdn: { enabled: false } };'),
    { ...DISABLED_RUNTIME_CLIENT_CONFIG, webVitals: { enabled: true } });
  assert.equal(parseRuntimeClientConfig('window.__ARENA_RUNTIME_CONFIG__ = { webVitals: { enabled: false } };')
    .webVitals.enabled, false, 'operations can stop reporting without a release');
  assert.equal(parseRuntimeClientConfig('window.__ARENA_RUNTIME_CONFIG__ = { cardImageCdn: { enabled: "true" } };')
    .cardImageCdn.enabled, false);
  assert.deepEqual(parseRuntimeClientConfig(''), DISABLED_RUNTIME_CLIENT_CONFIG);
});

test('the reader serves one read per refresh window and fails closed', async () => {
  let reads = 0;
  let source: string | Error = shipped;
  const read = createRuntimeClientConfigReader(async () => {
    reads += 1;
    if (source instanceof Error) throw source;
    return source;
  }, 30_000);

  assert.deepEqual(await read(1_000), ENABLED);
  assert.deepEqual(await read(30_999), ENABLED);
  assert.equal(reads, 1, 'requests inside the window reuse the value');

  source = shipped.replace('enabled: true', 'enabled: false');
  assert.equal((await read(31_000)).cardImageCdn.enabled, false, 'operations switch delivery off without a release');
  assert.equal(reads, 2);

  source = new Error('ENOENT');
  assert.deepEqual(await read(61_000), DISABLED_RUNTIME_CLIENT_CONFIG, 'an unreadable file means origin delivery');
  source = 'window.__ARENA_RUNTIME_CONFIG__ = {';
  assert.deepEqual(await read(91_000), DISABLED_RUNTIME_CLIENT_CONFIG, 'an invalid file means origin delivery');
});
