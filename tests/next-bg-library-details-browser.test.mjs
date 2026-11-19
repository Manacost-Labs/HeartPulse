import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { createPublicWebGateway } from '../scripts/public-web-gateway.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';
import { isAbortedRoutePrefetch } from './helpers/abortedRoutePrefetch.mjs';
import { isMenuBackgroundRead, MENU_PATCH_ARCHIVE } from './helpers/menuBackgroundReads.mjs';

const axe = readFileSync(fileURLToPath(import.meta.resolve('axe-core')), 'utf8');
const placeholder = readFileSync(new URL('../public/arena-logo-icon.webp', import.meta.url));
// The open layer of a minion: ten facts (type, tier, tribe, attack/health, text, one mechanic, the golden version, name), so
// its page is indexable. Closed marks ride along in the answer on purpose: no page may print them.
const thin = {
  dbfId: 98582, kind: 'minion', nameRu: 'Баюбот', typeName: 'Существо',
  textRu: 'Магнетизм', images: { card: '/assets/og-preview.png' }, winrate: 'PRIVATE_CARD_WINRATE',
};
const card = { card: {
  ...thin,
  tavernTier: 1, tribe: 'Механизм', attack: 2, health: 2, mechanics: ['Магнетизм'], golden: { attack: 4, health: 4 },
  impact: 'PRIVATE_CARD_IMPACT',
}, canonicalPath: '/library/minions/баюбот-98582/',
stats: { avgPlacementWith: 3.9, avgPlacementWithout: 4.2, popularity: 7.5, gamesWith: 900, updatedAt: '2026-11-19T02:45:13.000Z',
  combatWinrate: 'PRIVATE_STATS_WINRATE', rounds: ['PRIVATE_STATS_ROUNDS'] },
related: [{ dbfId: 100026, name: 'Электрический синтезатор', path: '/library/minions/электрический-синтезатор-100026/', tavernTier: 1, tribe: 'Механизм',
  impact: 'PRIVATE_RELATED_IMPACT' }] };
const PRIVATE = ['PRIVATE_CARD_WINRATE', 'PRIVATE_CARD_IMPACT', 'PRIVATE_STATS_WINRATE', 'PRIVATE_STATS_ROUNDS', 'PRIVATE_RELATED_IMPACT'];
const extraKinds = {
  anomalies: 'anomaly', 'dark-gifts': 'dark_gift', quests: 'quest', rewards: 'reward',
  'darkmoon-prizes': 'darkmoon_prize', trinkets: 'trinket', timewarped: 'timewarped',
};

