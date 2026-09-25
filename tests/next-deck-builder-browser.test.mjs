import assert from 'node:assert/strict';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

test('Next deck builder checks full administrator access and preserves the editable draft', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true });
  let browser;
  try {
    const guest = await fetch(`${runtime.origin}/deck-builder/`);
    const guestHtml = await guest.text();
    assert.equal(guest.status, 200);
    assert.match(guest.headers.get('cache-control') ?? '', /no-store/);
    assert.match(guestHtml, /Конструктор колоды недоступен/);
    assert.match(guestHtml, /name="robots" content="noindex, nofollow"/);
    assert.doesNotMatch(guestHtml, /card-reader@example\.test/);
    assert.equal((await fetch(`${runtime.origin}/deck-builder/unknown/`)).status, 404);

    const regular = await fetch(`${runtime.origin}/deck-builder/`, { headers: { Cookie: runtime.cookie } });
    assert.match(await regular.text(), /Конструктор колоды недоступен/);
    assert.equal((await fetch(`${runtime.origin}/api/admin/deck-builder/resolve`, {
      method: 'POST', headers: { Cookie: runtime.cookie, 'Content-Type': 'application/json' }, body: '{}',
    })).status, 403);

    runtime.backend.database.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run('card-reader');
    const administrator = await fetch(`${runtime.origin}/deck-builder/`, { headers: { Cookie: runtime.cookie } });
    const adminHtml = await administrator.text();
    assert.equal(administrator.status, 200);
    assert.match(adminHtml, /Проверка доступа/);
    assert.doesNotMatch(adminHtml, /card-reader@example\.test|Соберите колоду/);

    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const [name, value] = runtime.cookie.split('=');
    await page.setCookie({ name, value, url: runtime.origin });
    for (const width of [390, 1440]) {
      await page.setViewport({ width, height: 900 });
      const response = await page.goto(`${runtime.origin}/deck-builder/`, { waitUntil: 'domcontentloaded' });
      assert.equal(response.status(), 200);
      await page.waitForSelector('.deck-builder__landing-hero', { timeout: 15000 });
      const state = await page.evaluate(() => ({
        heading: document.querySelector('h1')?.textContent?.trim(),
        overflow: document.documentElement.scrollWidth > innerWidth,
        mainCount: document.querySelectorAll('main').length,
      }));
      assert.equal(state.heading, 'Соберите колоду');
      assert.equal(state.overflow, false, `builder overflow at ${width}px`);
      assert.equal(state.mainCount, 1);
    }

    await page.click('.deck-builder__format-picker button:last-child');
    await page.click('button[aria-label^="Маг: создать колоду"]');
    await page.waitForSelector('#deck-builder-workspace-title');
    await page.waitForFunction(() => {
      const draft = JSON.parse(window.localStorage.getItem('manacost:deck-builder:draft:v1') || 'null');
      return draft?.heroClass === 'MAGE' && draft?.format === 'wild';
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#deck-builder-workspace-title', { timeout: 15000 });
    assert.match(await page.$eval('.deck-builder__workspace-identity', node => node.textContent), /Вольный.*Маг/);
    await page.close();

    const demotedPage = await browser.newPage();
    await demotedPage.setCookie({ name, value, url: runtime.origin });
    await demotedPage.setRequestInterception(true);
    demotedPage.on('request', request => {
      if (new URL(request.url()).pathname === '/api/auth/me') {
        void request.respond({ status: 200, contentType: 'application/json',
          body: '{"user":null,"adminAllowed":false,"contestAdminAllowed":false}' });
      } else void request.continue();
    });
    await demotedPage.goto(`${runtime.origin}/deck-builder/`, { waitUntil: 'domcontentloaded' });
    await demotedPage.waitForSelector('.deck-builder-access-card');
    assert.equal(await demotedPage.$('.deck-builder__landing-hero'), null);
    await demotedPage.close();

    runtime.backend.database.prepare("UPDATE users SET blocked_at = ? WHERE id = ?")
      .run(new Date().toISOString(), 'card-reader');
    const blocked = await fetch(`${runtime.origin}/deck-builder/`, { headers: { Cookie: runtime.cookie } });
    assert.match(await blocked.text(), /Конструктор колоды недоступен/);
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
