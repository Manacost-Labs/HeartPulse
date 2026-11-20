import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { openAnswer } from './helpers/standardMatchupsOpenFixture.ts';

// The deploy of a prerendered data page (/standard/meta/, /standard/meta/wild/, /standard/matchups/) against an
// Express that is up, down or busy, on the built Next server:
// - a restart (only the build's empty copy is on disk) and the warm-up's `revalidatePath` make the next request wait
//   for a regeneration; when Express does not answer then, a guest, a robot and a router prefetch (`?_rsc=`) still get a
//   200 with the last good page and never a 500 or the empty stub;
// - when the source is there, the warm-up leaves Next's own copy with the data, whatever the public address answers.

const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const ROBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const PAGES = [
  { path: '/standard/meta/', marker: 'standard-meta__results', text: 'Стандартный архетип 3' },
  { path: '/standard/meta/wild/', marker: 'standard-meta__results', text: 'Вольный архетип 3' },
  { path: '/standard/matchups/', marker: 'standard-matchups-open__matrix', text: 'Открытый архетип 1<' },
];

const metaRows = format => Array.from({ length: 8 }, (_, index) => ({
  id: `${format}-${index + 1}`, slug: `${format}-arch-${index + 1}`, archetype: `Archetype ${format} ${index + 1}`,
  archetypeLabel: `${format === 'wild' ? 'Вольный' : 'Стандартный'} архетип ${index + 1}`, translated: true,
  classKey: index % 2 ? 'mage' : 'priest', winrate: 55 - index, popularity: 12 - index / 2, games: 5000 - index * 300,
  turns: null, durationMinutes: null, climbingSpeed: null,
}));
const metaSlice = format => ({
  format, formatLabel: format === 'wild' ? 'Вольный' : 'Стандарт', rank: 'diamond_legend', rankLabel: 'Алмаз — Легенда',
  period: 'patch_36.6.3', availablePeriods: ['patch_36.6.3'], currentPeriod: 'patch_36.6.3', currentPatchPeriod: 'patch_36.6.3',
  coin: 'any_player', minGames: 100, source: 'hsguru', sourceUrl: 'https://www.hsguru.com/meta', translationSource: '',
  updatedAt: new Date(Date.now() - 3_600_000).toISOString(), totalGames: 99_000, items: metaRows(format),
});

/** `mode`: `up` answers, `down` is a 503, `busy` holds the open projections until the mode changes (Express right after a restart). */
async function startExpress() {
  const state = { mode: 'up', reads: 0, matchupsDown: false };
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://express');
    const json = (status, body) => response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
    if (url.pathname === '/api/auth/me') return json(200, { user: null });
    if (url.pathname === '/api/articles') return json(200, []);
    const meta = url.pathname === '/api/standard-meta/public';
    const matchups = url.pathname === '/api/standard/matchups/public';
    if (!meta && !matchups) return json(404, {});
    state.reads += 1;
    let closed = false;
    request.on('close', () => { closed = true; });
    while (state.mode === 'busy' && !closed) await delay(50);
    if (closed) return undefined;
    if (state.mode === 'down' || (matchups && state.matchupsDown)) return json(503, { error: 'no snapshot' });
    return meta ? json(200, metaSlice(url.searchParams.get('format') === 'wild' ? 'wild' : 'standard'))
      : json(200, openAnswer({ noise: true, format: 'standard' }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const close = async () => { server.closeAllConnections(); await new Promise(done => server.close(done)); };
  return { state, origin: `http://127.0.0.1:${server.address().port}`, close };
}

const startNext = (express, stateDir) => startNextServer({ legacyOrigin: express.origin, readyTimeoutMs: 30_000,
  env: { PAGE_LAST_GOOD_DIR: stateDir, NODE_OPTIONS: `--require=${resolve('tests/helpers/shiftableClock.cjs')}` } });

const get = async (next, page, headers = {}) => {
  const asRoute = headers.RSC === '1';
  const response = await fetch(`${next.origin}${page.path}${asRoute ? '?_rsc=abc12' : ''}`, { headers: { 'User-Agent': BROWSER_UA, ...headers }, signal: AbortSignal.timeout(30_000) });
  return { status: response.status, body: await response.text() };
};
const hasData = (page, { body }) => body.includes(page.marker) && body.replaceAll('<!-- -->', '').includes(page.text);

/** Moves the server's clock past the five-minute window and requests until `ready(answer)`; every answer on the way must not be a 500. */
async function regenerate(next, page, ready, headers) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    process.kill(next.pid, 'SIGUSR2');
    const answer = await get(next, page, headers);
    assert.equal(answer.status, 200, `${page.path} answered ${answer.status}: ${next.output().slice(-300)}`);
    if (ready(answer)) return answer;
    await delay(250);
  }
  return assert.fail(`${page.path} was not regenerated: ${next.output().slice(-300)}`);
}

