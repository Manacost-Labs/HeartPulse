import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import express, { type Request } from 'express';
import rateLimit from 'express-rate-limit';
import { csrfRequestAllowed } from '../server/csrf.js';
import { publicResourceUrl } from '../shared/publicResourceUrl.js';
import {
  MAX_SAVED_DECKS,
  createSavedDeckRepository,
  createSavedDecksRouter,
  parseDeckInput,
} from '../server/modules/savedDecks/public.js';

const CODE = 'AAECAZ8FBomwBNy5BJvDBM3SBNXSBIGhBQyU1ATI1AT/3wQAAA==';
const OTHER_CODE = 'AAECAa0GBsDYBMjQBPfLBODoBZ/zBeHpBQzD2ASvwAXD7AXW9QUAAA==';
const EXPORT = `### Пират Воин
# Класс: Воин
# Формат: Стандартный
#
# 2x (1) Абордаж
#
${CODE}
#
# Чтобы использовать эту колоду, скопируйте её в буфер обмена и создайте новую колоду в Hearthstone`;

// The game's export and a bare code give the same deck; the ### line names it.
assert.deepEqual(parseDeckInput(EXPORT), { deckCode: CODE, name: 'Пират Воин' });
assert.deepEqual(parseDeckInput(`  ${CODE}  `), { deckCode: CODE, name: null });
assert.equal(parseDeckInput('привет, это не колода'), null);
assert.equal(parseDeckInput(''), null);

const database = new DatabaseSync(':memory:');
database.exec(`PRAGMA foreign_keys = ON;
  CREATE TABLE users (id TEXT PRIMARY KEY);
  INSERT INTO users (id) VALUES ('alice'), ('bob'), ('carol');`);
const repository = createSavedDeckRepository(() => database);

let clock = Date.parse('2026-11-05T12:00:00.000Z');
let ids = 0;
// Renders are held until the test settles them, like a slow deckview.
const renders: Array<{ code: string; name: string; settle: (ok: boolean) => void }> = [];
const APP_URL = 'https://hearthpulse.net';
let resolverDown = false;
let resolveCalls = 0;
const sessionUser = (request: Request) => {
  const match = /hp_session=([a-z]+)/.exec(String(request.headers.cookie ?? ''));
  return match ? { id: match[1] } : null;
};

