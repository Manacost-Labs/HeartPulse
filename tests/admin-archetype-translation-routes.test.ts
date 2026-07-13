import assert from 'node:assert/strict';
import express from 'express';
// @ts-ignore: node:sqlite is available in the production Node 22 runtime.
import { DatabaseSync } from 'node:sqlite';
import {
  analyzeArchetypeTranslationCoverage,
  createAdminArchetypeTranslationRouter,
  normalizeArchetypeTranslation,
  normalizeBlizzcoreArchetypes,
  syncBlizzcoreArchetypes,
} from '../server/adminArchetypeTranslationRoutes.js';

assert.deepEqual(normalizeArchetypeTranslation({ nameEn: '  Control   Warrior ', nameRu: ' Контроль Воин ' }), {
  nameEn: 'Control Warrior',
  nameRu: 'Контроль Воин',
  nameKey: 'control warrior',
  nameRuKey: 'контроль воин',
});
assert.throws(() => normalizeArchetypeTranslation({ nameEn: 'Воин', nameRu: 'Воин' }));
assert.throws(() => normalizeBlizzcoreArchetypes([{ id: 1, name_en: 'Mage', name_ru: 'Маг' }, { id: 1, name_en: 'Warrior', name_ru: 'Воин' }]));
assert.deepEqual(
  normalizeBlizzcoreArchetypes([{ id: 197, name_en: 'Большой друид', name_ru: 'Большой Друид' }]),
  [{ id: 197, nameEn: 'Большой друид', nameRu: 'Большой Друид' }],
);

const database = new DatabaseSync(':memory:');
database.exec(`
  CREATE TABLE archetype_translations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    blizzcore_id INTEGER UNIQUE,
    name_en TEXT NOT NULL,
    name_en_key TEXT NOT NULL UNIQUE,
    name_ru TEXT NOT NULL,
    name_ru_key TEXT NOT NULL,
    source TEXT NOT NULL CHECK(source IN ('blizzcore', 'manual')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    synced_at TEXT,
    updated_by TEXT
  );
`);

let upstreamPayload: unknown = [
  { id: 11, name_en: 'Control Warrior', name_ru: 'Контроль Воин' },
  { id: 12, name_en: 'Tempo Mage', name_ru: 'Темпо Маг' },
];
let seedRuns = 0;
let invalidations = 0;
let observedFails = false;
const audit: string[] = [];
const timestamp = '2026-07-13T16:30:00.000Z';

