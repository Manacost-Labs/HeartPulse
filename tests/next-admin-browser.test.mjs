import assert from 'node:assert/strict';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

test('Next admin HTML checks the Express session and keeps private data out of SSR', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true });
  let browser;
  try {
    const guest = await fetch(`${runtime.origin}/admin/`);
    const guestHtml = await guest.text();
    assert.equal(guest.status, 200);
    assert.match(guest.headers.get('cache-control') ?? '', /no-store/);
    assert.match(guestHtml, /Админ панель недоступна/);
    assert.match(guestHtml, /name="robots" content="noindex, nofollow"/);
    assert.doesNotMatch(guestHtml, /admin-tailadmin-shell|ContestAdminPanel|card-reader@example\.test/);
    assert.equal((await fetch(`${runtime.origin}/admin/unknown/`)).status, 404);

    const regularUser = await fetch(`${runtime.origin}/admin/`, { headers: { Cookie: runtime.cookie } });
    assert.match(await regularUser.text(), /Админ панель недоступна/);
    assert.equal((await fetch(`${runtime.origin}/api/admin/contests`, {
      headers: { Cookie: runtime.cookie },
    })).status, 403);

    runtime.backend.database.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run('card-reader');
    const administrator = await fetch(`${runtime.origin}/admin/`, { headers: { Cookie: runtime.cookie } });
    const adminHtml = await administrator.text();
    assert.equal(administrator.status, 200);
    assert.match(administrator.headers.get('cache-control') ?? '', /no-store/);
    assert.match(adminHtml, /Проверка доступа/);
    assert.doesNotMatch(adminHtml, /card-reader@example\.test|adminAllowed|contestAdminAllowed/);

    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const [name, value] = runtime.cookie.split('=');
    await page.setCookie({ name, value, url: runtime.origin });
    for (const width of [1440, 390]) {
      await page.setViewport({ width, height: 900 });
      const response = await page.goto(`${runtime.origin}/admin/`, { waitUntil: 'domcontentloaded' });
      assert.equal(response.status(), 200);
      await page.waitForSelector('.admin-tailadmin-shell', { timeout: 15000 });
      const state = await page.evaluate(() => ({
        heading: document.querySelector('h1')?.textContent?.trim(),
        overflow: document.documentElement.scrollWidth > innerWidth,
        mainCount: document.querySelectorAll('main').length,
      }));
      assert.ok(state.heading, `admin heading at ${width}px`);
      assert.equal(state.overflow, false, `admin overflow at ${width}px`);
      assert.equal(state.mainCount, 1, `admin main landmark at ${width}px`);
      if (width === 390) {
        await page.click('button[aria-label="Открыть меню"]');
        assert.equal(await page.$eval('button[aria-label="Закрыть меню"]', button => button.getAttribute('aria-expanded')), 'true');
        await page.click('button[aria-label^="Статьи:"]');
        await page.waitForFunction(() => document.querySelector('h1')?.textContent?.trim() === 'Статьи');
      }
    }
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
    await demotedPage.goto(`${runtime.origin}/admin/`, { waitUntil: 'domcontentloaded' });
    await demotedPage.waitForSelector('.admin-access-card');
    assert.equal(await demotedPage.$('.admin-tailadmin-shell'), null);
    await demotedPage.close();

    runtime.backend.database.prepare("UPDATE users SET blocked_at = ? WHERE id = ?")
      .run(new Date().toISOString(), 'card-reader');
    const blocked = await fetch(`${runtime.origin}/admin/`, { headers: { Cookie: runtime.cookie } });
    assert.match(await blocked.text(), /Админ панель недоступна/);
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