test('Next Battleground card detail keeps public identity and real missing-card status', async () => {
  const legacy = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://fixture').pathname;
    response.setHeader('Content-Type', 'application/json');
    if (pathname === '/api/bg/library/public/minion/98582') { response.end(JSON.stringify(card)); return; }
    if (pathname === '/api/bg/library/public/minion/100026') {
      response.end(JSON.stringify({ ...card, card: { ...card.card, dbfId: 100026,
        nameRu: 'Электрический синтезатор' },
      canonicalPath: '/library/minions/электрический-синтезатор-100026/' })); return;
    }
    if (pathname === '/api/bg/library/public/minion/98583') {
      response.end(JSON.stringify({ card: { ...card.card, dbfId: 98583, textRu: 'А'.repeat(7000) },
        canonicalPath: '/library/minions/long-98583/' })); return;
    }
    if (pathname === '/api/bg/library/public/minion/888888') {
      response.writeHead(503, { 'Retry-After': '120' }).end('{"error":"unavailable"}'); return;
    }
    if (pathname === '/api/bg/library/public/archive/minion/98583') {
      response.end(JSON.stringify({ card: { ...card.card, dbfId: 98583, nameRu: 'Старый механизм' }, stats: null, related: [],
        canonicalPath: '/library/archive/minions/старый-механизм-98583/' })); return;
    }
    if (pathname === '/api/bg/library/public/archive/spell/105752') {
      response.end(JSON.stringify({ card: { ...thin, dbfId: 105752, kind: 'spell',
        nameRu: 'Старое заклинание', typeName: 'Заклинание' },
      canonicalPath: '/library/archive/spells/старое-заклинание-105752/' })); return;
    }
    const extra = pathname.match(/^\/api\/bg\/library\/public\/extra\/(current|archive)\/([^/]+)\/([1-9][0-9]*)$/);
    if (extra && Object.hasOwn(extraKinds, extra[2])) {
      if (extra[3] === '888888') {
        response.writeHead(503, { 'Retry-After': '75' }).end('{"error":"unavailable"}'); return;
      }
      if (extra[3] === (extra[1] === 'archive' ? '102093' : '119142')
        && (extra[1] === 'current' || !['dark-gifts', 'timewarped'].includes(extra[2]))) {
        const prefix = extra[1] === 'archive' ? '/library/archive' : '/library';
        response.end(JSON.stringify({ card: { ...thin, dbfId: Number(extra[3]),
          kind: extraKinds[extra[2]], nameRu: 'Дополнительная карта', typeName: 'Карта' },
        canonicalPath: `${prefix}/${extra[2]}/card-${extra[3]}/` })); return;
      }
    }
    if (pathname.startsWith('/api/bg/library/public/')) { response.writeHead(404).end('{"error":"missing"}'); return; }
    if (pathname === '/api/auth/me') { response.end('{"user":null,"adminAllowed":false,"contestAdminAllowed":false}'); return; }
    if (isMenuBackgroundRead(pathname)) { response.end(JSON.stringify(MENU_PATCH_ARCHIVE)); return; }
    if (pathname.startsWith('/api/')) { response.writeHead(401).end('{"error":"guest"}'); return; }
    response.writeHead(204).end();
  });
  const legacyOrigin = await listenLocal(legacy);
  const reservation = http.createServer(); const nextOrigin = await listenLocal(reservation); await closeLocal(reservation);
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', 'apps/public-web',
    '--hostname', '127.0.0.1', '--port', new URL(nextOrigin).port], {
    env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', RUNTIME_CLIENT_CONFIG_FILE: '', LEGACY_WEB_ORIGIN: legacyOrigin },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = ''; let gateway; let browser;
  child.stdout.on('data', chunk => { output = (output + chunk).slice(-4000); });
  child.stderr.on('data', chunk => { output = (output + chunk).slice(-4000); });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      if (child.exitCode !== null) throw new Error(`Next exited: ${output}`);
      ready = await fetch(`${nextOrigin}/health/next/`).then(response => response.ok, () => false);
      if (ready) break;
      await delay(50);
    }
    assert.ok(ready, `Next did not start: ${output}`);
    gateway = createPublicWebGateway({ legacyOrigin, nextOrigin, enabled: true, pagesEnabled: true });
    const origin = await listenLocal(gateway);
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    const errors = []; const failed = []; const protectedCalls = [];
    page.on('request', request => {
      if (request.url().startsWith('https://hearthpulse.net/assets/')) {
        void request.respond({ status: 200, contentType: 'image/webp', body: placeholder }); return;
      }
      if (/^\/api\/bg\/library\/(?!public\/)/.test(new URL(request.url()).pathname)) protectedCalls.push(request.url());
      void request.continue();
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfailed', request => { if (!isAbortedRoutePrefetch(request)) failed.push(request.url()); });
    for (const width of [1440, 390]) {
      await page.setViewport({ width, height: 900 });
      const response = await page.goto(`${origin}/library/minions/баюбот-98582/`, { waitUntil: 'networkidle2' });
      assert.equal(response.status(), 200, output);
      await page.evaluate(axe);
      const state = await page.evaluate(async () => ({
        html: document.documentElement.outerHTML,
        canonical: document.querySelector('link[rel=canonical]')?.href,
        h1: [...document.querySelectorAll('h1')].map(node => node.textContent?.trim()),
        main: document.querySelectorAll('main').length,
        overflow: document.documentElement.scrollWidth > innerWidth,
        violations: (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }))
          .violations.map(violation => violation.id),
      }));
      assert.deepEqual(state.h1, ['Баюбот']);
      assert.equal(state.main, 1);
      assert.equal(state.overflow, false);
      assert.deepEqual(state.violations, []);
      assert.equal(state.canonical, encodeURI('https://hearthpulse.net/library/minions/баюбот-98582/'));
      for (const mark of PRIVATE) assert.equal(state.html.includes(mark), false, mark);
      // The open layer is in the document: facts, statistics and the related card, before the closed part.
      for (const fact of ['Механизм', '2/2', '4/4', '3,90', '4,20', '7,5%', 'Электрический синтезатор']) assert.ok(state.html.includes(fact), fact);
    }
    assert.deepEqual(errors, []); assert.deepEqual(failed, []); assert.deepEqual(protectedCalls, []);
    const missing = await page.goto(`${origin}/library/minions/missing-999999/`, { waitUntil: 'networkidle2' });
    assert.equal(missing.status(), 404);
    assert.equal(await page.$eval('meta[name="robots"]', node => node.content), 'noindex, nofollow');
    const redirect = await fetch(`${origin}/library/minions/wrong-98582/?utm_source=qa`, { redirect: 'manual' });
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.get('location'), encodeURI('/library/minions/баюбот-98582/') + '?utm_source=qa');
    const cyrillic = await fetch(`${origin}/library/minions/электрический-синтезатор-100026/`);
    assert.equal(cyrillic.status, 200, 'long Cyrillic canonical slugs stay reachable');
    const cyrillicHtml = await cyrillic.text();
    assert.match(cyrillicHtml, /Электрический синтезатор/);
    const cardJsonLd = [...cyrillicHtml.matchAll(/<script\b(?=[^>]*type="application\/ld\+json")(?=[^>]*data-server-entity-jsonld)[^>]*>([\s\S]*?)<\/script>/g)];
    assert.equal(cardJsonLd.length, 1, 'card HTML contains one server entity JSON-LD script');
    assert.ok(JSON.parse(cardJsonLd[0][1])['@graph'].some(node => node.identifier === 100026
      && node.url === encodeURI('https://hearthpulse.net/library/minions/электрический-синтезатор-100026/')));
    const errorsBeforeAdditionalPages = errors.length;
    const failedBeforeAdditionalPages = failed.length;
    const protectedBeforeAdditionalPages = protectedCalls.length;
    const detailPaths = [
      '/library/archive/minions/старый-механизм-98583/',
      '/library/archive/spells/старое-заклинание-105752/',
      ...Object.keys(extraKinds).map(kind => `/library/${kind}/card-119142/`),
      ...Object.keys(extraKinds).filter(kind => !['dark-gifts', 'timewarped'].includes(kind))
        .map(kind => `/library/archive/${kind}/card-102093/`),
    ];
    for (const path of detailPaths) {
      const detail = await fetch(`${origin}${path}`);
      assert.equal(detail.status, 200, path);
      const html = await detail.text();
      const scripts = [...html.matchAll(/<script\b(?=[^>]*type="application\/ld\+json")(?=[^>]*data-server-entity-jsonld)[^>]*>([\s\S]*?)<\/script>/g)];
      const canonical = encodeURI(`https://hearthpulse.net${path}`);
      const identity = Number(path.match(/-([1-9][0-9]*)\/$/)[1]);
      // Only a page with ten open facts is indexable and carries the entity JSON-LD; the others are noindex without it.
      if (path === '/library/archive/minions/старый-механизм-98583/') {
        assert.equal(scripts.length, 1, path);
        assert.ok(JSON.parse(scripts[0][1])['@graph'].some(node =>
          node.identifier === identity && node.url === canonical), path);
        assert.match(html, /<meta name="robots" content="index, follow/, path);
      } else {
        assert.equal(scripts.length, 0, path);
        assert.match(html, /<meta name="robots" content="noindex, follow"/, path);
      }
      assert.equal([...html.matchAll(/<h1(?:\s[^>]*)?>/g)].length, 1, path);
      for (const mark of PRIVATE) assert.equal(html.includes(mark), false, `${path} ${mark}`);
      assert.ok(html.includes(`href="${canonical}"`), path);
    }
    for (const width of [1440, 390]) {
      await page.setViewport({ width, height: 900 });
      for (const path of ['/library/anomalies/card-119142/', '/library/archive/trinkets/card-102093/']) {
        const detail = await page.goto(`${origin}${path}`, { waitUntil: 'networkidle2' });
        assert.equal(detail.status(), 200, path);
        await page.evaluate(axe);
        const state = await page.evaluate(async () => ({
          h1: document.querySelectorAll('h1').length,
          overflow: document.documentElement.scrollWidth > innerWidth,
          violations: (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }))
            .violations.map(violation => violation.id),
        }));
        assert.equal(state.h1, 1, path);
        assert.equal(state.overflow, false, path);
        assert.deepEqual(state.violations, [], path);
      }
    }
    assert.deepEqual(errors.slice(errorsBeforeAdditionalPages), []);
    assert.deepEqual(failed.slice(failedBeforeAdditionalPages), []);
    assert.deepEqual(protectedCalls.slice(protectedBeforeAdditionalPages), []);
    for (const path of ['/library/anomalies/missing-999999/', '/library/archive/dark-gifts/card-102093/']) {
      const missingDetail = await fetch(`${origin}${path}`);
      assert.equal(missingDetail.status, 404, path);
      assert.match(await missingDetail.text(), /noindex/i, path);
    }
    const extraRedirect = await fetch(`${origin}/library/anomalies/wrong-119142/?utm_source=qa`, { redirect: 'manual' });
    assert.equal(extraRedirect.status, 308);
    assert.equal(extraRedirect.headers.get('location'), '/library/anomalies/card-119142/?utm_source=qa');
    const extraOutage = await fetch(`${origin}/library/anomalies/card-888888/`);
    assert.equal(extraOutage.status, 503);
    assert.equal(extraOutage.headers.get('retry-after'), '75');
    assert.equal((await fetch(`${origin}/library/anomalies/card-888888/`, { method: 'HEAD' })).status, 503);
    const outage = await fetch(`${origin}/library/minions/outage-888888/`, { redirect: 'manual' });
    assert.equal(outage.status, 503);
    assert.equal(outage.headers.get('retry-after'), '120');
    assert.equal(outage.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.match(outage.headers.get('cache-control') ?? '', /no-store/);
    assert.match(await outage.text(), /временно недоступн/i);
    const headOutage = await fetch(`${origin}/library/minions/outage-888888/`, { method: 'HEAD' });
    assert.equal(headOutage.status, 503);
    assert.equal(headOutage.headers.get('retry-after'), '120');
    assert.equal(await headOutage.text(), '');
    const oversized = await fetch(`${origin}/library/minions/long-98583/`);
    assert.equal(oversized.status, 503, 'an oversized projection cannot race a second API fetch');
    assert.equal(oversized.headers.get('retry-after'), '300');
    const outagePage = await page.goto(`${origin}/library/minions/outage-888888/`, { waitUntil: 'networkidle2' });
    assert.equal(outagePage.status(), 503);
    assert.equal(await page.$eval('h1', node => node.textContent), 'Данные временно недоступны');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.close();
  } finally {
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway);
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
    await closeLocal(legacy);
  }
});