const app = express();
app.use(express.json());
app.use('/api', createAdminArchetypeTranslationRouter({
  adminGuard: (request, response, next) => {
    const identity = String(request.headers['x-test-user'] || '');
    if (!identity) return response.status(401).json({ error: 'Требуется вход' });
    if (identity !== 'admin') return response.status(403).json({ error: 'Доступ запрещён для этого ID' });
    return next();
  },
  adminAuth: request => request.headers['x-test-user'] === 'admin' ? { id: 'admin-1' } : null,
  getDatabase: () => database,
  loadUpstream: async () => upstreamPayload,
  loadObservedArchetypes: async () => {
    if (observedFails) throw new Error('private upstream detail');
    return [
      { nameEn: 'Control Warrior', rank: 'Легенда' },
      { nameEn: 'Tempo Mage', rank: 'Алмаз 4-1' },
      { nameEn: 'New Priest', rank: 'Легенда' },
      { nameEn: 'New Priest', rank: 'Алмаз 4-1' },
    ];
  },
  ensureSeeded: async () => {
    const count = Number((database.prepare('SELECT COUNT(*) AS total FROM archetype_translations').get() as any).total);
    if (count) return;
    seedRuns += 1;
    syncBlizzcoreArchetypes(database, normalizeBlizzcoreArchetypes(upstreamPayload), 'system:test', timestamp);
  },
  setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
  invalidateTranslations: () => { invalidations += 1; },
  recordAudit: (_actor, action) => { audit.push(action); },
  now: () => new Date(timestamp),
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const baseUrl = `http://127.0.0.1:${address.port}/api`;
const adminHeaders = { 'Content-Type': 'application/json', 'X-Test-User': 'admin' };

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  return { response, body: await response.json() as any };
}

try {
  assert.equal((await request('/admin/archetype-translations')).response.status, 401);
  assert.equal((await request('/admin/archetype-translations', { headers: { 'X-Test-User': 'user' } })).response.status, 403);

  const seeded = await request('/admin/archetype-translations?pageSize=1', { headers: adminHeaders });
  assert.equal(seeded.response.status, 200);
  assert.equal(seeded.response.headers.get('cache-control'), 'private, no-store');
  assert.equal(seeded.body.total, 2);
  assert.equal(seeded.body.items.length, 1);
  assert.equal(seeded.body.pages, 2);
  assert.deepEqual(seeded.body.stats, {
    total: 2,
    manual: 0,
    blizzcore: 2,
    lastSyncedAt: timestamp,
  });
  assert.equal(seedRuns, 1);

  const coverage = await request('/admin/archetype-translations/untranslated', { headers: adminHeaders });
  assert.equal(coverage.response.status, 200);
  assert.deepEqual(coverage.body, {
    items: [{ nameEn: 'New Priest', ranks: ['Алмаз 4-1', 'Легенда'] }],
    totalObserved: 3,
    translated: 2,
    missing: 1,
    coveragePercent: 66.7,
  });
  assert.deepEqual(analyzeArchetypeTranslationCoverage(database, []), {
    items: [], totalObserved: 0, translated: 0, missing: 0, coveragePercent: 100,
  });

  observedFails = true;
  const unavailableCoverage = await request('/admin/archetype-translations/untranslated', { headers: adminHeaders });
  assert.equal(unavailableCoverage.response.status, 502);
  assert.deepEqual(unavailableCoverage.body, { error: 'Не удалось проверить актуальные архетипы' });
  observedFails = false;

  const invalid = await request('/admin/archetype-translations', {
    method: 'POST', headers: adminHeaders, body: JSON.stringify({ translation: { nameEn: '', nameRu: 'Пусто' } }),
  });
  assert.equal(invalid.response.status, 400);

  const created = await request('/admin/archetype-translations', {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ translation: { nameEn: 'Rainbow Mage', nameRu: 'Радужный Маг' } }),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.translation.source, 'manual');
  assert.equal(created.body.translation.updatedBy, 'admin-1');

  const duplicate = await request('/admin/archetype-translations', {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ translation: { nameEn: 'rainbow mage', nameRu: 'Дубль' } }),
  });
  assert.equal(duplicate.response.status, 409);

  const remoteId = Number((database.prepare('SELECT id FROM archetype_translations WHERE blizzcore_id = 11').get() as any).id);
  const edited = await request(`/admin/archetype-translations/${remoteId}`, {
    method: 'PATCH', headers: adminHeaders,
    body: JSON.stringify({ translation: { nameEn: 'Control Warrior', nameRu: 'Контрольный Воин' } }),
  });
  assert.equal(edited.response.status, 200);
  assert.equal(edited.body.translation.source, 'manual');
  assert.equal(edited.body.translation.nameRu, 'Контрольный Воин');
  assert.equal((await request('/admin/archetype-translations/9999', {
    method: 'PATCH', headers: adminHeaders,
    body: JSON.stringify({ translation: { nameEn: 'Missing', nameRu: 'Нет' } }),
  })).response.status, 404);

  upstreamPayload = [
    { id: 11, name_en: 'Control Warrior', name_ru: 'Перезаписать нельзя' },
    { id: 12, name_en: 'Tempo Mage', name_ru: 'Темповый Маг' },
    { id: 13, name_en: 'Token Druid', name_ru: 'Токен Друид' },
  ];
  const synced = await request('/admin/archetype-translations/sync', {
    method: 'POST', headers: adminHeaders, body: '{}',
  });
  assert.equal(synced.response.status, 200);
  assert.deepEqual({
    rows: synced.body.rows,
    imported: synced.body.imported,
    updated: synced.body.updated,
    preservedManual: synced.body.preservedManual,
  }, { rows: 3, imported: 1, updated: 1, preservedManual: 1 });
  assert.equal((database.prepare('SELECT name_ru FROM archetype_translations WHERE blizzcore_id = 11').get() as any).name_ru, 'Контрольный Воин');
  assert.equal((database.prepare('SELECT name_ru FROM archetype_translations WHERE blizzcore_id = 12').get() as any).name_ru, 'Темповый Маг');

  const filtered = await request('/admin/archetype-translations?source=manual&q=%D0%BC%D0%B0%D0%B3', { headers: adminHeaders });
  assert.equal(filtered.response.status, 200);
  assert.equal(filtered.body.total, 1);
  assert.equal(filtered.body.items[0].nameEn, 'Rainbow Mage');

  upstreamPayload = { unexpected: true };
  const invalidSync = await request('/admin/archetype-translations/sync', {
    method: 'POST', headers: adminHeaders, body: '{}',
  });
  assert.equal(invalidSync.response.status, 502);
  assert.equal(Number((database.prepare('SELECT COUNT(*) AS total FROM archetype_translations').get() as any).total), 4);
  assert.equal(invalidations, 3);
  assert.deepEqual(audit, [
    'archetype-translation.created',
    'archetype-translation.updated',
    'archetype-translation.synced',
  ]);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  database.close();
}

console.log('admin archetype-translation router contract tests passed');
