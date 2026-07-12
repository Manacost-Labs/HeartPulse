import assert from 'node:assert/strict';
import express from 'express';
import { createBattlegroundProxyRouter } from '../server/battlegroundProxyRoutes.js';

const calls: Array<{ kind: string; upstream: string; enriched: boolean }> = [];
const app = express();
const enrich = (payload: any) => ({ ...payload, enriched: true });
app.use('/api', createBattlegroundProxyRouter({
  requireAccess: (request, response, next) => request.headers.authorization === 'Bearer qa' ? next() : response.status(401).json({ error: 'subscription required' }),
  proxyLegacy: (_request, response, upstream) => {
    calls.push({ kind: 'legacy', upstream, enriched: false });
    return response.json({ kind: 'legacy', upstream });
  },
  proxyApp: (_request, response, upstream, payloadEnricher) => {
    calls.push({ kind: 'app', upstream, enriched: payloadEnricher === enrich });
    return response.json(payloadEnricher ? payloadEnricher({ kind: 'app', upstream }) : { kind: 'app', upstream });
  },
  proxyExtraLibrary: (_request, response, library) => {
    calls.push({ kind: 'extra', upstream: library, enriched: false });
    return response.json({ kind: 'extra', library });
  },
  enrichHeroPayload: enrich,
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const address = server.address();
assert.ok(address && typeof address === 'object');
const baseUrl = `http://127.0.0.1:${address.port}/api`;
const authorized = { Authorization: 'Bearer qa' };

try {
  const denied = await fetch(`${baseUrl}/bg/heroes`);
  assert.equal(denied.status, 401);
  assert.equal(calls.length, 0);

  const legacy = await fetch(`${baseUrl}/battlegrounds-spells`, { headers: authorized });
  assert.equal(legacy.status, 200);
  assert.deepEqual(await legacy.json(), { kind: 'legacy', upstream: '/api/battlegrounds-spells' });

  const cards = await fetch(`${baseUrl}/bg/library/cards`, { headers: authorized });
  assert.deepEqual(await cards.json(), { kind: 'app', upstream: '/api/bg/library/cards' });

  const encoded = await fetch(`${baseUrl}/bg/library/minions/123%2F456/history`, { headers: authorized });
  assert.deepEqual(await encoded.json(), { kind: 'app', upstream: '/api/bg/library/minions/123%2F456/history' });

  const hero = await fetch(`${baseUrl}/bg/heroes/777/details`, { headers: authorized });
  assert.deepEqual(await hero.json(), { kind: 'app', upstream: '/api/bg/heroes/777/details', enriched: true });

  const extra = await fetch(`${baseUrl}/bg/library/extra/trinket`, { headers: authorized });
  assert.deepEqual(await extra.json(), { kind: 'extra', library: 'trinket' });

  assert.deepEqual(calls, [
    { kind: 'legacy', upstream: '/api/battlegrounds-spells', enriched: false },
    { kind: 'app', upstream: '/api/bg/library/cards', enriched: false },
    { kind: 'app', upstream: '/api/bg/library/minions/123%2F456/history', enriched: false },
    { kind: 'app', upstream: '/api/bg/heroes/777/details', enriched: true },
    { kind: 'extra', upstream: 'trinket', enriched: false },
  ]);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('battleground proxy router contract tests passed');
