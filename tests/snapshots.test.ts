import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadSnapshot,
  publishSnapshot,
  SNAPSHOT_SCHEMA_VERSION,
  validateSnapshot,
} from '../server/snapshots.js';

const directory = mkdtempSync(join(tmpdir(), 'hs-arena-snapshots-'));
const original = {
  classes: Array.from({ length: 10 }, (_, index) => ({ id: String(index), winrate: 50, games: 100 })),
  updatedAt: '2026-07-11T12:00:00.000Z',
  source: 'fixture',
};

try {
  const destination = join(directory, 'winrates.json');
  writeFileSync(destination, JSON.stringify(original));
  const replacement = {
    ...original,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    updatedAt: '2026-07-11T12:01:00.000Z',
  };
  publishSnapshot(directory, 'winrates.json', replacement);
  assert.deepEqual(loadSnapshot(directory, 'winrates.json'), replacement);
  assert.match(readFileSync(join(directory, '.snapshots-published'), 'utf8'), /winrates\.json/);
  assert.equal(readdirSync(directory).some(name => name.endsWith('.tmp')), false);

  assert.throws(() => publishSnapshot(directory, 'winrates.json', {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    classes: [], updatedAt: '2026-07-11T12:02:00.000Z', source: 'fixture',
  }), /empty or incomplete/);
  assert.deepEqual(JSON.parse(readFileSync(destination, 'utf8')), replacement);
  assert.throws(() => publishSnapshot(directory, 'winrates.json', {
    ...original,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    updatedAt: '2026-07-11T11:59:00.000Z',
  }), /older than the published snapshot/);
  assert.deepEqual(JSON.parse(readFileSync(destination, 'utf8')), replacement);

  const legendaryDestination = join(directory, 'legendaries.json');
  const legendarySnapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    groups: Array.from({ length: 100 }, (_, index) => ({
      keyCard: { cardId: `legendary-${index}` },
      cards: [{ cardId: `reward-${index}` }],
      winRate: null,
    })),
    updatedAt: '2026-07-11T12:00:00.000Z',
    source: 'fixture',
  };
  writeFileSync(legendaryDestination, JSON.stringify(legendarySnapshot));
  assert.throws(() => publishSnapshot(directory, 'legendaries.json', {
    ...legendarySnapshot,
    groups: legendarySnapshot.groups.slice(0, 49),
    updatedAt: '2026-07-11T12:01:00.000Z',
  }), /groups shrank unexpectedly \(100 -> 49\)/);
  assert.deepEqual(JSON.parse(readFileSync(legendaryDestination, 'utf8')), legendarySnapshot);

  const tierDestination = join(directory, 'tierlist.json');
  const tierSnapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    sections: [{ id: 'fixture', tiers: [{ cards: [{ cardId: 'one' }] }] }],
    cards: { one: {}, two: {}, three: {}, four: {} },
    updatedAt: '2026-07-11T12:00:00.000Z',
    source: 'fixture',
  };
  writeFileSync(tierDestination, JSON.stringify(tierSnapshot));
  assert.throws(() => publishSnapshot(directory, 'tierlist.json', {
    ...tierSnapshot,
    cards: { one: {} },
    updatedAt: '2026-07-11T12:01:00.000Z',
  }), /cards index shrank unexpectedly \(4 -> 1\)/);
  assert.deepEqual(JSON.parse(readFileSync(tierDestination, 'utf8')), tierSnapshot);

  assert.throws(() => validateSnapshot('tierlist.json', {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    sections: [{}], cards: {}, updatedAt: '2026-07-11T12:02:00.000Z', source: 'fixture',
  }), /cards index is empty/);
  assert.throws(() => validateSnapshot('winrates.json', {
    ...replacement,
    schemaVersion: 999,
  }), /unsupported schema version/);
  assert.throws(() => validateSnapshot('winrates.json', {
    ...replacement,
    classes: replacement.classes.map((item, index) => ({
      ...item,
      id: index < 2 ? 'duplicate' : String(item.id),
      winrate: 50,
    })),
  }), /duplicate id duplicate/);
  assert.throws(() => validateSnapshot('winrates.json', {
    ...replacement,
    classes: replacement.classes.map((item, index) => ({
      ...item,
      winrate: index === 0 ? 101 : 50,
    })),
  }), /winrate is invalid/);
  assert.throws(() => validateSnapshot('tierlist.json', {
    ...tierSnapshot,
    sections: [{ id: 'fixture', tiers: [{ cards: [] }] }],
  }), /cards is empty/);
  assert.throws(() => publishSnapshot(directory, '../winrates.json', replacement), /unsupported snapshot|must not contain/);
} finally {
  rmSync(directory, { recursive: true, force: true });
}

console.log('durable snapshot publishing tests passed');
