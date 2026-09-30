import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { qaSessionCookie } from '../scripts/qa/mockApi.mjs';
import { startQaNextRuntime } from '../scripts/qa/nextRuntime.mjs';
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

// Waits for the first report, then long enough for a duplicate to follow it.
async function firstReport(arrived) {
  for (let attempt = 0; attempt < 200 && !arrived(); attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  await new Promise(resolve => setTimeout(resolve, 250));
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
      await firstReport(() => reports.length > seen);
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
      assert.equal(section.nav, true, `${path}: the error page keeps the site navigation`);
      assert.deepEqual(section.retry, ['Повторить']);
      assert.ok((await reportAfter(seen)).scope.startsWith(`${scope} digest=`), `${path} reports as ${scope}`);
    }
    assert.deepEqual(pageErrors, []);
  } finally {
    if (browser) await browser.close();
    if (next) await next.close();
    await closeLocal(express.server);
  }
});

const launchBrowser = () => puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  headless: true, args: ['--no-sandbox'] });

async function openPage(browser, origin, cookie) {
  const page = await browser.newPage();
  if (cookie) {
    const [name, value] = cookie.split('=');
    await page.setCookie({ name, value, url: origin });
  }
  return page;
}

// Finds the chunk of a lazily loaded component by a string that only its code contains.
async function chunkHolding(browser, origin, path, marker, cookie) {
  const page = await openPage(browser, origin, cookie);
  const requested = new Set();
  page.on('request', request => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith('/_next/static/chunks/') && pathname.endsWith('.js')) requested.add(pathname);
  });
  await page.goto(`${origin}${path}`, { waitUntil: 'networkidle0' });
  await page.close();
  for (const chunk of requested) {
    if ((await (await fetch(`${origin}${chunk}`)).text()).includes(marker)) return chunk;
  }
  throw new Error(`no chunk requested by ${path} contains "${marker}"`);
}

// Opens `path` while `chunk` fails to load, as it does for a tab that outlived a deploy.
async function openWithoutChunk(browser, origin, path, chunk, cookie) {
  const page = await openPage(browser, origin, cookie);
  const state = { missing: true, reports: [] };
  await page.setRequestInterception(true);
  page.on('request', request => {
    const { pathname } = new URL(request.url());
    if (request.method() === 'POST' && pathname === '/api/telemetry/client-errors') {
      state.reports.push(JSON.parse(request.postData()));
      return request.respond({ status: 204 });
    }
    if (state.missing && pathname === chunk) return request.abort('failed');
    return request.continue();
  });
  await page.goto(`${origin}${path}`, { waitUntil: 'networkidle2' });
  await firstReport(() => state.reports.length > 0);
  return { page, state };
}

test('a page stays usable when the optional support prompt cannot load', async () => {
  const runtime = await startQaNextRuntime();
  let browser;
  try {
    browser = await launchBrowser();
    const chunk = await chunkHolding(browser, runtime.origin, '/articles/', 'manacost_support_prompt_closed_at');
    for (const [path, heading] of [['/articles/', 'Статьи'], ['/classes/', 'Классы']]) {
      const { page, state } = await openWithoutChunk(browser, runtime.origin, path, chunk);
      assert.equal(await page.$('[data-app-error]'), null, `${path} must not turn into an error page`);
      assert.equal(await page.$eval('h1', element => element.textContent.trim()), heading);
      assert.ok(await page.$('nav'), `${path} keeps its navigation`);
      assert.deepEqual(state.reports.map(report => [report.kind, report.scope]), [['chunk', 'support-prompt']],
        `${path} reports the missing chunk once`);
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});

test('a missing page chunk offers a reload, and the reload recovers the page', async () => {
  const runtime = await startQaNextRuntime();
  let browser;
  try {
    browser = await launchBrowser();
    const admin = qaSessionCookie({ admin: true });
    const chunk = await chunkHolding(browser, runtime.origin, '/deck-builder/', 'Соберите колоду', admin);
    const { page, state } = await openWithoutChunk(browser, runtime.origin, '/deck-builder/', chunk, admin);
    await page.waitForSelector('[data-app-error] h1', { visible: true });
    assert.equal(await page.$eval('[data-app-error] h1', element => element.textContent.trim()), 'Сайт обновился');
    assert.deepEqual(await page.$$eval('[data-app-error] button', buttons => buttons.map(button => button.textContent.trim())),
      ['Обновить страницу']);
    assert.ok(await page.$('nav'), 'the error page keeps the site navigation');
    assert.deepEqual(state.reports.map(report => [report.kind, report.scope]), [['chunk', 'route']]);

    state.missing = false;
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.click('[data-app-error] button')]);
    await page.waitForFunction(() => document.querySelector('h1')?.textContent?.includes('Соберите колоду'));
    assert.equal(await page.$('[data-app-error]'), null, 'the reloaded page has no error');
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
