import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SemanticSitemapStore,
  SitemapCandidateRejectedError,
  type SitemapSemanticEntry,
} from '../server/entitySitemapStore.js';

const directory = mkdtempSync(join(tmpdir(), 'arena-sitemap-store-'));
let now = Date.parse('2026-07-21T08:00:00.000Z');
const clock = () => now;
const filename = 'seo-standard-cards-sitemap-v1.json';
const primary = join(directory, filename);
const recovery = join(directory, 'seo-standard-cards-sitemap-v1.lkg.json');

const baseEntries: SitemapSemanticEntry[] = [
  {
    key: 'CARD_1',
    location: 'https://hearthpulse.net/standard/cards/standard/CARD_1/',
    semanticHash: '1'.repeat(64),
  },
  {
    key: 'CARD_2',
    location: 'https://hearthpulse.net/standard/cards/standard/CARD_2/',
    semanticHash: '2'.repeat(64),
  },
  {
    key: 'CARD_3',
    location: 'https://hearthpulse.net/standard/cards/standard/CARD_3/',
    semanticHash: '3'.repeat(64),
  },
];

try {
  const store = new SemanticSitemapStore({ directory, filename, now: clock });
  const first = store.publish(baseEntries);
  assert.equal(first.schemaVersion, 1);
  assert.deepEqual(first.entries.map(entry => entry.lastmod), [undefined, undefined, undefined],
    'first observation must not invent entity freshness');
  assert.ok(/^[a-f0-9]{64}$/.test(first.contentHash));
  assert.equal(readFileSync(primary, 'utf8'), readFileSync(recovery, 'utf8'),
    'the recovery LKG must survive primary-file corruption');

  now = Date.parse('2026-07-22T09:15:00.000Z');
  const restarted = new SemanticSitemapStore({ directory, filename, now: clock });
  const unchanged = restarted.publish([...baseEntries].reverse());
  assert.equal(unchanged.updatedAt, first.updatedAt,
    'an unchanged semantic projection must not rewrite document freshness');
  assert.deepEqual(unchanged.entries.map(entry => entry.lastmod), [undefined, undefined, undefined]);

  now = Date.parse('2026-07-23T10:30:00.000Z');
  const changed = restarted.publish(baseEntries.map(entry => entry.key === 'CARD_2'
    ? { ...entry, semanticHash: 'a'.repeat(64) }
    : entry));
  assert.equal(changed.entries.find(entry => entry.key === 'CARD_2')?.lastmod, '2026-07-23');
  assert.equal(changed.entries.find(entry => entry.key === 'CARD_1')?.lastmod, undefined);

  now = Date.parse('2026-07-24T11:45:00.000Z');
  const unchangedAgain = restarted.publish(baseEntries.map(entry => entry.key === 'CARD_2'
    ? { ...entry, semanticHash: 'a'.repeat(64) }
    : entry));
  assert.equal(unchangedAgain.entries.find(entry => entry.key === 'CARD_2')?.lastmod, '2026-07-23',
    'unchanged hashes must preserve their prior truthful lastmod');

  writeFileSync(primary, '{corrupt primary', 'utf8');
  const healingStore = new SemanticSitemapStore({ directory, filename, now: clock });
  const recovered = healingStore.readLastKnownGood();
  assert.equal(recovered?.contentHash, unchangedAgain.contentHash,
    'restart must recover the valid mirrored LKG when the primary file is corrupt');
  const healed = healingStore.publish(baseEntries.map(entry => entry.key === 'CARD_2'
    ? { ...entry, semanticHash: 'a'.repeat(64) }
    : entry));
  assert.equal(healed.updatedAt, unchangedAgain.updatedAt,
    'mirror repair must not invent document or entity freshness');
  assert.equal(readFileSync(primary, 'utf8'), readFileSync(recovery, 'utf8'),
    'an unchanged publish must repair a corrupt primary copy');

  rmSync(primary);
  healingStore.publish(baseEntries.map(entry => entry.key === 'CARD_2'
    ? { ...entry, semanticHash: 'a'.repeat(64) }
    : entry));
  assert.equal(existsSync(primary), true,
    'an unchanged publish after a recovery-only crash must recreate the primary copy');
  assert.equal(readFileSync(primary, 'utf8'), readFileSync(recovery, 'utf8'));

  writeFileSync(recovery, '{corrupt recovery', 'utf8');
  healingStore.publish(baseEntries.map(entry => entry.key === 'CARD_2'
    ? { ...entry, semanticHash: 'a'.repeat(64) }
    : entry));
  assert.equal(readFileSync(primary, 'utf8'), readFileSync(recovery, 'utf8'),
    'an unchanged publish must repair a corrupt recovery copy');

  const beforeRejected = readFileSync(recovery, 'utf8');
  assert.throws(
    () => restarted.publish([baseEntries[0], baseEntries[0], baseEntries[1]]),
    SitemapCandidateRejectedError,
    'duplicate candidate keys must never replace the LKG',
  );
  assert.equal(readFileSync(recovery, 'utf8'), beforeRejected);

  assert.throws(
    () => restarted.publish([baseEntries[0]]),
    /collapse/i,
    'a material count collapse must never replace the LKG',
  );
  assert.equal(readFileSync(recovery, 'utf8'), beforeRejected);

  const tampered = JSON.parse(beforeRejected);
  tampered.entries[0].semanticHash = 'f'.repeat(64);
  writeFileSync(primary, `${JSON.stringify(tampered)}\n`, 'utf8');
  const afterTamper = new SemanticSitemapStore({ directory, filename, now: clock }).readLastKnownGood();
  assert.equal(afterTamper?.contentHash, unchangedAgain.contentHash,
    'a checksum-invalid primary document must not displace the recovery LKG');
} finally {
  rmSync(directory, { recursive: true, force: true });
}

console.log('entity sitemap semantic LKG store contracts passed');

const heroDirectory = mkdtempSync(join(tmpdir(), 'arena-hero-sitemap-store-'));
try {
  const heroStore = new SemanticSitemapStore({
    directory: heroDirectory,
    segment: 'battleground-heroes',
    now: () => Date.parse('2026-09-03T08:00:00.000Z'),
  });
  const heroes = heroStore.publish([{
    key: '132608',
    location: 'https://hearthpulse.net/heroes/132608/',
    semanticHash: 'a'.repeat(64),
  }]);
  assert.equal(heroes.segment, 'battleground-heroes');
  assert.equal(existsSync(join(heroDirectory, 'seo-battleground-heroes-sitemap-v1.json')), true);
  assert.equal(existsSync(join(heroDirectory, 'seo-battleground-heroes-sitemap-v1.lkg.json')), true);
  assert.throws(() => heroStore.publish([{
    key: '132608',
    location: 'https://hearthpulse.net/library/minions/not-a-hero-132608/',
    semanticHash: 'b'.repeat(64),
  }]), /canonical location/i);
} finally {
  rmSync(heroDirectory, { recursive: true, force: true });
}

const minionDirectory = mkdtempSync(join(tmpdir(), 'arena-minion-sitemap-store-'));
try {
  const minionStore = new SemanticSitemapStore({
    directory: minionDirectory,
    segment: 'battleground-minions',
  });
  const minions = minionStore.publish([{
    key: '98582',
    location: 'https://hearthpulse.net/library/minions/%D0%B1%D0%B0%D1%8E%D0%B1%D0%BE%D1%82-98582/',
    semanticHash: 'c'.repeat(64),
  }]);
  assert.equal(minions.segment, 'battleground-minions');
} finally {
  rmSync(minionDirectory, { recursive: true, force: true });
}
