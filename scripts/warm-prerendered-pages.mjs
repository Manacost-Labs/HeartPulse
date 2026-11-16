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
 * until they carry theirs. The pages and the fewest words each has with data
 * are in scripts/lib/post-deploy-data-pages.mjs. It never fails the deploy: the
 * browser loads the data itself, so a page that stays short is reported as a
 * warning ("without data") and the exit code stays 0.
 */
import { countWords, DATA_PAGES, STREAMER_PROFILE_PAGE } from './lib/post-deploy-data-pages.mjs';

const base = process.env.PRODUCTION_BASE_URL || 'https://hearthpulse.net';
const attempts = Number(process.env.WARM_ATTEMPTS || 6);
const delayMs = Number(process.env.WARM_DELAY_MS || 5000);

const nextOrigin = process.env.NEXT_LOCAL_ORIGIN || 'http://127.0.0.1:4321';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const withoutData = [];

// Regenerating while Express is down would replace the build copy with
// another empty one; only do it when the data the pages read is there.
const apiReady = await fetch(new URL('/api/articles', base), { signal: AbortSignal.timeout(10_000) })
  .then(response => response.ok, () => false);
if (!apiReady) {
  console.log('[warm] Express /api/articles is not answering; pages keep the build copy and load data in the browser');
  process.exit(0);
}
try {
  const response = await fetch(new URL('/health/next/revalidate/', nextOrigin), { method: 'POST', signal: AbortSignal.timeout(10_000) });
  console.log(`[warm] revalidate: HTTP ${response.status}`);
} catch (error) {
  console.log(`[warm] revalidate failed: ${error instanceof Error ? error.message : String(error)}`);
}

async function request(origin, path) {
  const response = await fetch(new URL(path, origin), {
    headers: { 'User-Agent': 'hearthpulse-deploy-warmup', Accept: 'text/html' },
    signal: AbortSignal.timeout(15_000),
  });
  const html = await response.text();
  return { status: response.status, cache: response.headers.get('x-nextjs-cache') ?? 'none', words: countWords(html), html };
}

/** Requests the page until it answers 200 with its data (at least `minWords`), never the stale build copy. */
async function warm(origin, { path, minWords }) {
  let last = 'not requested';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const { status, cache, words, html } = await request(origin, path);
      last = `HTTP ${status}, x-nextjs-cache ${cache}, ${words} words`;
      if (status === 200 && cache !== 'STALE' && words >= minWords) {
        console.log(`[warm] ${path}: ${last}`);
        return html;
      }
    } catch (error) {
      last = `request failed: ${error instanceof Error ? error.message : String(error)}`;
    }
    if (attempt < attempts) await sleep(delayMs);
  }
  console.log(`[warm] ${path}: without data after ${attempts} attempts (${last}; at least ${minWords} words expected)`);
  withoutData.push(path);
  return null;
}

// The prerendered pages go through the public address, as a visitor reaches them.
for (const page of DATA_PAGES.filter(item => item.isr)) await warm(base, page);

// Dynamic pages are primed on the local origin: a cold Next process loads
// each route's code on its first request, and the patch notes page keeps its
// Express reads in the Next process (apps/public-web/lib/publicPatchNotesData.ts).
let streamersHtml = null;
for (const page of DATA_PAGES.filter(item => !item.isr)) {
  const html = await warm(nextOrigin, page);
  if (page.path === '/streamers/') streamersHtml = html;
}
const slug = streamersHtml?.match(/href="\/streamers\/([A-Za-z0-9._~-]+)\/"/)?.[1];
if (slug) await warm(nextOrigin, { path: `/streamers/${slug}/`, ...STREAMER_PROFILE_PAGE });

if (withoutData.length) {
  console.log(`[warm] pages still without data: ${withoutData.join(', ')}`);
  console.log(`::warning::pages without data after the deploy warm-up: ${withoutData.join(', ')}`);
} else {
  console.log('[warm] every data page carries its data');
}
