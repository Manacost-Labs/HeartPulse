import assert from 'node:assert/strict';
import express from 'express';
import { createBattlegroundLibraryAuxiliaryPublicRouter } from '../server/modules/battlegroundLibrary/auxiliaryPublicRoutes.js';
import { sameOriginPublicResourceUrl } from '../shared/publicResourceUrl.js';

const source = {
  dbf: 119142,
  card_id: 'BGDUO_Anomaly_005',
  name: { ru: 'Сила <script>секрет</script> в бутылке' },
  text: { ru: 'В начале хода <b>получите</b> карту.' },
  images: { card: 'https://art.hearthstonejson.com/v1/bgs/latest/ruRU/512x/BGDUO_Anomaly_005.png' },
  in_pool: true,
  winrate: 'QA_PRIVATE_WINRATE',
  statsAccess: 'QA_PRIVATE_ACCESS',
};
const calls: URL[] = [];
let upstreamStatus = 200;
let upstreamData: unknown[] = [source];
const fetchImpl: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  calls.push(url);
  assert.equal((init?.headers as Record<string, string>)?.Authorization, undefined);
  return new Response(JSON.stringify({ data: upstreamData, pagination: { total: upstreamData.length } }), {
    status: upstreamStatus, headers: { 'Content-Type': 'application/json' },
  });
};
const app = express();
app.use(createBattlegroundLibraryAuxiliaryPublicRouter({
  fetchImpl, apiBaseUrl: 'https://api.kolodahearthstone.com/api/v1', retryAfterSeconds: 42,
  publicImageUrl: value => sameOriginPublicResourceUrl(value, 'https://hearthpulse.net')
    ?? 'https://hearthpulse.net/assets/og-preview.png',
}));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address();
assert.ok(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}`;

try {
  const response = await fetch(`${origin}/api/bg/library/public/extra/current/anomalies/119142`, {
    headers: { Cookie: 'session=private', Authorization: 'Bearer private' },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  const body = await response.text();
  assert.doesNotMatch(body, /QA_PRIVATE|winrate|statsAccess|<script>/);
  const projection = JSON.parse(body);
  assert.equal(projection.card.dbfId, 119142);
  assert.equal(projection.card.nameRu, 'Сила секрет в бутылке');
  assert.equal(projection.card.textRu, 'В начале хода получите карту.');
  assert.equal(projection.card.images.card,
    'https://hearthpulse.net/api/public-resource/hsjson/v1/bgs/latest/ruRU/512x/BGDUO_Anomaly_005.png');
  assert.equal(projection.canonicalPath, '/library/anomalies/сила-секрет-в-бутылке-119142/');
  assert.equal(calls.at(-1)?.pathname, '/api/v1/anomalies');
  assert.equal(calls.at(-1)?.searchParams.get('dbf'), '119142');
  assert.equal(calls.at(-1)?.searchParams.get('in_pool'), '1');

  upstreamData = [{ ...source, in_pool: false }];
  const archived = await fetch(`${origin}/api/bg/library/public/extra/archive/anomalies/119142`);
  assert.equal(archived.status, 200);
  assert.equal((await archived.json()).canonicalPath,
    '/library/archive/anomalies/сила-секрет-в-бутылке-119142/');
  assert.equal(calls.at(-1)?.searchParams.get('in_pool'), '0');
  assert.equal((await fetch(`${origin}/api/bg/library/public/extra/current/anomalies/119142`)).status, 404);

  const kinds = [
    ['anomalies', 'anomalies'], ['dark-gifts', 'dark-gifts'], ['quests', 'quests'],
    ['rewards', 'rewards'], ['darkmoon-prizes', 'darkmoon-prizes'],
    ['trinkets', 'trinkets'], ['timewarped', 'timewarped-cards'],
  ] as const;
  upstreamData = [source];
  for (const [kind, endpoint] of kinds) {
    const current = await fetch(`${origin}/api/bg/library/public/extra/current/${kind}/119142`);
    assert.equal(current.status, 200, kind);
    assert.match((await current.json()).canonicalPath, new RegExp(`^/library/${kind}/`));
    assert.equal(calls.at(-1)?.pathname, `/api/v1/${endpoint}`);
    assert.equal(calls.at(-1)?.searchParams.has('in_pool'), !['dark-gifts', 'timewarped'].includes(kind));
  }
  upstreamData = [{ ...source, in_pool: false }];
  for (const kind of ['anomalies', 'quests', 'rewards', 'darkmoon-prizes', 'trinkets']) {
    const archive = await fetch(`${origin}/api/bg/library/public/extra/archive/${kind}/119142`);
    assert.equal(archive.status, 200, kind);
    assert.match((await archive.json()).canonicalPath, new RegExp(`^/library/archive/${kind}/`));
  }
  upstreamData = [];
  assert.equal((await fetch(`${origin}/api/bg/library/public/extra/current/anomalies/119142`)).status, 404);

  for (const path of [
    '/api/bg/library/public/extra/archive/dark-gifts/119142',
    '/api/bg/library/public/extra/archive/timewarped/119142',
    '/api/bg/library/public/extra/current/unknown/119142',
    '/api/bg/library/public/extra/current/anomalies/0',
    '/api/bg/library/public/extra/current/anomalies/99999999999999999999',
  ]) assert.equal((await fetch(`${origin}${path}`)).status, 404, path);

  upstreamStatus = 502;
  const unavailable = await fetch(`${origin}/api/bg/library/public/extra/current/trinkets/112083`);
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get('retry-after'), '42');
  assert.equal(unavailable.headers.get('x-robots-tag'), 'noindex, nofollow');
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
console.log('Battleground auxiliary public detail projection contracts passed');
