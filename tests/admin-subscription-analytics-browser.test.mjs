import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startQaNextRuntime } from '../scripts/qa/nextRuntime.mjs';
import { createQaApiHandler, qaSessionCookie } from '../scripts/qa/mockApi.mjs';

// The section reads the real hook (useLiveSubscriptionMetrics) in a real browser: first load, the
// minute poll, a hidden tab, a failed poll that keeps the data, and a source that is down at first.
const API_DELAY_MS = 250;
const PATH = '/admin/?section=subscription-analytics';

async function openAdmin(browser, origin, adminState, viewport = { width: 1440, height: 900 }) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const handle = createQaApiHandler({ authenticated: true, admin: true, adminState, origin });
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
    // The minute poll is fired by hand: the test does not wait 60 s, and a cleared interval stays cleared.
    const minute = new Map();
    const realSet = window.setInterval.bind(window);
    const realClear = window.clearInterval.bind(window);
    window.setInterval = (callback, delay, ...rest) => {
      const handle = realSet(callback, delay, ...rest);
      if (delay === 60_000) minute.set(handle, callback);
      return handle;
    };
    window.clearInterval = handle => { minute.delete(handle); realClear(handle); };
    window.__fireMinute = () => minute.forEach(callback => callback());
    window.__minuteTimers = () => minute.size;
    window.__setVisibility = state => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    window.__skeletons = 0;
    window.__shift = 0;
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node instanceof Element && (node.matches('.sa-skeleton') || node.querySelector('.sa-skeleton'))) window.__skeletons += 1;
      }
    }).observe(document, { childList: true, subtree: true });
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__shift += entry.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  return page;
}