test('a restart or a revalidation while Express is down or busy never gives a 500 and keeps the last good page', { timeout: 300_000 }, async () => {
  assert.equal(existsSync('apps/public-web/.next/BUILD_ID'), true, 'run build:next before this test');
  const stateDir = mkdtempSync(join(tmpdir(), 'page-last-good-'));
  const express = await startExpress();
  try {
    // The release before: the pages have been regenerated with data once.
    const before = await startNext(express, stateDir);
    try {
      for (const page of PAGES) await regenerate(before, page, answer => hasData(page, answer));
    } finally {
      await before.close();
    }

    // The deploy restarts Next while Express is still down: only the build's empty copy is on disk.
    express.state.mode = 'down';
    const next = await startNext(express, stateDir);
    try {
      for (const page of PAGES) {
        for (const headers of [{}, { 'User-Agent': ROBOT_UA }, { RSC: '1' }]) {
          // Regenerates from the stored slice: the page comes back with its data, never as the stub, and never as a 500.
          const answer = await regenerate(next, page, current => hasData(page, current) || headers.RSC === '1', headers);
          if (headers.RSC !== '1') assert.ok(hasData(page, answer), `${page.path}: the last good page is served, not the stub`);
        }
      }
      // The warm-up marks the pages stale while Express still answers; then it stops answering before the render, as it did
      // on the production restart: the visitor whose request waits for the regeneration must get the last good page.
      express.state.mode = 'up';
      const marked = await (await fetch(`${next.origin}/health/next/revalidate/`, { method: 'POST' })).json();
      for (const path of ['/standard/meta', '/standard/meta/wild', '/standard/matchups']) assert.ok(marked.revalidated.includes(path), `${path} is marked stale`);
      express.state.mode = 'busy';
      const waiting = await Promise.all(PAGES.flatMap(page => [{}, { 'User-Agent': ROBOT_UA }, { RSC: '1' }].map(async headers => ({ page, headers, answer: await get(next, page, headers) }))));
      for (const { page, headers, answer } of waiting) {
        assert.equal(answer.status, 200, `${page.path} ${JSON.stringify(headers)} while Express is busy: ${next.output().slice(-300)}`);
        if (headers.RSC !== '1') assert.ok(hasData(page, answer), `${page.path} keeps the last good page while Express is busy`);
      }
    } finally {
      express.state.mode = 'up';
      await next.close();
    }
  } finally {
    await express.close();
    rmSync(stateDir, { recursive: true, force: true });
  }
});

