import assert from 'node:assert/strict';
import express from 'express';
// @ts-ignore: node:sqlite is available in the production Node 22 runtime.
import { DatabaseSync } from 'node:sqlite';
import { createReferralRouter, normalizeReferralTarget, slugifyReferral } from '../server/referralRoutes.js';

assert.equal(slugifyReferral('Летняя акция', 1), 'letnyaya-akciya');
assert.equal(slugifyReferral('', 36), 'ref-10');
assert.equal(normalizeReferralTarget('https://arena.hs-manacost.ru/contests?from=qa#entry', 'https://arena.hs-manacost.ru'), '/contests?from=qa#entry');
assert.equal(normalizeReferralTarget('https://evil.example/contests', 'https://arena.hs-manacost.ru'), '/');
assert.equal(normalizeReferralTarget('//evil.example', 'https://arena.hs-manacost.ru'), '//evil.example');

const database = new DatabaseSync(':memory:');
database.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE referral_links (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    campaign TEXT NOT NULL DEFAULT '',
    target_path TEXT NOT NULL DEFAULT '/',
    status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE referral_clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    referral_id TEXT NOT NULL,
    clicked_at TEXT NOT NULL,
    ip_hash TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    referrer TEXT NOT NULL DEFAULT '',
    landing_path TEXT NOT NULL DEFAULT '',
    FOREIGN KEY(referral_id) REFERENCES referral_links(id) ON DELETE CASCADE
  );
`);

let idSequence = 0;
const app = express();
app.use(express.json());
app.use('/api', createReferralRouter({
  getDatabase: () => database,
  adminGuard: (request, response, next) => {
    const identity = String(request.headers['x-test-user'] || '');
    if (!identity) return response.status(401).json({ error: 'Требуется вход' });
    if (identity !== 'admin') return response.status(403).json({ error: 'Доступ запрещён для этого ID' });
    next();
  },
  adminAuth: request => request.headers['x-test-user'] === 'admin' ? { id: 'admin-1' } : null,
  appUrl: 'https://arena.hs-manacost.ru',
  clientIp: () => '203.0.113.12',
  ipHashSalt: 'test-referral-salt',
  now: () => new Date('2026-07-12T08:15:00.000Z'),
  createId: () => `ref-test-${++idSequence}`,
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});

const address = server.address();
assert.ok(address && typeof address === 'object');
const baseUrl = `http://127.0.0.1:${address.port}/api`;

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  return { response, body: await response.json() as any };
}

try {
  const anonymousList = await request('/admin/referrals');
  assert.equal(anonymousList.response.status, 401);
  assert.deepEqual(anonymousList.body, { error: 'Требуется вход' });

  const forbiddenList = await request('/admin/referrals', { headers: { 'X-Test-User': 'user' } });
  assert.equal(forbiddenList.response.status, 403);

  const missingLabel = await request('/admin/referrals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test-User': 'admin' },
    body: JSON.stringify({ label: '  ' }),
  });
  assert.equal(missingLabel.response.status, 400);
  assert.deepEqual(missingLabel.body, { error: 'Название ссылки обязательно' });

  const created = await request('/admin/referrals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test-User': 'admin' },
    body: JSON.stringify({
      label: 'Летняя акция',
      slug: 'summer',
      campaign: 'qa',
      targetPath: '/contests?from=qa',
      status: 'active',
    }),
  });
  assert.equal(created.response.status, 200);
  assert.deepEqual(created.body, {
    success: true,
    referral: {
      id: 'ref-test-1',
      slug: 'summer',
      label: 'Летняя акция',
      campaign: 'qa',
      targetPath: '/contests?from=qa',
      status: 'active',
      createdBy: 'admin-1',
      createdAt: '2026-07-12T08:15:00.000Z',
      updatedAt: '2026-07-12T08:15:00.000Z',
      url: 'https://arena.hs-manacost.ru/r/summer',
      clicks: 0,
      uniqueClicks: 0,
      lastClickAt: '',
    },
  });

  const duplicate = await request('/admin/referrals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test-User': 'admin' },
    body: JSON.stringify({ label: 'Duplicate', slug: 'summer' }),
  });
  assert.equal(duplicate.response.status, 409);
  assert.deepEqual(duplicate.body, { error: 'Такой slug уже занят' });

  const missingTrack = await request('/referrals/track/missing', { method: 'POST' });
  assert.equal(missingTrack.response.status, 404);
  assert.deepEqual(missingTrack.body, {
    error: 'Ссылка не найдена',
    targetUrl: 'https://arena.hs-manacost.ru/',
  });

  const tracked = await request('/referrals/track/summer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Referral route test',
      Referer: 'https://example.test/post',
    },
    body: JSON.stringify({ landingPath: '/source/page' }),
  });
  assert.equal(tracked.response.status, 200);
  assert.deepEqual(tracked.body, {
    success: true,
    targetPath: '/contests?from=qa',
    targetUrl: 'https://arena.hs-manacost.ru/contests?from=qa',
  });

  const clickRow = database.prepare('SELECT * FROM referral_clicks').get() as Record<string, unknown>;
  assert.equal(clickRow.referral_id, 'ref-test-1');
  assert.equal(clickRow.clicked_at, '2026-07-12T08:15:00.000Z');
  assert.equal(String(clickRow.ip_hash).length, 64);
  assert.notEqual(clickRow.ip_hash, '203.0.113.12');
  assert.equal(clickRow.user_agent, 'Referral route test');
  assert.equal(clickRow.referrer, 'https://example.test/post');
  assert.equal(clickRow.landing_path, '/source/page');

  const listed = await request('/admin/referrals', { headers: { 'X-Test-User': 'admin' } });
  assert.equal(listed.response.status, 200);
  assert.equal(listed.body.referrals.length, 1);
  assert.equal(listed.body.referrals[0].clicks, 1);
  assert.equal(listed.body.referrals[0].uniqueClicks, 1);
  assert.equal(listed.body.recentClicks.length, 1);
  assert.equal(listed.body.recentClicks[0].id, '1');
  assert.equal(listed.body.recentClicks[0].slug, 'summer');
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  database.close();
}

console.log('referral router contract tests passed');
