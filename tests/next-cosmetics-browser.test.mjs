import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { createPublicWebGateway } from '../scripts/public-web-gateway.mjs';

const axe = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const pagination = { page: 1, perPage: 48, total: 1, totalPages: 1 };
const hero = { cardId: 'HERO_QA_001', dbf: 123, name: { ru: 'Контрольный герой', en: 'Fixture Hero' },
  class: { slug: 'mage', nameRu: 'Маг' }, rarity: { slug: 'base', nameRu: 'Базовый' },
  categorySlugs: [], images: { static: '/arena-logo-icon.webp', animated: null } };
const coin = { cardId: 'COIN_QA_001', dbf: 456, name: { ru: 'Контрольная монета', en: 'Fixture Coin' },
  textRu: null, images: { card: '/arena-logo-icon.webp', crop: '/arena-logo-icon.webp' } };
const pet = { cardId: 'PET_QA_001', dbf: 789, variantId: 1, name: 'Контрольный питомец', level: 1,
  images: { card: '/arena-logo-icon.webp' } };
const heroDetail = { ...hero, health: null, character: null, actor: null, artist: null,
  categories: [], images: { ...hero.images, fullArt: null }, gallery: [], sounds: [], sourceUrl: null };
const coinDetail = { ...coin, text: { ru: null, en: null },
  images: { ...coin.images, golden: null, wiki: null }, generatedBy: [], related: [] };
const petDetail = { ...pet, pet: { id: 1, name: 'Семейство' },
  images: { ...pet.images,
    endScreen: 'https://hearthstone.wiki.gg/wiki/Special:Redirect/file/Pet_EndScreen.png' },
  gallery: [], variants: [pet] };

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}

