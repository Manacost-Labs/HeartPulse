import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import {
  SemanticSitemapStore,
  SitemapCandidateRejectedError,
  type SitemapSemanticEntry,
} from '../server/entitySitemapStore.js';
import { assertProperty } from './helpers/propertyRuns.js';

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

// Archetypes: the catalog's own data date dates a change, and the segment's size follows the period.
const archetypeEntry = (slug: string, hash: string, dataDate?: string): SitemapSemanticEntry => ({
  key: slug,
  location: `https://hearthpulse.net/standard/archetypes/standard/${slug}/`,
  semanticHash: hash.repeat(64),
  ...(dataDate === undefined ? {} : { dataDate }),
});

const archetypeDirectory = mkdtempSync(join(tmpdir(), 'arena-archetype-sitemap-store-'));
try {
  let archetypeNow = Date.parse('2026-10-30T22:00:00.000Z');
  const archetypes = new SemanticSitemapStore({
    directory: archetypeDirectory,
    segment: 'archetypes',
    now: () => archetypeNow,
    minimumEntryCount: 2,
  });

  const first = archetypes.publish([
    archetypeEntry('pure-paladin', '1', '2026-10-29'),
    archetypeEntry('egg-priest', '2', '2026-10-29'),
    archetypeEntry('zoolock', '3', '2026-10-29'),
  ]);
  assert.deepEqual(first.entries.map(entry => [entry.key, entry.lastmod]), [
    ['egg-priest', '2026-10-29'],
    ['pure-paladin', '2026-10-29'],
    ['zoolock', '2026-10-29'],
  ], 'a new archetype takes the day its data was produced, not the day the server saw it');
  assert.equal(JSON.stringify(first).includes('dataDate'), false, 'the data date is a hint and is never stored');
  assert.equal(
    JSON.parse(readFileSync(join(archetypeDirectory, 'seo-archetypes-sitemap-v1.json'), 'utf8')).entries[0].dataDate,
    undefined,
  );

  const second = archetypes.publish([
    archetypeEntry('pure-paladin', '1', '2026-10-30'),
    archetypeEntry('egg-priest', '9', '2026-10-30'),
    archetypeEntry('zoolock', '3', '2026-10-30'),
  ]);
  assert.deepEqual(second.entries.map(entry => [entry.key, entry.lastmod]), [
    ['egg-priest', '2026-10-30'],
    ['pure-paladin', '2026-10-29'],
    ['zoolock', '2026-10-29'],
  ], 'only the archetype whose public numbers changed takes the new data date');

  archetypeNow = Date.parse('2026-11-02T08:00:00.000Z');
  const shrunk = archetypes.publish([
    archetypeEntry('pure-paladin', '1', '2026-11-01'),
    archetypeEntry('zoolock', '4', '2026-11-01'),
  ]);
  assert.deepEqual(shrunk.entries.map(entry => entry.key), ['pure-paladin', 'zoolock'],
    'a patch can take the archetype list from three to two: no ratio guard stands in its way');
  assert.equal(shrunk.entries[1].lastmod, '2026-11-01');

  assert.throws(
    () => archetypes.publish([archetypeEntry('pure-paladin', '1', '2026-11-02')]),
    /partial/i,
    'the minimum entry count still rejects a truncated candidate',
  );
  assert.deepEqual(archetypes.readLastKnownGood()?.entries.map(entry => entry.key), ['pure-paladin', 'zoolock']);

  const future = archetypes.publish([
    archetypeEntry('pure-paladin', '5', '2026-11-20'),
    archetypeEntry('zoolock', '4', '2026-11-01'),
  ]);
  assert.equal(future.entries[0].lastmod, '2026-11-02', 'lastmod never lies ahead of today');

  archetypeNow = Date.parse('2026-11-05T08:00:00.000Z');
  const older = archetypes.publish([
    archetypeEntry('pure-paladin', '6', '2026-10-01'),
    archetypeEntry('zoolock', '4', '2026-11-01'),
  ]);
  assert.equal(older.entries[0].lastmod, '2026-11-02', 'a source that went back in time never moves lastmod back');

  for (const dataDate of ['2026-02-31', '30.10.2026', '2026-10-30T11:00:00Z', '']) {
    assert.throws(
      () => archetypes.publish([
        archetypeEntry('pure-paladin', '6', dataDate),
        archetypeEntry('zoolock', '4', '2026-11-01'),
      ]),
      /data date/i,
      `a malformed data date (${JSON.stringify(dataDate)}) must reject the candidate`,
    );
  }

  for (const [key, path] of [
    ['Pure-Paladin', '/standard/archetypes/standard/Pure-Paladin/'],
    ['pure_paladin', '/standard/archetypes/standard/pure_paladin/'],
    ['pure-paladin', '/standard/meta/standard/pure-paladin/'],
    ['pure-paladin', '/standard/archetypes/wild/pure-paladin/'],
    ['a'.repeat(91), `/standard/archetypes/standard/${'a'.repeat(91)}/`],
  ]) {
    assert.throws(
      () => archetypes.publish([
        { key, location: `https://hearthpulse.net${path}`, semanticHash: '7'.repeat(64) },
        archetypeEntry('zoolock', '4', '2026-11-01'),
      ]),
      SitemapCandidateRejectedError,
      `${path} must never enter the archetype segment`,
    );
  }

  const cardLocation = (index: number) => `https://hearthpulse.net/standard/cards/standard/CARD_${index}/`;
  const cardEntry = (index: number, hash: string): SitemapSemanticEntry => ({
    key: `CARD_${index}`, location: cardLocation(index), semanticHash: hash.repeat(64),
  });
  const cards = new SemanticSitemapStore({
    directory: mkdtempSync(join(tmpdir(), 'arena-card-ratio-')),
    now: () => archetypeNow,
  });
  cards.publish(Array.from({ length: 10 }, (_, index) => cardEntry(index, 'a')));
  assert.throws(
    () => cards.publish(Array.from({ length: 6 }, (_, index) => cardEntry(index, 'a'))),
    /collapse/i,
    'the ratio guard still protects every segment whose size does not follow a period',
  );
  const explicit = new SemanticSitemapStore({
    directory: mkdtempSync(join(tmpdir(), 'arena-card-ratio-off-')),
    now: () => archetypeNow,
    collapseRatio: null,
  });
  explicit.publish(Array.from({ length: 10 }, (_, index) => cardEntry(index, 'a')));
  assert.equal(explicit.publish(Array.from({ length: 6 }, (_, index) => cardEntry(index, 'a'))).entryCount, 6,
    'a null ratio turns the guard off');
} finally {
  rmSync(archetypeDirectory, { recursive: true, force: true });
}

