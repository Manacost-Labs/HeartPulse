import assert from 'node:assert/strict';
import express from 'express';
import { createAdminTelegramReadRouter } from '../server/adminTelegramReadRoutes.js';

let failure = false;
let capturedSql = '';
const rows = [
  {
    id: 'telegram-access', name: 'VIP', email: 'vip@example.test', role: 'user', telegram_id: '1001', telegram_username: '@vip',
    telegram_oidc_id: 'oidc-1', telegram_photo_url: '/avatar.webp', subscription_source: 'telegram', has_access: 1,
    subscription_checked_at: '2026-07-13T02:30:00.000Z', subscription_updated_at: '2026-07-13T02:30:00.000Z',
    telegram_json: JSON.stringify({ hasAccess: true, entitlements: { arena: true }, chats: [{ chatId: '-1001', status: 'member' }] }),
    boosty_json: JSON.stringify({ hasAccess: false }), created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-13T02:30:00.000Z',
  },
  {
    id: 'contact-only', name: 'Contact', email: 'contact@example.test', contact_telegram: '@contact', subscription_source: 'profile',
    subscription_checked_at: '2026-07-01T00:00:00.000Z', telegram_json: '{}', boosty_json: '{}',
  },
  {
    id: 'blocked', name: 'Blocked', telegram_id: '1002', blocked_at: '2026-07-12T00:00:00.000Z', subscription_source: 'none',
    telegram_json: '{}', boosty_json: '{}',
  },
  { id: 'plain-user', name: 'Plain', subscription_source: 'none', telegram_json: '{}', boosty_json: '{}' },
];

const parseObject = (value: unknown) => {
  try { const parsed = JSON.parse(String(value || '{}')); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
};
const app = express();
app.use('/api', createAdminTelegramReadRouter({
  adminAuth: request => request.headers['x-admin'] === 'yes' ? { id: 'admin-1' } : null,
  repository: { all: sql => { capturedSql = sql; if (failure) throw new Error('/private/ecosystem.sqlite'); return rows; } },
  safeJsonObject: parseObject,
  normalizeBoosty: detail => detail,
  normalizeTelegram: detail => detail,
  deriveEntitlements: (_hasAccess, _source, _boosty, telegram) => telegram.entitlements || {},
  hasAnyEntitlement: entitlements => Object.values(entitlements).some(Boolean),
  subscriptionRefreshMs: 60 * 60 * 1000,
  configured: () => true,
  chatIds: () => ['-1001'],
  setPrivateNoStore: response => { response.set('Cache-Control', 'private, no-store'); },
  now: () => new Date('2026-07-13T03:00:00.000Z'),
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const address = server.address();
assert.ok(address && typeof address === 'object');
const endpoint = `http://127.0.0.1:${address.port}/api/admin/telegram/accounts`;
const request = (admin = true) => fetch(endpoint, { headers: admin ? { 'X-Admin': 'yes' } : {} });

try {
  const forbidden = await request(false);
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.headers.get('cache-control'), 'private, no-store');

  const response = await request();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const payload = await response.json() as any;
  assert.match(capturedSql, /LEFT JOIN identities tg/);
  assert.match(capturedSql, /LEFT JOIN subscriptions/);
  assert.equal(payload.configured, true);
  assert.deepEqual(payload.chatIds, ['-1001']);
  assert.deepEqual(payload.summary, { total: 3, access: 1, checkable: 0, contactOnly: 1, stale: 2, blocked: 1 });
  assert.equal(payload.fetchedAt, '2026-07-13T03:00:00.000Z');
  assert.deepEqual(payload.accounts.map((account: any) => account.id), ['telegram-access', 'contact-only', 'blocked']);
  assert.equal(payload.accounts[0].telegramUsername, 'vip');
  assert.equal(payload.accounts[0].accessState, 'access');
  assert.equal(payload.accounts[0].hasAccess, true);
  assert.equal(payload.accounts[0].stale, false);
  assert.equal(payload.accounts[1].accessState, 'contact-only');
  assert.equal(payload.accounts[2].accessState, 'blocked');

  failure = true;
  const failed = await request();
  assert.equal(failed.status, 500);
  assert.equal(failed.headers.get('cache-control'), 'private, no-store');
  const failedPayload = await failed.json();
  assert.deepEqual(failedPayload, { error: 'Не удалось загрузить Telegram-аккаунты' });
  assert.doesNotMatch(JSON.stringify(failedPayload), /private|sqlite/i);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('admin Telegram read router contract tests passed');