const app = express();
app.use(express.json());
app.use('/api', createSavedDecksRouter({
  repository,
  userAuth: sessionUser,
  csrfAllowed: request => csrfRequestAllowed({
    method: request.method, path: request.originalUrl, authCookiePresent: Boolean(sessionUser(request)),
    csrfHeader: request.headers['x-csrf-request'], origin: request.headers.origin, referer: request.headers.referer,
    secFetchSite: request.headers['sec-fetch-site'], appUrl: APP_URL,
  }),
  setPrivateNoStore: response => { response.set('Cache-Control', 'private, no-store'); },
  isDeckCode: code => code.startsWith('AAEC'),
  resolveDeck: async code => {
    resolveCalls += 1;
    if (resolverDown) throw new Error('catalog unavailable');
    return code === CODE || code === OTHER_CODE
      ? { deckCode: code, format: 'standard', archetypeLabel: code === CODE ? 'Пиратский воин' : null }
      : null;
  },
  // Small budget so the test can spend it; keyed per account like a client.
  renderLimiter: rateLimit({ windowMs: 60_000, max: 12, standardHeaders: true, legacyHeaders: false,
    keyGenerator: request => String(sessionUser(request)?.id ?? 'anonymous'), message: { error: 'limited' } }),
  renderDeck: (code, name) => new Promise((resolve, reject) => {
    renders.push({ code, name, settle: ok => (ok
      ? resolve({ imageUrl: `https://api.blizzcore.ru/static/generated/${code.length}.png`, previewImageUrl: `https://api.blizzcore.ru/static/generated/${code.length}-preview.webp` })
      : reject(new Error('DECKVIEW_RENDER_FAILED'))) });
  }),
  imageUrl: publicResourceUrl,
  now: () => clock,
  newId: () => `deck-${ids += 1}`,
}));
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/account/decks`;
const tick = () => new Promise(resolve => setImmediate(resolve));

async function call(user: string | null, method: string, path = '', body?: unknown, headers: Record<string, string> = {}, url = `${base}${path}`) {
  const response = await fetch(url, {
    method,
    headers: {
      'content-type': 'application/json', 'sec-fetch-site': 'same-origin', 'x-csrf-request': '1',
      ...(user ? { cookie: `hp_session=${user}` } : {}), ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() as Record<string, any> };
}

try {
  // A session is required; changes need the same-origin CSRF proof.
  assert.equal((await call(null, 'GET')).status, 401);
  assert.equal((await call('alice', 'POST', '', { deckCode: CODE }, { 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await call('alice', 'POST', '', { deckCode: CODE }, { 'x-csrf-request': '' })).status, 403);
  const empty = await call('alice', 'GET');
  assert.deepEqual(empty.body, { decks: [], limit: MAX_SAVED_DECKS });
  assert.equal(empty.cache, 'private, no-store');

  // Bad input is refused before anything is stored or rendered.
  assert.equal((await call('alice', 'POST', '', { deckCode: 'не колода' })).status, 400);
  assert.equal((await call('alice', 'POST', '', { deckCode: 'AAECAQAAAAAAAAAAAAAAAAAAAA' })).status, 400, 'a code the catalog rejects');
  assert.equal((await call('alice', 'POST', '', { deckCode: CODE, comment: 'x'.repeat(501) })).status, 400);
  const lookups = resolveCalls;
  assert.equal((await call('alice', 'POST', '', { deckCode: 'Zm9vYmFyYmF6cXV4cXV1eA==' })).status, 400);
  assert.equal(resolveCalls, lookups, 'an undecodable code never reaches the catalog lookup');
  resolverDown = true;
  const down = await call('alice', 'POST', '', { deckCode: CODE });
  assert.equal(down.status, 503, 'a failed check is not reported as a wrong code');
  resolverDown = false;
  assert.equal(renders.length, 0);

  // The game's export: saved at once as pending with its own name; the image follows.
  const added = await call('alice', 'POST', '', { deckCode: EXPORT, comment: '  Против агро держать <b>Абордаж</b>  ' });
  assert.equal(added.status, 201);
  assert.deepEqual(added.body.deck, {
    id: 'deck-1', deckCode: CODE, name: 'Пират Воин', format: 'standard', comment: 'Против агро держать <b>Абордаж</b>',
    status: 'pending', imageUrl: null, previewImageUrl: null, createdAt: '2026-11-05T12:00:00.000Z',
  });
  assert.equal(JSON.stringify(added.body).includes('alice'), false, 'the account id is not in the answer');
  assert.deepEqual(renders.map(render => render.name), ['Пиратский воин'],
    'the image is titled by the archetype, so the owner\'s name cannot multiply shared renders');
  renders[0].settle(true);
  await tick();
  const [ready] = (await call('alice', 'GET')).body.decks;
  assert.equal(ready.status, 'ready');
  assert.equal(ready.imageUrl, `/api/public-resource/deckview/static/generated/${CODE.length}.png`, 'images come through the site proxy');
  assert.equal(ready.previewImageUrl, `/api/public-resource/deckview/static/generated/${CODE.length}-preview.webp`);

  // The same deck twice is refused; without a ### line the archetype names the deck, then «Колода».
  assert.equal((await call('alice', 'POST', '', { deckCode: CODE })).status, 409);
  const second = await call('alice', 'POST', '', { deckCode: OTHER_CODE });
  assert.equal(second.body.deck.name, 'Колода');
  assert.equal((await call('bob', 'POST', '', { deckCode: CODE })).body.deck.name, 'Пиратский воин', 'another account may save the same deck');

  // A failed render keeps the deck and can be retried.
  renders[1].settle(false);
  await tick();
  const failed = (await call('alice', 'GET')).body.decks.find((deck: { id: string }) => deck.id === second.body.deck.id);
  assert.equal(failed.status, 'failed');
  const retried = await call('alice', 'POST', `/${failed.id}/render`);
  assert.equal(retried.body.deck.status, 'pending');
  renders.at(-1)?.settle(true);
  await tick();
  assert.equal((await call('alice', 'GET')).body.decks.find((deck: { id: string }) => deck.id === failed.id).status, 'ready');

  // Newest first, each account sees only its own decks; another account's deck is a 404 for every change.
  assert.deepEqual((await call('alice', 'GET')).body.decks.map((deck: { id: string }) => deck.id), ['deck-2', 'deck-1']);
  assert.deepEqual((await call('bob', 'GET')).body.decks.map((deck: { id: string }) => deck.id), ['deck-3']);
  assert.equal((await call('bob', 'DELETE', '/deck-1')).status, 404);
  assert.equal((await call('bob', 'PATCH', '/deck-1', { comment: 'чужое' })).status, 404);
  assert.equal((await call('bob', 'POST', '/deck-1/render')).status, 404);

  // The owner edits the comment and deletes the deck.
  assert.equal((await call('alice', 'PATCH', '/deck-1', { comment: 'Новый план' })).body.deck.comment, 'Новый план');
  assert.equal((await call('alice', 'PATCH', '/deck-1', { comment: 'x'.repeat(501) })).status, 400);
  assert.equal((await call('alice', 'PATCH', '/deck-1', {})).status, 400, 'a missing comment does not erase it');
  assert.equal((await call('alice', 'GET')).body.decks.find((deck: { id: string }) => deck.id === 'deck-1').comment, 'Новый план');
  assert.equal((await call('alice', 'DELETE', '/deck-1')).status, 200);
  assert.equal((await call('alice', 'DELETE', '/deck-1')).status, 404);

  // A render lost to a restart becomes retryable after five minutes.
  repository.insert({ id: 'stuck', userId: 'carol', deckCode: CODE, deckName: 'Колода', renderName: 'Колода', format: 'standard', comment: '',
    status: 'pending', imageUrl: null, previewImageUrl: null, createdAt: new Date(clock).toISOString(), updatedAt: new Date(clock).toISOString() });
  assert.equal((await call('carol', 'GET')).body.decks[0].status, 'pending');
  clock += 6 * 60_000;
  assert.equal((await call('carol', 'PATCH', '/stuck', { comment: 'правка' })).body.deck.status, 'failed',
    'editing the comment does not hide a lost render');
  assert.equal((await call('carol', 'GET')).body.decks[0].status, 'failed');

  // The limit is per account.
  for (let index = repository.count('carol'); index < MAX_SAVED_DECKS; index += 1) {
    repository.insert({ id: `bulk-${index}`, userId: 'carol', deckCode: `BULK${index}`, deckName: 'Колода', renderName: 'Колода', format: 'standard', comment: '',
      status: 'ready', imageUrl: null, previewImageUrl: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
  }
  assert.equal((await call('carol', 'POST', '', { deckCode: OTHER_CODE })).status, 409);

  // The render budget holds for every spelling of the path, a doubled slash included.
  const origin = base.replace('/api/account/decks', '');
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 14; attempt += 1) {
    statuses.push((await call('bob', 'POST', '', { deckCode: 'не колода' }, {}, `${origin}/api//account/decks`)).status);
  }
  assert.ok(statuses.includes(429), `the doubled slash must not escape the render budget: ${statuses.join(',')}`);

  // Deleting the account deletes its decks.
  database.exec("DELETE FROM users WHERE id = 'carol'");
  assert.equal(repository.count('carol'), 0);
} finally {
  server.close();
}

console.log('saved decks routes: ok');
