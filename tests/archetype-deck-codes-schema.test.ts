import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-ignore: node:sqlite is available in the production Node 22 runtime.
import { DatabaseSync } from 'node:sqlite';
import { ensureArchetypeDeckCodesAllRank } from '../server/archetypeDeckCodesSchema.js';

const directory = await mkdtemp(join(tmpdir(), 'hs-arena-deck-schema-'));
const database = new DatabaseSync(join(directory, 'users.sqlite'));

try {
  database.exec(`
    CREATE TABLE archetype_deck_codes (
      name_en_key TEXT PRIMARY KEY,
      name_en TEXT NOT NULL,
      deck_code TEXT NOT NULL,
      format TEXT NOT NULL CHECK(format IN ('standard', 'wild')),
      rank_key TEXT NOT NULL CHECK(rank_key IN ('legend', 'diamond', 'top_5k', 'top_legend', 'all')),
      source TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_archetype_deck_codes_updated
    ON archetype_deck_codes(updated_at DESC);
    INSERT INTO archetype_deck_codes VALUES (
      'tog druid', 'Tog Druid', 'AAEBA-existing', 'wild', 'legend', 'hsguru-decks', '2026-07-22T20:00:00Z'
    );
  `);

  assert.equal(ensureArchetypeDeckCodesAllRank(database), true);
  const preserved = database.prepare(
    'SELECT name_en, rank_key FROM archetype_deck_codes WHERE name_en_key = ?',
  ).get('tog druid') as { name_en: string; rank_key: string };
  assert.deepEqual(
    { name_en: preserved.name_en, rank_key: preserved.rank_key },
    { name_en: 'Tog Druid', rank_key: 'legend' },
  );
  for (const rank of [
    'all',
    'diamond_all',
    'diamond',
    'diamond_legend',
    'legend',
    'top_5k',
    'top_500',
    'top_100',
    'top_legend',
  ]) {
    database.prepare(`
      INSERT INTO archetype_deck_codes VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      `deck ${rank}`,
      `Deck ${rank}`,
      `AAEBA-${rank}`,
      'standard',
      rank,
      'hsguru-decks',
      '2026-07-22T20:30:00Z',
    );
    assert.equal(
      (database.prepare('SELECT rank_key FROM archetype_deck_codes WHERE name_en_key = ?')
        .get(`deck ${rank}`) as { rank_key: string }).rank_key,
      rank,
    );
  }
  assert.throws(() => database.prepare(`
    INSERT INTO archetype_deck_codes VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    'bad rank', 'Bad Rank', 'AAEBA-bad', 'wild', 'bronze', 'test', '2026-07-22T20:30:00Z',
  ));
  assert.equal(ensureArchetypeDeckCodesAllRank(database), false);
console.log('archetype deck-code rank schema migration tests passed');
} finally {
  database.close();
  await rm(directory, { recursive: true, force: true });
}
