import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createStandardMetaRouter, type StandardMetaRouterDependencies } from '../server/standardMetaRoutes.ts';
import { projectPublicViciousGold } from '../server/viciousGoldPublic.ts';
import { isPublicDataApiRequest } from '../server/apiRateLimitPolicy.ts';

// The paid report as `loadViciousGold` answers it, with a sentinel in every closed field (#656): shares, games, win
// rates, ranks, builds, the threshold, the coverage, and an extra field next to every copied one (a projection that
// spreads a record instead of copying fields by name leaks it). Numbers are unique, so a leaked one is found as text.
const CLOSED = 'SENTINEL_CLOSED';
const report = {
  title: 'Vicious Syndicate Gold', format: 'Standard', games: 917_331, source: 'Vicious Syndicate Live',
  sourceUrl: 'https://www.vicioussyndicate.com/data-reaper-live/', sourceId: `${CLOSED}_source_id`,
  updatedAt: '2026-11-20T08:15:00.000Z', minimumDeckFrequency: 0.4917,
  timeRanges: { distribution: 'lastDay', tierLadder: 'lastWeek', tierMatchups: 'last2Weeks', extra: `${CLOSED}_range` },
  classDistribution: [
    { class: 'Warrior', classLabel: 'Воин', classIcon: 'warrior', frequency: 31.4159, extra: `${CLOSED}_class` },
    { class: 'DeathKnight', classLabel: 'Рыцарь смерти', classIcon: 'death-knight', frequency: 27.1828 },
    { class: 'Mage', classLabel: 'Маг', classIcon: 'mage', frequency: 16.1803 },
  ],
  deckDistribution: [
    { deck: 'Dragon Warrior', deckLabel: 'Драконий Воин', archetypeSlug: 'dragon-warrior', class: 'Warrior', classLabel: 'Воин',
      classIcon: 'warrior', frequency: 12.3457, build: { deckCode: `${CLOSED}_deck_code`, winrate: 58.8001, sampleGames: 4_441 } },
    { deck: 'Blood Death Knight', deckLabel: 'Рыцарь смерти крови', archetypeSlug: 'blood-dk', class: 'DeathKnight',
      classLabel: 'Рыцарь смерти', classIcon: 'death-knight', frequency: 9.8765, build: null, rank: 3 },
    { deck: 'Control Warrior', deckLabel: 'Контроль Воин', archetypeSlug: null, class: 'Warrior', classLabel: 'Воин',
      classIcon: 'warrior', frequency: 7.6543, build: null, note: `${CLOSED}_deck_note` },
    { deck: 'Protoss Mage', deckLabel: 'Протосс Маг', archetypeSlug: '<script>', class: 'Mage', classLabel: 'Маг',
      classIcon: 'mage', frequency: 5.4321, build: null },
  ],
  tierList: [
    { rankBracket: 'All ranks', rankLabel: 'Все ранги', decks: [
      { rank: 1, deck: 'Protoss Mage', deckLabel: 'Протосс Маг', class: 'Mage', winrate: 54.3219, build: null },
      { rank: 2, deck: 'Dragon Warrior', deckLabel: 'Драконий Воин', class: 'Warrior', winrate: 52.1098, build: null },
    ] },
    { rankBracket: 'Legend', rankLabel: 'Легенда', decks: [{ rank: 1, deck: 'Blood Death Knight', winrate: 56.7891 }], note: `${CLOSED}_tier` },
  ],
  buildCoverage: { found: 3_331, total: 3_332 },
};
const CLOSED_VALUES = ['917331', '917 331', '0.4917', '31.4159', '27.1828', '16.1803', '12.3457', '9.8765', '7.6543', '5.4321',
  '58.8001', '4441', '54.3219', '52.1098', '56.7891', '3331', '3332', CLOSED];

function assertNothingClosed(body: string) {
  for (const value of CLOSED_VALUES) assert.equal(body.includes(value), false, `closed value ${value} reached the open answer`);
  for (const key of ['"frequency"', '"games"', '"winrate"', '"rank"', '"build"', '"deckCode"', '"deckCards"', '"sampleGames"',
    '"minimumDeckFrequency"', '"buildCoverage"', '"tierList"', '"decks"']) {
    assert.equal(body.includes(key), false, `closed field ${key} reached the open answer`);
  }
}

