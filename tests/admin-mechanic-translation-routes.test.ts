import assert from 'node:assert/strict';
import express from 'express';
// @ts-ignore: node:sqlite is available in the production Node 22 runtime.
import { DatabaseSync } from 'node:sqlite';
import {
  createAdminMechanicTranslationRouter,
  loadConstructedMechanicOverrideMap,
  loadConstructedMechanicTranslationMap,
  mechanicEnglishLabel,
  repairLegacyConstructedMechanicTranslations,
} from '../server/adminMechanicTranslationRoutes.js';

assert.equal(mechanicEnglishLabel('DIVINE_SHIELD'), 'Divine Shield');
assert.equal(mechanicEnglishLabel('Draw cards'), 'Draw cards');

const database = new DatabaseSync(':memory:');
database.exec(`
  CREATE TABLE mechanic_translations (
    mechanic_key TEXT PRIMARY KEY,
    name_en TEXT NOT NULL,
    name_ru TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT
  );
`);
assert.equal(loadConstructedMechanicTranslationMap(database).BATTLECRY, 'Боевой клич', 'the compatibility API map must retain defaults');
assert.deepEqual(loadConstructedMechanicOverrideMap(database), {}, 'the override map must contain only saved admin values');

const repairDatabase = new DatabaseSync(':memory:');
repairDatabase.exec(`
  CREATE TABLE mechanic_translations (
    mechanic_key TEXT PRIMARY KEY,
    name_en TEXT NOT NULL,
    name_ru TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT
  );
`);
repairDatabase.prepare(`
  INSERT INTO mechanic_translations (mechanic_key, name_en, name_ru, updated_at, updated_by)
  VALUES (?, ?, ?, ?, ?)
`).run('FRENZY', 'Frenzy', 'Замарозка', '2026-07-01T00:00:00.000Z', 'legacy-admin');
repairDatabase.prepare(`
  INSERT INTO mechanic_translations (mechanic_key, name_en, name_ru, updated_at, updated_by)
  VALUES (?, ?, ?, ?, ?)
`).run('QUICKDRAW', 'Quickdraw', 'Мой редакторский вариант', '2026-07-02T00:00:00.000Z', 'admin-1');
assert.equal(repairLegacyConstructedMechanicTranslations(repairDatabase, '2026-07-17T12:00:00.000Z'), 1);
assert.equal(loadConstructedMechanicTranslationMap(repairDatabase).FRENZY, 'Бешенство');
assert.equal(loadConstructedMechanicOverrideMap(repairDatabase).FRENZY, 'Бешенство');
assert.equal(
  loadConstructedMechanicTranslationMap(repairDatabase).QUICKDRAW,
  'Мой редакторский вариант',
  'the repair must not overwrite a custom admin translation',
);
assert.equal(repairLegacyConstructedMechanicTranslations(repairDatabase, '2026-07-17T12:00:01.000Z'), 0, 'the repair must be idempotent');
repairDatabase.close();

let auditAction = '';
const app = express();
app.use(express.json());
app.use('/api', createAdminMechanicTranslationRouter({
  adminGuard: (request, response, next) => {
    const identity = String(request.headers['x-test-user'] || '');
    if (!identity) return response.status(401).json({ error: 'Требуется вход' });
    if (identity !== 'admin') return response.status(403).json({ error: 'Доступ запрещён' });
    return next();
  },
  adminAuth: request => request.headers['x-test-user'] === 'admin' ? { id: 'admin-1' } : null,
  getDatabase: () => database,
  loadCards: async () => ({
    cards: [
      { card_id: 'SPELL_1', name: { ru: 'Заклинание' }, card_type: { slug: 'SPELL' }, mechanics: ['BATTLECRY'], images: { card: 'spell.png' } },
      { card_id: 'MINION_1', name: { ru: 'Существо-пример' }, card_type: { slug: 'MINION' }, mechanics: ['BATTLECRY', 'NEW_MECHANIC'], referenced_tags: ['DECK_RELATED'], images: { card: 'minion.png' } },
      { card_id: 'JAIL_430', name: { ru: 'Азалина Резец Душ' }, card_type: { slug: 'MINION' }, mechanics: [], referenced_tags: [], images: { card: 'azalina.png' } },
    ],
    updatedAt: null,
    sourceUrl: '',
  }),
  setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
  recordAudit: (_actor, action) => { auditAction = action; },
  now: () => new Date('2026-07-16T12:30:00.000Z'),
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}/api/admin/mechanic-translations`;
const adminHeaders = { 'Content-Type': 'application/json', 'X-Test-User': 'admin' };

try {
  assert.equal((await fetch(origin)).status, 401);
  assert.equal((await fetch(origin, { headers: { 'X-Test-User': 'user' } })).status, 403);

  const initialResponse = await fetch(origin, { headers: adminHeaders });
  assert.equal(initialResponse.status, 200);
  assert.equal(initialResponse.headers.get('cache-control'), 'private, no-store');
  const initial = await initialResponse.json() as any;
  assert.equal(initial.stats.total, 8);
  assert.equal(initial.stats.missing, 1);
  assert.equal(initial.stats.mechanics, 2);
  assert.equal(initial.stats.tags, 6);
  const battlecry = initial.items.find((item: any) => item.key === 'BATTLECRY');
  assert.equal(battlecry.nameRu, 'Боевой клич');
  assert.equal(battlecry.example.cardId, 'MINION_1');
  const copy = initial.items.find((item: any) => item.key === 'COPY');
  assert.equal(copy.nameRu, 'Копирование');
  assert.equal(copy.kind, 'tag');
  assert.equal(copy.example.cardId, 'JAIL_430');
  const tagResponse = await fetch(`${origin}?kind=tag`, { headers: adminHeaders });
  const tags = await tagResponse.json() as any;
  assert.equal(tags.items.length, 6);
  assert.equal(tags.items.find((item: any) => item.key === 'DECK_RELATED').kind, 'tag');

  const invalid = await fetch(`${origin}/NEW_MECHANIC`, {
    method: 'PUT', headers: adminHeaders, body: JSON.stringify({ nameEn: 'New Mechanic', nameRu: '' }),
  });
  assert.equal(invalid.status, 400);

  const saved = await fetch(`${origin}/NEW_MECHANIC`, {
    method: 'PUT', headers: adminHeaders, body: JSON.stringify({ nameEn: 'New Mechanic', nameRu: 'Новая механика' }),
  });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json() as any).translation.nameRu, 'Новая механика');
  assert.equal(loadConstructedMechanicTranslationMap(database).NEW_MECHANIC, 'Новая механика');
  assert.equal(auditAction, 'mechanic-translation.updated');

  const manualResponse = await fetch(`${origin}?status=manual`, { headers: adminHeaders });
  const manual = await manualResponse.json() as any;
  assert.equal(manual.items.length, 1);
  assert.equal(manual.items[0].source, 'manual');
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  database.close();
}

console.log('admin mechanic translation routes tests passed');
