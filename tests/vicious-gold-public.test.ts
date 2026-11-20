import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createStandardMetaRouter, type StandardMetaRouterDependencies } from '../server/standardMetaRoutes.ts';
import { createPublicViciousGoldHandler, projectPublicViciousGold } from '../server/viciousGoldPublic.ts';
import { isPublicDataApiRequest } from '../server/apiRateLimitPolicy.ts';
import {
  CLOSED_INTEGER_PATTERN, CLOSED_KEYS, CLOSED_VALUES, closedKeyPattern, OPEN_FRAME, PERMUTED_REPORTS, REPORT,
} from './fixtures/viciousGoldSentinels.mjs';

// The paid report (`loadViciousGold`) carries a unique sentinel in every closed field of #656 (shares, games, win
// rates, ranks, the threshold, the coverage, builds and every field of a build, deck lists, Power Tier rows with names
// of their own) and an extra field next to every copied one: a projection that spreads a record leaks it.

function assertNothingClosed(body: string, where: string) {
  assert.deepEqual(CLOSED_VALUES.filter(value => body.includes(value)), [], `${where}: no closed value`);
  assert.deepEqual(CLOSED_KEYS.filter(key => body.includes(`"${key}"`)), [], `${where}: no closed field`);
}

async function listen(app: express.Express) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return { origin: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}

test('the open frame copies the open fields by name, in an order of their own', () => {
  const frame = projectPublicViciousGold(REPORT);
  assert.deepEqual(frame, OPEN_FRAME);
  assertNothingClosed(JSON.stringify(frame), 'projection');
});

test('the open frame is the same byte for byte whatever order the source sends', () => {
  const expected = JSON.stringify(OPEN_FRAME);
  for (const [name, report] of Object.entries(PERMUTED_REPORTS)) {
    assert.equal(JSON.stringify(projectPublicViciousGold(report)), expected, `${name}: the open answer does not follow the source order`);
  }
});

test('a source link to another host falls back to the vS report page', () => {
  assert.equal(projectPublicViciousGold({ ...REPORT, sourceUrl: 'https://evil.example/x' }).sourceUrl,
    'https://www.vicioussyndicate.com/data-reaper-live/');
  assert.equal(projectPublicViciousGold({ ...REPORT, sourceUrl: 'http://www.vicioussyndicate.com/x' }).sourceUrl,
    'https://www.vicioussyndicate.com/data-reaper-live/');
});

test('the open route answers a guest without the access guard, keeps the paid route closed and is a scrape-guarded path', async () => {
  let failing = false;
  let reads = 0;
  const errors: string[] = [];
  const dependencies: StandardMetaRouterDependencies = {
    adminGuard: (_request, response) => { response.status(403).json({}); },
    accessGuard: (request, response, next) => {
      if (request.headers['x-test-access'] !== 'allowed') { response.status(401).json({ error: 'paid' }); return; }
      next();
    },
    loadMeta: async () => ({}),
    loadViciousGold: async () => { reads += 1; if (failing) throw new Error('source down'); return REPORT; },
    loadViciousGoldBuilds: async () => ({ builds: [], buildCoverage: REPORT.buildCoverage }),
    findRecommendation: async () => null,
    createPreview: async () => ({ hash: 'abc12345', state: 'queued', ready: false, imageUrl: null, error: null }),
    getPreview: async hash => ({ hash, state: 'done', ready: true, imageUrl: null, error: null }),
    setPrivateNoStore: response => { response.set('Cache-Control', 'private, no-store'); },
    onError: scope => { errors.push(scope); },
  };
  const app = express();
  app.use('/api', createStandardMetaRouter(dependencies));
  const server = await listen(app);
  try {
    const open = await fetch(`${server.origin}/api/vicious-syndicate-gold/public`);
    assert.equal(open.status, 200);
    assert.equal(open.headers.get('cache-control'), 'public, max-age=300, stale-while-revalidate=900');
    assert.equal(open.headers.get('vary'), 'X-Hearthpulse-Prerender', 'a shared cache keys the answer on the prerender header');
    const body = await open.text();
    assert.equal(body, JSON.stringify(OPEN_FRAME));
    assertNothingClosed(body, 'API answer');

    assert.equal((await fetch(`${server.origin}/api/vicious-syndicate-gold`)).status, 401, 'the paid report stays behind the guard');
    assert.equal((await fetch(`${server.origin}/api/vicious-syndicate-gold/builds`)).status, 401, 'the builds stay behind the guard');
    const paid = await fetch(`${server.origin}/api/vicious-syndicate-gold`, { headers: { 'x-test-access': 'allowed' } });
    assert.equal(paid.status, 200);
    assert.equal((await paid.json()).games, 9_173_317);

    // The source fails: the last good frame, marked stale and kept by no shared cache; a prerender gets a 503.
    failing = true;
    const stale = await fetch(`${server.origin}/api/vicious-syndicate-gold/public`);
    assert.equal(stale.status, 200);
    assert.equal(stale.headers.get('x-vicious-gold-source'), 'stale');
    assert.equal(stale.headers.get('cache-control'), 'private, no-store');
    assert.equal(stale.headers.get('vary'), 'X-Hearthpulse-Prerender');
    const staleBody = await stale.text();
    assert.equal(staleBody, JSON.stringify(OPEN_FRAME));
    assertNothingClosed(staleBody, 'last good answer');
    const prerender = await fetch(`${server.origin}/api/vicious-syndicate-gold/public`, { headers: { 'X-Hearthpulse-Prerender': '1' } });
    assert.equal(prerender.status, 503);
    assert.equal(prerender.headers.get('cache-control'), 'no-store');
    assert.equal(prerender.headers.get('vary'), 'X-Hearthpulse-Prerender');
    assert.deepEqual(errors, ['vicious-gold', 'vicious-gold']);
    assert.equal(reads, 4);
  } finally {
    await server.close();
  }

  assert.equal(isPublicDataApiRequest('GET', '/vicious-syndicate-gold/public'), true, 'the scrape guard budgets the open frame');
});

test('a source without archetypes and no earlier frame answers 503, never an empty frame', async () => {
  const app = express();
  app.get('/public', createPublicViciousGoldHandler({ loadViciousGold: async () => ({ ...REPORT, deckDistribution: [] }) }));
  const server = await listen(app);
  try {
    const response = await fetch(`${server.origin}/public`);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('retry-after'), '60');
  } finally {
    await server.close();
  }
});

test('the closed-integer check finds a closed value in any form and only as a whole value', () => {
  const found = (text: string) => [...text.matchAll(CLOSED_INTEGER_PATTERN)].length > 0;
  for (const leak of ['{"value":"7771937"}', '{"rank":7771937,"x":1}', String.raw`{\"rank\":7771937}`, '>9 173 317<',
    '>9 173 317<', '>9 173 317<', '9,173,317', '["9999137"]', '<td>3331937</td>',
    '[1,7771937]', '[7771937,1]']) {
    assert.ok(found(leak), `a leak is found: ${leak}`);
  }
  for (const other of ['>7771937abc<', 'a7771937', '77719370', '7771937.5', '1.7771937', '9,173,3170', 'abc-7771937',
    'я7771937', '1 7771937', '7771937 123', '7771937-ab']) {
    assert.ok(!found(other), `not a closed value: ${other}`);
  }
  assert.ok(closedKeyPattern('rank').test(String.raw`{\"rank\":1}`) && !closedKeyPattern('rank').test('{"rankBracket":1}'));
});
