import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

const ANALYTICS_SCRIPT = 'https://stats.hs-manacost.ru/js/script.js';

// The static FAQ page needs no data; only the shell's session check reaches Express.
async function startSignedOutExpress() {
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.writeHead(request.url.startsWith('/api/auth/me') ? 401 : 404).end('{"error":"Unavailable"}');
  });
  return { server, origin: await listenLocal(server) };
}

test('every Next document carries the site head tags, analytics and field focus mode', async () => {
  const express = await startSignedOutExpress();
  let next;
  let browser;
  try {
    next = await startNextServer({ legacyOrigin: express.origin });
    const html = await (await fetch(`${next.origin}/faq/`)).text();
    const tag = pattern => html.match(pattern)?.[0] ?? '';

    assert.match(tag(/<meta name="google-site-verification"[^>]*>/),
      /content="aGEyRvNTeG7FHSUUER0Tsfyyyd3sdRywc4qLycYIcpo"/, 'Search Console ownership meta tag');
    assert.match(tag(/<meta name="theme-color"[^>]*>/), /content="#081a33"/);
    assert.match(tag(/<meta name="color-scheme"[^>]*>/), /content="light"/);
    assert.match(tag(/<meta name="author"[^>]*>/), /content="Manacost"/);
    for (const [file, size] of [['favicon-16.png', '16x16'], ['favicon-32.png', '32x32'], ['favicon-96.png', '96x96']]) {
      assert.match(tag(new RegExp(`<link rel="icon"[^>]*${file.replace('.', '\\.')}[^>]*>`)),
        new RegExp(`sizes="${size}"`), `${size} favicon`);
    }
    assert.match(html, /<link rel="icon"[^>]*favicon\.ico/);
    assert.match(tag(/<link rel="apple-touch-icon"[^>]*>/), /apple-touch-icon\.png[^>]*sizes="180x180"|sizes="180x180"[^>]*apple-touch-icon\.png/);

    const port = new URL(next.origin).port;
    // Chromium resolves the production host to the local Next server, so the
    // canonical-host branch runs without touching production or its analytics.
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP hearthpulse.net 127.0.0.1'] });
    const open = async origin => {
      const page = await browser.newPage();
      const state = { page, pageErrors: [], analyticsRequests: [] };
      page.on('pageerror', error => state.pageErrors.push(error.message));
      await page.setRequestInterception(true);
      page.on('request', request => {
        if (request.url() !== ANALYTICS_SCRIPT) { request.continue(); return; }
        state.analyticsRequests.push(request.url());
        request.respond({ status: 200, contentType: 'application/javascript', body: '' });
      });
      await page.setViewport({ width: 1440, height: 900 });
      await page.goto(`${origin}/faq/`, { waitUntil: 'networkidle2' });
      return state;
    };

    const production = await open(`http://hearthpulse.net:${port}`);
    await production.page.waitForSelector(`script[src="${ANALYTICS_SCRIPT}"]`);
    assert.equal(await production.page.$eval(`script[src="${ANALYTICS_SCRIPT}"]`, script => script.dataset.domain),
      'hearthpulse.net', 'pageviews are attributed to the canonical host');
    assert.equal(production.analyticsRequests.length, 1, 'the analytics script loads once');
    assert.deepEqual(production.pageErrors, []);

    const local = await open(next.origin);
    assert.deepEqual(local.analyticsRequests, [], 'only the canonical host reports pageviews');
    assert.equal(await local.page.$(`script[src="${ANALYTICS_SCRIPT}"]`), null);

    const field = 'input[placeholder]';
    const outline = () => local.page.$eval(field, input => getComputedStyle(input).outlineStyle);
    await local.page.waitForSelector(field, { visible: true });
    await local.page.click(field);
    await local.page.keyboard.type('mage');
    assert.equal(await outline(), 'none', 'typing after a click must not draw a focus ring');
    await local.page.keyboard.press('Tab');
    await local.page.keyboard.down('Shift');
    await local.page.keyboard.press('Tab');
    await local.page.keyboard.up('Shift');
    assert.equal(await local.page.$eval(field, input => input === document.activeElement), true);
    assert.equal(await outline(), 'solid', 'Tab navigation must show the focus ring');
    assert.deepEqual(local.pageErrors, []);
  } finally {
    if (browser) await browser.close();
    if (next) await next.close();
    await closeLocal(express.server);
  }
});
