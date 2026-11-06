import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { launchBrowser } from '../../scripts/lib/browser-launch.mjs';
import { startPublicCardPilot } from './publicCardPilot.mjs';
import { isAbortedRoutePrefetch } from './abortedRoutePrefetch.mjs';

const axe = readFileSync(fileURLToPath(import.meta.resolve('axe-core')), 'utf8');
const listings = [
  ['/library/minions/', 'Существа Полей сражений'],
  ['/library/spells/', 'Заклинания Полей сражений'],
  ['/library/anomalies/', 'Аномалии Полей сражений'],
  ['/library/dark-gifts/', 'Темные дары Полей сражений'],
  ['/library/quests/', 'Квесты Полей сражений'],
  ['/library/rewards/', 'Награды Полей сражений'],
  ['/library/darkmoon-prizes/', 'Призы Ярмарки Новолуния'],
  ['/library/trinkets/', 'Аксессуары Полей сражений'],
  ['/library/timewarped/', 'Хрономальные карты Полей сражений'],
  ['/library/archive/', 'Архив Полей сражений'],
  ['/library/archive/minions/', 'Архив существ Полей сражений'],
  ['/library/archive/spells/', 'Архив заклинаний Полей сражений'],
  ['/library/archive/anomalies/', 'Архив аномалий Полей сражений'],
  ['/library/archive/quests/', 'Архив квестов Полей сражений'],
  ['/library/archive/rewards/', 'Архив наград Полей сражений'],
  ['/library/archive/darkmoon-prizes/', 'Архив призов Ярмарки Новолуния'],
  ['/library/archive/trinkets/', 'Архив аксессуаров Полей сражений'],
];

export function registerBgLibraryListings(label, widths) {
  test(`Next Battleground library listings preserve anonymous SEO without private requests: ${label}`, async () => {
    const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
    let browser;
    try {
      browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
        headless: true, args: ['--no-sandbox'] });
      const page = await browser.newPage();
      const errors = []; const failed = []; const privateRequests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('requestfailed', request => { if (!isAbortedRoutePrefetch(request)) failed.push(request.url()); });
      page.on('request', request => {
        if (new URL(request.url()).pathname.startsWith('/api/bg/library/')) privateRequests.push(request.url());
      });
      for (const width of widths) {
        await page.setViewport({ width, height: 900 });
        for (const [path, heading] of listings) {
          const response = await page.goto(`${runtime.origin}${path}`, { waitUntil: 'load' });
          assert.equal(response.status(), 200, `${path} at ${width}px`);
          // Document load does not prove that the session check has finished.
          await page.waitForSelector('.arena-paywall', { visible: true, timeout: 10_000 });
          await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all(document.getAnimations()
              .filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime))
              .map(animation => animation.finished.catch(() => {})));
          });
          await page.evaluate(axe);
          const state = await page.evaluate(async () => ({
            canonical: document.querySelector('link[rel=canonical]')?.href,
            h1: [...document.querySelectorAll('h1')].map(node => node.textContent?.trim()),
            main: document.querySelectorAll('main').length,
            overflow: document.documentElement.scrollWidth > innerWidth,
            paywall: document.body.textContent.includes('доступна подписчикам'),
            violations: (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }))
              .violations.map(violation => violation.id),
          }));
          assert.equal(state.canonical, `https://hearthpulse.net${path}`);
          assert.deepEqual(state.h1, [heading]);
          assert.equal(state.main, 1);
          assert.equal(state.overflow, false);
          assert.equal(state.paywall, true);
          assert.deepEqual(state.violations, []);
        }
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(failed, []);
      assert.deepEqual(privateRequests, []);
      assert.equal((await page.goto(`${runtime.nextOrigin}/library/unknown/`, { waitUntil: 'networkidle2' })).status(), 404);
      assert.equal((await page.goto(`${runtime.nextOrigin}/library/archive/dark-gifts/`, { waitUntil: 'networkidle2' })).status(), 404);
      assert.equal((await page.goto(`${runtime.nextOrigin}/library/archive/timewarped/`, { waitUntil: 'networkidle2' })).status(), 404);
      await page.close();
    } finally {
      if (browser) await browser.close();
      await runtime.close();
    }
  });
}
