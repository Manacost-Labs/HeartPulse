import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

// Every Express read fails, so a server loader throws into the nearest error.tsx.
async function startFailingExpress() {
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url.startsWith('/api/auth/me')) {
      response.writeHead(401).end('{"error":"Unauthorized"}');
      return;
    }
    response.writeHead(503).end('{"error":"Fixture outage"}');
  });
  return { server, origin: await listenLocal(server) };
}

async function readErrorPage(page, url) {
  await page.goto(url, { waitUntil: 'networkidle2' });
  await page.waitForSelector('[role="alert"] h1', { visible: true });
  return page.evaluate(() => {
    const alert = document.querySelector('[role="alert"]');
    return {
      heading: alert.querySelector('h1')?.textContent?.trim(),
      text: alert.textContent ?? '',
      retry: [...alert.querySelectorAll('button')].map(button => button.textContent?.trim()),
      homeLink: Boolean(alert.querySelector('a[href="/"]')),
      nav: Boolean(document.querySelector('nav')),
      marker: alert.getAttribute('data-app-error'),
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
}

test('route error pages keep their recovery copy and report the error once', async () => {
  const express = await startFailingExpress();
  let next;
  let browser;
  try {
    next = await startNextServer({ legacyOrigin: express.origin });
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    // Each error page reports itself once to the first-party diagnostics endpoint.
    const reports = [];
    page.on('request', request => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/telemetry/client-errors') {
        reports.push(JSON.parse(request.postData()));
      }
    });
    const reportAfter = async seen => {
      for (let attempt = 0; attempt < 100 && reports.length <= seen; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      assert.equal(reports.length, seen + 1, 'one report per error page');
      return reports.at(-1);
    };

    for (const width of [320, 1440]) {
      await page.setViewport({ width, height: 900 });
      // The proxy answers card, Battlegrounds and cosmetics detail outages itself; archetypes reach error.tsx.
      const seen = reports.length;
      const archetype = await readErrorPage(page, `${next.origin}/standard/meta/standard/qa-evenlock/`);
      assert.equal(archetype.heading, 'Страница временно недоступна');
      const report = await reportAfter(seen);
      assert.equal(report.kind, 'render');
      assert.equal(report.route, '/standard/meta/standard/qa-evenlock/');
      assert.match(report.scope, /^route digest=\S+$/, 'the digest links the report to the server log');
      assert.equal(archetype.marker, 'route', 'the production observer finds an error page by this attribute');
      assert.ok(archetype.text.includes(report.scope.split('digest=')[1]), 'the page shows the same error code');
      assert.match(report.incidentId, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
      assert.match(report.releaseId, /^(?:development|[a-f0-9]{7,40})$/);
      assert.doesNotMatch(archetype.text, /карт|каталог/i, 'an archetype outage must not mention the card catalog');
      assert.deepEqual(archetype.retry, ['Повторить']);
      assert.equal(archetype.homeLink, true);
      assert.equal(archetype.nav, true, `site navigation stays available at ${width}px`);
      assert.equal(archetype.overflow, false, `error page overflow at ${width}px`);
    }

    // A section boundary keeps its own copy and reports under its own scope.
    for (const [path, heading, scope] of [
      ['/standard/cards/standard/', 'Данные карты временно недоступны', 'route:standard-cards'],
      ['/articles/', 'Статьи временно недоступны', 'route:articles'],
      ['/contests/', 'Конкурсы временно недоступны', 'route:contests'],
    ]) {
      const seen = reports.length;
      const section = await readErrorPage(page, `${next.origin}${path}`);
      assert.equal(section.heading, heading);
      assert.equal(section.marker, scope);
      assert.ok((await reportAfter(seen)).scope.startsWith(`${scope} digest=`), `${path} reports as ${scope}`);
    }
    assert.deepEqual(pageErrors, []);
  } finally {
    if (browser) await browser.close();
    if (next) await next.close();
    await closeLocal(express.server);
  }
});
