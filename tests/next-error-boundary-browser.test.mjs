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
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
}

test('route errors outside the card catalog show generic recovery copy', async () => {
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

    for (const width of [320, 1440]) {
      await page.setViewport({ width, height: 900 });
      // The proxy answers Battlegrounds and cosmetics outages itself; archetypes reach error.tsx.
      const archetype = await readErrorPage(page, `${next.origin}/standard/meta/standard/qa-evenlock/`);
      assert.equal(archetype.heading, 'Страница временно недоступна');
      assert.doesNotMatch(archetype.text, /карт|каталог/i, 'an archetype outage must not mention the card catalog');
      assert.deepEqual(archetype.retry, ['Повторить']);
      assert.equal(archetype.homeLink, true);
      assert.equal(archetype.nav, true, `site navigation stays available at ${width}px`);
      assert.equal(archetype.overflow, false, `error page overflow at ${width}px`);
    }

    const card = await readErrorPage(page, `${next.origin}/standard/cards/standard/CARD_QA_1/`);
    assert.equal(card.heading, 'Данные карты временно недоступны');
    assert.deepEqual(pageErrors, []);
  } finally {
    if (browser) await browser.close();
    if (next) await next.close();
    await closeLocal(express.server);
  }
});
