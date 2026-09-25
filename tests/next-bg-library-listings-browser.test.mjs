import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

const axe = readFileSync(fileURLToPath(import.meta.resolve('axe-core')), 'utf8');
const listings = [
  ['/library/minions/', 'Существа Полей сражений'],
  ['/library/spells/', 'Заклинания Полей сражений'],
  ['/library/archive/', 'Архив Полей сражений'],
  ['/library/archive/minions/', 'Архив существ Полей сражений'],
  ['/library/archive/spells/', 'Архив заклинаний Полей сражений'],
];

test('Next Battleground library listings preserve anonymous SEO without private requests', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = []; const failed = []; const privateRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfailed', request => failed.push(request.url()));
    page.on('request', request => {
      if (new URL(request.url()).pathname.startsWith('/api/bg/library/')) privateRequests.push(request.url());
    });
    for (const width of [1440, 390]) {
      await page.setViewport({ width, height: 900 });
      for (const [path, heading] of listings) {
        const response = await page.goto(`${runtime.origin}${path}`, { waitUntil: 'networkidle2' });
        assert.equal(response.status(), 200, `${path} at ${width}px`);
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
    await page.close();
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
