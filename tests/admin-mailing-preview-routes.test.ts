import assert from 'node:assert/strict';
import express from 'express';
import {
  AdminMailingValidationError,
  createAdminMailingPreviewRouter,
  type AdminMailingDraft,
} from '../server/adminMailingPreviewRoutes.js';

let secretConfigured = true;
let storageFailure = false;
const app = express();
app.use(express.json({ strict: false }));
app.use('/api', createAdminMailingPreviewRouter({
  adminAuth: request => request.headers['x-admin'] === 'yes' ? { id: 'admin-1' } : null,
  csrfAllowed: request => request.headers['x-csrf-request'] === '1',
  signingSecretConfigured: () => secretConfigured,
  normalizeDraft: value => {
    const body = value as Partial<AdminMailingDraft> | null;
    if (!body?.subject?.trim()) throw new AdminMailingValidationError('Укажите тему письма');
    if (!body?.htmlBody?.trim()) throw new AdminMailingValidationError('HTML письма пуст');
    return {
      subject: body.subject.trim(), preheader: body.preheader || '', htmlBody: body.htmlBody,
      textBody: body.textBody || 'Текст', segment: body.segment || 'all-consented', templateKey: body.templateKey || 'custom',
    };
  },
  eligibleContacts: () => {
    if (storageFailure) throw new Error('/private/ecosystem.sqlite');
    return [{ id: 'contact-2' }, { id: 'contact-1' }];
  },
  renderPreview: draft => `<html>${draft.htmlBody}</html>`,
  previewDigest: (_draft, contacts) => `digest-${contacts.length}`,
  setPrivateNoStore: response => { response.set('Cache-Control', 'private, no-store'); },
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const url = `http://127.0.0.1:${address.port}/api/admin/mailings/preview`;

async function request(body: unknown, options: { admin?: boolean; csrf?: boolean } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.admin !== false) headers['X-Admin'] = 'yes';
  if (options.csrf !== false) headers['X-CSRF-Request'] = '1';
  return fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
}

try {
  const forbidden = await request({ subject: 'Тема', htmlBody: '<p>Текст</p>' }, { admin: false });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.headers.get('cache-control'), 'private, no-store');
  assert.equal((await request({ subject: 'Тема', htmlBody: '<p>Текст</p>' }, { csrf: false })).status, 403);

  secretConfigured = false;
  assert.equal((await request({ subject: 'Тема', htmlBody: '<p>Текст</p>' })).status, 503);
  secretConfigured = true;

  for (const body of [{}, { subject: 'Тема' }, { htmlBody: '<p>Текст</p>' }]) {
    const invalid = await request(body);
    assert.equal(invalid.status, 400);
  }

  const preview = await request({ subject: '  Тема  ', htmlBody: '<p>Текст</p>', segment: 'active' });
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await preview.json(), {
    subject: 'Тема', html: '<html><p>Текст</p></html>', text: 'Текст', recipientCount: 2,
    previewDigest: 'digest-2', sanitizedHtmlBody: '<p>Текст</p>',
  });

  storageFailure = true;
  const failed = await request({ subject: 'Тема', htmlBody: '<p>Текст</p>' });
  assert.equal(failed.status, 500);
  assert.deepEqual(await failed.json(), { error: 'Не удалось подготовить предпросмотр' });
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('admin mailing preview router contract tests passed');