// Property: whatever the snapshots, lastmod moves only with a change of the public numbers.
const snapshotArbitrary = fc.array(
  fc.record({
    day: fc.integer({ min: 0, max: 3 }),
    hashes: fc.dictionary(fc.constantFrom('a-deck', 'b-deck', 'c-deck', 'd-deck'), fc.constantFrom('1', '2', '3'), { minKeys: 2 }),
  }),
  { minLength: 1, maxLength: 8 },
);
assertProperty(fc.property(snapshotArbitrary, snapshots => {
  const directoryForRun = mkdtempSync(join(tmpdir(), 'arena-archetype-sitemap-property-'));
  try {
    const dayOf = (offset: number) => new Date(Date.UTC(2026, 9, 29 + offset)).toISOString().slice(0, 10);
    const store = new SemanticSitemapStore({
      directory: directoryForRun,
      segment: 'archetypes',
      now: () => Date.UTC(2026, 10, 30),
      minimumEntryCount: 2,
    });
    let previous = new Map<string, { hash: string; lastmod: string }>();
    let latestDay = 0;
    for (const snapshot of snapshots) {
      latestDay = Math.max(latestDay, snapshot.day);
      const dataDate = dayOf(latestDay);
      const published = store.publish(Object.entries(snapshot.hashes)
        .map(([slug, hash]) => archetypeEntry(slug, hash, dataDate)));
      const next = new Map<string, { hash: string; lastmod: string }>();
      for (const entry of published.entries) {
        const hash = snapshot.hashes[entry.key];
        assert.ok(entry.lastmod, `${entry.key} has a data date from its first snapshot`);
        const before = previous.get(entry.key);
        if (before && before.hash === hash) {
          assert.equal(entry.lastmod, before.lastmod, 'unchanged numbers keep their lastmod');
        } else {
          assert.equal(entry.lastmod, before && before.lastmod > dataDate ? before.lastmod : dataDate,
            'a new or changed archetype takes the data date, and never an earlier one');
        }
        next.set(entry.key, { hash, lastmod: entry.lastmod });
      }
      previous = next;
    }
  } finally {
    rmSync(directoryForRun, { recursive: true, force: true });
  }
}));

console.log('entity sitemap archetype store contracts passed');
