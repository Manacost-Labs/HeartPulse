import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

async function startGateway(nextOrigin) {
  const next = new URL(nextOrigin);
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push({ path: request.url, destination: request.headers['sec-fetch-dest'], rsc: request.headers.rsc });
    if (request.url.startsWith('/api/')) {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' });
      response.end(JSON.stringify({ user: null }));
      return;
    }
    const upstream = http.request(next, { method: request.method, path: request.url, headers: request.headers },
      answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
    request.pipe(upstream);
  });
  return { server, origin: await listenLocal(server), requests };
}

async function visitByClick(page, selector, pathname) {
  await page.click(selector);
  await page.waitForFunction(path => location.pathname === path && document.querySelector('#main-content'), {}, pathname);
}

async function rememberFrame(page) {
  await page.evaluate(() => {
    window.__navigationFrame = { sidebar: document.querySelector('.arena-sidebar'), topbar: document.querySelector('.arena-mobile-topbar') };
  });
}

async function assertSameFrame(page) {
  assert.equal(await page.evaluate(() => window.__navigationFrame?.sidebar === document.querySelector('.arena-sidebar')
    && window.__navigationFrame?.topbar === document.querySelector('.arena-mobile-topbar')), true, 'navigation DOM must persist');
}

async function assertGroupSwitchHasNoDelayedCollapse(page, root) {
  const result = await page.evaluate(async selector => {
    const nav = document.querySelector(selector);
    const buttons = [...nav.querySelectorAll('button[aria-controls]')];
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    buttons[0].click();
    await new Promise(resolve => setTimeout(resolve, 250));
    buttons[1].click();
    await frame();
    await frame();
    const closed = document.getElementById(buttons[0].getAttribute('aria-controls'));
    const height = closed.getBoundingClientRect().height;
    const firstY = buttons[1].getBoundingClientRect().y;
    await new Promise(resolve => setTimeout(resolve, 180));
    return { height, firstY, lastY: buttons[1].getBoundingClientRect().y };
  }, root);
  assert.equal(result.height, 0, 'the closed group must release layout with the newly opened group');
  assert.ok(Math.abs(result.firstY - result.lastY) < 0.5, 'group controls must not move again after the exit duration');
}

test('public navigation preserves the frame, sidebar state and native link behavior', { timeout: 60_000 }, async () => {
  const legacy = http.createServer((_request, response) => response.writeHead(401).end());
  let next, gateway, browser;
  try {
    next = await startNextServer({ legacyOrigin: await listenLocal(legacy) });
    gateway = await startGateway(next.origin);
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1440, height: 700 });
    await page.goto(`${gateway.origin}/faq/`, { waitUntil: 'networkidle2' });
    await rememberFrame(page);
    await assertGroupSwitchHasNoDelayedCollapse(page, '.arena-sidebar');
    await page.evaluate(() => { document.querySelector('.arena-sidebar').scrollTop = 180; });
    await page.hover('.arena-sidebar a[href="/guides-archive/"]');
    const scroll = await page.$eval('.arena-sidebar', node => node.scrollTop);
    assert.ok(scroll > 0, 'fixture must exercise sidebar scroll');
    const documentCount = gateway.requests.filter(request => request.destination === 'document').length;
    await visitByClick(page, '.arena-sidebar a[href="/guides-archive/"]', '/guides-archive/');
    await assertSameFrame(page);
    assert.equal(await page.$eval('.arena-sidebar', node => node.scrollTop), scroll);
    assert.equal(await page.$eval('.arena-sidebar button[aria-controls="arena-sidebar-misc"]', node => node.getAttribute('aria-expanded')), 'true');
    assert.equal(gateway.requests.filter(request => request.destination === 'document').length, documentCount);
    assert.ok(gateway.requests.some(request => request.rsc === '1' && request.path.startsWith('/guides-archive/')));
    assert.equal(await page.evaluate(() => document.querySelector('script[type="speculationrules"]') === null
      && !document.documentElement.hasAttribute('data-page-enter') && getComputedStyle(document.querySelector('.arena-content')).opacity === '1'), true);
    await page.evaluate(() => history.back());
    await page.waitForFunction(() => location.pathname === '/faq/');
    await assertSameFrame(page);
    await page.evaluate(() => history.forward());
    await page.waitForFunction(() => location.pathname === '/guides-archive/');
    await assertSameFrame(page);
    // A plain anchor from page content uses the same router; fragments remain native.
    await page.evaluate(() => {
      const invalid = document.createElement('a'); invalid.href = 'http://%';
      document.querySelector('.arena-content').append(invalid);
      invalid.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
      const link = document.createElement('a'); link.id = 'client-test-link'; link.href = '/faq?from=navigation'; link.textContent = 'Перейти';
      document.querySelector('.arena-content').prepend(link);
    });
    await visitByClick(page, '#client-test-link', '/faq/');
    assert.equal(await page.evaluate(() => location.search), '?from=navigation');
    await assertSameFrame(page);
    const popupReady = browser.waitForTarget(target => target.type() === 'page' && target.url() === `${gateway.origin}/tierlist/`, { timeout: 10_000 });
    await page.keyboard.down('Control');
    await page.click('.arena-sidebar a[href="/tierlist/"]');
    await page.keyboard.up('Control');
    const popup = await (await popupReady).page();
    assert.ok(popup, 'Ctrl-click must create a new page');
    assert.equal(new URL(popup.url()).pathname, '/tierlist/', 'Ctrl-click opens the destination in another tab');
    assert.equal(await page.evaluate(() => location.pathname), '/faq/');
    await popup.close();
    await page.bringToFront();
    assert.deepEqual(errors, []);

    await page.setViewport({ width: 390, height: 844 });
    await page.click('.arena-mobile-nav-toggle');
    await page.waitForFunction(() => document.querySelector('#arena-mobile-menu').matches(':popover-open'));
    await assertGroupSwitchHasNoDelayedCollapse(page, '#arena-mobile-menu');
    await visitByClick(page, '#arena-mobile-menu a[href="/tierlist/"]', '/tierlist/');
    await page.waitForFunction(() => !document.querySelector('#arena-mobile-menu').matches(':popover-open') && document.body.style.position !== 'fixed');
    await assertSameFrame(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    await page.close();
  } finally {
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway.server);
    if (next) await next.close();
    await closeLocal(legacy);
  }
});
