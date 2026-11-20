import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createPatchNotesApi } from '../server/modules/patchNotes/public.js';
import { PatchNotesLastGoodFile, type PatchNotesLastGoodStorage } from '../server/modules/patchNotes/lastGood.js';

// #600: after a restart the archive (about 4 MB from hs-data-api) took minutes to read and /standard/patches/ answered 503.
const ORIGIN = 'https://api.kolodahearthstone.com';
const LONG_CACHE = 'public, max-age=600, stale-while-revalidate=1800';
const SHORT_CACHE = 'public, max-age=10';
const history = JSON.parse(readFileSync(new URL('./fixtures/card-history-snapshots-20261119.json', import.meta.url), 'utf8')) as
  Record<string, unknown>;
const hung = () => new Promise<never>(() => undefined);
const knight = { BE_285: { name: 'Рыцарь-гибрид', playerClass: 'DEATHKNIGHT', type: 'MINION' } };
const archive = (title: string) => ({ patches: [{
  version: '37.0.2.255000', hs_manacost_version: '37.0.2', title, match_state: 'matched', official_published_at: '2026-11-03T15:55:00Z',
  content_text: 'Рыцарь-гибрид\nДо изменения: 3 атаки, 3 здоровья\nПосле: 3 атаки, 4 здоровья',
}] });

type Api = Parameters<typeof createPatchNotesApi>[0];
const api = (directory: string, over: Partial<Api>) => createPatchNotesApi({
  stateDirectory: directory, patchesUrl: `${ORIGIN}/api/patches?limit=500&include_content=1`, ttlMs: 30 * 60_000,
  fetchJson: hung, loadCardNames: hung, now: () => Date.parse('2026-11-20T12:00:00Z'), ...over,
});

/** Starts Express with the routes and returns one `/api` read, bounded by `timeoutMs`; `close` stops it. */
function serve(router: ReturnType<typeof createPatchNotesApi>) {
  const server = express().use('/api', router).listen(0);
  const { port } = server.address() as { port: number };
  return {
    get: (path: string, timeoutMs = 1_000) => fetch(`http://127.0.0.1:${port}/api${path}`, { signal: AbortSignal.timeout(timeoutMs) }),
    close: () => { server.closeAllConnections(); server.close(); },
  };
}

/** Background work (a rebuild, a write) has no handle: reads again until `ready`, at most 40 times 50 ms apart. */
async function eventually<T>(read: () => Promise<T>, ready: (value: T) => boolean): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    const value = await read();
    if (ready(value) || attempt === 40) return value;
    await delay(50);
  }
}

/** The first `/recent` answer of a server restarted on `directory` whose source hangs. */
async function restartedRecent(directory: string): Promise<RecentBody> {
  const restarted = serve(api(directory, {}));
  try {
    return await (await restarted.get('/patch-notes/recent')).json() as RecentBody;
  } finally {
    restarted.close();
  }
}

type RecentBody = { patches: { title: string; entries: { cardId: string | null; beforeRenderUrl: string | null; afterRenderUrl: string | null }[] }[]; updatedAt: string };

