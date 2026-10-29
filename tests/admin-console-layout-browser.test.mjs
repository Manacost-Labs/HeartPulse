import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startQaNextRuntime } from '../scripts/qa/nextRuntime.mjs';
import { createQaApiHandler, qaSessionCookie } from '../scripts/qa/mockApi.mjs';

// API answers arrive late, as from a distant edge: the section renders its loading state first.
const API_DELAY_MS = 400;

async function adminPage(browser, origin) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const handle = createQaApiHandler({ authenticated: true, admin: true, adminState: {}, origin });
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    const answer = () => {
      if (handle({ url, method: request.method(), postData: request.postData() }, response => request.respond(response))) return;
      if (url.origin === origin) request.continue({ headers: { ...request.headers(), cookie: qaSessionCookie({ admin: true }) } });
      else request.continue();
    };
    if (url.pathname.startsWith('/api/admin/')) setTimeout(answer, API_DELAY_MS);
    else answer();
  });
  await page.evaluateOnNewDocument(() => {
    window.__shift = 0;
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__shift += entry.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  return page;
}

async function openSection(page, label) {
  await page.evaluate(() => { window.__shift = 0; });
  await page.evaluate(text => [...document.querySelectorAll('.ui-sidebar__item')]
    .find(item => item.textContent?.trim() === text)?.click(), label);
  await page.waitForFunction(text => document.querySelector('#admin-section-title')?.textContent?.trim() === text, {}, label);
  await page.waitForNetworkIdle({ idleTime: 800, timeout: 20_000 });
  return page.evaluate(() => window.__shift);
}

test('admin sections open without moving their content, sticky panels follow the scroll and sheets take the console theme', async () => {
  const runtime = await startQaNextRuntime();
  let browser;
  try {
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
    const page = await adminPage(browser, runtime.origin);
    await page.goto(`${runtime.origin}/admin/?section=dashboard`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#admin-section-title');

    // The mailing templates and the operations header status used to reflow when the overview arrived;
    // the parser panel used to push the caches card below it.
    for (const label of ['Рассылка', 'Данные и парсеры']) {
      const shift = await openSection(page, label);
      assert.ok(shift < 0.02, `${label}: layout shift ${shift.toFixed(3)} when its data arrives`);
    }

    // The preview card is sticky inside the console's scrolling main area: it stays in view.
    await openSection(page, 'Рассылка');
    const preview = await page.evaluate(() => {
      const main = document.getElementById('main-content');
      const card = document.querySelector('.admin-mailing-preview-card');
      if (!main || !card) return null;
      main.scrollTop = 600;
      const mainTop = main.getBoundingClientRect().top;
      return { position: getComputedStyle(card).position, top: Math.round(card.getBoundingClientRect().top - mainTop) };
    });
    assert.ok(preview, 'mailing preview card is rendered');
    assert.equal(preview.position, 'sticky');
    assert.ok(preview.top >= 0 && preview.top <= 40, `preview stays at the top of the scrolled area (offset ${preview.top}px)`);

    // Side sheets portal into the console's layer host: they take the theme instead of the public
    // site's palette, and their buttons fit their labels.
    await openSection(page, 'Пользователи');
    await page.waitForSelector('.admin-people-row .admin-crm-open', { visible: true });
    // Sections the console keeps hidden hold their own names; open the person from the visible table.
    await page.evaluate(() => [...document.querySelectorAll('.admin-people-row .admin-crm-open')]
      .find(button => button.offsetParent)?.click());
    await page.waitForSelector('.admin-crm-sheet[role="dialog"] .admin-crm-actions .contest-primary-button');
    await page.waitForNetworkIdle({ idleTime: 600, timeout: 20_000 });
    const sheet = await page.evaluate(() => {
      const dialog = document.querySelector('.admin-crm-sheet[role="dialog"]');
      const primary = dialog?.querySelector('.admin-crm-actions .contest-primary-button');
      const clipped = [...(dialog?.querySelectorAll('button') ?? [])]
        .filter(button => button.offsetParent && button.scrollWidth > button.clientWidth + 1)
        .map(button => button.textContent?.trim());
      return {
        inHost: Boolean(dialog?.closest('[data-admin-layer-host]')),
        primaryBackground: primary ? getComputedStyle(primary).backgroundColor : '',
        clipped,
      };
    });
    assert.equal(sheet.inHost, true, 'the client card renders inside the console layer host');
    assert.equal(sheet.primaryBackground, 'rgb(154, 79, 16)', 'the main action uses the console primary colour');
    assert.deepEqual(sheet.clipped, [], 'no button in the client card cuts its label');
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
