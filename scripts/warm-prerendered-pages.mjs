#!/usr/bin/env node
/**
 * After a deploy the pages that render Express data may hold a copy without it:
 * - prerendered data pages (ISR) still hold the build's empty seed (CI builds
 *   without the Express API), and that copy counts as fresh for five minutes;
 * - dynamic data pages have no build copy, but a first-paint read that misses
 *   its budget on a cold or busy server ships the document without the data.
 * The runner lives on the production host, so it asks the local Next server to
 * mark the prerendered pages stale (POST /health/next/revalidate/, local calls
 * only), requests each of them to start the regeneration and waits until a
 * request returns a copy with its data. The dynamic pages are requested on the
 * local origin (the edge never stores a copy rendered before the data landed)
 * until they carry theirs. The pages and the marker only the HTML with data
 * has are in scripts/lib/post-deploy-data-pages.mjs.
 * A cold start is the main case: the runner waits for Express (up to
 * WARM_API_WAIT_MS) and keeps going for WARM_TOTAL_MS. A prerendered page that
 * still lacks its data after a regeneration is revalidated again, so an empty
 * copy never stays for five minutes. It never fails the deploy: the browser
 * loads the data itself, so each page that stays without data is reported as
 * a warning ("without data") and the exit code stays 0.
 */
import { countWords, DATA_PAGES, hasMarker, STREAMER_PROFILE_PAGE } from './lib/post-deploy-data-pages.mjs';

const base = process.env.PRODUCTION_BASE_URL || 'https://hearthpulse.net';
const nextOrigin = process.env.NEXT_LOCAL_ORIGIN || 'http://127.0.0.1:4321';
const delayMs = Number(process.env.WARM_DELAY_MS || 5000);
const apiWaitMs = Number(process.env.WARM_API_WAIT_MS || 120_000);
const totalMs = Number(process.env.WARM_TOTAL_MS || 300_000);
// A test may name the pages it serves; production warms all of them.
const only = process.env.WARM_ONLY ? new Set(process.env.WARM_ONLY.split(',')) : null;
const pages = DATA_PAGES.filter(page => !only || only.has(page.path));

const started = Date.now();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const message = error => error instanceof Error ? error.message : String(error);
/** Last outcome of each page: `ok` or why it is still without data. */
const outcome = new Map();

function finish() {
  const without = [...outcome].filter(([, result]) => result !== 'ok').map(([path]) => path);
  for (const [path, result] of outcome) console.log(result === 'ok' ? `[warm] ${path}: with data` : `[warm] ${path}: without data (${result})`);
  if (without.length) {
    console.log(`[warm] pages still without data: ${without.join(', ')}`);
    console.log(`::warning::pages without data after the deploy warm-up: ${without.join(', ')}`);
  } else {
    console.log('[warm] every data page carries its data');
  }
  process.exit(0);
}

// Regenerating while Express is down would replace the build copy with
// another empty one; wait for the data the pages read, as long as allowed.
const apiReady = () => fetch(new URL('/api/articles', base), { signal: AbortSignal.timeout(10_000) })
  .then(response => response.ok, () => false);
const apiDeadline = started + Math.min(apiWaitMs, totalMs);
let ready = await apiReady();
while (!ready && Date.now() + delayMs < apiDeadline) {
  await sleep(delayMs);
  ready = await apiReady();
}
if (!ready) {
  const reason = `Express /api/articles did not answer within ${Math.round((Date.now() - started) / 1000)} s`;
  for (const page of pages) outcome.set(page.path, reason);
  finish();
}

async function request(origin, path) {
  const response = await fetch(new URL(path, origin), {
    headers: { 'User-Agent': 'hearthpulse-deploy-warmup', Accept: 'text/html' },
    signal: AbortSignal.timeout(15_000),
  });
  const html = await response.text();
  return { status: response.status, cache: response.headers.get('x-nextjs-cache') ?? 'none', words: countWords(html), html };
}

/** The page's HTML once it answers 200 with its data and is not the stale build copy; otherwise `null`. */
async function check(origin, page) {
  try {
    const { status, cache, words, html } = await request(origin, page.path);
    if (status === 200 && cache !== 'STALE' && hasMarker(html, page.marker)) {
      outcome.set(page.path, 'ok');
      console.log(`[warm] ${page.path}: HTTP ${status}, x-nextjs-cache ${cache}, ${words} words`);
      return html;
    }
    outcome.set(page.path, `HTTP ${status}, x-nextjs-cache ${cache}, ${words} words, no \`${page.marker}\``);
  } catch (error) {
    outcome.set(page.path, `request failed: ${message(error)}`);
  }
  return null;
}

// The prerendered pages are revalidated and then requested through the public
// address, as a visitor reaches them. A page that is still short after the
// regeneration got an empty copy for five minutes: all of them are revalidated
// again (Next regenerates only what is marked stale) and checked again.
// Dynamic pages are primed on the local origin: a cold Next process loads each
// route's code on its first request, and the patch notes page keeps its Express
// reads in the Next process (apps/public-web/lib/publicPatchNotesData.ts).
const prerendered = pages.filter(page => page.isr);
let dynamic = pages.filter(page => !page.isr);
let prerenderedDone = prerendered.length === 0;
for (const page of pages) outcome.set(page.path, 'not requested yet');
while (!prerenderedDone || dynamic.length) {
  if (!prerenderedDone) {
    try {
      const response = await fetch(new URL('/health/next/revalidate/', nextOrigin), { method: 'POST', signal: AbortSignal.timeout(10_000) });
      console.log(`[warm] revalidate: HTTP ${response.status}`);
    } catch (error) {
      console.log(`[warm] revalidate failed: ${message(error)}`);
    }
    const results = [];
    for (const page of prerendered) results.push(await check(base, page));
    prerenderedDone = results.every(Boolean);
  }
  const pending = [];
  for (const page of dynamic) {
    const html = await check(nextOrigin, page);
    if (!html) pending.push(page);
    else if (page.path === '/streamers/') {
      const slug = html.match(/href="\/streamers\/([A-Za-z0-9._~-]+)\/"/)?.[1];
      if (slug) {
        const profile = { path: `/streamers/${slug}/`, ...STREAMER_PROFILE_PAGE };
        outcome.set(profile.path, 'not requested yet');
        if (!(await check(nextOrigin, profile))) pending.push(profile);
      }
    }
  }
  dynamic = pending;
  if ((prerenderedDone && !dynamic.length) || Date.now() + delayMs >= started + totalMs) break;
  await sleep(delayMs);
}
finish();