const tileText = (page, id) => page.$eval(`[data-tile="${id}"]`, element => element.textContent.replace(/\s+/g, ' ').trim());
const requestCount = state => state.subscriptionMetrics?.requests?.length ?? 0;
const waitRequests = async (state, count) => {
  const deadline = Date.now() + 10_000;
  while (requestCount(state) < count) {
    if (Date.now() > deadline) throw new Error(`expected ${count} requests, got ${requestCount(state)}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
};
const settle = () => new Promise(resolve => setTimeout(resolve, API_DELAY_MS + 350));

test('subscription analytics: tiles, charts, live polling and failure states', async () => {
  const runtime = await startQaNextRuntime();
  let browser;
  try {
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    const state = {};
    const page = await openAdmin(browser, runtime.origin, state);
    await page.goto(`${runtime.origin}${PATH}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('ul.sa-tiles', { timeout: 30_000 });

    // The menu names the section and the address opens it.
    assert.equal(await page.$eval('#admin-section-title', element => element.textContent.trim()), 'Аналитика подписок');
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('.ui-sidebar__item')].some(item => item.textContent?.trim() === 'Аналитика подписок')));

    // First load: the sample's numbers, Russian labels, the default period.
    assert.deepEqual(state.subscriptionMetrics.requests, ['92']);
    assert.match(await tileText(page, 'paidNow'), /Платных сейчас\s*414/);
    assert.match(await tileText(page, 'netChange'), /Изменение за период\s*\+123/);
    assert.match(await tileText(page, 'newStarts'), /Новые\s*280/);
    assert.match(await tileText(page, 'returnedStarts'), /Вернувшиеся\s*55/);
    assert.match(await tileText(page, 'endsToFree'), /Ушли на бесплатный\s*133/);
    assert.match(await tileText(page, 'endsLeft'), /Ушли совсем\s*79/);
    assert.equal(await page.$eval('.sa-periods [aria-pressed="true"]', element => element.textContent.trim()), '92 дн.');
    assert.match(await page.$eval('[data-testid="live-status"]', element => element.textContent), /Обновлено .+назад|Обновлено только что/);
    assert.match(await page.$eval('[data-testid="last-poll"]', element => element.textContent), /Последний опрос Boosty: \d+ \S+, \d\d:\d\d UTC, \d+ (минуту|минуты) назад/);
    assert.equal(await page.$('[data-testid="stale-warning"]'), null, 'a fresh poll raises no warning');

    // Charts: the daily line with its plan breakdown and the marked days without observations, the weekly one with its partial week.
    await page.waitForSelector('[data-chart-id="daily-paid"] svg[data-chart]');
    assert.ok(await page.$('[data-chart-id="daily-paid"] .analytics-chart__reference'), 'carried days are drawn dashed');
    assert.match(await page.$eval('[data-testid="unobserved-note"]', element => element.textContent), /Без наблюдений \d+ (день|дня|дней): .*сен/);
    assert.match(await page.$eval('[data-chart-id="daily-paid"] .sa-legend', element => element.textContent), /Дни без наблюдений/);
    assert.ok(await page.$('[data-chart-id="daily-paid"] .analytics-chart + .sa-legend + .sa-chart-note ~ div .analytics-chart'), 'plan shares follow the daily chart');
    await page.waitForSelector('[data-chart-id="weekly-access"] svg[data-chart]');
    assert.match(await page.$$eval('[data-chart-id="weekly-access"] .analytics-chart__boundary', elements => elements.map(element => element.textContent).join(' ')), /неполная неделя/);
    // A partial week is its own one-point segment: its endings must still be drawn, not only its starts.
    const loneEndings = await page.$$eval('[data-chart-id="weekly-access"] svg[data-chart] circle > title', titles => titles
      .filter(title => title.parentElement.getBoundingClientRect().width > 0)
      .map(title => title.textContent));
    assert.deepEqual(loneEndings, ['Неделя с 10 авг (неполная): Закончили 12', 'Неделя с 9 ноя (неполная): Закончили 12'], 'endings of both partial weeks are drawn and named');

    // Both partial weeks are named under the chart, the first one too (it sits left of the first boundary).
    const weekNotes = await page.$$eval('[data-testid="partial-week-note"]', elements => elements.map(element => element.textContent));
    assert.equal(weekNotes.length, 2);
    assert.match(weekNotes[0], /Неделя с 10 авг неполная/);
    assert.match(weekNotes[1], /Неделя с 9 ноя ещё не закончилась/);
    assert.match(await page.$eval('[data-chart-id="weekly-access"] .sa-legend', element => element.textContent), /неполная неделя/);
    // The change tile explains itself; the free count lives in the conversion block now.
    assert.doesNotMatch(await tileText(page, 'netChange'), /Бесплатных сейчас/);

    // Slice 3 blocks: each has its Russian heading, units and honest wording.
    const sectionText = id => page.$eval(`[data-section="${id}"]`, element => element.innerText.replace(/\s+/g, ' ').trim());
    const headings = await page.$$eval('.sa-section h3', elements => elements.map(element => element.textContent.trim()));
    assert.deepEqual(headings, [
      'Стоимость базы по ценам тарифов', 'Тарифы', 'Переходы между тарифами', 'Удержание когорт', 'Отток по месяцам',
      'Денежная оценка (не выручка)', 'Конверсия бесплатных подписчиков в платных', 'Что нельзя посчитать', 'Ограничения и оговорки', 'Покрытие данных',
    ]);
    const baseValue = await sectionText('base-value');
    assert.match(baseValue, /Средний тариф снизился: 207 ₽ → 193 ₽ \(−14 ₽\)/);
    assert.match(baseValue, /60 318 ₽ в месяц.*291.*79 942 ₽ в месяц.*414/);
    const plansText = await sectionText('plans');
    assert.match(plansText, /Алмаз 199 ₽\/мес 255 317 \+62 221 165 9 3/);
    assert.match(plansText, /Топ-1000 Легенды 999 ₽\/мес 1 2 \+1 1 0 0 0/);
    const transitionsText = await sectionText('transitions');
    assert.match(transitionsText, /Любитель Арены Алмаз ↑ Повышение 7/);
    assert.match(transitionsText, /Алмаз Легенда ↑ Повышение 3/);
    const retentionText = await sectionText('retention');
    assert.match(retentionText, /Через 30 дней 72,4 % Проверено 123 из 150 человек/);
    assert.match(retentionText, /Ещё 27 не удалось проверить.*59,3 %.*77,3 %/);
    assert.match(retentionText, /Через 90 дней 42,9 % Проверено 21 из 21 человек.*Мало данных/);
    assert.match(retentionText, /Исходная база периода 64,9 % 189 из 291/);
    const churnText = await sectionText('churn');
    assert.match(churnText, /август 2026 неполный 291 37 12,7 % 74 38 327/);
    assert.match(churnText, /сентябрь 2026 327 66 20,2 % 84 77 334/);
    assert.match(churnText, /ноябрь 2026 неполный 394 27 6,9 %/);
    assert.match(churnText, /август 2026 и ноябрь 2026 неполные.*нельзя сравнивать с полными/);
    const moneyText = await sectionText('money');
    assert.match(moneyText, /Денежная оценка \(не выручка\).*Это оценка, а не выручка/);
    assert.match(moneyText, /Прирост счётчиков \(оценка\) 215 374 ₽ 1 079 приростов за период/);
    assert.match(moneyText, /Плательщиков 546/);
    assert.match(moneyText, /ARPPU \(оценка\) 394 ₽/);
    assert.match(moneyText, /Уменьшений счётчика 0/);
    assert.match(moneyText, /Первых значений счётчика 1/);
    assert.match(moneyText, /Деньги — это рост счётчика платежей подписчика между опросами, а не выписка по платежам/);
    assert.match(moneyText, /сентябрь 2026 58 154 ₽ 310 188 ₽/);
    assert.match(await sectionText('conversion'), /Бесплатных на начало 243.*Хоть раз стали платными 20.*4 из них сейчас не платят.*Платят сейчас 16.*Доля ставших платными 8,2 %.*Бесплатных сейчас 357/);
    const unavailableText = await sectionText('unavailable');
    for (const phrase of ['Чистая выручка недоступна', 'Точная доля продлений недоступна', 'сколько стоило их привлечение']) assert.ok(unavailableText.includes(phrase), phrase);
    const limitationsText = await sectionText('limitations');
    for (const phrase of ['Все суммы считаются рублями', 'впервые увидели подписчика платным', 'первому опросу в течение суток', 'Отток месяца', 'по UTC', 'перерывы в опросах', 'Первый и текущий месяцы неполные']) {
      assert.ok(limitationsText.includes(phrase) || limitationsText.toLowerCase().includes(phrase.toLowerCase()), phrase);
    }
    const coverageText = await sectionText('coverage');
    assert.match(coverageText, /Наблюдаем с 28 июл 2026, 00:36 UTC/);
    assert.match(coverageText, /Принято опросов 55 266/);
    assert.match(coverageText, /Самый долгий перерыв 114 ч/);
    assert.match(coverageText, /11 сен, 21:56 UTC 15 сен, 22:25 UTC 96,5 ч/);
    assert.match(coverageText, /24 сен, 17:11 UTC 29 сен, 11:12 UTC 114 ч/);

    // A new period asks with its own days and keeps the screen: no skeleton, tiles stay.
    await page.evaluate(() => { window.__skeletons = 0; window.__shift = 0; });
    await page.click('.sa-periods button:nth-child(1)');
    await page.waitForFunction(() => /Обновляем/.test(document.querySelector('[data-testid="live-status"]')?.textContent ?? ''), { polling: 'mutation', timeout: 5000 });
    assert.ok(await page.$('ul.sa-tiles'), 'tiles stay while the new period loads');
    await waitRequests(state, 2);
    assert.equal(state.subscriptionMetrics.requests.at(-1), '30');
    await settle();
    for (const [index, days] of [[3, '180'], [4, '365']]) {
      const before = requestCount(state);
      await page.click(`.sa-periods button:nth-child(${index})`);
      await waitRequests(state, before + 1);
      assert.equal(state.subscriptionMetrics.requests.at(-1), days);
      await settle();
    }
    // Going back to a period that was just loaded reads the tab cache: no second request.
    const cached = requestCount(state);
    await page.click('.sa-periods button:nth-child(2)');
    await settle();
    assert.equal(requestCount(state), cached);
    assert.equal(await page.$eval('.sa-periods [aria-pressed="true"]', element => element.textContent.trim()), '92 дн.');
    assert.equal(await page.evaluate(() => window.__skeletons), 0, 'switching periods never shows a skeleton');

    // The minute poll refreshes in place: one request, no skeleton, no layout shift.
    await page.click('.sa-periods button:nth-child(2)');
    await settle();
    await page.evaluate(() => { window.__skeletons = 0; window.__shift = 0; });
    const beforePoll = requestCount(state);
    await page.evaluate(() => window.__fireMinute());
    await waitRequests(state, beforePoll + 1);
    await settle();
    assert.equal(requestCount(state), beforePoll + 1);
    assert.equal(await page.evaluate(() => window.__skeletons), 0, 'the poll never shows a skeleton');
    assert.ok(await page.evaluate(() => window.__shift) < 0.01, 'the poll does not move the layout');

    // A hidden tab makes no requests; coming back asks at once.
    await page.evaluate(() => window.__setVisibility('hidden'));
    assert.equal(await page.evaluate(() => window.__minuteTimers()), 0, 'the poll timer is stopped while hidden');
    const hiddenAt = requestCount(state);
    await page.evaluate(() => window.__fireMinute());
    await settle();
    assert.equal(requestCount(state), hiddenAt);
    await page.evaluate(() => window.__setVisibility('visible'));
    await waitRequests(state, hiddenAt + 1);
    await settle();

    // A failed poll keeps the data and says so; the next good poll clears it.
    state.subscriptionMetrics.failure = 'unavailable';
    await page.evaluate(() => window.__fireMinute());
    await page.waitForSelector('[data-testid="update-failed"]', { timeout: 10_000 });
    assert.match(await page.$eval('[data-testid="update-failed"]', element => element.textContent), /Не удалось обновить, показаны данные от \d+ \S+, \d\d:\d\d:\d\d UTC/);
    assert.match(await tileText(page, 'paidNow'), /414/);
    assert.equal(await page.$('[data-testid="unavailable-state"]'), null);
    state.subscriptionMetrics.failure = undefined;
    await page.evaluate(() => window.__fireMinute());
    await page.waitForSelector('[data-testid="update-failed"]', { hidden: true, timeout: 10_000 });

    // An old accepted poll raises the warning.
    state.subscriptionMetrics.pollAgeMinutes = 47;
    await page.evaluate(() => window.__fireMinute());
    await page.waitForSelector('[data-testid="stale-warning"]', { timeout: 10_000 });
    assert.match(await page.$eval('[data-testid="last-poll"]', element => element.textContent), /4[67] минут назад/);
    state.subscriptionMetrics.pollAgeMinutes = 2;
    await page.evaluate(() => window.__fireMinute());
    await page.waitForSelector('[data-testid="stale-warning"]', { hidden: true, timeout: 10_000 });
    await page.close();

    // A source that is down at first: a plain message, then the page recovers on the next poll by itself.
    const down = { subscriptionMetrics: { failure: 'unavailable' } };
    const recovering = await openAdmin(browser, runtime.origin, down);
    await recovering.goto(`${runtime.origin}${PATH}`, { waitUntil: 'domcontentloaded' });
    await recovering.waitForSelector('[data-testid="unavailable-state"]', { timeout: 30_000 });
    assert.match(await recovering.$eval('[data-testid="unavailable-state"]', element => element.textContent), /Источник аналитики недоступен.*Повторить/);
    assert.equal(await recovering.$('ul.sa-tiles'), null);
    down.subscriptionMetrics.failure = undefined;
    await recovering.evaluate(() => window.__fireMinute());
    await recovering.waitForSelector('ul.sa-tiles', { timeout: 10_000 });
    assert.match(await tileText(recovering, 'paidNow'), /414/);
    assert.equal(await recovering.$('[data-testid="unavailable-state"]'), null);
    await recovering.close();

    // 403 reads as missing rights, with no retry button.
    const forbidden = await openAdmin(browser, runtime.origin, { subscriptionMetrics: { failure: 'forbidden' } });
    await forbidden.goto(`${runtime.origin}${PATH}`, { waitUntil: 'domcontentloaded' });
    await forbidden.waitForSelector('[data-testid="unavailable-state"]', { timeout: 30_000 });
    assert.match(await forbidden.$eval('[data-testid="unavailable-state"]', element => element.textContent), /Недостаточно прав/);
    assert.equal(await forbidden.$('[data-testid="unavailable-state"] button'), null);
    await forbidden.close();
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});

