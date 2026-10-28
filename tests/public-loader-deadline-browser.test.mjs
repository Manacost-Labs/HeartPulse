import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startStorybookStatic } from './helpers/storybookStatic.mjs';

// REQUEST_DEADLINE_MS in src/shared/http/fetchWithDeadline.ts.
const REQUEST_DEADLINE_MS = 20_000;

// Each story sends its real request; the browser test never answers it, like a
// stalled connection. The loader must leave its skeleton for the error state
// with «Повторить», and the retry must send the request again.
const STALLED_LOADERS = [
  ['guides archive', 'guides-loading-states--network', /^\/api\/guides-archive$/, 'Не удалось загрузить архив гайдов', 'Загружаем архив'],
  ['guide detail', 'guides-loading-states--detail-network', /^\/api\/guides-archive\/sizing-guide$/, 'Не удалось загрузить гайд', 'Загружаем гайд'],
  ['fun decks', 'constructed-fun-decks-states--network', /^\/api\/fun-decks$/, 'Подборка временно недоступна', 'Загружаем фан-колоды'],
  ['cosmetics catalog', 'cosmetics-loading-states--network', /^\/api\/cosmetics\/heroes$/, 'Не удалось загрузить каталог', 'Загружаем косметику'],
  ['cosmetics detail', 'cosmetics-loading-states--detail-network', /^\/api\/cosmetics\/heroes\/HERO_11ai$/, 'Не удалось загрузить страницу', 'Загружаем предмет косметики'],
  ['contests', 'contests-loading-states--network', /^\/api\/contests$/, 'Сервер не ответил', 'Загружаем конкурсы'],
];

test('public loaders end a stalled request in the error state with a retry', async () => {
  const storybook = await startStorybookStatic();
  let browser;
  try {
    const executablePath = [process.env.CHROMIUM_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path));
    browser = await launchBrowser({ executablePath, headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Fake timers for the deadline only: its 20 s timer fires after 150 ms.
    await page.evaluateOnNewDocument(deadline => {
      const setTimeoutOriginal = window.setTimeout.bind(window);
      window.setTimeout = (handler, delay, ...args) => setTimeoutOriginal(handler, delay === deadline ? 150 : delay, ...args);
    }, REQUEST_DEADLINE_MS);
    await page.setRequestInterception(true);
    let stalled = [];
    page.on('request', request => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith('/api/')) { stalled.push(pathname); return; }
      void request.continue();
    });
    await page.setViewport({ width: 1024, height: 900 });

    for (const [name, storyId, path, alertText, statusText] of STALLED_LOADERS) {
      stalled = [];
      await page.goto(storybook.storyUrl(storyId));
      const alert = await page.waitForSelector('[role="alert"]', { visible: true, timeout: 15_000 })
        .catch(() => assert.fail(`${name}: a stalled request never left the loading state`));
      const text = await alert.evaluate(node => node.textContent ?? '');
      assert.match(text, new RegExp(alertText), `${name}: error copy`);
      assert.match(text, /Сервер не ответил за 20 секунд/, `${name}: the request deadline ended the wait`);
      assert.equal(await page.$('[role="status"].loading-surface'), null, `${name}: no skeleton left beside the error`);
      assert.equal(stalled.filter(item => path.test(item)).length, 1, `${name}: one request (${stalled.join(', ')})`);

      const [retry] = await page.$$('xpath/.//button[normalize-space()="Повторить"]');
      assert.ok(retry, `${name}: the error offers «Повторить»`);
      await retry.click();
      await page.waitForFunction(text => [...document.querySelectorAll('[role="status"]')]
        .some(node => node.textContent?.includes(text)), { timeout: 5_000 }, statusText)
        .catch(() => assert.fail(`${name}: the retry did not show the loading state «${statusText}»`));
      await page.waitForFunction(() => document.querySelector('[role="alert"]'), { timeout: 15_000 });
      assert.equal(stalled.filter(item => path.test(item)).length, 2, `${name}: the retry sent the request again`);
    }
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    await storybook.close();
  }
});
