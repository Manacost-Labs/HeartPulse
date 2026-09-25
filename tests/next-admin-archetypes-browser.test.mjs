import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

const standardCatalog = { count: 1, translated: 1, items: [{
  id: 856, nameEn: 'Tempo Mage', nameRu: 'Темпо-маг', translated: true,
  classKey: 'MAGE', classLabel: 'Маг', standard: true, stats: { winRate: 54.3, games: 1200 },
}] };
const wildCatalog = { count: 1, translated: 1, items: [{
  id: null, nameEn: 'Wild Mage', nameRu: 'Вольный маг', translated: true,
  classKey: 'MAGE', classLabel: 'Маг', standard: false, wild: true,
  stats: { winRate: 57.2, games: 2345 },
}] };
const deckCode = 'AAECAf0EBpGxA8W4A5KBA6iKBLqRBM2eBgzAAbAClgX0xgX7yQXz8QWQgwaGgwY=';
const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');

test('Next admin archetype routes keep the full-admin boundary and Wild deck deep links', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true });
  let browser;
  try {
    for (const path of ['/archetypes/', '/archetypes/856/', '/archetypes/wild/']) {
      const guest = await fetch(`${runtime.origin}${path}`);
      const html = await guest.text();
      assert.equal(guest.status, 200, path);
      assert.match(guest.headers.get('cache-control') ?? '', /no-store/, path);
      assert.match(html, /Архетипы недоступны/);
      assert.match(html, /name="robots" content="noindex, nofollow"/);
      assert.doesNotMatch(html, /card-reader@example\.test/);
    }
    assert.equal((await fetch(`${runtime.origin}/archetypes/not-a-number/`)).status, 404);

    runtime.backend.database.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run('card-reader');
    const admin = await fetch(`${runtime.origin}/archetypes/wild/`, { headers: { Cookie: runtime.cookie } });
    const adminHtml = await admin.text();
    assert.equal(admin.status, 200);
    assert.match(adminHtml, /Проверка доступа/);
    assert.doesNotMatch(adminHtml, /card-reader@example\.test|Wild Mage/);

    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    const failed = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfailed', request => failed.push(request.url()));
    const [name, value] = runtime.cookie.split('=');
    await page.setCookie({ name, value, url: runtime.origin });
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname === '/api/admin/archetypes') {
        void request.respond({ status: 200, contentType: 'application/json',
          body: JSON.stringify(url.searchParams.get('format') === 'wild' ? wildCatalog : standardCatalog) });
      } else if (url.pathname === '/api/admin/archetypes/wild/decks') {
        void request.respond({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ decks: [{ title: 'Wild Mage list', deck_code: deckCode, win_rate: 59.1, games: 321 }] }) });
      } else if (url.pathname === '/api/admin/archetypes/856') {
        void request.respond({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ available: false, reason: 'Нет свежего снимка' }) });
      } else void request.continue();
    });

    for (const width of [390, 1440]) {
      await page.setViewport({ width, height: 900 });
      assert.equal((await page.goto(`${runtime.origin}/archetypes/`, { waitUntil: 'networkidle2' })).status(), 200);
      await page.waitForSelector('.archetypes-row__name');
      assert.match(await page.$eval('.archetypes-row__name', node => node.textContent), /Темпо-маг/);
      const standardState = await page.evaluate(() => ({
        main: document.querySelectorAll('main').length,
        overflow: document.documentElement.scrollWidth > innerWidth,
      }));
      assert.equal(standardState.main, 1);
      assert.equal(standardState.overflow, false, `standard archetypes overflow at ${width}px`);

      assert.equal((await page.goto(`${runtime.origin}/archetypes/wild/?archetype=Wild%20Mage`,
        { waitUntil: 'networkidle2' })).status(), 200);
      await page.waitForSelector('.wild-archetypes__deck-link');
      if (process.env.VISUAL_QA_DIR) await page.screenshot({
        path: `${process.env.VISUAL_QA_DIR}/wild-archetypes-${width}.png`, fullPage: true,
      });
      await page.evaluate(axeSource);
      const wildState = await page.evaluate(() => ({
        heading: document.querySelector('h1')?.textContent?.trim(),
        main: document.querySelectorAll('main').length,
        overflow: document.documentElement.scrollWidth > innerWidth,
        deckHref: document.querySelector('.wild-archetypes__deck-link')?.getAttribute('href'),
      }));
      assert.equal(wildState.heading, 'Архетипы Вольного формата');
      assert.equal(wildState.main, 1);
      assert.equal(wildState.overflow, false, `Wild archetypes overflow at ${width}px`);
      assert.equal(wildState.deckHref, `/deck-builder/?code=${encodeURIComponent(deckCode)}`);
      const violations = await page.evaluate(async () =>
        (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }))
          .violations.map(violation => violation.id));
      assert.deepEqual(violations, []);
    }

    assert.equal((await page.goto(`${runtime.origin}/archetypes/856/`, { waitUntil: 'networkidle2' })).status(), 200);
    await page.waitForSelector('.archetypes-status');
    assert.match(await page.$eval('.archetypes-status', node => node.textContent), /Нет свежего снимка/);
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
    await page.close();

    const demotedPage = await browser.newPage();
    await demotedPage.setCookie({ name, value, url: runtime.origin });
    await demotedPage.setRequestInterception(true);
    demotedPage.on('request', request => {
      if (new URL(request.url()).pathname === '/api/auth/me') {
        void request.respond({ status: 200, contentType: 'application/json',
          body: '{"user":{"email":"contest@example.test","name":"Contest","role":"user","adminAllowed":false,"contestAdminAllowed":true},"adminAllowed":false,"contestAdminAllowed":true}' });
      } else void request.continue();
    });
    await demotedPage.goto(`${runtime.origin}/archetypes/wild/`, { waitUntil: 'domcontentloaded' });
    await demotedPage.waitForSelector('.archetypes-access-card');
    assert.equal(await demotedPage.$('.wild-archetypes__catalog'), null);
    await demotedPage.close();
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
