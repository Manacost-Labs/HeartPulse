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
  assert.throws(() => validateSnapshot('tierlist.json', {
    sections: [{}], cards: {}, updatedAt: '2026-07-11T12:02:00.000Z', source: 'fixture',
  }), /cards index is empty/);
  assert.throws(() => publishSnapshot(directory, '../winrates.json', replacement), /unsupported snapshot|must not contain/);
} finally {
  rmSync(directory, { recursive: true, force: true });
}

console.log('durable snapshot publishing tests passed');
