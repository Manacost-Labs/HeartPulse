import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createPatchNotesApi } from '../server/modules/patchNotes/public.js';

// #600: after a restart the archive (about 4 MB from hs-data-api) took minutes to read and /standard/patches/ answered 503.
const ORIGIN = 'https://api.kolodahearthstone.com';
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

/** The copy is stored in the background: restarts on `directory` until a restarted server's `/recent` passes `ready`. */
async function restartedAnswer(directory: string, ready: (body: RecentBody) => boolean): Promise<RecentBody> {
  for (let attempt = 1; ; attempt += 1) {
    const restarted = serve(api(directory, {}));
    try {
      const body = await (await restarted.get('/patch-notes/recent')).json() as RecentBody;
      if (ready(body) || attempt === 40) return body;
    } finally {
      restarted.close();
    }
    await delay(50);
  }
}

type RecentBody = { patches: { title: string; entries: { cardId: string | null; beforeRenderUrl: string | null; afterRenderUrl: string | null }[] }[]; updatedAt: string };

test('a restarted server answers /recent at once from the last good build while the source hangs', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'patch-notes-last-good-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const first = serve(api(directory, { fetchJson: async () => archive('Обновление 37.0.2'), loadCardNames: async () => knight }));
  const built = await (await first.get('/patch-notes/recent', 10_000)).json() as RecentBody;
  first.close();
  assert.equal(built.patches[0].title, 'Обновление 37.0.2');

  let reads = 0;
  const restarted = serve(api(directory, { fetchJson: () => { reads += 1; return hung(); } }));
  try {
    const recent = await restarted.get('/patch-notes/recent');
    assert.equal(recent.status, 200);
    assert.equal(recent.headers.get('cache-control'), 'public, max-age=10', 'an answer from the stored copy is cached only briefly');
    const body = await recent.json() as RecentBody;
    assert.deepEqual(body.patches.map(patch => patch.title), ['Обновление 37.0.2']);
    assert.equal(body.patches[0].entries[0].cardId, 'BE_285');
    assert.equal(body.updatedAt, '2026-11-20T12:00:00.000Z');
    assert.equal((await restarted.get('/patch-notes/37.0.2')).status, 200);
    assert.deepEqual((await (await restarted.get('/patch-notes')).json()).patches.map((patch: { version: string }) => patch.version), ['37.0.2']);
    assert.equal(reads, 1, 'the archive is rebuilt once in the background');
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

test('a successful rebuild replaces the stored copy, with the before/after pictures of the newest patch', async t => {
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
    const stale = await (await rebuilt.get('/patch-notes/recent')).json() as RecentBody;
    assert.equal(stale.patches[0].title, 'Старый заголовок', 'the stored copy is served while the archive is rebuilt');
  } finally {
    rebuilt.close();
  }

  const body = await restartedAnswer(directory, answer => answer.patches[0].entries[0].afterRenderUrl !== null);
  assert.equal(body.patches[0].title, 'Новый заголовок');
  assert.equal(body.updatedAt, '2026-11-20T12:30:00.000Z');
  assert.deepEqual(body.patches[0].entries.map(entry => [entry.beforeRenderUrl, entry.afterRenderUrl]), [[
    `${ORIGIN}/uploads/card-history-media/a5ac8b73d068aa1cc9e5241d8c31fe4215fc8224629111970ff981f62a155f9a.png`,
    `${ORIGIN}/uploads/card-history-media/0b324f4aaaacdaa07ae9688f46d1ec73f5ad75f932c9c46c3096a78f2074bf47.png`,
  ]]);
});