test('Next cosmetics catalogs and details preserve status, metadata, media and mobile layout', async () => {
  assert.equal(existsSync('apps/public-web/.next/BUILD_ID'), true, 'run build:next before browser QA');
  const catalogRequests = [];
  const detailCookies = [];
  const legacy = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://fixture');
    const path = url.pathname;
    if (path.startsWith('/api/cosmetics/')) catalogRequests.push(`${path}${url.search}`);
    if (/^\/api\/cosmetics\/(heroes|coins|pets)\/[^/]+$/.test(path)) detailCookies.push(request.headers.cookie ?? '');
    if (path.startsWith('/api/card-image/') || path.startsWith('/api/public-resource/wiki/')) {
      response.setHeader('Content-Type', 'image/webp');
      response.end(readFileSync('public/arena-logo-icon.webp'));
      return;
    }
    const publicRoot = resolve('public');
    const staticFile = resolve(publicRoot, `.${path}`);
    if (staticFile.startsWith(`${publicRoot}${sep}`) && existsSync(staticFile) && statSync(staticFile).isFile()) {
      const mime = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
        '.woff2': 'font/woff2', '.otf': 'font/otf' }[extname(staticFile)] ?? 'application/octet-stream';
      response.setHeader('Content-Type', mime);
      response.end(readFileSync(staticFile));
      return;
    }
    const payload = path === '/api/auth/me' ? { user: null }
      : path === '/api/cosmetics/heroes' ? { items: [hero], pagination, updatedAt: null, source: 'fixture' }
        : path === '/api/cosmetics/coins' ? { items: [coin], generatedBy: [], related: [], pagination, updatedAt: null, source: 'fixture' }
          : path === '/api/cosmetics/pets' ? { items: [{ petId: 1, name: 'Семейство', variants: [pet] }], pagination, updatedAt: null, source: 'fixture' }
            : path === '/api/cosmetics/heroes/HERO_QA_001' ? heroDetail
              : path === '/api/cosmetics/coins/COIN_QA_001' ? coinDetail
                : path === '/api/cosmetics/pets/PET_QA_001' ? petDetail
            : null;
    response.setHeader('Content-Type', 'application/json');
    if (path.endsWith('/UNAVAILABLE')) {
      response.writeHead(502).end(JSON.stringify({ error: 'unavailable' }));
      return;
    }
    response.writeHead(payload ? 200 : 404).end(JSON.stringify(payload ?? { error: 'missing' }));
  });
  const legacyOrigin = await listen(legacy);
  const reservation = http.createServer();
  const nextOrigin = await listen(reservation);
  await close(reservation);
  const next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', 'apps/public-web',
    '--hostname', '127.0.0.1', '--port', new URL(nextOrigin).port], {
    env: { ...process.env, LEGACY_WEB_ORIGIN: legacyOrigin, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  next.stdout.on('data', chunk => { output = (output + chunk).slice(-1500); });
  next.stderr.on('data', chunk => { output = (output + chunk).slice(-1500); });
  let gateway; let browser;
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      ready = await fetch(`${nextOrigin}/health/next/`).then(response => response.ok, () => false);
      if (ready) break;
      await delay(100);
    }
    assert.equal(ready, true, output);
    gateway = createPublicWebGateway({ legacyOrigin, nextOrigin, enabled: true, pagesEnabled: true });
    const origin = await listen(gateway);
    const filteredHtml = await (await fetch(`${origin}/cosmetics/heroes/?class=mage`)).text();
    assert.match(filteredHtml, /<h1>Скины героев<\/h1>/);
    assert.match(filteredHtml, /<link rel="canonical" href="https:\/\/hearthpulse\.net\/cosmetics\/heroes\/"/);
    const robotsMeta = filteredHtml.match(/<meta name="robots" content="([^"]+)"/)?.[1] ?? '';
    assert.match(robotsMeta, /noindex/);
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const listings = [
      ['/cosmetics/', 'Скины героев', 'Контрольный герой'],
      ['/cosmetics/heroes/?class=mage', 'Скины героев', 'Контрольный герой'],
      ['/cosmetics/coins/', 'Косметические монеты', 'Fixture Coin'],
      ['/cosmetics/pets/', 'Питомцы', 'Контрольный питомец'],
    ];
    for (const width of [1440, 390, 320]) {
      const page = await browser.newPage();
      await page.setViewport({ width, height: 900 });
      const errors = []; const failed = []; const httpErrors = []; const mediaRequests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('requestfailed', request => failed.push(request.url()));
      page.on('request', request => {
        if (/\.(?:webm|mp3|ogg)(?:$|\?)/i.test(request.url())) mediaRequests.push(request.url());
      });
      page.on('response', response => {
        if (response.status() >= 400) httpErrors.push(`${response.status()} ${new URL(response.url()).pathname}`);
      });
      for (const [path, heading, card] of listings) {
        const response = await page.goto(`${origin}${path}`, { waitUntil: 'networkidle2' });
        assert.equal(response.status(), 200, `${path} at ${width}px`);
        await page.evaluate(axe);
        const state = await page.evaluate(async () => ({
          canonical: document.querySelector('link[rel=canonical]')?.href,
          heading: document.querySelector('h1')?.textContent?.trim(),
          selectedClass: document.querySelector('select[name=cosmetics-class]')?.value,
          robots: document.querySelector('meta[name=robots]')?.content,
          card: document.querySelector('.cosmetics-card')?.textContent?.trim(),
          main: document.querySelectorAll('main').length,
          overflow: document.documentElement.scrollWidth > innerWidth,
          violations: (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }))
            .violations.map(violation => violation.id),
        }));
        assert.equal(state.canonical, `https://hearthpulse.net${path.split('?')[0]}`);
        assert.equal(state.heading, heading);
        if (path.includes('class=mage')) {
          assert.equal(state.selectedClass, 'mage');
          assert.match(state.robots ?? '', /noindex/);
        }
        assert.match(state.card ?? '', new RegExp(card));
        assert.equal(state.main, 1);
        assert.equal(state.overflow, false);
        assert.deepEqual(state.violations, []);
        if (process.env.COSMETICS_SCREENSHOT_DIR &&
          ((width === 390 && path === '/cosmetics/') || (width === 1440 && path === '/cosmetics/coins/'))) {
          await page.screenshot({ path: `${process.env.COSMETICS_SCREENSHOT_DIR}/cosmetics-${width}.png`, fullPage: true });
        }
      }
      for (const [path, heading] of [
        ['/cosmetics/heroes/HERO_QA_001/', 'Контрольный герой'],
        ['/cosmetics/coins/COIN_QA_001/', 'Fixture Coin'],
        ['/cosmetics/pets/PET_QA_001/', 'Контрольный питомец'],
      ]) {
        const html = await (await fetch(`${origin}${path}`)).text();
        assert.match(html, new RegExp(`<h1>${heading}</h1>`), `server HTML for ${path}`);
        assert.match(html, /data-server-entity-jsonld/);
        const response = await page.goto(`${origin}${path}`, { waitUntil: 'networkidle2' });
        assert.equal(response.status(), 200, `${path} at ${width}px`);
        await page.evaluate(axe);
        const state = await page.evaluate(async () => ({
          canonical: document.querySelector('link[rel=canonical]')?.href,
          heading: document.querySelector('h1')?.textContent?.trim(),
          detail: Boolean(document.querySelector('.cosmetics-detail')),
          endScreen: document.querySelector('.cosmetics-end-screen')?.getAttribute('src') ?? null,
          main: document.querySelectorAll('main').length,
          overflow: document.documentElement.scrollWidth > innerWidth,
          violations: (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }))
            .violations.map(violation => violation.id),
        }));
        assert.equal(state.canonical, `https://hearthpulse.net${path}`);
        assert.equal(state.heading, heading);
        assert.equal(state.detail, true);
        if (path.includes('/pets/')) {
          assert.equal(state.endScreen,
            '/api/public-resource/wiki/wiki/Special:Redirect/file/Pet_EndScreen.png');
        }
        assert.equal(state.main, 1);
        assert.equal(state.overflow, false);
        assert.deepEqual(state.violations, []);
        if (process.env.COSMETICS_SCREENSHOT_DIR && path.includes('/heroes/')) {
          await page.screenshot({ path: `${process.env.COSMETICS_SCREENSHOT_DIR}/cosmetics-detail-${width}.png`, fullPage: true });
        }
      }
      assert.deepEqual([...new Set(httpErrors)], []);
      assert.deepEqual([...new Set(errors)], []);
      assert.deepEqual(failed, []);
      assert.deepEqual(mediaRequests, [], 'catalog navigation must not preload animation or audio');
      await page.close();
    }
    assert.equal((await fetch(`${origin}/cosmetics/unknown/`)).status, 404);
    const authenticatedRequest = await fetch(`${origin}/cosmetics/heroes/HERO_QA_001/`, {
      headers: { Cookie: 'session=browser-fixture' },
    });
    assert.equal(authenticatedRequest.status, 200);
    assert.ok(detailCookies.length > 0);
    assert.deepEqual([...new Set(detailCookies)], [''], 'public detail fetch must not forward browser cookies');
    const missing = await fetch(`${origin}/cosmetics/heroes/MISSING/`);
    assert.equal(missing.status, 404);
    assert.match(await missing.text(), /Косметика не найдена/);
    const unavailable = await fetch(`${origin}/cosmetics/heroes/UNAVAILABLE/`);
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.headers.get('retry-after'), '300');
    assert.match(unavailable.headers.get('x-robots-tag') ?? '', /noindex/);
    assert.equal((await fetch(`${origin}/cosmetics/heroes/bad%2Fid/`)).status, 404);
    assert.ok(catalogRequests.some(path => path === '/api/cosmetics/heroes?class=mage'));
  } finally {
    if (browser) await browser.close();
    if (gateway) await close(gateway);
    if (next.exitCode === null) { const exited = once(next, 'exit'); next.kill('SIGTERM'); await exited; }
    await close(legacy);
  }
});
