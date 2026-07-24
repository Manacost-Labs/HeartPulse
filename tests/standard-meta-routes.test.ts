import assert from 'node:assert/strict';
import express, { type RequestHandler } from 'express';
import {
  createStandardMetaRouter,
  type StandardMetaRecommendation,
  type StandardMetaRouterDependencies,
} from '../server/standardMetaRoutes.js';
import { STANDARD_META_MEDIA_TYPE } from '../shared/standardMetaContract.js';

const calls: string[] = [];
const sourceUpdatedAt = '2026-07-21T05:05:30.230Z';
const metaItems = Array.from({ length: 5 }, (_, index) => ({
  id: `meta-${index + 1}`,
  archetype: index === 0 ? 'Mug Shaman' : `Archetype ${index + 1}`,
  archetypeLabel: index === 0 ? 'Кружечный Шаман' : `Архетип ${index + 1}`,
  translated: true,
  classKey: index === 0 ? 'shaman' : 'warrior',
  winrate: 55 - index,
  popularity: 20 - index,
  games: 1_000 - index * 50,
  turns: 8 + index / 10,
  durationMinutes: 7 + index / 10,
  climbingSpeed: 0.5 - index / 10,
}));
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
  accessGuard: (request, response, next) => {
    if (request.headers['x-test-access'] !== 'allowed') return response.status(403).json({ error: 'diamond only' });
    next();
  },
  loadMeta: async (format, rank, period, coin, minGames) => {
    calls.push(`meta:${format}:${rank}:${period}:${coin}:${minGames}`);
    return {
      publicationMode: 'stable',
      publishedAt: sourceUpdatedAt,
      format,
      formatLabel: format === 'standard' ? 'Стандарт' : 'Вольный',
      rank,
      rankLabel: rank,
      period,
      coin,
      minGames,
      source: 'hsguru',
      sourceId: `hsguru-meta-${format}-${rank}`,
      sourceUrl: 'https://example.test/meta',
      translationSource: 'database',
      updatedAt: sourceUpdatedAt,
      items: rank === 'top_legend'
        ? metaItems.map(item => ({ ...item, winrate: 100 }))
        : metaItems,
    };
  },
  loadViciousGold: async () => {
    calls.push('vicious-gold');
    return { games: 355561, deckDistribution: [{ deck: 'Mug Shaman', frequency: 7.36 }] };
  },
  findRecommendation: async (archetype, _label, format, rank) => {
    calls.push(`recommendation:${archetype}:${format}:${rank}`);
    if (archetype === 'Upstream Failure') throw new Error('temporary upstream failure');
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

  const deniedPublicMeta = await fetch(`${origin}/standard-meta?format=standard&rank=legend`);
  assert.equal(deniedPublicMeta.status, 403, 'Standard meta requires the Diamond entitlement');
  const publicMeta = await fetch(`${origin}/standard-meta?format=standard&rank=legend`, { headers: { 'X-Test-Access': 'allowed' } });
  assert.equal(publicMeta.status, 200);
  assert.equal((await publicMeta.json() as any).format, 'standard');
  calls.length = 0;

  const defaultMeta = await fetch(`${origin}/standard-meta?format=standard`, { headers: { 'X-Test-Access': 'allowed' } });
  assert.equal(defaultMeta.status, 200);
  assert.equal((await defaultMeta.json() as any).rank, 'diamond_all');
  assert.deepEqual(calls, ['meta:standard:diamond_all:past_day:any_player:100']);
  calls.length = 0;

  const aggregateMeta = await fetch(`${origin}/standard-meta?format=standard&rank=all&period=past_day&coin=any_player&min_games=100`, { headers: { 'X-Test-Access': 'allowed' } });
  assert.equal(aggregateMeta.status, 200);
  assert.equal((await aggregateMeta.json() as any).rank, 'all');
  assert.deepEqual(calls, ['meta:standard:all:past_day:any_player:100']);
  calls.length = 0;

  for (const rank of ['diamond_all', 'diamond_legend']) {
    const extendedDiamondMeta = await fetch(
      `${origin}/standard-meta?format=standard&rank=${rank}&period=past_day&coin=any_player&min_games=100`,
      { headers: { 'X-Test-Access': 'allowed' } },
    );
    assert.equal(extendedDiamondMeta.status, 200);
    assert.equal((await extendedDiamondMeta.json() as any).rank, rank);
    assert.deepEqual(calls, [`meta:standard:${rank}:past_day:any_player:100`]);
    calls.length = 0;
  }

  const sixHourMeta = await fetch(`${origin}/standard-meta?format=wild&rank=legend&period=past_6_hours&coin=any_player&min_games=500`, { headers: { 'X-Test-Access': 'allowed' } });
  assert.equal(sixHourMeta.status, 200);
  assert.equal((await sixHourMeta.json() as any).period, 'past_6_hours');
  assert.deepEqual(calls, ['meta:wild:legend:past_6_hours:any_player:500']);
  calls.length = 0;

  const invalid = await fetch(`${origin}/admin/standard-meta?format=classic&rank=bronze`, { headers: adminHeaders });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.headers.get('cache-control'), 'no-store');

  const meta = await fetch(`${origin}/admin/standard-meta?format=wild&rank=top_5k&period=past_2_weeks&coin=any_player&min_games=5000`, { headers: adminHeaders });
  assert.equal(meta.status, 200);
  const legacyMeta = await meta.json() as any;
  assert.equal(legacyMeta.format, 'wild');
  assert.equal(legacyMeta.rank, 'top_5k');
  assert.equal(legacyMeta.items.length, 5);
  assert.equal(legacyMeta.schemaVersion, undefined, 'ordinary Accept remains compatible with the previous response shape');
  assert.equal(meta.headers.get('vary')?.includes('Accept'), true);
  assert.match(meta.headers.get('x-dataset-version') ?? '', /^sm1-[a-f0-9]{20}$/);
  assert.deepEqual(calls, ['meta:wild:top_5k:past_2_weeks:any_player:5000']);

  const removedCoin = await fetch(`${origin}/admin/standard-meta?format=standard&rank=legend&period=past_day&coin=on_coin&min_games=100`, { headers: adminHeaders });
  assert.equal(removedCoin.status, 400);

  const removedThreshold = await fetch(`${origin}/admin/standard-meta?format=standard&rank=legend&period=past_day&coin=any_player&min_games=7500`, { headers: adminHeaders });
  assert.equal(removedThreshold.status, 400);

  const versionedMeta = await fetch(`${origin}/admin/standard-meta?format=standard&rank=legend`, {
    headers: { ...adminHeaders, Accept: STANDARD_META_MEDIA_TYPE },
  });
  assert.equal(versionedMeta.status, 200);
  const envelope = await versionedMeta.json() as any;
  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.dataset, 'standard-meta');
  assert.equal(envelope.mode, 'stable');
  assert.equal(envelope.data.items[0].archetype, 'Mug Shaman');
  assert.equal(envelope.quality.status, 'pass');
  assert.equal(versionedMeta.headers.get('content-type')?.startsWith(STANDARD_META_MEDIA_TYPE), true);

  const declinedEnvelope = await fetch(`${origin}/admin/standard-meta?format=standard&rank=legend`, {
    headers: { ...adminHeaders, Accept: `${STANDARD_META_MEDIA_TYPE}; q=0, application/json` },
  });
  assert.equal(declinedEnvelope.status, 200);
  assert.match(declinedEnvelope.headers.get('content-type') ?? '', /^application\/json/);
  assert.equal((await declinedEnvelope.json() as any).schemaVersion, undefined);

  const rejectedMeta = await fetch(`${origin}/admin/standard-meta?format=standard&rank=top_legend`, {
    headers: { ...adminHeaders, Accept: STANDARD_META_MEDIA_TYPE },
  });
  assert.equal(rejectedMeta.status, 502, 'widespread impossible winrates must fail before outbound response');

  const deniedVicious = await fetch(`${origin}/admin/vicious-syndicate-gold`);
  assert.equal(deniedVicious.status, 403);

  const vicious = await fetch(`${origin}/admin/vicious-syndicate-gold`, { headers: adminHeaders });
  assert.equal(vicious.status, 200);
  assert.equal(vicious.headers.get('cache-control'), 'no-store');
  assert.equal((await vicious.json() as any).deckDistribution[0].deck, 'Mug Shaman');
  assert.ok(calls.includes('vicious-gold'));

  const missing = await fetch(`${origin}/admin/standard-meta/recommendation?archetype=Unknown&format=standard&rank=legend`, { headers: adminHeaders });
  assert.equal(missing.status, 404);

  const upstreamFailure = await fetch(`${origin}/admin/standard-meta/recommendation?archetype=Upstream%20Failure&format=standard&rank=legend`, { headers: adminHeaders });
  assert.equal(upstreamFailure.status, 502, 'a transient lookup failure must not be presented as a missing deck');
  assert.deepEqual(await upstreamFailure.json(), { error: 'Не удалось подобрать сборку' });

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
