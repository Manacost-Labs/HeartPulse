import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { createPublicWebGateway } from '../scripts/public-web-gateway.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

const teaser = {
  slug: 'arena-100-percent', title: 'Арена 100% побед', description: 'Подробное описание',
  image: '/images/arena.png', publishedAt: '2026-07-10T12:00:00.000Z',
  kind: 'Гайды', kindSlug: 'guides', menuName: 'Арена',
  contentHtml: 'PRIVATE_CONTENT', bodyText: 'PRIVATE_BODY', sourceUrl: 'PRIVATE_SOURCE',
};
const axe = readFileSync(fileURLToPath(import.meta.resolve('axe-core')), 'utf8');
const placeholder = readFileSync(new URL('../public/arena-logo-icon.webp', import.meta.url));

test('Next guide detail renders an anonymous teaser, canonicalizes old IDs and returns real 404s', async () => {
  const legacy = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    const pathname = new URL(request.url, 'http://fixture').pathname;
    if (['/api/guides-archive/teaser/arena-100-percent', '/api/guides-archive/teaser/1'].includes(pathname)) {
      response.end(JSON.stringify(teaser)); return;
    }
    if (pathname.startsWith('/api/guides-archive/teaser/')) {
      response.writeHead(404).end('{"error":"missing"}'); return;
    }
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
    env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', LEGACY_WEB_ORIGIN: legacyOrigin },
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
    page.on('requestfailed', request => failed.push(request.url()));
    page.on('request', request => {
      if (/^\/api\/guides-archive\/(?!teaser\/)/.test(new URL(request.url()).pathname)) protectedCalls.push(request.url());
    });
    for (const [slug, width] of [['arena-100-percent', 1440], ['1', 390]]) {
      await page.setViewport({ width, height: 900 });
      const response = await page.goto(`${origin}/guides-archive/${slug}/`, { waitUntil: 'networkidle2' });
      assert.equal(response.status(), 200);
      await page.evaluate(axe);
      const document = await page.evaluate(async () => ({
        html: document.documentElement.outerHTML,
        canonical: document.querySelector('link[rel=canonical]')?.href,
        h1: [...document.querySelectorAll('h1')].map(node => node.textContent?.trim()),
        main: document.querySelectorAll('main').length,
        overflow: document.documentElement.scrollWidth > innerWidth,
        accessibility: (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }))
          .violations.map(violation => violation.id),
      }));
      assert.deepEqual(document.h1, ['Арена 100% побед']);
      assert.equal(document.main, 1);
      assert.equal(document.overflow, false);
      assert.deepEqual(document.accessibility, []);
      assert.equal(document.canonical, 'https://hearthpulse.net/guides-archive/arena-100-percent/');
      assert.equal(document.html.includes('PRIVATE_'), false);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
    assert.deepEqual(protectedCalls, []);
    assert.equal((await page.goto(`${origin}/guides-archive/missing/`, { waitUntil: 'networkidle2' })).status(), 404);
    await page.close();
  } finally {
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway);
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
    await closeLocal(legacy);
  }
});