test('subscription analytics on a phone: no horizontal scroll, readable in both colour schemes', async () => {
  const runtime = await startQaNextRuntime();
  let browser;
  try {
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    for (const scheme of ['light', 'dark']) {
      const page = await openAdmin(browser, runtime.origin, {}, { width: 390, height: 844, isMobile: true, hasTouch: true });
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
      await page.goto(`${runtime.origin}${PATH}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-chart-id="weekly-access"] svg[data-chart]', { timeout: 30_000 });
      const layout = await page.evaluate(() => {
        const main = document.getElementById('main-content');
        const tiles = [...document.querySelectorAll('.sa-tile')].map(tile => tile.getBoundingClientRect());
        const columns = new Set(tiles.map(rect => Math.round(rect.left))).size;
        const clipped = [...document.querySelectorAll('.subscription-analytics button, .sa-tile')]
          .filter(element => element.scrollWidth > element.clientWidth + 1).length;
        return {
          page: document.documentElement.scrollWidth - window.innerWidth,
          main: main ? main.scrollWidth - main.clientWidth : 0,
          columns, clipped,
          chart: Math.round(document.querySelector('[data-chart-id="daily-paid"] .analytics-chart').getBoundingClientRect().width),
        };
      });
      assert.ok(layout.page <= 0, `${scheme}: page scrolls sideways by ${layout.page}px`);
      assert.ok(layout.main <= 0, `${scheme}: the main area scrolls sideways by ${layout.main}px`);
      assert.equal(layout.columns, 2, `${scheme}: tiles in two columns on a phone`);
      assert.equal(layout.clipped, 0, `${scheme}: no tile or button cuts its content`);
      // Wide tables scroll inside their own labelled area, the first column stays in view.
      const tables = await page.$$eval('[data-section] [role="region"]', regions => regions.map(region => ({
        name: region.getAttribute('aria-label'),
        wider: region.scrollWidth > region.clientWidth + 1,
        fits: region.getBoundingClientRect().right <= window.innerWidth + 1,
        focusable: region.tabIndex === 0,
      })));
      assert.deepEqual(tables.map(table => table.name), [
        'Таблица: Тарифы', 'Таблица: Переходы между тарифами', 'Таблица: Отток по месяцам', 'Таблица: Денежная оценка по месяцам', 'Таблица: Перерывы в опросах',
      ]);
      for (const table of tables) assert.ok(table.fits && table.focusable, `${scheme}: ${table.name} stays inside the screen and is reachable by keyboard`);
      assert.ok(tables[0].wider && tables[2].wider, `${scheme}: plan and churn tables scroll inside their area`);
      const stickyKept = await page.evaluate(() => {
        const region = document.querySelector('[data-section="plans"] [role="region"]');
        region.scrollLeft = region.scrollWidth;
        const cell = region.querySelector('tbody th').getBoundingClientRect();
        return Math.abs(cell.left - region.getBoundingClientRect().left) < 2;
      });
      assert.ok(stickyKept, `${scheme}: the plan name column stays pinned while the table scrolls`);
      assert.ok(layout.chart >= 300, `${scheme}: charts use the full width (${layout.chart}px)`);
      // Tile text keeps AA contrast against what is behind it.
      const contrast = await page.evaluate(() => {
        const parse = value => value.match(/[\d.]+/g).map(Number);
        const luminance = ([r, g, b]) => [r, g, b].map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
        const backdrop = element => {
          for (let node = element; node; node = node.parentElement) {
            const [r, g, b, a = 1] = parse(getComputedStyle(node).backgroundColor);
            if (a > 0.9) return [r, g, b];
          }
          return [255, 255, 255];
        };
        return [...document.querySelectorAll('.sa-tile__label, .sa-tile__hint, .sa-tile__value, .sa-live')].map(element => {
          const front = luminance(parse(getComputedStyle(element).color));
          const back = luminance(backdrop(element));
          return { name: element.className, ratio: (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05) };
        });
      });
      for (const item of contrast) assert.ok(item.ratio >= 4.5, `${scheme}: ${item.name} contrast ${item.ratio.toFixed(2)}`);
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
