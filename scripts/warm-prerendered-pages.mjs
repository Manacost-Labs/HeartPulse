#!/usr/bin/env node
/**
 * After a deploy the prerendered data pages still hold the build's empty seed
 * (CI builds without the Express API), and that copy counts as fresh for five
 * minutes. The runner lives on the production host, so it asks the local Next
 * server to mark them stale (POST /health/next/revalidate/, local calls only),
 * requests each page to start the regeneration and waits until a request
 * returns the regenerated copy. It never fails the deploy: the browser loads
 * the data itself until regeneration lands.
 */
const base = process.env.PRODUCTION_BASE_URL || 'https://hearthpulse.net';
const paths = ['/standard/meta/', '/articles/'];
const attempts = Number(process.env.WARM_ATTEMPTS || 6);
const delayMs = Number(process.env.WARM_DELAY_MS || 5000);

const nextOrigin = process.env.NEXT_LOCAL_ORIGIN || 'http://127.0.0.1:4321';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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

async function request(path) {
  const response = await fetch(new URL(path, base), {
    headers: { 'User-Agent': 'hearthpulse-deploy-warmup', Accept: 'text/html' },
    signal: AbortSignal.timeout(15_000),
  });
  await response.arrayBuffer();
  return { status: response.status, cache: response.headers.get('x-nextjs-cache') ?? 'none' };
}

for (const path of paths) {
  let last = 'not requested';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const { status, cache } = await request(path);
      last = `HTTP ${status}, x-nextjs-cache ${cache}`;
      // The first answer after a deploy is the build copy (STALE); a later HIT is the regenerated one.
      if (attempt > 1 && status === 200 && cache === 'HIT') break;
    } catch (error) {
      last = `request failed: ${error instanceof Error ? error.message : String(error)}`;
    }
    if (attempt < attempts) await sleep(delayMs);
  }
  console.log(`[warm] ${path}: ${last}`);
}
