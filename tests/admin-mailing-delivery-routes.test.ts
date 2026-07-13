import assert from 'node:assert/strict';
import express, { type RequestHandler } from 'express';
import { AdminMailingValidationError, type AdminMailingDraft } from '../server/adminMailingPreviewRoutes.js';
import { AdminMailingDeliveryError, createAdminMailingDeliveryRouter } from '../server/adminMailingDeliveryRoutes.js';

const pass: RequestHandler = (_request, _response, next) => next();
let secret = true;
let transportFailure = false;
let queueFailure: Error | null = null;
let auditFailure = false;
let scheduleFailure = false;
let sentTests = 0;
let queuedCampaigns = 0;
let sideEffectErrors: string[] = [];

const normalizeDraft = (value: unknown): AdminMailingDraft => {
  const body = value as Partial<AdminMailingDraft> | null;
  if (!body?.subject?.trim()) throw new AdminMailingValidationError('Укажите тему письма');
  if (!body?.htmlBody?.trim()) throw new AdminMailingValidationError('HTML письма пуст');
  return { subject: body.subject.trim(), preheader: '', htmlBody: body.htmlBody, textBody: 'Текст', segment: 'active', templateKey: 'custom' };
};

const app = express();
app.use(express.json({ strict: false }));
app.use('/api', createAdminMailingDeliveryRouter({
  adminGuard: pass,
  testLimiter: pass,
  sendLimiter: pass,
  adminAuth: request => request.headers['x-admin'] === 'yes' ? { id: 'admin-1', email: String(request.headers['x-email'] || 'admin@example.test') } : null,
  csrfAllowed: request => request.headers['x-csrf-request'] === '1',
  signingSecretConfigured: () => secret,
  normalizeDraft,
  isRealEmail: email => email.includes('@'),
  sendTest: async () => {
    if (transportFailure) throw new Error('/usr/sbin/sendmail: private failure');
    sentTests += 1;
  },
  queueCampaign: (_admin, _draft, expectedRecipients, digest) => {
    if (queueFailure) throw queueFailure;
    if (!Number.isInteger(expectedRecipients) || expectedRecipients !== 2) throw new AdminMailingDeliveryError(409, 'Аудитория изменилась: сейчас 2. Обновите предпросмотр.');
    if (digest !== 'valid-digest') throw new AdminMailingDeliveryError(409, 'Предпросмотр устарел или содержимое письма изменилось. Обновите предпросмотр.');
    queuedCampaigns += 1;
    return { campaign: { id: 'campaign-1', status: 'queued' }, recipientCount: 2 };
  },
  recordAudit: () => { if (auditFailure) throw new Error('/private/audit.sqlite'); },
  scheduleCampaign: () => { if (scheduleFailure) throw new Error('worker unavailable'); },
  setPrivateNoStore: response => { response.set('Cache-Control', 'private, no-store'); },
  onSideEffectError: (_error, operation) => { sideEffectErrors.push(operation); },
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const address = server.address();
assert.ok(address && typeof address === 'object');
const base = `http://127.0.0.1:${address.port}/api/admin/mailings`;
const draft = { subject: 'Тема', htmlBody: '<p>Текст</p>' };

async function request(path: 'test' | 'send', body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${base}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin': 'yes', 'X-CSRF-Request': '1', ...headers },
    body: JSON.stringify(body),
  });
}

try {
  const forbidden = await request('test', draft, { 'X-Admin': 'no' });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.headers.get('cache-control'), 'private, no-store');
  assert.equal((await request('test', draft, { 'X-CSRF-Request': '0' })).status, 403);
  assert.equal((await request('test', draft, { 'X-Email': 'invalid' })).status, 400);

  secret = false;
  assert.equal((await request('test', draft)).status, 503);
  secret = true;
  assert.equal((await request('test', {})).status, 400);

  transportFailure = true;
  const transport = await request('test', draft);
  assert.equal(transport.status, 502);
  assert.deepEqual(await transport.json(), { error: 'Почтовый транспорт не принял тестовое письмо' });
  transportFailure = false;

  auditFailure = true;
  const testSent = await request('test', draft);
  assert.equal(testSent.status, 200);
  assert.equal(sentTests, 1);
  assert.deepEqual(sideEffectErrors, ['test-audit']);
  auditFailure = false;

  assert.equal((await request('send', draft)).status, 400);
  const staleAudience = await request('send', { ...draft, confirmation: 'SEND', expectedRecipients: 1, previewDigest: 'valid-digest' });
  assert.equal(staleAudience.status, 409);
  const stalePreview = await request('send', { ...draft, confirmation: 'SEND', expectedRecipients: 2, previewDigest: 'invalid' });
  assert.equal(stalePreview.status, 409);

  queueFailure = new Error('/private/ecosystem.sqlite');
  const storage = await request('send', { ...draft, confirmation: 'SEND', expectedRecipients: 2, previewDigest: 'valid-digest' });
  assert.equal(storage.status, 500);
  assert.deepEqual(await storage.json(), { error: 'Не удалось поставить рассылку в очередь' });
  queueFailure = null;

  auditFailure = true;
  scheduleFailure = true;
  sideEffectErrors = [];
  const queued = await request('send', { ...draft, confirmation: 'SEND', expectedRecipients: 2, previewDigest: 'valid-digest' });
  assert.equal(queued.status, 202);
  assert.equal(queuedCampaigns, 1);
  assert.deepEqual(sideEffectErrors, ['queue-audit', 'queue-schedule']);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('admin mailing delivery router contract tests passed');