test('a restarted server answers at once from the last good build while the source hangs, cached only briefly', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'patch-notes-last-good-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const first = serve(api(directory, { fetchJson: async () => archive('Обновление 37.0.2'), loadCardNames: async () => knight }));
  const built = await (await first.get('/patch-notes/recent', 10_000)).json() as RecentBody;
  first.close();
  assert.equal(built.patches[0].title, 'Обновление 37.0.2');

  // A write cut off by SIGKILL leaves a temporary file; the next start removes it.
  writeFileSync(join(directory, 'patch-notes-v1', '.last-good.json.999999.0f1e2d3c.tmp'), '{"format":1,"snap');
  let reads = 0;
  const restarted = serve(api(directory, { fetchJson: () => { reads += 1; return hung(); } }));
  try {
    const recent = await restarted.get('/patch-notes/recent');
    assert.equal(recent.status, 200);
    assert.equal(recent.headers.get('cache-control'), SHORT_CACHE);
    const body = await recent.json() as RecentBody;
    assert.deepEqual(body.patches.map(patch => patch.title), ['Обновление 37.0.2']);
    assert.equal(body.patches[0].entries[0].cardId, 'BE_285');
    assert.equal(body.updatedAt, '2026-11-20T12:00:00.000Z');
    const one = await restarted.get('/patch-notes/37.0.2');
    assert.deepEqual([one.status, one.headers.get('cache-control')], [200, SHORT_CACHE]);
    const list = await restarted.get('/patch-notes');
    assert.equal(list.headers.get('cache-control'), SHORT_CACHE, 'the archive list from the copy is cached only briefly too');
    assert.deepEqual((await list.json()).patches.map((patch: { version: string }) => patch.version), ['37.0.2']);
    const unknown = await restarted.get('/patch-notes/38.0.0');
    assert.deepEqual([unknown.status, unknown.headers.get('cache-control')], [404, 'no-store'],
      'a patch released after the copy was made is not cached as missing');
    assert.equal(reads, 1, 'the archive is rebuilt once in the background');
    assert.deepEqual(readdirSync(join(directory, 'patch-notes-v1')), ['last-good.json']);
  } finally {
    restarted.close();
  }
});

test('without a stored copy the first read waits for the source as before', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'patch-notes-last-good-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const failing = serve(api(directory, { fetchJson: async () => { throw new Error('down'); }, loadCardNames: async () => ({}) }));
  try {
    const response = await failing.get('/patch-notes/recent');
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally {
    failing.close();
  }
  const hanging = serve(api(directory, {}));
  try {
    await assert.rejects(hanging.get('/patch-notes/recent', 300), { name: 'TimeoutError' }, 'a failed build leaves no copy to serve');
  } finally {
    hanging.close();
  }
});

