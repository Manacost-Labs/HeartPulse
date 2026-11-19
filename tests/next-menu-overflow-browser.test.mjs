import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

// The menu never scrolls sideways: a window of 1024–1920 px at a browser zoom of
// 90–150 % gives a layout width of about 680–2130 px, so both the sidebar and the
// phone drawer are measured, on a page of every mode (the longest labels are
// Battlegrounds') and with the mode panel open.
const WINDOWS = [1024, 1280, 1440, 1920];
const ZOOMS = [0.9, 1, 1.25, 1.5];
const PAGES = ['/standard/meta/', '/classes/', '/heroes/', '/articles/', '/faq/'];

function signedOut(response) {
  response.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' })
    .end('{"error":"Unavailable"}');
}

async function startGateway(nextOrigin) {
  const next = new URL(nextOrigin);
  const server = http.createServer((request, response) => {
    if (request.url.startsWith('/api/')) { signedOut(response); return; }
    const upstream = http.request(next, { method: request.method, path: request.url, headers: request.headers },
      answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
    request.pipe(upstream);
  });
  return { server, origin: await listenLocal(server) };
}

test('the sidebar and the drawer have no horizontal scroll at any window width and browser zoom', { timeout: 300_000 }, async () => {
  const express = http.createServer((_request, response) => signedOut(response));
  let next; let gateway; let browser;
  try {
    next = await startNextServer({ legacyOrigin: await listenLocal(express) });
    gateway = await startGateway(next.origin);
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const measured = [];
    for (const path of PAGES) {
      for (const width of WINDOWS) {
        for (const zoom of ZOOMS) {
          const layoutWidth = Math.round(width / zoom);
          await page.setViewport({ width: layoutWidth, height: Math.round(900 / zoom) });
          await page.goto(`${gateway.origin}${path}`, { waitUntil: 'networkidle2' });
          const drawer = layoutWidth < 1024;
          if (drawer) {
            await page.click('.arena-mobile-nav-toggle');
            await page.waitForFunction(() => document.querySelector('#arena-mobile-menu').matches(':popover-open')
              && !document.querySelector('#arena-mobile-menu').getAnimations().length);
          }
          const root = drawer ? '#arena-mobile-menu' : '.arena-sidebar';
          const read = () => page.evaluate(selector => {
            const region = document.querySelector(selector);
            const list = region.querySelector('.hp-nav-scroll');
            return {
              region: region.scrollWidth - region.clientWidth,
              list: list.scrollWidth - list.clientWidth,
              page: document.documentElement.scrollWidth - innerWidth,
              labels: [...region.querySelectorAll('.hp-nav-label')].filter(label => label.checkVisibility())
                .filter(label => label.scrollWidth > label.clientWidth).length,
            };
          }, root);
          const closed = await read();
          await page.click(`${root} details.hp-mode > summary`);
          await page.waitForFunction(selector => [...document.querySelectorAll(`${selector} [data-mode-card]`)].every(card => card.checkVisibility()), {}, root);
          const open = await read();
          const label = `${path} window ${width} zoom ${zoom} (layout ${layoutWidth})`;
          measured.push(label);
          assert.deepEqual(closed, { region: 0, list: 0, page: 0, labels: 0 }, `${label}: closed menu`);
          // With the panel open the aside's own scroll width includes the popover; its list and the page must still fit.
          assert.deepEqual({ ...open, region: drawer ? open.region : 0 }, { region: 0, list: 0, page: 0, labels: 0 }, `${label}: menu with the mode panel open`);
        }
      }
    }
    assert.equal(measured.length, PAGES.length * WINDOWS.length * ZOOMS.length);
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway.server);
    if (next) await next.close();
    await closeLocal(express);
  }
});
