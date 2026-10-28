/**
 * Real-route skeleton geometry and CLS.
 *
 * tests/skeleton-geometry-browser.test.mjs compares Storybook stories; this
 * test runs the PRODUCTION Next app (`next start apps/public-web`) behind
 * scripts/public-web-gateway.mjs against a local fixture backend. For each
 * route in tests/helpers/skeletonRouteFixtures.mjs and each viewport it
 * holds the route's data request, measures the skeleton, releases the
 * request, measures the loaded view, and asserts:
 *   - the skeleton parts match the loaded parts (fixed structures ≤2 px
 *     width and x, ≤4 px top and height; variable text within the real
 *     short/long loaded range; containers reserve one viewport of content);
 *   - the layout-shift score from release to the settled loaded view is 0.
 *
 * Prerequisite: a production build of apps/public-web from the same source,
 *   npm run build:next        (writes apps/public-web/.next/BUILD_ID)
 * with a node_modules that satisfies package-lock.json, and Chrome at
 * CHROMIUM_PATH or /usr/bin/google-chrome.
 *
 * Run:  node --test tests/skeleton-route-geometry-browser.test.mjs
 * Env:  SKELETON_ROUTES=fun-decks,guide-detail  only these route ids (also runs `awaits` routes)
 *       SKELETON_CLS_SCROLL=top                observe the swap at the page top instead of
 *                                              with the main container (first part) at the viewport top
 *       SKELETON_SCREENSHOT_DIR=<dir>          save skeleton/loaded screenshots
 *       SKELETON_REPORT=<file.json>            write every measurement
 *
 * Verification contract: docs/specs/loading-surfaces.md (fonts, finite
 * animations, lazy content scrolled into view, pointer moved away).
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { createPublicWebGateway } from '../scripts/public-web-gateway.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';
import { SKELETON_ROUTES } from './helpers/skeletonRouteFixtures.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const VIEWPORTS = [
  { name: 'mobile', width: 412, height: 915, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
];
const TOLERANCE = { width: 2, x: 2, top: 4, height: 4 };
const DESKTOP_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const ENTITLEMENTS = { arena: true, battlegrounds: true, standard: true, contests: true, guidesArchive: true, arenaArticles: true, battlegroundsArticles: true };
const STATIC_TYPES = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.otf': 'font/otf', '.ico': 'image/x-icon', '.css': 'text/css', '.js': 'text/javascript' };
const selectedRoutes = process.env.SKELETON_ROUTES
  ? SKELETON_ROUTES.filter(route => process.env.SKELETON_ROUTES.split(',').includes(route.id))
  // A route marked `awaits` cannot show a skeleton yet (see its reason); name it explicitly to measure it.
  : SKELETON_ROUTES.filter(route => !route.awaits);
const screenshotDir = process.env.SKELETON_SCREENSHOT_DIR || '';

/** Local Express stand-in: route answers, held requests, a subscribed viewer, public files and sized SVG media. */
function createFixtureBackend() {
  const state = { route: null, variant: 'long', holding: false, held: [], heldSeen: 0, unknown: new Set() };
  const publicRoot = resolve(ROOT, 'public');
  const send = (response, { status = 200, body }) => {
    if (response.destroyed || response.writableEnded) return;
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body));
  };
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://fixture');
    const browser = Boolean(request.headers['x-forwarded-host']);
    const route = state.route;
    if (route && state.holding && route.hold(url, { browser })) {
      state.heldSeen++;
      state.held.push(() => send(response, route.respond(url, { browser, variant: state.variant })
        ?? { status: 404, body: { error: 'missing' } }));
      return;
    }
    const answer = route?.respond(url, { browser, variant: state.variant });
    if (answer) { send(response, answer); return; }
    const size = /^\/fixture-media\/(\d+)x(\d+)\.svg$/.exec(url.pathname);
    if (size) {
      response.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
      response.end(`<svg xmlns="http://www.w3.org/2000/svg" width="${size[1]}" height="${size[2]}"><rect width="100%" height="100%" fill="#8a6a3c"/></svg>`);
      return;
    }
    if (url.pathname === '/api/auth/me') {
      send(response, { body: { user: { id: 'skeleton-member', name: 'Тест', email: 'member@example.test', role: 'user' } } }); return;
    }
    if (url.pathname === '/api/subscription/status') {
      send(response, { body: { hasAccess: true, active: true, entitlements: ENTITLEMENTS, source: 'fixture', checkedAt: new Date().toISOString(),
        stale: false, message: '', boosty: {}, patreon: {}, telegram: {} } }); return;
    }
    if (url.pathname === '/api/deck/render') {
      send(response, { body: { ok: true, ready: true, imageUrl: '/fixture-media/2048x2048.svg?deck', renderer: 'fixture', style: 'parchment' } }); return;
    }
    if (url.pathname === '/api/deck/resolve') {
      send(response, { body: { ok: true, cards: [], sideboards: [], totalCards: 30, deckSizeLimit: 30 } }); return;
    }
    if (url.pathname.startsWith('/api/telemetry/')) { response.writeHead(204).end(); return; }
    if (url.pathname.startsWith('/api/')) {
      state.unknown.add(url.pathname);
      send(response, { status: 404, body: { error: 'missing' } }); return;
    }
    let file = null;
    try { file = resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`); } catch { /* invalid escape */ }
    if (file?.startsWith(publicRoot + sep) && existsSync(file) && statSync(file).isFile()) {
      response.writeHead(200, { 'Content-Type': STATIC_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' });
      response.end(readFileSync(file)); return;
    }
    response.writeHead(404).end();
  });
  return {
    server, state,
    use(route, variant, holding) { Object.assign(state, { route, variant, holding, heldSeen: 0 }); },
    release() { state.holding = false; for (const answer of state.held.splice(0)) answer(); },
  };
}

async function startNext(legacyOrigin) {
  const reservation = http.createServer(); const nextOrigin = await listenLocal(reservation); await closeLocal(reservation);
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', 'apps/public-web',
    '--hostname', '127.0.0.1', '--port', new URL(nextOrigin).port], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', RUNTIME_CLIENT_CONFIG_FILE: '', LEGACY_WEB_ORIGIN: legacyOrigin },
  });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output = (output + chunk).slice(-4000); });
  for (let attempt = 0; attempt < 300; attempt++) {
    if (child.exitCode !== null) throw new Error(`Next exited: ${output}`);
    if (await fetch(`${nextOrigin}/health/next/`).then(response => response.ok, () => false)) return { child, nextOrigin };
    await delay(100);
  }
  child.kill('SIGTERM');
  throw new Error(`Next did not start: ${output}`);
}

/** A fresh, isolated page: no shared storage or cache, outside requests blocked, layout shifts recorded. */
async function openPage(browser, origin, viewport) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport(viewport);
  await page.setUserAgent(viewport.isMobile ? MOBILE_UA : DESKTOP_UA);
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    const local = url.origin === origin || url.protocol === 'data:' || url.protocol === 'blob:';
    if (!local) void request.abort('blockedbyclient').catch(() => {});
    else if (/\/(?:telemetry|web-vitals|metrics|analytics)(?:\/|$)/.test(url.pathname)) {
      void request.respond({ status: 204, body: '' }).catch(() => {});
    } else void request.continue().catch(() => {});
  });
  await page.evaluateOnNewDocument(() => {
    window.__shifts = [];
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        window.__shifts.push({ value: entry.value, startTime: entry.startTime, input: entry.hadRecentInput,
          sources: (entry.sources ?? []).map(source => {
            const node = source.node;
            const name = node?.nodeType === 1 ? `${node.tagName.toLowerCase()}${node.className && typeof node.className === 'string' ? `.${node.className.trim().split(/\s+/).join('.')}` : ''}` : '#text';
            return `${name} ${Math.round(source.previousRect.y)}→${Math.round(source.currentRect.y)} h${Math.round(source.previousRect.height)}→${Math.round(source.currentRect.height)}`;
          }) });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  return { context, page };
}

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime))
    .map(animation => animation.finished.catch(() => {}))));
  await page.mouse.move(0, 0);
}

/** Document-relative box of the n-th match, measured after its lazy content and images are in view. */
async function measure(page, selector, index = 0) {
  const handle = (await page.$$(selector))[index];
  if (!handle) return null;
  await handle.evaluate(async element => {
    element.scrollIntoView({ block: 'center' });
    const images = [...element.querySelectorAll('img')].filter(image => !image.complete);
    await Promise.race([
      Promise.all(images.map(image => new Promise(done => {
        image.addEventListener('load', done, { once: true }); image.addEventListener('error', done, { once: true });
      }))),
      new Promise(done => setTimeout(done, 3000)),
    ]);
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
  await settle(page);
  const box = await handle.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + scrollX, top: rect.top + scrollY, width: rect.width, height: rect.height };
  });
  await handle.dispose();
  return Object.fromEntries(Object.entries(box).map(([key, value]) => [key, Math.round(value * 10) / 10]));
}

async function measureParts(page, route, side) {
  const result = {};
  for (const part of route.parts) result[part.name] = await measure(page, part[side], part.index);
  await page.evaluate(() => scrollTo(0, 0));
  await delay(100);
  return result;
}

async function screenshot(page, name) {
  if (!screenshotDir) return;
  mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({ path: join(screenshotDir, `${name}.png`) });
  await page.screenshot({ path: join(screenshotDir, `${name}-full.png`), fullPage: true });
}

/** Problems of one part; an empty list is a pass. */
function compare(part, skeleton, loaded, short, viewport) {
  if (!skeleton) return ['skeleton part not rendered'];
  if (!loaded) return ['loaded part not rendered'];
  const problems = [];
  const differs = (key, limit) => Math.abs(skeleton[key] - loaded[key]) > limit;
  if (differs('x', TOLERANCE.x)) problems.push(`x ${skeleton.x} vs ${loaded.x}`);
  if (differs('width', TOLERANCE.width)) problems.push(`width ${skeleton.width} vs ${loaded.width}`);
  if (part.top !== false && differs('top', TOLERANCE.top)) problems.push(`top ${skeleton.top} vs ${loaded.top}`);
  if (part.check === 'fixed' && differs('height', TOLERANCE.height)) problems.push(`height ${skeleton.height} vs ${loaded.height}`);
  if (part.check === 'text') {
    const low = Math.min(short?.height ?? loaded.height, loaded.height); const high = Math.max(short?.height ?? loaded.height, loaded.height);
    if (skeleton.height < low - TOLERANCE.height || skeleton.height > high + TOLERANCE.height) {
      problems.push(`height ${skeleton.height} outside real range ${low}–${high}`);
    }
  }
  if (part.check === 'viewport') {
    const reserve = Math.min(loaded.height, viewport.height);
    if (skeleton.height < reserve - TOLERANCE.height) problems.push(`height ${skeleton.height} reserves less than one viewport (${reserve}) of the loaded ${loaded.height}`);
  }
  return problems;
}

async function runRoute({ browser, origin, backend, route, viewport }) {
  const record = { route: route.id, path: route.path, viewport: viewport.name, problems: [], parts: {} };
  const tag = `${route.id}-${viewport.name}`;
  const { context, page } = await openPage(browser, origin, viewport);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let navigation;
  if (route.via) {
    backend.use(route, 'long', false);
    await page.goto(`${origin}${route.via.from}`, { waitUntil: 'networkidle2', timeout: 60_000 });
    await settle(page);
    backend.use(route, 'long', true);
    navigation = page.click(route.via.click).catch(error => error);
  } else {
    backend.use(route, 'long', true);
    navigation = page.goto(`${origin}${route.path}`, { waitUntil: 'load', timeout: 60_000 }).catch(error => error);
  }
  let skeleton = null;
  try {
    // Server-held reads must be released before their ten-second deadline
    // (apps/public-web/lib/expressApi.ts), screenshots and measuring included.
    // Puppeteer's own timeout does not run while a held document has not committed.
    await Promise.race([page.waitForSelector(route.skeleton, { visible: true, timeout: 6_000 }),
      delay(6_000).then(() => { throw new Error('timed out after 6000 ms'); })]);
    for (let wait = 0; backend.state.heldSeen === 0 && wait < 50; wait++) await delay(100);
    if (backend.state.heldSeen === 0) record.problems.push('the held data request was never made');
    await delay(800); // Access checks and remounts settle while data stays held.
    await settle(page);
    skeleton = await measureParts(page, route, 'skeleton');
  } catch (error) {
    record.problems.push(`no skeleton while the data request is held (${route.skeleton}): ${error.message.split('\n')[0]}`);
  }
  if (skeleton) await screenshot(page, `${tag}-skeleton`);
  // The swap is observed with the main container (the first part) at the top
  // of the viewport, where a reader waiting for it looks; layout shifts below
  // the fold would not count. SKELETON_CLS_SCROLL=top observes the page top.
  // Without a skeleton the document may not have committed yet: page
  // scripts would wait for it, so release first and count every shift.
  let swapStart = 0;
  if (skeleton) {
    if (process.env.SKELETON_CLS_SCROLL !== 'top') {
      await page.$eval(route.parts[0].skeleton, element => element.scrollIntoView({ block: 'start' })).catch(() => {});
      await delay(200);
    }
    record.clsScroll = await page.evaluate(() => Math.round(scrollY));
    swapStart = await page.evaluate(() => performance.now());
  }
  backend.release();
  let loaded = null;
  try {
    await page.waitForSelector(route.loaded, { visible: true, timeout: 20_000 });
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 15_000 }).catch(() => {});
    await settle(page);
    await delay(500);
    const shifts = await page.evaluate(() => window.__shifts);
    const counted = shifts.filter(shift => !shift.input);
    record.clsBeforeRelease = Math.round(counted.filter(shift => shift.startTime < swapStart).reduce((sum, shift) => sum + shift.value, 0) * 1e4) / 1e4;
    const swap = counted.filter(shift => shift.startTime >= swapStart);
    record.cls = Math.round(swap.reduce((sum, shift) => sum + shift.value, 0) * 1e4) / 1e4;
    record.shiftSources = swap.flatMap(shift => shift.sources).slice(0, 8);
    if (record.cls !== 0) record.problems.push(`CLS ${record.cls} from loading to loaded: ${record.shiftSources.join('; ')}`);
    await page.evaluate(() => scrollTo(0, 0));
    await screenshot(page, `${tag}-loaded`);
    loaded = await measureParts(page, route, 'loaded');
  } catch (error) {
    record.problems.push(`loaded view did not render (${route.loaded}): ${error.message.split('\n')[0]}`);
  }
  await navigation;
  await context.close();
  let short = null;
  if (route.textVariants && loaded) {
    backend.use(route, 'short', false);
    const shortPage = await openPage(browser, origin, viewport);
    await shortPage.page.goto(`${origin}${route.path}`, { waitUntil: 'networkidle2', timeout: 60_000 });
    await shortPage.page.waitForSelector(route.loaded, { visible: true, timeout: 20_000 });
    await settle(shortPage.page);
    short = await measureParts(shortPage.page, route, 'loaded');
    await shortPage.context.close();
  }
  for (const part of route.parts) {
    const problems = skeleton && loaded ? compare(part, skeleton[part.name], loaded[part.name], short?.[part.name], viewport) : [];
    record.parts[part.name] = { check: part.check, skeleton: skeleton?.[part.name] ?? null, loaded: loaded?.[part.name] ?? null,
      short: short?.[part.name] ?? null, pass: Boolean(skeleton && loaded) && problems.length === 0 };
    record.problems.push(...problems.map(problem => `${part.name}: ${problem}`));
  }
  record.pageErrors = errors;
  return record;
}

test('real routes: skeletons match the loaded layout and the swap does not shift the page', async t => {
  assert.ok(existsSync(join(ROOT, 'apps/public-web/.next/BUILD_ID')), 'run `npm run build:next` before this browser test');
  assert.ok(selectedRoutes.length > 0, `SKELETON_ROUTES matched no route; ids: ${SKELETON_ROUTES.map(route => route.id).join(', ')}`);
  const backend = createFixtureBackend();
  const legacyOrigin = await listenLocal(backend.server);
  let next; let gateway; let browser; const records = [];
  try {
    next = await startNext(legacyOrigin);
    gateway = createPublicWebGateway({ legacyOrigin, nextOrigin: next.nextOrigin, enabled: true, pagesEnabled: true, galleryEnabled: true, timeoutMs: 60_000 });
    const origin = await listenLocal(gateway);
    const executablePath = [process.env.CHROMIUM_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path));
    browser = await launchBrowser({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    for (const route of selectedRoutes) {
      for (const viewport of VIEWPORTS) {
        await t.test(`${route.id} at ${viewport.width}x${viewport.height}`, async subtest => {
          const record = await runRoute({ browser, origin, backend, route, viewport });
          records.push(record);
          for (const [name, part] of Object.entries(record.parts)) {
            const box = value => value ? `${value.width}x${value.height}@${value.top}` : '—';
            subtest.diagnostic(`${record.route} ${record.viewport} ${name} [${part.check}] skeleton ${box(part.skeleton)} loaded ${box(part.loaded)}${part.short ? ` short ${box(part.short)}` : ''} ${part.pass ? 'pass' : 'FAIL'}`);
          }
          subtest.diagnostic(`${record.route} ${record.viewport} CLS swap ${record.cls ?? '—'} at scrollY ${record.clsScroll} (before release ${record.clsBeforeRelease ?? '—'})`);
          assert.deepEqual(record.problems, [], `${route.id} at ${viewport.name}`);
        });
      }
    }
  } finally {
    backend.release();
    if (process.env.SKELETON_REPORT) {
      writeFileSync(process.env.SKELETON_REPORT, JSON.stringify({ records, unknownApi: [...backend.state.unknown] }, null, 2));
    }
    await browser?.close();
    if (gateway) await closeLocal(gateway);
    if (next?.child.exitCode === null) { const exited = once(next.child, 'exit'); next.child.kill('SIGTERM'); await exited; }
    await closeLocal(backend.server);
  }
});