test('the open frame copies the header, the classes and archetypes in a neutral order and the rank names', () => {
  const frame = projectPublicViciousGold(report);
  assert.deepEqual(frame, {
    title: 'Vicious Syndicate Gold', format: 'Standard', source: 'Vicious Syndicate Live',
    sourceUrl: 'https://www.vicioussyndicate.com/data-reaper-live/', updatedAt: '2026-11-20T08:15:00.000Z',
    timeRanges: { distribution: 'lastDay', tierLadder: 'lastWeek', tierMatchups: 'last2Weeks' },
    // By class name, then archetype name: Маг (16%) before Рыцарь смерти (27%), Protoss Mage (#1 of the Power Tier) third.
    classes: [
      { class: 'Warrior', classLabel: 'Воин', classIcon: 'warrior' },
      { class: 'Mage', classLabel: 'Маг', classIcon: 'mage' },
      { class: 'DeathKnight', classLabel: 'Рыцарь смерти', classIcon: 'death-knight' },
    ],
    archetypes: [
      { class: 'Warrior', classLabel: 'Воин', classIcon: 'warrior', deck: 'Dragon Warrior', deckLabel: 'Драконий Воин', archetypeSlug: 'dragon-warrior' },
      { class: 'Warrior', classLabel: 'Воин', classIcon: 'warrior', deck: 'Control Warrior', deckLabel: 'Контроль Воин', archetypeSlug: null },
      { class: 'Mage', classLabel: 'Маг', classIcon: 'mage', deck: 'Protoss Mage', deckLabel: 'Протосс Маг', archetypeSlug: null },
      { class: 'DeathKnight', classLabel: 'Рыцарь смерти', classIcon: 'death-knight', deck: 'Blood Death Knight', deckLabel: 'Рыцарь смерти крови', archetypeSlug: 'blood-dk' },
    ],
    rankBrackets: [{ rankBracket: 'All ranks', rankLabel: 'Все ранги' }, { rankBracket: 'Legend', rankLabel: 'Легенда' }],
  });
  assertNothingClosed(JSON.stringify(frame));
});

test('a source link to another host falls back to the vS report page', () => {
  assert.equal(projectPublicViciousGold({ ...report, sourceUrl: 'https://evil.example/x' }).sourceUrl,
    'https://www.vicioussyndicate.com/data-reaper-live/');
  assert.equal(projectPublicViciousGold({ ...report, sourceUrl: 'http://www.vicioussyndicate.com/x' }).sourceUrl,
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
    loadViciousGold: async () => { reads += 1; if (failing) throw new Error('source down'); return report; },
    loadViciousGoldBuilds: async () => ({ builds: [], buildCoverage: report.buildCoverage }),
    findRecommendation: async () => null,
    createPreview: async () => ({ hash: 'abc12345', state: 'queued', ready: false, imageUrl: null, error: null }),
    getPreview: async hash => ({ hash, state: 'done', ready: true, imageUrl: null, error: null }),
    setPrivateNoStore: response => { response.set('Cache-Control', 'private, no-store'); },
    onError: scope => { errors.push(scope); },
  };
  const app = express();
  app.use('/api', createStandardMetaRouter(dependencies));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}/api`;
  try {
    const open = await fetch(`${origin}/vicious-syndicate-gold/public`);
    assert.equal(open.status, 200);
    assert.equal(open.headers.get('cache-control'), 'public, max-age=300, stale-while-revalidate=900');
    const body = await open.text();
    assert.equal(JSON.parse(body).archetypes.length, 4);
    assertNothingClosed(body);

    assert.equal((await fetch(`${origin}/vicious-syndicate-gold`)).status, 401, 'the paid report stays behind the guard');
    assert.equal((await fetch(`${origin}/vicious-syndicate-gold/builds`)).status, 401, 'the builds stay behind the guard');
    const paid = await fetch(`${origin}/vicious-syndicate-gold`, { headers: { 'x-test-access': 'allowed' } });
    assert.equal(paid.status, 200);
    assert.equal((await paid.json()).games, 917_331);

    // The source fails: the last good frame, marked stale; a prerender gets no stale copy.
    failing = true;
    const stale = await fetch(`${origin}/vicious-syndicate-gold/public`);
    assert.equal(stale.status, 200);
    assert.equal(stale.headers.get('x-vicious-gold-source'), 'stale');
    assert.equal(stale.headers.get('cache-control'), 'public, max-age=60, stale-while-revalidate=60');
    assertNothingClosed(await stale.text());
    const prerender = await fetch(`${origin}/vicious-syndicate-gold/public`, { headers: { 'X-Hearthpulse-Prerender': '1' } });
    assert.equal(prerender.status, 503);
    assert.equal(prerender.headers.get('cache-control'), 'no-store');
    assert.deepEqual(errors, ['vicious-gold', 'vicious-gold']);
    assert.equal(reads, 4);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }

  assert.equal(isPublicDataApiRequest('GET', '/vicious-syndicate-gold/public'), true, 'the scrape guard budgets the open frame');
});

test('a source without archetypes and no earlier frame answers 503, never an empty frame', async () => {
  const { createPublicViciousGoldHandler } = await import('../server/viciousGoldPublic.ts');
  const app = express();
  app.get('/public', createPublicViciousGoldHandler({ loadViciousGold: async () => ({ ...report, deckDistribution: [] }) }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/public`);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('retry-after'), '60');
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
