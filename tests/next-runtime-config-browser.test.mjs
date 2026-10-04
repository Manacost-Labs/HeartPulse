import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

const CDN = 'https://cdn.hearthpulse.net';
const CARD_PATH = '/standard/cards/standard/CARD_QA_0002/';
const CARD_IMAGE = '.constructed-card-detail__visual-button img';

// Server HTML, then the hydrated page with CDN requests answered locally.
async function renderCard(runtime, browser) {
  const html = await (await fetch(`${runtime.nextOrigin}${CARD_PATH}`)).text();
  const page = await browser.newPage();
  const errors = [];
  const cdnRequests = [];
  const reports = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /hydrat|Minified React error/i.test(message.text())) errors.push(message.text());
  });
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === '/api/telemetry/web-vitals') reports.push(JSON.parse(request.postData()));
    if (url.origin !== CDN) { request.continue(); return; }
    cdnRequests.push(request.url());
    request.respond({ status: 200, contentType: 'image/webp', body: readFileSync('public/arena-logo-icon.webp') });
  });
  await page.goto(`${runtime.origin}${CARD_PATH}`, { waitUntil: 'networkidle2' });
  await page.waitForSelector(CARD_IMAGE, { visible: true });
  const hydrated = await page.evaluate(selector => ({
    src: document.querySelector(selector).getAttribute('src'),
    config: window.__ARENA_RUNTIME_CONFIG__,
  }), CARD_IMAGE);
  // A trusted input finalizes LCP; the title is not a link, so the page stays.
  await page.click('h1');
  // Long enough for the reporter's three-second batches, had it started.
  const deadline = Date.now() + 8_000;
  await new Promise(resolve => setTimeout(resolve, 4_000));
  while (reports.length > 0 && !reports.some(report => report.metrics.some(metric => metric.name === 'LCP'))
    && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  await page.close();
  return { html, errors, cdnRequests, reports, serverSrc: html.match(/<img src="([^"]*\/api\/card-image\/CARD_QA_0002\/full\.webp[^"]*)"/)?.[1], ...hydrated };
}

test('server HTML and the hydrated page share the runtime switches for card images and Web Vitals', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'hs-runtime-config-'));
  const enabledFile = join(directory, 'runtime-config.js');
  writeFileSync(enabledFile, readFileSync('public/runtime-config.js', 'utf8'));
  const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true, args: ['--no-sandbox'] });
  try {
    const withCdn = await startPublicCardPilot({ pagesEnabled: true, runtimeClientConfigFile: enabledFile });
    try {
      const card = await renderCard(withCdn, browser);
      assert.ok(card.html.indexOf('window.__ARENA_RUNTIME_CONFIG__={"cardImageCdn":{"enabled":true')
        < card.html.indexOf('<div id="root"'), 'the switches precede the application markup');
      assert.match(card.serverSrc ?? '', /^https:\/\/cdn\.hearthpulse\.net\/api\/card-image\//, 'server HTML uses the CDN');
      assert.equal(card.src, card.serverSrc.replaceAll('&amp;', '&'), 'hydration keeps the server URL');
      assert.deepEqual(card.config, { cardImageCdn: { enabled: true, origin: CDN }, webVitals: { enabled: true } });
      const metrics = card.reports.flatMap(report => report.metrics);
      assert.ok(metrics.length > 0, 'a deployed switch file turns Web Vitals reporting on');
      for (const metric of metrics) {
        assert.match(metric.name, /^(?:CLS|FCP|INP|LCP|TTFB)$/);
        assert.match(metric.rating, /^(?:good|needs-improvement|poor)$/);
        assert.ok(Number.isFinite(metric.value) && metric.value >= 0, `${metric.name} value`);
        assert.equal('lcpTarget' in metric, metric.name === 'LCP', `${metric.name} element descriptor`);
      }
      for (const report of card.reports) {
        // Puppeteer's default 800px viewport renders the mobile shell.
        assert.deepEqual({ route: report.route, device: report.device },
          { route: '/standard/cards/[format]/[cardId]/', device: 'mobile' });
      }
      const lcp = metrics.find(metric => metric.name === 'LCP');
      assert.ok(lcp, 'the click finalizes LCP');
      assert.match(lcp.lcpTarget, /^[a-z0-9]+(?:\.[a-z][a-z0-9_-]*)?$/, 'LCP names a tag and at most one class');
      assert.notEqual(lcp.lcpTarget, 'none');
      assert.equal(JSON.stringify(card.reports).includes('CARD_QA_0002'), false, 'reports never carry the card id');
      assert.ok(card.cdnRequests.length > 0, 'the browser loads the card image from the CDN');
      assert.deepEqual(card.errors, []);
    } finally {
      await withCdn.close();
    }

    // Test runtimes start without a switch file: origin delivery, no external requests.
    const withoutSwitches = await startPublicCardPilot({ pagesEnabled: true });
    try {
      const card = await renderCard(withoutSwitches, browser);
      assert.match(card.serverSrc ?? '', /^\/api\/card-image\//, 'server HTML uses the application origin');
      assert.equal(card.src, card.serverSrc.replaceAll('&amp;', '&'));
      assert.equal(card.config.cardImageCdn.enabled, false);
      assert.deepEqual(card.cdnRequests, []);
      assert.deepEqual(card.reports, [], 'no background reporting without a switch file');
      assert.deepEqual(card.errors, []);
    } finally {
      await withoutSwitches.close();
    }
  } finally {
    await browser.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
