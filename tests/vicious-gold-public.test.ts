import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    '[1,7771937]', '[7771937,1]', '>7771937 123<', '>123 7771937<', '1 7771937']) {
    assert.ok(found(leak), `a leak is found: ${leak}`);
  }
  for (const other of ['>7771937abc<', 'a7771937', '77719370', '7771937.5', '1.7771937', '9,173,3170', 'abc-7771937',
    'я7771937', '7771937-ab']) {
    assert.ok(!found(other), `not a closed value: ${other}`);
  }
  assert.ok(closedKeyPattern('rank').test(String.raw`{\"rank\":1}`) && !closedKeyPattern('rank').test('{"rankBracket":1}'));
});

// The last good frame on disk (#677): a restarted Express (a deploy, a crash) whose source is down still answers a
// guest. A new handler is a new process: the handler keeps its frame in its own closure, nothing in module state.

const SAVED_AT = 1_795_000_000_000;
const COPY_DIRECTORY = 'vicious-gold-last-good-v1';

async function waitForFile(file: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { return await readFile(file, 'utf8'); } catch { await new Promise(resolve => setTimeout(resolve, 10)); }
  }
  throw new Error(`${file} was never written`);
}

async function serve(handler: express.RequestHandler) {
  const app = express();
  app.get('/public', handler);
  return listen(app);
}

test('a restart while vS is down answers a guest the frame kept on disk, and a prerender a 503', async () => {
  const stateDirectory = await mkdtemp(join(tmpdir(), 'vicious-gold-state-'));
  try {
    const before = await serve(createPublicViciousGoldHandler({ loadViciousGold: async () => REPORT, stateDirectory, now: () => SAVED_AT }));
    try {
      assert.equal((await fetch(`${before.origin}/public`)).status, 200);
    } finally {
      await before.close();
    }
    const stored = await waitForFile(join(stateDirectory, COPY_DIRECTORY, 'public.json'));
    assertNothingClosed(stored, 'file on disk');
    assert.deepEqual(JSON.parse(stored), { format: 1, savedAt: SAVED_AT, frame: OPEN_FRAME });

    const errors: string[] = [];
    const after = await serve(createPublicViciousGoldHandler({
      loadViciousGold: async () => { throw new Error('source down'); }, stateDirectory, now: () => SAVED_AT + 60_000,
      onError: scope => { errors.push(scope); },
    }));
    try {
      const guest = await fetch(`${after.origin}/public`);
      assert.equal(guest.status, 200);
      assert.equal(guest.headers.get('x-vicious-gold-source'), 'stale');
      assert.equal(guest.headers.get('cache-control'), 'private, no-store');
      assert.equal(await guest.text(), JSON.stringify(OPEN_FRAME));
      const prerender = await fetch(`${after.origin}/public`, { headers: { 'X-Hearthpulse-Prerender': '1' } });
      assert.equal(prerender.status, 503);
      assert.equal(prerender.headers.get('cache-control'), 'no-store');
      assert.deepEqual(errors, ['vicious-gold', 'vicious-gold']);
    } finally {
      await after.close();
    }
  } finally {
    await rm(stateDirectory, { recursive: true, force: true });
  }
});

test('a frame read from disk passes the open parser: an added field is dropped, a broken or week-old file is not served', async () => {
  const stateDirectory = await mkdtemp(join(tmpdir(), 'vicious-gold-state-'));
  const file = join(stateDirectory, COPY_DIRECTORY, 'public.json');
  const down = async () => { throw new Error('source down'); };
  const answer = async (now: number) => {
    const server = await serve(createPublicViciousGoldHandler({ loadViciousGold: down, stateDirectory, now: () => now }));
    try {
      const response = await fetch(`${server.origin}/public`);
      return { status: response.status, body: await response.text() };
    } finally {
      await server.close();
    }
  };
  try {
    await mkdir(join(stateDirectory, COPY_DIRECTORY));
    const tampered = { ...OPEN_FRAME, games: 9_173_317, archetypes: OPEN_FRAME.archetypes.map(item => ({ ...item, winrate: 59.9001 })) };
    await writeFile(file, JSON.stringify({ format: 1, savedAt: SAVED_AT, frame: tampered }));
    assert.deepEqual(await answer(SAVED_AT + 60_000), { status: 200, body: JSON.stringify(OPEN_FRAME) });
    assert.equal((await answer(SAVED_AT + 8 * 24 * 60 * 60_000)).status, 503, 'a week-old frame is a wrong one');

    await writeFile(file, JSON.stringify({ format: 1, savedAt: SAVED_AT, frame: { ...OPEN_FRAME, archetypes: [] } }));
    assert.equal((await answer(SAVED_AT + 60_000)).status, 503, 'a frame without archetypes is no frame');
    await writeFile(file, '{"format":1,');
    assert.equal((await answer(SAVED_AT + 60_000)).status, 503, 'a damaged file is no frame');
  } finally {
    await rm(stateDirectory, { recursive: true, force: true });
  }
});

test('a state directory that is not a directory or is read-only never breaks the answer', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vicious-gold-state-'));
  const notADirectory = join(root, 'file');
  await writeFile(notADirectory, 'not a directory');
  const readOnly = join(root, 'read-only');
  await mkdir(readOnly);
  await chmod(readOnly, 0o555);
  const directories = process.getuid?.() === 0 ? [notADirectory] : [notADirectory, readOnly];
  try {
    for (const stateDirectory of directories) {
      let failing = false;
      const server = await serve(createPublicViciousGoldHandler({
        loadViciousGold: async () => { if (failing) throw new Error('source down'); return REPORT; }, stateDirectory,
      }));
      try {
        const fresh = await fetch(`${server.origin}/public`);
        assert.equal(fresh.status, 200, stateDirectory);
        assert.equal(await fresh.text(), JSON.stringify(OPEN_FRAME));
        // Let the failed write settle before the source fails: the memory copy still answers.
        await new Promise(resolve => setTimeout(resolve, 50));
        failing = true;
        const stale = await fetch(`${server.origin}/public`);
        assert.equal(stale.status, 200, stateDirectory);
        assert.equal(stale.headers.get('x-vicious-gold-source'), 'stale');
        assert.equal(await stale.text(), JSON.stringify(OPEN_FRAME));

        // Once the directory is usable again, the next good answer is kept on disk: one failed write costs nothing more.
        if (stateDirectory === notADirectory) await rm(notADirectory); else await chmod(readOnly, 0o755);
        failing = false;
        assert.equal((await fetch(`${server.origin}/public`)).status, 200);
        assert.deepEqual(JSON.parse(await waitForFile(join(stateDirectory, COPY_DIRECTORY, 'public.json'))).frame, OPEN_FRAME);
      } finally {
        await server.close();
      }
    }
  } finally {
    await chmod(readOnly, 0o755);
    await rm(root, { recursive: true, force: true });
  }
});