test('the deploy warm-up leaves Next itself with the data, whatever the public address answers', { timeout: 300_000 }, async () => {
  assert.equal(existsSync('apps/public-web/.next/BUILD_ID'), true, 'run build:next before this test');
  const stateDir = mkdtempSync(join(tmpdir(), 'page-last-good-'));
  const express = await startExpress();
  // The edge still holds the copy of the release before, with the data: a check made there proves nothing about Next.
  const edge = createServer((_request, response) => response.writeHead(200, { 'Content-Type': 'text/html' })
    .end('<main><div class="standard-meta__results standard-matchups-open__matrix"></div></main>'));
  edge.listen(0, '127.0.0.1');
  await once(edge, 'listening');
  // Express is busy for the first seconds after the restart, as on the host: the first revalidation finds no source.
  express.state.mode = 'busy';
  const next = await startNext(express, stateDir);
  try {
    for (const page of PAGES) assert.equal(hasData(page, await get(next, page)), false, `${page.path}: the build copy has no data`);
    setTimeout(() => { express.state.mode = 'up'; }, 7000);
    const child = spawn(process.execPath, ['scripts/warm-prerendered-pages.mjs'], { env: { PATH: process.env.PATH,
      PRODUCTION_BASE_URL: `http://127.0.0.1:${edge.address().port}`, NEXT_LOCAL_ORIGIN: next.origin, EXPRESS_LOCAL_ORIGIN: express.origin,
      WARM_ONLY: PAGES.map(page => page.path).join(','), WARM_DELAY_MS: '500', WARM_TOTAL_MS: '60000' } });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    const [code] = await once(child, 'exit');
    assert.equal(code, 0, output);
    for (const page of PAGES) {
      assert.match(output, new RegExp(`\\[warm\\] ${page.path}: with data`), output);
      // What a visitor gets at once after the warm-up, with no clock shifted and no second request.
      const answer = await get(next, page);
      assert.equal(answer.status, 200);
      assert.ok(hasData(page, answer), `${page.path}: Next itself carries the data right after the warm-up`);
    }
  } finally {
    express.state.mode = 'up';
    await next.close();
    edge.closeAllConnections();
    await new Promise(done => edge.close(done));
    await express.close();
    rmSync(stateDir, { recursive: true, force: true });
  }
});

test('the warm-up asks again only for the pages that still lack their data', { timeout: 300_000 }, async () => {
  assert.equal(existsSync('apps/public-web/.next/BUILD_ID'), true, 'run build:next before this test');
  const stateDir = mkdtempSync(join(tmpdir(), 'page-last-good-'));
  const express = await startExpress();
  express.state.matchupsDown = true;
  const next = await startNext(express, stateDir);
  // Every call of the runner to the route, as the host sees it.
  const calls = [];
  const gateway = createServer(async (incoming, response) => {
    if (incoming.method === 'POST') calls.push(incoming.url);
    const answer = await fetch(`${next.origin}${incoming.url}`, { method: incoming.method, redirect: 'manual' });
    response.writeHead(answer.status, { 'Content-Type': answer.headers.get('content-type') ?? 'text/html',
      'X-Nextjs-Cache': answer.headers.get('x-nextjs-cache') ?? 'none' }).end(await answer.text());
  });
  gateway.listen(0, '127.0.0.1');
  await once(gateway, 'listening');
  try {
    const child = spawn(process.execPath, ['scripts/warm-prerendered-pages.mjs'], { env: { PATH: process.env.PATH,
      NEXT_LOCAL_ORIGIN: `http://127.0.0.1:${gateway.address().port}`, EXPRESS_LOCAL_ORIGIN: express.origin,
      WARM_ONLY: PAGES.map(page => page.path).join(','), WARM_DELAY_MS: '300', WARM_TOTAL_MS: '6000' } });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    const [code] = await once(child, 'exit');
    assert.equal(code, 0, output);
    assert.match(output, /\[warm\] \/standard\/meta\/: with data/, output);
    assert.match(output, /\[warm\] \/standard\/matchups\/: without data/, 'the page whose source never answers is named');
    assert.equal(calls[0], '/health/next/revalidate/', 'the first call is for every page');
    assert.ok(calls.length >= 3, `the runner kept asking: ${JSON.stringify(calls)}`);
    assert.deepEqual([...new Set(calls.slice(1))], ['/health/next/revalidate/?paths=%2Fstandard%2Fmatchups%2F'],
      'only the page without data is revalidated again; the pages with their data are left alone');
  } finally {
    gateway.closeAllConnections();
    await new Promise(done => gateway.close(done));
    await next.close();
    await express.close();
    rmSync(stateDir, { recursive: true, force: true });
  }
});
