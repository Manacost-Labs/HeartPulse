import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConstructedCardCatalogStore } from '../server/constructedCardCatalogStore.js';

// Readiness read and compared both copies of every catalog on each call
// (~2 s for Wild on the server). Monitors call it every minute, and every call
// froze the server long enough for card pages to answer 503 (#669). The summary
// answers the same as `inspect`, and reads the copies again only after a
// change on disk.

const directory = mkdtempSync(join(tmpdir(), 'arena-catalog-health-summary-'));
let now = Date.parse('2026-11-20T18:00:00.000Z');
const card = (index: number, edition = 1) => ({
  card_id: `CARD_${index}`,
  dbf: index,
  name: { ru: `Карта ${index}`, en: `Card ${index}` },
  card_set: 'CORE',
  text: { ru: `Боевой клич: ${'текст карты '.repeat(40)}${edition}` },
  images: { card: `https://cdn.example.test/CARD_${index}.png` },
});
const catalog = (count: number, edition = 1) => Array.from({ length: count }, (_, index) => card(index + 1, edition));
const open = () => new ConstructedCardCatalogStore({
  stateDirectory: directory,
  now: () => now,
  minimumCardCountByFormat: { standard: 1, wild: 1 },
  freshWindowMs: 5 * 60_000,
});
let store = open();
const projected = (format: 'standard' | 'wild') => {
  const { document, ...rest } = store.inspect(format);
  return { ...rest, document: document && {
    verifiedAt: document.verifiedAt, publishedAt: document.publishedAt, count: document.count, datasetVersion: document.datasetVersion,
  } };
};
const timed = <T>(read: () => T): { value: T; ms: number } => {
  const startedAt = performance.now();
  const value = read();
  return { value, ms: performance.now() - startedAt };
};

try {
  assert.deepEqual(store.inspectSummary('wild'), { state: 'missing', document: null, ageMs: null, repairWarning: null });

  store.publish('wild', catalog(6_000), { expectedTotal: 6_000 });
  // A restarted process reads the copies once.
  store = open();
  const first = timed(() => store.inspectSummary('wild'));
  assert.deepEqual(first.value, projected('wild'), 'the summary answers what inspect answers');
  assert.equal(first.value.state, 'fresh');
  assert.equal(first.value.document?.count, 6_000);

  // Nothing changed on disk: the next readiness check does not read the copies again.
  const again = timed(() => store.inspectSummary('wild'));
  assert.deepEqual(again.value, first.value);
  assert.ok(again.ms < 50 && again.ms * 5 < first.ms, `repeated check took ${again.ms.toFixed(1)} ms after ${first.ms.toFixed(1)} ms`);

  // Time passes: the age is evaluated on every call.
  now += 6 * 60_000;
  assert.equal(store.inspectSummary('wild').state, 'stale');

  // A new catalog is noticed, and the check after this process published it does not read it back.
  store.publish('wild', catalog(6_100, 2), { expectedTotal: 6_100 });
  const afterPublish = timed(() => store.inspectSummary('wild'));
  const republished = afterPublish.value;
  assert.equal(republished.document?.count, 6_100);
  assert.ok(afterPublish.ms < 50, `check after a publish took ${afterPublish.ms.toFixed(1)} ms`);
  assert.deepEqual(republished, projected('wild'));

  // A primary damaged behind the store's back is noticed: the copies differ.
  writeFileSync(join(directory, 'constructed-card-catalog-v1', 'wild.json'), '{"schemaVersion":');
  const damaged = store.inspectSummary('wild');
  assert.deepEqual(damaged, projected('wild'));
  assert.equal(damaged.state, 'stale');
  assert.ok(damaged.repairWarning);
} finally {
  rmSync(directory, { recursive: true, force: true });
}

console.log('constructed card catalog health summary tests passed');
