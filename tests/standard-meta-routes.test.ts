import assert from 'node:assert/strict';
import express, { type RequestHandler } from 'express';
import {
  createStandardMetaRouter,
  type StandardMetaRecommendation,
  type StandardMetaRouterDependencies,
} from '../server/standardMetaRoutes.js';

const calls: string[] = [];
const recommendation: StandardMetaRecommendation = {
  archetype: 'Mug Shaman',
  archetypeLabel: 'Кружечный Шаман',
  deckCode: 'AAECAaoIAtDbB9lBw6vnwTTvgbRmwfwqgf8rQe8sQfLtgfDwAfTwAf3wAfH2wfK2wfN2wfa3wcAAA==',
  format: 'standard',
  rank: 'legend',
  source: 'hsguru-streamer',
  sourceUrl: 'https://example.test/deck',
  streamer: 'Tester',
  sampleGames: 20,
  winrate: 60,
  updatedAt: '2026-07-13T12:00:00.000Z',
  classKey: 'shaman',
  matchedArchetype: 'Mug Shaman',
  matchMethod: 'exact',
};

const adminGuard: RequestHandler = (request, response, next) => {
  if (request.headers['x-test-admin'] !== 'yes') return response.status(403).json({ error: 'admin only' });
  next();
};

const dependencies: StandardMetaRouterDependencies = {
  adminGuard,
  loadMeta: async (format, rank) => {
    calls.push(`meta:${format}:${rank}`);
    return { format, rank, items: [{ archetype: 'Mug Shaman' }] };
  },
  loadViciousGold: async () => {
    calls.push('vicious-gold');
    return { games: 355561, deckDistribution: [{ deck: 'Mug Shaman', frequency: 7.36 }] };
  },
  findRecommendation: async (archetype, _label, format, rank) => {
    calls.push(`recommendation:${archetype}:${format}:${rank}`);
    return archetype === recommendation.archetype ? { ...recommendation, format, rank } : null;
  },
  createPreview: async selected => {
    calls.push(`preview:${selected.deckCode.slice(0, 8)}`);
    return { hash: 'abc12345', state: 'queued', ready: false, imageUrl: null, error: null };
  },
  getPreview: async hash => {
    calls.push(`status:${hash}`);
    return { hash, state: 'done', ready: true, imageUrl: 'https://example.test/deck.jpg', error: null };
  },
  setPrivateNoStore: response => {
    response.set('Cache-Control', 'no-store');
    response.vary('Cookie');
  },
};

const app = express();
app.use(express.json());
app.use('/api', createStandardMetaRouter(dependencies));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}/api`;
const adminHeaders = { 'X-Test-Admin': 'yes' };

try {
  const denied = await fetch(`${origin}/admin/standard-meta`);
  assert.equal(denied.status, 403);
  assert.deepEqual(calls, []);

  const publicMeta = await fetch(`${origin}/standard-meta?format=standard&rank=legend`);
  assert.equal(publicMeta.status, 200, 'the released Standard meta must be public');
  assert.equal((await publicMeta.json() as any).format, 'standard');
  calls.length = 0;

  const invalid = await fetch(`${origin}/admin/standard-meta?format=classic&rank=bronze`, { headers: adminHeaders });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.headers.get('cache-control'), 'no-store');

  const meta = await fetch(`${origin}/admin/standard-meta?format=wild&rank=top_5k`, { headers: adminHeaders });
  assert.equal(meta.status, 200);
  assert.deepEqual(await meta.json(), { format: 'wild', rank: 'top_5k', items: [{ archetype: 'Mug Shaman' }] });
  assert.deepEqual(calls, ['meta:wild:top_5k']);

  const deniedVicious = await fetch(`${origin}/admin/vicious-syndicate-gold`);
  assert.equal(deniedVicious.status, 403);

  const vicious = await fetch(`${origin}/admin/vicious-syndicate-gold`, { headers: adminHeaders });
  assert.equal(vicious.status, 200);
  assert.equal(vicious.headers.get('cache-control'), 'no-store');
  assert.equal((await vicious.json() as any).deckDistribution[0].deck, 'Mug Shaman');
  assert.ok(calls.includes('vicious-gold'));

  const missing = await fetch(`${origin}/admin/standard-meta/recommendation?archetype=Unknown&format=standard&rank=legend`, { headers: adminHeaders });
  assert.equal(missing.status, 404);

  const selected = await fetch(`${origin}/admin/standard-meta/recommendation?archetype=Mug%20Shaman&archetypeLabel=Test&format=standard&rank=legend`, { headers: adminHeaders });
  assert.equal(selected.status, 200);
  assert.equal((await selected.json() as any).recommendation.deckCode, recommendation.deckCode);

  const preview = await fetch(`${origin}/admin/standard-meta/preview`, {
    method: 'POST',
    headers: { ...adminHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      archetype: 'Mug Shaman',
      archetypeLabel: 'Кружечный Шаман',
      format: 'standard',
      rank: 'legend',
      deckCode: 'malicious-client-code-must-be-ignored',
    }),
  });
  assert.equal(preview.status, 202);
  assert.equal((await preview.json() as any).preview.hash, 'abc12345');
  assert.ok(calls.some(call => call.startsWith(`preview:${recommendation.deckCode.slice(0, 8)}`)));

  const invalidHash = await fetch(`${origin}/admin/standard-meta/preview/!`, { headers: adminHeaders });
  assert.equal(invalidHash.status, 400);
  const ready = await fetch(`${origin}/admin/standard-meta/preview/abc12345`, { headers: adminHeaders });
  assert.equal(ready.status, 200);
  assert.equal((await ready.json() as any).preview.ready, true);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('standard meta public/admin router contract tests passed');
