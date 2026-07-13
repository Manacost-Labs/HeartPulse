import assert from 'node:assert/strict';
import express from 'express';
import { createAdminMailingReadRouter } from '../server/adminMailingReadRoutes.js';

let failure: 'overview' | 'campaign' | null = null;
const app = express();
app.use('/api', createAdminMailingReadRouter({
  adminAuth: request => request.headers['x-admin'] === 'yes' ? { id: 'admin-1' } : null,
  overview: () => {
    if (failure === 'overview') throw new Error('/private/ecosystem.sqlite');
    return { summary: { eligible: 2 }, campaigns: [{ id: 'campaign-1' }] };
  },
  getCampaign: id => {
    if (failure === 'campaign') throw new Error('/private/ecosystem.sqlite');
    return id === 'campaign-1' ? { id, subject: 'Тема' } : null;
  },
  serializeCampaign: row => ({ ...row as object, serialized: true }),
  setPrivateNoStore: response => { response.set('Cache-Control', 'private, no-store'); },
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const address = server.address();
assert.ok(address && typeof address === 'object');
const base = `http://127.0.0.1:${address.port}/api/admin/mailings`;
const request = (path: string, admin = true) => fetch(`${base}${path}`, { headers: admin ? { 'X-Admin': 'yes' } : {} });

try {
  const forbidden = await request('/overview', false);
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.headers.get('cache-control'), 'private, no-store');

  const overview = await request('/overview');
  assert.equal(overview.status, 200);
  assert.equal(overview.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await overview.json(), { summary: { eligible: 2 }, campaigns: [{ id: 'campaign-1' }] });

  failure = 'overview';
  const failedOverview = await request('/overview');
  assert.equal(failedOverview.status, 500);
  assert.deepEqual(await failedOverview.json(), { error: 'Не удалось загрузить данные рассылок' });
  failure = null;

  for (const id of ['/bad%20id', `/${'a'.repeat(161)}`]) {
    const invalid = await request(id);
    assert.equal(invalid.status, 400);
  }
  assert.equal((await request('/missing')).status, 404);

  const campaign = await request('/campaign-1');
  assert.equal(campaign.status, 200);
  assert.deepEqual(await campaign.json(), { campaign: { id: 'campaign-1', subject: 'Тема', serialized: true } });

  failure = 'campaign';
  const failedCampaign = await request('/campaign-1');
  assert.equal(failedCampaign.status, 500);
  assert.deepEqual(await failedCampaign.json(), { error: 'Не удалось загрузить рассылку' });
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('admin mailing read router contract tests passed');
