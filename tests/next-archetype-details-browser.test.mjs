import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { createPublicWebGateway } from '../scripts/public-web-gateway.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';
import { isAbortedRoutePrefetch } from './helpers/abortedRoutePrefetch.mjs';

const teaser = {
  format: 'wild', formatLabel: 'Вольный', patch: '36.0.3', minimumGames: 50,
  updatedAt: '2026-07-24T12:38:57.727Z', account: 'PRIVATE_ACCOUNT',
  item: {
    slug: 'thief-priest', archetype: 'Thief Priest', archetypeLabel: 'Воровской Жрец',
    translated: true, classKey: 'priest', format: 'wild', games: 31959,
    winrate: 58.3, popularity: 13.5, turns: 7.9, durationMinutes: 8,
    climbingSpeed: 1.24, deckCount: 1, sourceUrl: 'https://www.hsguru.com/meta',
    builds: [{ deckCode: 'PRIVATE_DECK' }],
  },
  featuredBuild: { games: 2216, winrate: 57.1, updatedAt: null,
    sampleRank: 'all', samplePeriod: 'past_30_days', deckCode: 'PRIVATE_FEATURED_DECK' },
  history: [{ recordedAt: 'PRIVATE_HISTORY' }], analysis: { private: 'PRIVATE_ANALYSIS' },
};
const axe = readFileSync(fileURLToPath(import.meta.resolve('axe-core')), 'utf8');
const placeholder = readFileSync(new URL('../public/arena-logo-icon.webp', import.meta.url));

