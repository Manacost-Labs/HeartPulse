import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { openStory, startStorybookStatic } from './helpers/storybookStatic.mjs';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');
const screenshotPrefix = `/tmp/manacost-soft-paywall-${process.pid}`;
const chromiumPath = [
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].find(candidate => candidate && existsSync(candidate));
if (!chromiumPath) throw new Error('Chromium/Chrome executable is required for soft paywall browser tests');

// The story renders a page on fixture data; its query string picks the page and the access level.
const storybook = await startStorybookStatic();
const fixture = query => `${storybook.storyUrl('browser-test-fixtures-soft-paywall--fixture')}&${query}`;
// Chrome aborts a load with net::ERR_NETWORK_CHANGED whenever the host's network interfaces change; openStory opens such a canvas again.
let page;
const open = async url => {
  await openStory(page, url);
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 3000 }).catch(() => {});
};
const go = query => open(fixture(query));

let browser;
try {
  browser = await launchBrowser({
    executablePath: chromiumPath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  page = await browser.newPage();
  const runtimeErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('console', entry => {
    if (entry.type() === 'error') consoleErrors.push(entry.text());
  });

  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await go('page=meta');
  try {
    await page.waitForSelector('.arena-inline-paywall--meta', { timeout: 60_000 });
  } catch (error) {
    throw new Error(
      `soft paywall did not render; page errors=${JSON.stringify(runtimeErrors)} console errors=${JSON.stringify(consoleErrors)}`,
      { cause: error },
    );
  }
  assert.equal(await page.$$eval('.standard-meta-card', cards => cards.length), 3);
  assert.equal(await page.$$eval('.arena-paywall__overlay', nodes => nodes.length), 0);
  assert.equal(
    await page.$eval('.arena-inline-paywall__primary span', node => node.textContent),
    'Открыть всю мету',
  );
  assert.ok(await page.$('.standard-meta__controls'));
  assert.ok(await page.$('.standard-meta-chart'));
  await page.click('.standard-meta__segmented button:nth-child(2)');
  await page.waitForFunction(() => (
    document.querySelector('.standard-meta__segmented button:nth-child(2)')
      ?.getAttribute('aria-pressed') === 'true'
  ));
  await page.screenshot({ path: `${screenshotPrefix}-meta-desktop.png`, fullPage: true });

  for (const width of [390, 320]) {
    await page.setViewport({ width, height: 844, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    await open(page.url());
    await page.waitForSelector('.arena-inline-paywall--meta');
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      primaryHeight: document.querySelector('.arena-inline-paywall__primary')?.getBoundingClientRect().height ?? 0,
      cardCount: document.querySelectorAll('.standard-meta-card').length,
    }));
    assert.ok(layout.overflow <= 1, `meta teaser overflowed by ${layout.overflow}px at ${width}px`);
    assert.ok(layout.primaryHeight >= 48);
    assert.equal(layout.cardCount, 3);
  }
  await page.screenshot({ path: `${screenshotPrefix}-meta-mobile.png`, fullPage: true });

  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await go('page=fun-decks');
  await page.waitForSelector('.arena-inline-paywall--meta');
  await page.waitForSelector('[data-tour-id="fun-decks-deck-list"] .deck-list-view');
  assert.equal(await page.$$eval('.fun-deck-card', cards => cards.length), 3);
  assert.equal(
    await page.$eval('.fun-decks-grid', grid => getComputedStyle(grid).gridTemplateColumns.split(' ').length),
    3,
    'desktop fun-decks must show three decks per row',
  );
  assert.equal(await page.$$eval('.fun-deck-card .deck-list-view__expand', buttons => buttons.length), 0);
  assert.equal(await page.$$eval('.fun-deck-card:first-child .deck-list-view__body > .deck-list-view__hsreplay > .deck-list-view__list > li', rows => rows.length), 17);
  assert.equal(await page.$$eval('.fun-deck-card:first-child .deck-list-view__sideboard li', rows => rows.length), 3);
  assert.equal(await page.$eval('.fun-deck-card__identity h2', node => node.textContent), 'Фановая колода 6');
  assert.equal(await page.$eval('.fun-decks-tools__sort select', node => node.value), 'newest');
  assert.equal(await page.$eval('.fun-deck-card__identity span strong', node => node.textContent), 'Новая');
  assert.equal(await page.$('.fun-decks-freshness'), null);
  assert.equal(await page.$$eval('.arena-paywall__overlay', nodes => nodes.length), 0);
  assert.deepEqual(
    await page.$$eval('.arena-inline-paywall__provider', nodes => nodes.map(node => ({
      text: node.textContent?.replace(/\s+/g, ' ').trim(),
      href: node.getAttribute('href'),
    }))),
    [
      {
        text: 'BBoostyОткрыть через Boosty',
        href: 'https://boosty.to/kolodahearthstone',
      },
      {
        text: 'TelegramОткрыть через Telegram',
        href: 'https://web.tribute.tg/s/xz9',
      },
    ],
  );
  for (const anchor of [
    'fun-decks-method',
    'fun-decks-filters',
    'fun-decks-card-metrics',
    'fun-decks-deck-list',
  ]) {
    assert.ok(await page.$(`[data-tour-id="${anchor}"]`), `missing tour anchor ${anchor}`);
  }
  await page.click('.fun-decks-tools__formats button:nth-child(3)');
  await page.waitForFunction(() => (
    document.querySelector('.fun-deck-card__identity span')?.textContent?.startsWith('Вольный формат')
  ));
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(await page.$$eval('.fun-deck-card', cards => cards.length), 3);
  await page.select('.fun-decks-tools__sort select', 'fun');
  await page.waitForFunction(() => document.querySelector('.fun-deck-card__identity h2')?.textContent === 'Фановая колода 4');
  await page.addScriptTag({ path: axePath });
  const funDeckViolations = await page.evaluate(async () => {
    const result = await globalThis.axe.run(document.querySelector('#storybook-root'));
    return result.violations.filter(violation => ['serious', 'critical'].includes(violation.impact));
  });
  assert.deepEqual(funDeckViolations, []);
  await page.screenshot({ path: `${screenshotPrefix}-fun-decks-desktop.png`, fullPage: true });

  // Why a deck is fun, how far its win rate can be trusted, and the filters and the sort kept in the address.
  const openFun = async query => {
    await open(fixture(query.replace(/^id=[^&]*&viewMode=story&?/, '')));
    await page.waitForSelector('.fun-decks-tools');
  };
  const funTitles = () => page.$$eval('.fun-deck-card h2', nodes => nodes.map(node => node.textContent));
  const funCards = () => page.$$eval('.fun-deck-card', cards => cards.map(card => ({
    title: card.querySelector('h2')?.textContent,
    why: [...card.querySelectorAll('.fun-deck-card__why li')].map(item => item.textContent),
    closest: card.querySelector('.fun-deck-card__why p')?.textContent,
    winRate: card.querySelector('.fun-deck-card__metrics div:nth-child(1) dd')?.textContent,
    games: card.querySelector('.fun-deck-card__metrics div:nth-child(2) dd')?.textContent,
  })));
  const filterButton = async (group, name) => (await page.evaluateHandle((groupSelector, label) => (
    [...document.querySelectorAll(`${groupSelector} button`)].find(item => (item.getAttribute('aria-label') ?? item.textContent).trim() === label)
  ), group, name)).asElement();
  const pressedFilters = () => page.$$eval('.fun-decks-tools__classes button[aria-pressed="true"], .fun-decks-tools__tags button[aria-pressed="true"]',
    items => items.map(item => item.getAttribute('aria-label') ?? item.textContent.trim()));
  const waitForTitles = async titles => {
    try {
      await page.waitForFunction(expected => (
        JSON.stringify([...document.querySelectorAll('.fun-deck-card h2')].map(node => node.textContent)) === JSON.stringify(expected)
      ), { timeout: 10_000 }, titles);
    } catch (error) {
      const shown = await page.evaluate(() => ({
        state: document.querySelector('.fun-decks-page__state')?.textContent ?? null,
        skeleton: Boolean(document.querySelector('.loading-surface')),
        pressed: [...document.querySelectorAll('.fun-decks-tools [aria-pressed="true"]')].map(item => item.getAttribute('aria-label') ?? item.textContent),
        url: location.search,
      }));
      throw new Error(`expected the decks ${JSON.stringify(titles)}, the page shows ${JSON.stringify(await funTitles())} ${JSON.stringify(shown)}`, { cause: error });
    }
  };
  // The page's own parts are held to every impact level; the deck lists inside the cards to the serious and critical ones, as before.
  const noViolations = async label => {
    // A pressed button fades to its colours: axe would measure the blend.
    await page.mouse.move(0, 0);
    await page.evaluate(() => Promise.all(document.getAnimations()
      .filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime))
      .map(animation => animation.finished.catch(() => {}))));
    await page.addScriptTag({ path: axePath });
    const found = await page.evaluate(async () => (await globalThis.axe.run(document.querySelector('#storybook-root'))).violations
      .map(violation => ({ id: violation.id, impact: violation.impact, targets: violation.nodes.map(node => node.target.join(' ')) })));
    const own = /fun-decks-tools|fun-deck-card__why|fun-deck-card__metrics|fun-decks-page__state|fun-decks-method/;
    assert.deepEqual(found.filter(violation => ['serious', 'critical'].includes(violation.impact) || violation.targets.some(target => own.test(target)))
      .map(violation => ({ id: violation.id, impact: violation.impact, targets: violation.targets.slice(0, 3) })), [], `${label}: axe violations`);
  };

  await openFun('page=fun-decks&access=full');
  await page.waitForSelector('.fun-deck-card');
  const cards = await funCards();
  assert.deepEqual(cards.map(card => card.title), ['Фановая колода 6', 'Фановая колода 5', 'Фановая колода 4', 'Фановая колода 3', 'Фановая колода 2', 'Фановая колода 1']);
  assert.deepEqual(cards[4], {
    title: 'Фановая колода 2', why: ['Пакет: Рено', 'Хайлендер', 'Далеко от меты'], closest: 'Ближе всего к: Мета 2 · сходство 20%',
    winRate: '49% (47–61%)', games: '30 мало игр',
  }, 'a card shows three Russian reasons, the nearest archetype, the interval rounded to whole percent (46,5–61,4 is 47–61) and the few-games note');
  assert.deepEqual([cards[3].why, cards[3].winRate, cards[3].games], [['Сыр'], '50% (44–56%)', '250'], 'a deck with enough games has no note');
  assert.deepEqual(cards[1].why, ['Пакет: Рено', 'Хайлендер', 'XL-колода'], 'a card shows three reasons: the fourth ("Концепт") is left out');
  const pageText = await page.$eval('#storybook-root', root => root.innerText);
  assert.doesNotMatch(pageText, /_shape|_package|pkg:|standard_balance|title_mismatch|meta_core|low_meta/, 'no internal code is shown');
  assert.deepEqual(await page.$$eval('.fun-decks-tools__sort option', options => options.map(option => option.textContent)),
    ['Свежие', 'Индекс фана', 'Надёжный винрейт', 'Дальше от меты']);

  await (await filterButton('.fun-decks-tools__classes', 'Жрец')).click();
  await (await filterButton('.fun-decks-tools__tags', 'Хайлендер')).click();
  await page.select('.fun-decks-tools__sort select', 'reliable');
  await waitForTitles(['Фановая колода 2', 'Фановая колода 5']);
  assert.equal(await page.$eval('.fun-decks-tools__result p', node => node.textContent), 'Найдено: 2');
  const shared = new URL(page.url()).searchParams;
  assert.deepEqual([shared.get('class'), shared.get('tag'), shared.get('sort'), shared.get('page')], ['priest', 'highlander', 'reliable', 'fun-decks'],
    'the filters and the sort are in the address next to the parameters that were there');
  await noViolations('filtered fun decks');

  await openFun(new URL(page.url()).search.slice(1));
  await waitForTitles(['Фановая колода 2', 'Фановая колода 5']);
  assert.deepEqual(await pressedFilters(), ['Жрец', 'Хайлендер'], 'a reload keeps the filters');
  assert.equal(await page.$eval('.fun-decks-tools__sort select', node => node.value), 'reliable', 'and the sort');

  await (await filterButton('.fun-decks-tools__tags', 'Мем')).click();
  await (await filterButton('.fun-decks-tools__tags', 'Хайлендер')).click();
  await page.waitForFunction(() => document.querySelector('.fun-decks-page__state h2')?.textContent === 'Колоды не найдены');
  assert.equal(await page.$eval('.fun-decks-page__state p', node => node.textContent), 'Ни одна колода не подходит под выбранные фильтры.');
  assert.equal(await page.$$eval('.fun-deck-card', nodes => nodes.length), 0);
  await noViolations('fun decks without a match');
  await page.click('.fun-decks-page__state button');
  await waitForTitles(['Фановая колода 2', 'Фановая колода 3', 'Фановая колода 5', 'Фановая колода 6', 'Фановая колода 1', 'Фановая колода 4']);
  assert.deepEqual(await pressedFilters(), [], 'the reset clears every filter');
  const afterReset = new URL(page.url()).searchParams;
  assert.deepEqual([afterReset.get('class'), afterReset.get('tag'), afterReset.get('sort')], [null, null, 'reliable'], 'the sort is not a filter and stays');
  assert.equal(await page.$('.fun-decks-tools__result button'), null, 'with no filter there is nothing to reset');

  // A tag the reader filters by is on the card even where it would not be among the first three reasons.
  await (await filterButton('.fun-decks-tools__tags', 'Концепт')).click();
  await waitForTitles(['Фановая колода 5', 'Фановая колода 1']);
  assert.deepEqual((await funCards()).map(card => card.why), [['Концепт', 'Пакет: Рено', 'Хайлендер'], ['Концепт', 'Мем']],
    'the filtered tag comes first, and the deck that showed three other reasons gives up its last');

  // A guest's filters narrow the three decks the guest is shown; the second priest deck of the selection stays behind the subscription.
  await openFun('page=fun-decks&class=priest&sort=reliable');
  await waitForTitles(['Фановая колода 2', 'Фановая колода 5']);
  await openFun('page=fun-decks&class=shaman&sort=reliable');
  await page.waitForFunction(() => document.querySelector('.fun-decks-page__state p')?.textContent === 'Среди открытых колод таких нет.');
  assert.equal(await page.$$eval('.fun-deck-card', nodes => nodes.length), 0, 'a hidden deck is not opened by a filter');
  assert.ok(await page.$('.arena-inline-paywall--meta'), 'the subscription offer stays under the empty result');

  // A selection as served before concept-v7: no interval on the cards, and the reliable sort falls back to the win rate.
  await openFun('page=fun-decks&access=full&dataset=legacy&sort=reliable');
  await waitForTitles(['Фановая колода 6', 'Фановая колода 5', 'Фановая колода 4', 'Фановая колода 3', 'Фановая колода 2', 'Фановая колода 1']);
  assert.deepEqual((await funCards()).map(card => card.winRate), ['53%', '52%', '51%', '50%', '49%', '48%']);
  assert.equal((await funCards())[0].closest, 'Ближе всего к: Meta 6 · сходство 28%', 'the English archetype name stands in for the missing Russian one');

  for (const width of [390, 320]) {
    await page.setViewport({ width, height: 844, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    await openFun('page=fun-decks&access=full&class=priest&tag=highlander');
    await waitForTitles(['Фановая колода 5', 'Фановая колода 2']);
    const phone = await page.evaluate(() => {
      const tools = document.querySelector('.fun-decks-tools');
      const buttons = [...tools.querySelectorAll('button')];
      return {
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        toolsOverflow: tools.scrollWidth - tools.clientWidth,
        smallest: Math.min(...buttons.map(button => Math.min(button.getBoundingClientRect().width, button.getBoundingClientRect().height))),
        classRows: new Set([...tools.querySelectorAll('.fun-decks-tools__classes button')].map(button => Math.round(button.getBoundingClientRect().top))).size,
      };
    });
    assert.ok(phone.pageOverflow <= 1, `fun decks overflowed the page by ${phone.pageOverflow}px at ${width}px`);
    assert.ok(phone.toolsOverflow <= 1, `the filters overflowed by ${phone.toolsOverflow}px at ${width}px`);
    assert.ok(phone.smallest >= 42, `a filter control was ${phone.smallest}px at ${width}px`);
    assert.ok(phone.classRows >= 2, `the eleven classes wrap onto rows at ${width}px`);
    await noViolations(`fun decks filters at ${width}px`);
    if (width === 390) await page.screenshot({ path: `${screenshotPrefix}-fun-decks-filters-mobile.png`, fullPage: true });
  }

  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.setViewport({ width: 1920, height: 1000, deviceScaleFactor: 1 });
  await go('page=fun-decks&access=full');
  await page.waitForSelector('.fun-decks-grid .fun-deck-card:nth-child(6)');
  const wideFunDecks = await page.evaluate(() => ({
    cardCount: document.querySelectorAll('.fun-deck-card').length,
    columns: getComputedStyle(document.querySelector('.fun-decks-grid')).gridTemplateColumns.split(' ').length,
    minCardWidth: Math.min(...[...document.querySelectorAll('.fun-deck-card')]
      .map(node => node.getBoundingClientRect().width)),
    expandButtons: document.querySelectorAll('.fun-deck-card .deck-list-view__expand').length,
    mainRows: document.querySelectorAll('.fun-deck-card:first-child .deck-list-view__body > .deck-list-view__hsreplay > .deck-list-view__list > li').length,
    sideboardRows: document.querySelectorAll('.fun-deck-card:first-child .deck-list-view__sideboard li').length,
    tileHeight: document.querySelector('.fun-deck-card .hsrdv-card-tile')?.getBoundingClientRect().height ?? 0,
    artCoverage: (() => {
      const art = document.querySelector('.fun-deck-card .hsrdv-card-art');
      const frame = document.querySelector('.fun-deck-card .hsrdv-card-frame');
      if (!art || !frame) return 0;
      return art.getBoundingClientRect().width / frame.getBoundingClientRect().width;
    })(),
    cardHeight: document.querySelector('.fun-deck-card')?.getBoundingClientRect().height ?? 0,
  }));
  assert.equal(wideFunDecks.cardCount, 6);
  assert.equal(wideFunDecks.columns, 3);
  assert.ok(wideFunDecks.minCardWidth >= 420, `wide fun deck card was only ${wideFunDecks.minCardWidth}px`);
  assert.equal(wideFunDecks.expandButtons, 0);
  assert.equal(wideFunDecks.mainRows, 17);
  assert.equal(wideFunDecks.sideboardRows, 3);
  assert.ok(wideFunDecks.tileHeight <= 26, `compact fun deck row was ${wideFunDecks.tileHeight}px tall`);
  assert.ok(wideFunDecks.artCoverage >= 0.889, `compact art covered only ${wideFunDecks.artCoverage * 100}% of its frame`);
  // 820 px before the card gained the reasons block (about 54 px) and the interval note line (about 15 px).
  assert.ok(wideFunDecks.cardHeight <= 900, `compact full fun deck was ${wideFunDecks.cardHeight}px tall`);
  await page.screenshot({ path: `${screenshotPrefix}-fun-decks-wide.png`, fullPage: true });

  await go('page=fun-decks&access=full&render=ready');
  await page.waitForSelector('.fun-deck-card .deck-render-preview[data-render-state="ready"]');
  assert.equal(
    await page.$$eval('.fun-deck-card__copy', buttons => buttons.filter(button => {
      const style = getComputedStyle(button);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }).length),
    6,
    'every rendered fun deck must keep a visible copy-code action',
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async value => { window.__copiedFunDeckCode = value; },
      },
    });
  });
  await page.click('.fun-deck-card__copy');
  await page.waitForFunction(() => document.querySelector('.fun-deck-card__copy')?.textContent?.includes('Код скопирован'));
  assert.ok(
    await page.evaluate(() => typeof window.__copiedFunDeckCode === 'string' && window.__copiedFunDeckCode.length > 20),
    'the fun-deck copy action must write the full deck code',
  );
  await page.screenshot({ path: `${screenshotPrefix}-fun-decks-rendered.png`, fullPage: true });

  await open(page.url());
  await page.waitForSelector('.fun-deck-card .deck-render-preview[data-render-state="ready"]');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => { throw new DOMException('Denied', 'NotAllowedError'); } },
    });
    document.execCommand = command => {
      if (command !== 'copy') return false;
      window.__fallbackCopiedFunDeckCode = document.activeElement?.value;
      return true;
    };
  });
  await page.click('.fun-deck-card__copy');
  await page.waitForFunction(() => document.querySelector('.fun-deck-card__copy')?.textContent?.includes('Код скопирован'));
  assert.ok(
    await page.evaluate(() => typeof window.__fallbackCopiedFunDeckCode === 'string' && window.__fallbackCopiedFunDeckCode.length > 20),
    'the fun-deck copy action must fall back when Clipboard API writes are denied',
  );

  await page.setViewport({ width: 1024, height: 900, deviceScaleFactor: 1 });
  await go('page=fun-decks&access=full');
  assert.equal(
    await page.$eval('.fun-decks-grid', grid => getComputedStyle(grid).gridTemplateColumns.split(' ').length),
    2,
    'tablet fun-decks must use two columns',
  );
  await page.screenshot({ path: `${screenshotPrefix}-fun-decks-tablet.png`, fullPage: true });

  for (const width of [390, 320]) {
    await page.setViewport({ width, height: 844, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    await go('page=fun-decks');
    await page.waitForSelector('.arena-inline-paywall--meta');
    await page.waitForSelector('[data-tour-id="fun-decks-deck-list"] .deck-list-view');
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      providerHeights: [...document.querySelectorAll('.arena-inline-paywall__provider')]
        .map(node => node.getBoundingClientRect().height),
      cardCount: document.querySelectorAll('.fun-deck-card').length,
    }));
    assert.ok(layout.overflow <= 1, `fun deck teaser overflowed by ${layout.overflow}px at ${width}px`);
    assert.equal(layout.providerHeights.length, 2);
    assert.ok(layout.providerHeights.every(height => height >= 48));
    assert.equal(layout.cardCount, 3);
  }
  await page.screenshot({ path: `${screenshotPrefix}-fun-decks-mobile.png`, fullPage: true });

  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await go('page=archetype');
  await page.waitForSelector('.arena-inline-paywall--archetype');
  assert.equal(await page.$eval('#storybook-root h1', node => node.textContent), 'Охотник на демонов Бездны');
  assert.equal(await page.$$eval('.archetype-deck-card', nodes => nodes.length), 0);
  assert.equal(await page.$$eval('.constructed-card-stats', nodes => nodes.length), 0);
  assert.equal(await page.$$eval('.archetype-history', nodes => nodes.length), 0);
  assert.equal(await page.$$eval('.archetype-ranks, .archetype-radar-section, .archetype-compare', nodes => nodes.length), 0,
    'rank, radar and build comparisons are subscriber analytics');
  assert.equal(await page.$$eval('.archetype-dossier__metrics .ui-kpi-group__delta', nodes => nodes.length), 0,
    'guests see the statistics without the subscriber history');
  assert.equal(await page.$$eval('.archetype-build-preview', nodes => nodes.length), 1);
  assert.equal(
    await page.$eval('.arena-inline-paywall__primary span', node => node.textContent),
    'Открыть статистику архетипа',
  );
  assert.equal(
    await page.$eval('.arena-inline-paywall__account-link', node => node.getAttribute('href')),
    '/?login',
  );
  await page.screenshot({ path: `${screenshotPrefix}-archetype-desktop.png`, fullPage: true });

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await open(page.url());
  await page.waitForSelector('.arena-inline-paywall--archetype');
  const detailLayout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    primaryHeight: document.querySelector('.arena-inline-paywall__primary')?.getBoundingClientRect().height ?? 0,
    metricCount: document.querySelectorAll('.archetype-dossier__metrics > li').length,
  }));
  assert.ok(detailLayout.overflow <= 1, `archetype teaser overflowed by ${detailLayout.overflow}px`);
  assert.ok(detailLayout.primaryHeight >= 48);
  assert.equal(detailLayout.metricCount, 6);
  await page.screenshot({ path: `${screenshotPrefix}-archetype-mobile.png`, fullPage: true });

  await go('page=catalog');
  await page.waitForSelector('.archetype-row');
  assert.equal(await page.$$eval('.archetype-row', nodes => nodes.length), 4);
  assert.equal(await page.$$eval('.arena-inline-paywall', nodes => nodes.length), 0);

  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    const result = await globalThis.axe.run(document.querySelector('#storybook-root'));
    return result.violations.filter(violation => ['serious', 'critical'].includes(violation.impact));
  });
  assert.deepEqual(violations, []);
  assert.deepEqual(runtimeErrors, []);
  assert.deepEqual(consoleErrors, []);
  console.log(`Soft paywall browser QA passed; screenshots: ${screenshotPrefix}-*.png`);
} finally {
  await browser?.close();
  await storybook.close();
}