for (const [name, patches] of [
  ['a null patch', [null]],
  ['a patch without its entries and fields', [{ version: '37.0.2', title: 'Неполный патч', changeCount: 1 }]],
] as const) {
  test(`a damaged copy (${name}) is reported and not served; the source is read as without a copy`, async t => {
    const directory = mkdtempSync(join(tmpdir(), 'patch-notes-last-good-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    mkdirSync(join(directory, 'patch-notes-v1'));
    writeFileSync(join(directory, 'patch-notes-v1', 'last-good.json'), JSON.stringify({ format: 1, snapshot: { patches, updatedAt: '2026-11-20T12:00:00.000Z' } }));
    const errors: string[] = [];
    const restarted = serve(api(directory, {
      fetchJson: async () => { throw new Error('down'); }, loadCardNames: async () => ({}),
      onError: error => errors.push(error instanceof Error ? error.message : String(error)),
    }));
    try {
      const recent = await restarted.get('/patch-notes/recent');
      assert.deepEqual([recent.status, recent.headers.get('cache-control')], [502, 'no-store']);
      assert.equal((await restarted.get('/patch-notes')).status, 502, 'the process is alive and still answers');
      assert.deepEqual(errors.slice(0, 2), ['Stored patch notes copy is damaged; reading the archive from the source', 'down']);
    } finally {
      restarted.close();
    }
  });
}

test('a successful rebuild replaces the copy and the long cache, with the before/after pictures of the newest patch', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'patch-notes-last-good-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const old = serve(api(directory, { fetchJson: async () => archive('Старый заголовок'), loadCardNames: async () => knight }));
  await (await old.get('/patch-notes/recent', 10_000)).json();
  old.close();

  const fetchCardHistory = async (url: string) => {
    if (url === `${ORIGIN}/api/v1/card-history/constructed_card/BE_285`) return history.BE_285;
    throw Object.assign(new Error('not found'), { status: 404 });
  };
  const rebuilt = serve(api(directory, {
    fetchJson: async () => archive('Новый заголовок'), loadCardNames: async () => knight,
    cardHistoryBaseUrl: `${ORIGIN}/api/v1`, fetchCardHistory, now: () => Date.parse('2026-11-20T12:30:00Z'),
  }));
  try {
    const stale = await rebuilt.get('/patch-notes');
    assert.equal(stale.headers.get('cache-control'), SHORT_CACHE);
    assert.equal((await stale.json()).patches[0].title, 'Старый заголовок', 'the stored copy is served while the archive is rebuilt');
    const fresh = await eventually(() => rebuilt.get('/patch-notes', 10_000), response => response.headers.get('cache-control') === LONG_CACHE);
    assert.deepEqual([fresh.headers.get('cache-control'), (await fresh.json()).patches[0].title], [LONG_CACHE, 'Новый заголовок']);
    const recent = await rebuilt.get('/patch-notes/recent', 10_000);
    assert.equal(recent.headers.get('cache-control'), LONG_CACHE);
    const unknown = await rebuilt.get('/patch-notes/38.0.0');
    assert.deepEqual([unknown.status, unknown.headers.get('cache-control')], [404, 'public, max-age=300']);
  } finally {
    rebuilt.close();
  }

  const body = await eventually(() => restartedRecent(directory), answer => answer.patches[0].entries[0].afterRenderUrl !== null);
  assert.equal(body.patches[0].title, 'Новый заголовок');
  assert.equal(body.updatedAt, '2026-11-20T12:30:00.000Z');
  assert.deepEqual(body.patches[0].entries.map(entry => [entry.beforeRenderUrl, entry.afterRenderUrl]), [[
    `${ORIGIN}/uploads/card-history-media/a5ac8b73d068aa1cc9e5241d8c31fe4215fc8224629111970ff981f62a155f9a.png`,
    `${ORIGIN}/uploads/card-history-media/0b324f4aaaacdaa07ae9688f46d1ec73f5ad75f932c9c46c3096a78f2074bf47.png`,
  ]]);
});

test('the pictures of an older build, read while a newer build is being stored, never overwrite the newer copy', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'patch-notes-last-good-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  // The disk is the boundary held here: the newer build's write waits until the older build's pictures have arrived.
  const file = new PatchNotesLastGoodFile({ stateDirectory: directory });
  let openDisk!: () => void;
  const disk = new Promise<void>(resolve => { openDisk = resolve; });
  let newerWriteStarted!: () => void;
  const newerWrite = new Promise<void>(resolve => { newerWriteStarted = resolve; });
  const written: string[] = [];
  const lastGood: PatchNotesLastGoodStorage = {
    read: () => file.read(),
    write: async snapshot => {
      if (snapshot.patches[0].title === 'Новая сборка') {
        newerWriteStarted();
        await disk;
      }
      written.push(snapshot.patches[0].title);
      await file.write(snapshot);
    },
  };
  // The older build's card history answers when the test says so (the newer build of the same patch reuses that read).
  let answerOlderHistory!: () => void;
  const olderHistory = new Promise<void>(resolve => { answerOlderHistory = resolve; });
  let historyReads = 0;
  const fetchCardHistory = async () => {
    historyReads += 1;
    if (historyReads > 1) return hung();
    await olderHistory;
    return history.BE_285;
  };
  let clock = Date.parse('2026-11-20T12:00:00Z');
  let title = 'Старая сборка';
  const server = serve(api(directory, {
    fetchJson: async () => archive(title), loadCardNames: async () => knight, lastGood,
    cardHistoryBaseUrl: `${ORIGIN}/api/v1`, fetchCardHistory, now: () => clock,
  }));
  try {
    assert.equal((await (await server.get('/patch-notes', 10_000)).json()).patches[0].title, 'Старая сборка');
    clock = Date.parse('2026-11-20T12:31:00Z');
    title = 'Новая сборка';
    assert.equal((await (await server.get('/patch-notes')).json()).patches[0].title, 'Старая сборка', 'the expired build is served while the newer one is built');
    await newerWrite;
    answerOlderHistory();
    await delay(100);
    openDisk();
    const fresh = await eventually(async () => (await (await server.get('/patch-notes')).json()).patches[0].title as string, value => value === 'Новая сборка');
    assert.equal(fresh, 'Новая сборка');
    await delay(100);
  } finally {
    server.close();
  }
  assert.deepEqual(written, ['Старая сборка', 'Новая сборка', 'Новая сборка'],
    'the older build, the newer one, the newer one with its pictures; never the older one\'s pictures after the newer build');
  assert.equal((await restartedRecent(directory)).patches[0].title, 'Новая сборка');
});
