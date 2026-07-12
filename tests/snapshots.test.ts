import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSnapshot, publishSnapshot, validateSnapshot } from '../server/snapshots.js';

const directory = mkdtempSync(join(tmpdir(), 'hs-arena-snapshots-'));
const original = {
  classes: Array.from({ length: 10 }, (_, index) => ({ id: index })),
  updatedAt: '2026-07-11T12:00:00.000Z',
  source: 'fixture',
};

try {
  const destination = join(directory, 'winrates.json');
  writeFileSync(destination, JSON.stringify(original));
  const replacement = { ...original, updatedAt: '2026-07-11T12:01:00.000Z' };
  publishSnapshot(directory, 'winrates.json', replacement);
  assert.deepEqual(loadSnapshot(directory, 'winrates.json'), replacement);
  assert.match(readFileSync(join(directory, '.snapshots-published'), 'utf8'), /winrates\.json/);
  assert.equal(readdirSync(directory).some(name => name.endsWith('.tmp')), false);

  assert.throws(() => publishSnapshot(directory, 'winrates.json', {
    classes: [], updatedAt: '2026-07-11T12:02:00.000Z', source: 'fixture',
  }), /empty or incomplete/);
  assert.deepEqual(JSON.parse(readFileSync(destination, 'utf8')), replacement);
  assert.throws(() => publishSnapshot(directory, 'winrates.json', {
    ...original,
    updatedAt: '2026-07-11T11:59:00.000Z',
  }), /older than the published snapshot/);
  assert.deepEqual(JSON.parse(readFileSync(destination, 'utf8')), replacement);

  const legendaryDestination = join(directory, 'legendaries.json');
  const legendarySnapshot = {
    groups: Array.from({ length: 100 }, (_, index) => ({ id: index })),
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
    sections: [{ id: 'fixture' }],
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
    sections: [{}], cards: {}, updatedAt: '2026-07-11T12:02:00.000Z', source: 'fixture',
  }), /cards index is empty/);
  assert.throws(() => publishSnapshot(directory, '../winrates.json', replacement), /unsupported snapshot|must not contain/);
} finally {
  rmSync(directory, { recursive: true, force: true });
}

console.log('durable snapshot publishing tests passed');
