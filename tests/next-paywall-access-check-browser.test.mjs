import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

// The session check answers late, as it does on a phone after the scripts
// download, so the access check is still pending when the page has painted.
const SESSION_DELAY_MS = 1200;

async function startGateway(nextOrigin) {
  const next = new URL(nextOrigin);
  const server = http.createServer((request, response) => {
    if (request.url === '/api/auth/me') {
      setTimeout(() => response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        .end('{"user":null}'), SESSION_DELAY_MS);
      return;
    }
    if (request.url.startsWith('/api/')) {
      response.writeHead(401, { 'Content-Type': 'application/json' }).end('{"error":"guest"}');
      return;
    }
    const upstream = http.request(next, { method: request.method, path: request.url, headers: request.headers },
      answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
    request.pipe(upstream);
  });
  return { server, origin: await listenLocal(server) };
}

// While the access check runs, the gated pages hold the gate's height, so the
// gate (or a subscriber's page) replaces the placeholder without moving the
// footer. Before, the footer jumped by about 760 px: CLS 0.12-0.48.
test('gated pages keep the gate height while the access check runs', async () => {
  // Server loaders read only anonymous projections; every one answers "unavailable".
  const express = http.createServer((request, response) => response.writeHead(401).end());
  let next; let gateway; let browser;
  try {
    next = await startNextServer({ legacyOrigin: await listenLocal(express) });
    gateway = await startGateway(next.origin);
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const viewports = [{ width: 1440, height: 900 }, { width: 390, height: 844, isMobile: true, hasTouch: true }];
    for (const viewport of viewports) {
      for (const path of ['/heroes/', '/library/', '/battlegrounds/tier-list/', '/battlegrounds/strategies/', '/guides-archive/']) {
        const page = await browser.newPage();
        await page.setViewport(viewport);
        await page.evaluateOnNewDocument(() => {
          window.__layoutShifts = [];
          new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
              if (!entry.hadRecentInput) window.__layoutShifts.push({ value: entry.value,
                sources: entry.sources.map(source => source.node?.className?.toString?.() ?? '') });
            }
          }).observe({ type: 'layout-shift', buffered: true });
        });
        await page.goto(`${gateway.origin}${path}`, { waitUntil: 'domcontentloaded' });
        const pending = await page.waitForSelector('.arena-paywall-pending', { timeout: 10_000 }).catch(() => null);
        assert.ok(pending, `${path} must render the reserved placeholder while access is checked`);
        assert.equal(await page.$('.arena-paywall'), null, `${path} must not show the gate before the check ends`);
        await page.waitForSelector('.arena-paywall .arena-paywall__dialog', { timeout: 10_000 });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const shifts = await page.evaluate(() => window.__layoutShifts);
        const total = shifts.reduce((sum, shift) => sum + shift.value, 0);
        assert.ok(total < 0.01, `${path} at ${viewport.width}px shifted by ${total.toFixed(3)}: ${JSON.stringify(shifts)}`);
        await page.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway.server);
    if (next) await next.close();
    await closeLocal(express);
  }
});