test('Next archetype details isolate access and load builds before independent optional sections', async () => {
  let member = false, optionalMode = 'hold', coreFails = false;
  let releaseOptional;
  let optionalGate = new Promise(resolve => { releaseOptional = resolve; });
  const sectionCalls = [];
  const legacy = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    const pathname = new URL(request.url, 'http://fixture').pathname;
    if (pathname === '/api/constructed-archetypes/teaser/wild/thief-priest') {
      response.end(JSON.stringify(teaser)); return;
    }
    if (pathname.startsWith('/api/constructed-archetypes/teaser/')) {
      response.writeHead(404).end('{"error":"missing"}'); return;
    }
    if (pathname === '/api/constructed-archetypes/wild/thief-priest') {
      const section = new URL(request.url, 'http://fixture').searchParams.get('section');
      sectionCalls.push(section);
      if (!member) { response.writeHead(403).end('{"error":"denied"}'); return; }
      if (section === 'core') {
        if (coreFails) { response.writeHead(502).end('{"error":"Сборки временно недоступны"}'); return; }
        response.end(JSON.stringify({ ...teaser, item: { ...teaser.item, builds: [{ deckCode: 'AAEBAa0GValidDeckCode', games: 2216, winrate: 57.1, sourceUrl: '', classKey: 'priest' }] }, history: [], analysis: null })); return;
      }
      if (optionalMode === 'denied' && section === 'analysis') { response.writeHead(403).end('{"error":"access revoked"}'); return; }
      if (optionalMode === 'error') { response.writeHead(502).end('{"error":"Временная ошибка истории"}'); return; }
      const answer = () => { if (!response.destroyed) response.end(JSON.stringify(section === 'history' ? { history: [] } : { analysis: null })); };
      if (optionalMode === 'hold' || optionalMode === 'denied') void optionalGate.then(answer); else answer(); return;
    }
    if (pathname === '/api/subscription/status') { response.end(JSON.stringify({ hasAccess: member === true, entitlements: { standard: member === true }, active: member === true })); return; }
    if (pathname === '/api/deck/render') { response.end(JSON.stringify({ ok: true, ready: true, imageUrl: '/arena-logo-icon.webp', renderer: 'rust', style: 'parchment' })); return; }
    if (pathname === '/api/deck/resolve') { response.end(JSON.stringify({ ok: true, cards: [], sideboards: [], totalCards: 30, deckSizeLimit: 30 })); return; }
    if (pathname === '/api/auth/me' && member) { response.end(JSON.stringify({ user: { id: 'test-member', name: 'Тест', email: 'member@example.test', role: member === 'admin' ? 'admin' : 'user', adminAllowed: member === 'admin' } })); return; }
    if (pathname === '/api/auth/me') {
      response.end('{"user":null,"adminAllowed":false,"contestAdminAllowed":false}'); return;
    }
    if (pathname.startsWith('/api/')) {
      response.writeHead(401).end('{"error":"guest"}'); return;
    }
    if (/\.(?:webp|png|jpg|jpeg)$/.test(pathname)) {
      response.setHeader('Content-Type', 'image/webp'); response.end(placeholder); return;
    }
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
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = []; const failed = []; const protectedCalls = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfailed', request => { if (!isAbortedRoutePrefetch(request)) failed.push(request.url()); });
    page.on('request', request => {
      if (/^\/api\/constructed-archetypes\/(?!teaser\/)/.test(new URL(request.url()).pathname)) protectedCalls.push(request.url());
    });
    for (const [family, width] of [['archetypes', 1440], ['meta', 390]]) {
      await page.setViewport({ width, height: 900 });
      const path = `/standard/${family}/wild/thief-priest/`;
      const response = await page.goto(`${origin}${path}`, { waitUntil: 'networkidle2' });
      assert.equal(response.status(), 200);
      await page.evaluate(axe);
      const document = await page.evaluate(async () => ({
        html: document.documentElement.outerHTML,
        canonical: document.querySelector('link[rel=canonical]')?.href,
        robots: document.querySelector('meta[name=robots]')?.content,
        h1: [...document.querySelectorAll('h1')].map(node => node.textContent?.trim()),
        main: document.querySelectorAll('main').length,
        overflow: document.documentElement.scrollWidth > innerWidth,
        accessibility: (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }))
          .violations.map(violation => violation.id),
      }));
      assert.deepEqual(document.h1, ['Воровской Жрец']);
      assert.equal(document.main, 1);
      assert.equal(document.overflow, false);
      assert.deepEqual(document.accessibility, []);
      assert.equal(document.canonical, `https://hearthpulse.net${path}`);
      assert.match(document.robots, /noindex/);
      assert.match(document.robots, /follow/);
      assert.equal(document.html.includes('PRIVATE_'), false);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
    assert.deepEqual(protectedCalls, []);
    for (const path of ['/standard/archetypes/invalid/thief-priest/', '/standard/meta/wild/missing/']) {
      assert.equal((await page.goto(`${origin}${path}`, { waitUntil: 'networkidle2' })).status(), 404);
    }
    member = true;
    await page.evaluateOnNewDocument(() => {
      window.__detailCls = 0;
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__detailCls += entry.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    const started = Date.now();
    await page.goto(`${origin}/standard/archetypes/wild/thief-priest/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.archetype-builds', { timeout: 5_000 });
    assert.ok(Date.now() - started < 5_000, 'builds must render while optional responses remain held');
    assert.equal(await page.$eval('h1', node => node.textContent), 'Воровской Жрец');
    await page.waitForFunction(() => document.querySelectorAll('section[data-loading=true]').length === 2);
    await delay(10_000);
    assert.ok(await page.$('.archetype-builds'), 'ten seconds of optional latency must not hide the build');
    assert.deepEqual(sectionCalls.slice(-3).sort(), ['analysis', 'core', 'history']);
    assert.ok(await page.evaluate(() => window.__detailCls < 0.1), 'core loading must not push visible optional placeholders away');
    releaseOptional();
    await page.waitForFunction(() => document.querySelectorAll('section[data-loading=true]').length === 0);
    optionalMode = 'error';
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForFunction(() => document.querySelectorAll('button').length > 0 && [...document.querySelectorAll('button')].some(node => node.textContent === 'Повторить загрузку'));
    assert.ok(await page.$('.archetype-builds'), 'optional errors leave the build usable');
    assert.ok(await page.$eval('section[aria-label="История архетипа"] button', node => node.getBoundingClientRect().height >= 44));
    await page.evaluate(axe);
    assert.deepEqual(await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(item => item.id)), []);
    const coreCalls = sectionCalls.filter(section => section === 'core').length;
    optionalMode = 'ready';
    const retry = await page.$('section[aria-label="История архетипа"] button'); await retry.click();
    await page.waitForSelector('.archetype-history');
    assert.equal(sectionCalls.filter(section => section === 'core').length, coreCalls, 'retry only the failed block');
    coreFails = true;
    await page.reload({ waitUntil: 'networkidle2' });
    assert.equal(await page.$eval('h1', node => node.textContent), 'Воровской Жрец', 'public identity survives a core failure');
    const optionalCalls = sectionCalls.filter(section => section !== 'core').length;
    coreFails = false;
    await page.click('section[aria-label="Сборки архетипа"] button');
    await page.waitForSelector('.archetype-builds');
    assert.equal(sectionCalls.filter(section => section !== 'core').length, optionalCalls);
    optionalGate = new Promise(resolve => { releaseOptional = resolve; });
    optionalMode = 'denied';
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.textContent.includes('Доступ изменился'));
    assert.equal(await page.$('.archetype-builds'), null, 'a rejected section immediately removes all protected data');
    releaseOptional();
    await delay(300);
    assert.equal(await page.$('.archetype-history'), null, 'a late cancelled history reply must not restore paid data');
    optionalMode = 'ready';
    const chunkDirectory = new URL('../apps/public-web/.next/static/chunks/', import.meta.url);
    const analysisChunks = readdirSync(chunkDirectory, { recursive: true }).filter(file => file.endsWith('.js')
      && readFileSync(new URL(file, chunkDirectory), 'utf8').includes('constructed-analysis-stack'));
    assert.ok(analysisChunks.length > 0, 'the build must contain the optional analysis chunk');
    const chunkPage = await browser.newPage();
    const blockedChunks = [];
    await chunkPage.setCacheEnabled(false);
    await chunkPage.setRequestInterception(true);
    chunkPage.on('request', request => {
      const blocked = analysisChunks.some(file => new URL(request.url()).pathname.endsWith(`/${file}`));
      if (blocked) blockedChunks.push(request.url());
      void (blocked ? request.abort() : request.continue()).catch(() => {});
    });
    await chunkPage.goto(`${origin}/standard/archetypes/wild/thief-priest/`, { waitUntil: 'networkidle2' });
    await chunkPage.waitForSelector('section[aria-label="Матчапы и муллиган"] [data-recovery-state="error"]');
    assert.ok(blockedChunks.length > 0, 'the analysis chunk failure must actually be exercised');
    assert.ok(await chunkPage.$('.archetype-builds'), 'an optional code failure must not remove the build');
    assert.equal(await chunkPage.$eval('h1', node => node.textContent), 'Воровской Жрец');
    await chunkPage.close();
    member = false;
    await page.reload({ waitUntil: 'networkidle2' });
    assert.equal(await page.$('.archetype-builds'), null, 'logout removes protected builds');
    assert.equal(await page.$('.archetype-history'), null, 'logout removes protected history');
    member = 'admin';
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('.archetype-builds');
    assert.ok(await page.$('.archetype-history'), 'administrator access remains independent of a subscription');
    await page.close();
  } finally {
    releaseOptional();
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway);
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
    await closeLocal(legacy);
  }
});
