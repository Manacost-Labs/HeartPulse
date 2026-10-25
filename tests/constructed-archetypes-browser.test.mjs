import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import puppeteer from 'puppeteer';
import { startStorybookStatic } from './helpers/storybookStatic.mjs';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');
const screenshotPrefix = `/tmp/manacost-archetypes-${process.pid}`;
const chromiumPath = [
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].find(candidate => candidate && existsSync(candidate));
if (!chromiumPath) throw new Error('Chromium/Chrome executable is required for archetype browser tests');

// The story renders the archetype catalog on fixture data; the query string of
// the canvas picks the format and the simulated deck render failure.
const storybook = await startStorybookStatic();
const fixture = query => `${storybook.storyUrl('browser-test-fixtures-constructed-archetypes--fixture')}&${query}`;

let browser;
try {
  browser = await puppeteer.launch({
    executablePath: chromiumPath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  const runtimeErrors = [];
  const cardTileRequests = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && new URL(page.url()).searchParams.get('id') === 'browser-test-fixtures-constructed-archetypes--archetype-detail') runtimeErrors.push(message.text());
  });
  await page.setRequestInterception(true);
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/public-resource/db/uploads/horizontal-art/constructed_card/') || path.startsWith('/api/public-resource/db/uploads/card-tiles/constructed_card/')
      || path.startsWith('/api/public-resource/hsjson/v1/orig/')) {
      cardTileRequests.push(`${path}${new URL(request.url()).search}`);
      const missing = /\/JAIL_732\.(?:webp|png)$/.test(path);
      void request.respond({
        status: missing ? 404 : 200,
        contentType: 'image/gif',
        body: missing ? '' : Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64'),
      });
      return;
    }
    if (path.startsWith('/api/card-image/')) {
      cardTileRequests.push(path);
      void request.respond({
        status: 200,
        contentType: 'image/gif',
        body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64'),
      });
      return;
    }
    void request.continue();
  });

  await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 });
  await page.goto(fixture('format=wild'), { waitUntil: 'networkidle0' });
  await page.waitForSelector('.archetype-row');
  assert.equal(await page.$$eval('.archetype-row', rows => rows.length), 3);
  assert.equal(await page.$$eval('.archetypes-format-switch button', buttons => buttons.length), 2);
  assert.equal(await page.$$eval('.archetypes-class-filter button', buttons => buttons.length), 12);
  assert.equal(await page.$eval('#storybook-root h1', heading => heading.textContent), 'Архетипы');
  assert.ok(await page.$('[data-tour-id="archetypes-format"]'));
  assert.ok(await page.$('[data-tour-id="archetypes-class-filter"]'));
  assert.ok(await page.$('[data-tour-id="archetypes-search"]'));
  assert.ok(await page.$('[data-tour-id="archetypes-sort"]'));
  assert.ok(await page.$('[data-tour-id="archetypes-results"]'));
  await page.click('.archetypes-class-filter button[aria-label^="Маг:"]');
  await page.waitForFunction(() => document.querySelectorAll('.archetype-row').length === 1);
  assert.equal(await page.$eval('.archetype-row h2', heading => heading.textContent), 'Квест Маг');
  assert.match(page.url(), /[?&]class=mage(?:&|$)/);
  await page.click('.archetypes-class-filter button[aria-label^="Все классы:"]');
  await page.waitForFunction(() => document.querySelectorAll('.archetype-row').length === 3);
  await page.screenshot({ path: `${screenshotPrefix}-desktop.png`, fullPage: true });

  for (const width of [1024, 768, 375, 320]) {
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
    const responsiveCatalog = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      minFormatButtonHeight: Math.min(...[...document.querySelectorAll('.archetypes-format-switch button')].map(element => element.getBoundingClientRect().height)),
      minClassButtonHeight: Math.min(...[...document.querySelectorAll('.archetypes-class-filter button')].map(element => element.getBoundingClientRect().height)),
      minOpenHeight: Math.min(...[...document.querySelectorAll('.archetype-row__open')].map(element => element.getBoundingClientRect().height)),
    }));
    assert.ok(responsiveCatalog.overflow <= 1, `catalog overflowed by ${responsiveCatalog.overflow}px at ${width}px`);
    assert.ok(responsiveCatalog.minFormatButtonHeight >= 44, `format target too small at ${width}px`);
    assert.ok(responsiveCatalog.minClassButtonHeight >= 44, `class target too small at ${width}px`);
    assert.ok(
      responsiveCatalog.minOpenHeight >= 42,
      `open target was ${responsiveCatalog.minOpenHeight}px at ${width}px`,
    );
  }

  await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 });
  // Responsive rows use content-visibility; wait for their bounds after resizing.
  await page.locator('.archetype-row__open').click();
  await page.waitForSelector('.archetype-detail-page .archetype-history .analytics-chart');
  await page.waitForSelector('.archetype-deck-card .deck-tile');
  await page.waitForSelector('.constructed-matchup-ledger li');
  await page.waitForSelector('.constructed-card-stats tbody tr');
  assert.equal(await page.$('.archetype-detail-page .section-banner-modern'), null);
  assert.equal(await page.$eval('.archetype-dossier h1', title => title.textContent), 'Воровской Жрец');
  assert.equal(await page.$eval('.archetype-dossier h1', title => getComputedStyle(title).color), 'rgb(255, 240, 200)');
  const metricRows = await page.$$eval('.archetype-dossier__metrics > li', cells => cells.map(cell => Math.round(cell.getBoundingClientRect().top)));
  assert.equal(new Set(metricRows).size, 1, 'six desktop statistics share one aligned row');
  assert.equal(await page.$eval('.archetype-dossier__backdrop', image => new URL(image.currentSrc || image.src).pathname),
    '/archetype-art/classes/priest-1920.webp', 'the class art spans the header at desktop width');
  assert.match(await page.$eval('.archetype-dossier__metrics', bar => getComputedStyle(bar).backdropFilter), /blur/);
  // Insights on subscriber data: KPI change and sparkline, the winrate history with its Wilson band,
  // the rank heatmap, the build comparison and the radar.
  await page.waitForSelector('.archetype-dossier__metrics .ui-kpi-group__delta');
  assert.equal(await page.$$eval('.archetype-dossier__metrics .ui-kpi-group__delta', nodes => nodes.length), 3);
  assert.ok(await page.$('.archetype-dossier__metrics .ui-kpi-group__spark'));
  await page.waitForSelector('.archetype-history .analytics-chart__band');
  await page.waitForSelector('.archetype-rank-grid td[data-tone]');
  assert.match(await page.$eval('.archetype-rank-grid', node => node.textContent), /Топ-1000/);
  await page.$eval('.archetype-radar-section', section => section.scrollIntoView());
  await page.waitForSelector('.archetype-radar .profile-radar');
  assert.equal(await page.$$eval('.archetype-radar .profile-table [role="row"]', rows => rows.length), 6, 'a header and five metrics');
  assert.match(await page.$eval('.archetype-radar__summary', node => node.textContent), /^Воровской Жрец /);
  assert.match(await page.$eval('.profile-h2h', node => node.textContent), /Матчапы HSGuru сейчас недоступны/,
    'without a signed-in account the matchup table is not requested');
  await page.$eval('.archetype-compare', section => section.scrollIntoView());
  await page.waitForSelector('.archetype-build-comparison .build-head-to-head');
  await page.waitForSelector('.archetype-build-comparison .build-curve');
  assert.equal(await page.$$eval('.build-picker > li', cards => cards.length), 14, 'every build is a picker card');
  assert.deepEqual(await page.$$eval('.build-pick[data-side]', cards => cards.map(card => card.dataset.side)), ['left', 'right']);
  await page.click('.build-pick:nth-child(3) .build-pick__sides [data-side="right"]');
  await page.waitForFunction(() => document.querySelector('.build-head-to-head')?.textContent?.includes('Б · #3'));
  assert.equal(await page.$eval('.archetype-dossier__art', image => image.getAttribute('src')), '/wallpaper/home-paladin-hero-720.avif', 'the clean full artwork is used instead of a padded card image');
  assert.equal(await page.evaluate(() =>
    document.querySelector('.archetype-builds').compareDocumentPosition(document.querySelector('.archetype-history')) & Node.DOCUMENT_POSITION_FOLLOWING
  ), 4, 'the independently loaded builds precede optional history');
  assert.equal(await page.$('.archetype-main-build'), null, 'there is no separate main build block');
  assert.equal(await page.$eval('.archetype-builds .archetype-deck-card__number', node => node.textContent), '#1',
    'the gallery starts with the largest-sample build');
  assert.equal(await page.$eval('.archetype-builds', section => section.textContent.includes('Сборки HSGuru')), false);
  // Lazy thumbnails: bring the table into view; a failed image removes itself.
  await page.$eval('.constructed-card-stats__table', table => table.scrollIntoView({ block: 'start' }));
  await page.waitForFunction(() => [...document.querySelectorAll('.constructed-card-stats__table .card-stat-tile__art')]
    .every(image => image.complete), { timeout: 10_000 });
  await page.waitForNetworkIdle({ idleTime: 250, timeout: 10_000 });
  assert.ok(cardTileRequests.some(path => /\/hsjson\/v1\/orig\/.+width=256.+trim=1/.test(path)),
    'mulligan tiles use the trimmed original at twice the tile art size');
  assert.ok(!cardTileRequests.some(path => path.includes('/card-tiles/constructed_card/')),
    'provider tiles bake a truncated name into pixels, so the table draws the name as text');
  const failedArtRows = await page.$$eval('.constructed-card-stats__table tbody tr', rows => rows
    .filter(row => !row.querySelector('.card-stat-tile__art')).map(row => row.querySelector('.card-stat-tile__name')?.textContent));
  assert.ok(failedArtRows.length > 0 && failedArtRows.every(Boolean), 'a card without art keeps its mana and full name');
  const desktopGeometry = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.constructed-card-stats__table tbody tr')];
    const scroll = document.querySelector('.constructed-card-stats__table .ui-data-table__scroll');
    const names = [...document.querySelectorAll('.constructed-card-stats__table .card-stat-tile__name')];
    return {
      sideways: (scroll?.scrollWidth ?? 0) - (scroll?.clientWidth ?? 0),
      heights: [...new Set(rows.map(row => Math.round(row.getBoundingClientRect().height)))],
      clipped: names.filter(name => name.scrollHeight > name.clientHeight + 1).length,
      columns: document.querySelectorAll('.constructed-card-stats__table thead th').length,
    };
  });
  assert.ok(desktopGeometry.sideways <= 1, `the mulligan table scrolls sideways by ${desktopGeometry.sideways}px`);
  assert.equal(desktopGeometry.heights.length, 1, `mulligan rows share one height: ${desktopGeometry.heights}`);
  assert.equal(desktopGeometry.clipped, 0, 'every card name is readable in full');
  assert.equal(desktopGeometry.columns, 4, 'impact and sample of each phase share one column');
  await (await page.$('.archetype-builds')).scrollIntoView();
  await page.waitForSelector('.archetype-builds .archetype-deck-card:first-child .deck-render-preview__image:not([hidden]) img');
  assert.equal(
    await page.$eval('.archetype-builds .archetype-deck-card:first-child .deck-render-preview__image img', image => image.getAttribute('loading')),
    'eager',
    'a rendered parchment must not deadlock as a lazy image inside its hidden staging container',
  );
  assert.equal(
    await page.$$eval('.archetype-builds .archetype-deck-card:first-child .deck-render-preview__switch button', buttons => buttons.length),
    0,
    'the rendered parchment is the only successful deck presentation',
  );
  assert.equal(
    await page.$$eval('.archetype-deck-card__actions', actions => actions.length),
    0,
    'deck cards must not repeat builder and HSGuru actions below the rendered image',
  );
  assert.ok(
    await page.$$eval('.archetype-deck-card__copy', buttons => (
      buttons.length > 0 && buttons.every(button => button.getBoundingClientRect().height >= 44)
    )),
    'every rendered deck card must keep an accessible copy-code action below its preview',
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async value => { window.__copiedDeckCode = value; },
      },
    });
  });
  await page.click('.archetype-deck-card__copy');
  await page.waitForFunction(() => document.querySelector('.archetype-deck-card__copy')?.textContent?.includes('Код скопирован'));
  assert.ok(
    await page.evaluate(() => typeof window.__copiedDeckCode === 'string' && window.__copiedDeckCode.length > 20),
    'the copy action must write the full deck code to the clipboard',
  );
  await page.click('.archetype-builds .archetype-deck-card:first-child .deck-render-preview__open');
  await page.waitForSelector('.deck-render-lightbox[role="dialog"]');
  assert.equal(
    await page.$eval('.deck-render-lightbox__image', image => image.getAttribute('src')),
    await page.$eval('.archetype-builds .archetype-deck-card:first-child .deck-render-preview__image img', image => image.getAttribute('src')),
    'lightbox must reuse the already-rendered deck image',
  );
  await page.screenshot({ path: `${screenshotPrefix}-deck-lightbox.png` });
  await page.click('.deck-render-lightbox__close');
  await page.waitForSelector('.deck-render-lightbox', { hidden: true });
  await page.click('.archetype-builds .archetype-deck-card:first-child .deck-render-preview__open');
  await page.waitForSelector('.deck-render-lightbox[role="dialog"]');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.deck-render-lightbox', { hidden: true });
  assert.equal(
    await page.$eval('.archetype-builds .archetype-deck-card:first-child .deck-render-preview__open', button => document.activeElement === button),
    true,
    'closing the lightbox must restore focus to the deck preview',
  );

  await page.goto(fixture('format=wild&stale-deck-asset=1'), { waitUntil: 'networkidle0' });
  await page.click('.archetype-row__open');
  await page.waitForSelector('.archetype-builds .archetype-deck-card:first-child .deck-render-preview[data-render-state="ready"]', { timeout: 15_000 });
  const recoveryRequests = await page.evaluate(() => window.__deckRenderBodies || []);
  const mainDeckRequests = recoveryRequests.filter(request => request.deckCode?.includes('FixtureDeckCode01'));
  assert.equal(mainDeckRequests.length, 2, 'a stale cached asset should trigger one fresh server render');
  assert.equal(mainDeckRequests[0]?.refresh, undefined);
  assert.equal(mainDeckRequests[1]?.refresh, true, 'the recovery render must bypass the persisted preview cache');
  await page.$$eval('.deck-render-preview__list', lists => {
    lists.forEach(list => { list.hidden = false; });
  });
  await page.waitForFunction(() => !document.querySelector('.archetype-builds .archetype-deck-card:first-child .deck-render-preview__list')?.hidden);
  assert.equal(await page.$eval('#storybook-root h1', heading => heading.textContent), 'Воровской Жрец');
  assert.equal(await page.$$eval('.archetype-history .analytics-chart', charts => charts.length), 3);
  assert.equal(await page.$$eval('.archetype-history .analytics-chart__band', bands => bands.length) > 0, true, 'the winrate carries its Wilson band');
  assert.equal(await page.$$eval('.archetype-deck-card', cards => cards.length), 6);
  assert.equal(await page.$$eval('.archetype-deck-card .deck-tile', cards => cards.length), 30);
  assert.equal(await page.$$eval('.archetype-deck-card .deck-list-view__expand', buttons => buttons.length), 6);
  const hsReplayDeckTile = await page.$eval('.archetype-deck-card .deck-tile__art', element => {
    const rect = element.getBoundingClientRect();
    const tile = element.closest('.deck-tile');
    const frame = element.closest('.hsrdv-card-frame');
    const gem = tile.querySelector('.hsrdv-card-gem');
    const fade = frame.querySelector('.hsrdv-card-fade');
    const root = tile.closest('.hsrdv');
    return {
      tagName: element.tagName,
      height: rect.height,
      width: rect.width,
      artCoverage: rect.width / frame.getBoundingClientRect().width,
      maxWidth: getComputedStyle(element).maxWidth,
      objectFit: getComputedStyle(element).objectFit,
      artRight: getComputedStyle(element).right,
      maskImage: getComputedStyle(element).maskImage,
      tileHeight: tile.getBoundingClientRect().height,
      rootWidth: root.getBoundingClientRect().width,
      gemWidth: gem.getBoundingClientRect().width,
      gemBackground: getComputedStyle(gem).backgroundColor,
      fadeBackground: getComputedStyle(fade).backgroundImage,
    };
  });
  assert.equal(hsReplayDeckTile.tagName, 'IMG');
  assert.equal(hsReplayDeckTile.tileHeight, 25);
  assert.ok(hsReplayDeckTile.rootWidth <= 486);
  assert.equal(hsReplayDeckTile.gemWidth, 25);
  assert.equal(hsReplayDeckTile.gemBackground, 'rgb(134, 96, 39)');
  assert.equal(hsReplayDeckTile.maxWidth, 'none');
  assert.equal(hsReplayDeckTile.objectFit, 'cover');
  assert.equal(hsReplayDeckTile.artRight, '16px');
  assert.ok(hsReplayDeckTile.artCoverage >= 0.889, `compact archetype art covered only ${hsReplayDeckTile.artCoverage * 100}% of its frame`);
  assert.equal(hsReplayDeckTile.maskImage, 'none');
  assert.match(hsReplayDeckTile.fadeBackground, /linear-gradient\(65deg/);
  const hsReplayCountBox = await page.$eval(
    '.archetype-deck-card .hsrdv-rarity-common + .hsrdv-card-frame .deck-tile__count',
    element => {
      const tile = element.closest('.deck-tile');
      const countBox = element.closest('.hsrdv-card-countbox');
      const countStyle = getComputedStyle(element);
      return {
        count: element.textContent,
        countColor: countStyle.color,
        countBackground: getComputedStyle(countBox).backgroundColor,
        countBorderLeft: getComputedStyle(countBox).borderLeft,
        tileTextShadow: getComputedStyle(tile).textShadow,
      };
    },
  );
  assert.equal(hsReplayCountBox.count, '2');
  assert.equal(hsReplayCountBox.countColor, 'rgb(247, 219, 72)');
  assert.equal(hsReplayCountBox.countBackground, 'rgb(49, 49, 49)');
  assert.equal(hsReplayCountBox.countBorderLeft, '1px solid rgb(0, 0, 0)');
  assert.match(hsReplayCountBox.tileTextShadow, /rgb\(0, 0, 0\)/);
  const exactDeckList = await page.$eval('.archetype-deck-card .deck-list-view', element => {
    const list = element.querySelector('.deck-list-view__list');
    const tile = element.querySelector('.deck-tile');
    const secondRow = list.children[1];
    const card = element.closest('.archetype-deck-card');
    return {
      listDisplay: getComputedStyle(list).display,
      secondRowMarginTop: getComputedStyle(secondRow).marginTop,
      tileHeight: tile.getBoundingClientRect().height,
      summaryHeight: card.querySelector('.archetype-deck-card__summary').getBoundingClientRect().height,
      deckHeaderHeight: element.querySelector('.deck-list-view__head').getBoundingClientRect().height,
      hsReplayRoot: Boolean(list.closest('.hsrdv')),
    };
  });
  assert.equal(exactDeckList.listDisplay, 'block');
  assert.equal(exactDeckList.secondRowMarginTop, '1px');
  assert.equal(exactDeckList.tileHeight, 25);
  assert.equal(exactDeckList.summaryHeight, 52);
  assert.equal(exactDeckList.deckHeaderHeight, 46);
  assert.equal(exactDeckList.hsReplayRoot, true);
  await page.click('.archetype-deck-card .deck-list-view__expand');
  await page.waitForFunction(() => document.querySelector('.archetype-deck-card')?.querySelectorAll('.deck-tile').length === 8);
  assert.equal(
    await page.$eval('.archetype-deck-card .deck-list-view__expand', button => button.getAttribute('aria-expanded')),
    'true',
  );
  await page.click('.archetype-deck-card .deck-list-view__expand');
  await page.waitForFunction(() => document.querySelector('.archetype-deck-card')?.querySelectorAll('.deck-tile').length === 5);
  assert.equal(await page.$$eval('.constructed-matchup-ledger li', rows => rows.length), 11);
  assert.equal(await page.$$eval('.constructed-card-stats tbody tr', rows => rows.length), 15);
  for (const tourTarget of [
    'archetype-summary',
    'archetype-builds',
    'archetype-analysis',
    'archetype-history',
  ]) {
    assert.ok(await page.$(`[data-tour-id="${tourTarget}"]`), `missing ${tourTarget} tour anchor`);
  }
  assert.equal(
    await page.$eval('.archetype-dossier__art', image => new URL(image.src).pathname),
    '/wallpaper/home-paladin-hero-720.avif',
  );
  assert.equal(await page.$$eval('.archetype-dossier .archetypes-eyebrow', nodes => nodes.length), 0);
  assert.equal(await page.$$eval('.archetype-dossier__identity p, .archetype-dossier__identity small', nodes => nodes.length), 0);
  assert.equal(
    await page.$eval('.constructed-card-stats tbody tr:first-child .card-stat-tile__name', node => node.textContent),
    'Душа Бездны',
  );
  assert.equal(
    await page.$eval('.constructed-card-stats tbody tr:first-child .card-stat-tile__mana', node => node.textContent),
    '1',
  );
  assert.equal(await page.$eval('.constructed-card-stats__table th[aria-sort]', th => th.textContent), 'Муллиган');
  await page.select('.constructed-card-stats__sort select', 'drawnCount');
  assert.equal(await page.$eval('.constructed-card-stats tbody tr:first-child .card-stat-tile__name', node => node.textContent), 'Душа Бездны');
  await page.click('.constructed-card-stats__direction');
  assert.equal(await page.$eval('.constructed-card-stats__sort select', select => select.value), 'drawnCount');
  assert.notEqual(await page.$eval('.constructed-card-stats tbody tr:first-child .card-stat-tile__name', node => node.textContent), 'Душа Бездны');
  await page.click('.constructed-card-stats__table th:nth-child(2) .ui-data-table__sort');
  assert.equal(await page.$eval('.constructed-card-stats__sort select', select => select.value), 'mulliganImpact');
  assert.equal(await page.$eval('.constructed-card-stats__table th[aria-sort]', th => th.getAttribute('aria-sort')), 'descending');
  assert.ok(await page.$('.archetype-builds .archetype-deck-card:first-child .deck-list-view'));
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async value => { window.__qaCopiedDeckCode = value; } },
    });
  });
  await page.click('.archetype-builds .archetype-deck-card:first-child .archetype-deck-card__copy');
  await page.waitForFunction(() => document.querySelector('.archetype-builds .archetype-deck-card:first-child .archetype-deck-card__copy')
    ?.getAttribute('aria-label')?.startsWith('Код скопирован'));
  assert.match(await page.evaluate(() => window.__qaCopiedDeckCode || ''), /^AA/);
  await page.click('.constructed-card-stats__more');
  await page.waitForFunction(() => document.querySelectorAll('.constructed-card-stats tbody tr').length === 18);
  await page.$eval('.archetype-builds__more', button => button.click());
  await page.waitForFunction(() => document.querySelectorAll('.archetype-deck-card').length === 12);
  const revealedDeckLoadingStates = await page.$$eval(
    '.archetype-builds .archetype-deck-card:nth-child(n + 7) .deck-render-preview',
    previews => previews.map(preview => {
      const placeholder = preview.querySelector('.deck-render-preview__loading');
      const placeholderRect = placeholder?.getBoundingClientRect();
      return {
        state: preview.getAttribute('data-render-state'),
        listHidden: preview.querySelector('.deck-render-preview__list')?.hidden,
        placeholderVisible: Boolean(placeholder && !placeholder.hidden),
        placeholderRatio: placeholderRect?.height
          ? placeholderRect.width / placeholderRect.height
          : 0,
      };
    }),
  );
  assert.ok(revealedDeckLoadingStates.length >= 6, 'the expanded gallery must expose deferred Deckview previews');
  assert.ok(
    revealedDeckLoadingStates.every(state => (
      (state.state === 'loading' || state.state === 'idle')
      && state.listHidden === true
      && state.placeholderVisible
      && Math.abs(state.placeholderRatio - 1) <= 0.01
    )),
    `newly revealed decks must reserve a stable image area without flashing their fallback lists: ${JSON.stringify(revealedDeckLoadingStates)}`,
  );
  await page.screenshot({ path: `${screenshotPrefix}-detail-desktop.png`, fullPage: true });

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await page.goto(fixture('format=wild'), { waitUntil: 'networkidle0' });
  await page.waitForSelector('.archetype-row');
  const catalogMobile = await page.evaluate(async () => {
    // Rows away from the viewport skip layout (content-visibility), so each
    // row's control is measured once that row is on screen.
    const openHeights = [];
    for (const row of document.querySelectorAll('.archetype-row')) {
      row.scrollIntoView({ block: 'center' });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      openHeights.push(row.querySelector('.archetype-row__open').getBoundingClientRect().height);
    }
    scrollTo(0, 0);
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      minFormatButtonHeight: Math.min(...[...document.querySelectorAll('.archetypes-format-switch button')].map(element => element.getBoundingClientRect().height)),
      minClassButtonHeight: Math.min(...[...document.querySelectorAll('.archetypes-class-filter button')].map(element => element.getBoundingClientRect().height)),
      minOpenHeight: Math.min(...openHeights),
    };
  });
  assert.ok(catalogMobile.overflow <= 1, `catalog overflowed by ${catalogMobile.overflow}px`);
  assert.ok(catalogMobile.minFormatButtonHeight >= 44);
  assert.ok(catalogMobile.minClassButtonHeight >= 44);
  assert.ok(catalogMobile.minOpenHeight >= 42);
  await page.screenshot({ path: `${screenshotPrefix}-mobile.png`, fullPage: true });

  // A visitor taps a row on screen; a skipped offscreen row has no layout to aim at.
  // Wait until its control is rendered and stays put for a frame, so the tap
  // is not aimed while neighbouring rows are still being laid out.
  await page.$eval('.archetype-row', row => row.scrollIntoView({ block: 'center' }));
  await page.waitForFunction(() => {
    const open = document.querySelector('.archetype-row__open');
    const rect = open.getBoundingClientRect();
    const key = `${Math.round(rect.top)}:${Math.round(rect.height)}`;
    const settled = window.__archetypeOpenRect === key && rect.height > 0
      && open.checkVisibility({ contentVisibilityAuto: true });
    window.__archetypeOpenRect = key;
    return settled;
  }, { polling: 'raf' });
  await page.click('.archetype-row__open');
  await page.waitForSelector('.archetype-detail-page .archetype-history .analytics-chart');
  await page.waitForSelector('.archetype-deck-card .deck-tile');
  await page.waitForSelector('.constructed-matchup-ledger li');
  await page.$eval('.archetype-builds', section => section.scrollIntoView({ block: 'start' }));
  await page.waitForSelector('.archetype-builds .archetype-deck-card:first-child .deck-render-preview__image:not([hidden]) img');
  assert.equal(await page.$$eval('.deck-render-preview__switch', switches => switches.length), 0);
  await page.click('.archetype-builds .archetype-deck-card:first-child .deck-render-preview__open');
  await page.waitForSelector('.deck-render-lightbox[role="dialog"]');
  const mobileLightbox = await page.$eval('.deck-render-lightbox__panel', panel => {
    const rect = panel.getBoundingClientRect();
    return {
      left: rect.left,
      right: window.innerWidth - rect.right,
      top: rect.top,
      bottom: window.innerHeight - rect.bottom,
    };
  });
  assert.ok(Object.values(mobileLightbox).every(value => value >= 0), 'mobile deck lightbox must stay inside the viewport');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.deck-render-lightbox', { hidden: true });
  await page.$$eval('.deck-render-preview__list', lists => {
    lists.forEach(list => { list.hidden = false; });
  });
  await page.waitForFunction(() => !document.querySelector('.archetype-builds .archetype-deck-card:first-child .deck-render-preview__list')?.hidden);
  const detailMobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    chartCount: document.querySelectorAll('.archetype-history .analytics-chart').length,
    copyHeight: document.querySelector('.archetype-builds .archetype-deck-card:first-child .archetype-deck-card__copy')?.getBoundingClientRect().height ?? 0,
    deckTileHeight: document.querySelector('.archetype-deck-card .deck-tile')?.getBoundingClientRect().height ?? 0,
    deckGemWidth: document.querySelector('.archetype-deck-card .hsrdv-card-gem')?.getBoundingClientRect().width ?? 0,
    deckColumnCount: document.querySelectorAll('.archetype-deck-card').length,
    matchupCount: document.querySelectorAll('.constructed-matchup-ledger li').length,
  }));
  assert.ok(detailMobile.overflow <= 1, `detail overflowed by ${detailMobile.overflow}px`);
  assert.equal(detailMobile.chartCount, 3);
  assert.ok(detailMobile.copyHeight >= 42);
  assert.equal(detailMobile.deckTileHeight, 25);
  assert.equal(detailMobile.deckGemWidth, 25);
  assert.equal(detailMobile.deckColumnCount, 6);
  assert.equal(detailMobile.matchupCount, 11);
  const mobileCardStats = await page.evaluate(() => ({
    cardCount: document.querySelectorAll('.constructed-card-stats__list > li').length,
    desktopTableDisplay: getComputedStyle(document.querySelector('.constructed-card-stats__table')).display,
    minRowHeight: Math.min(...[...document.querySelectorAll('.constructed-card-stats__list .constructed-card-stats__row')].map(element => element.getBoundingClientRect().height)),
    minSortHeight: Math.min(...[...document.querySelectorAll('.constructed-card-stats__toolbar :is(select, .constructed-card-stats__direction, .constructed-card-stats__csv)')].map(element => element.getBoundingClientRect().height)),
  }));
  assert.equal(mobileCardStats.cardCount, 15);
  assert.equal(mobileCardStats.desktopTableDisplay, 'none');
  assert.ok(mobileCardStats.minRowHeight >= 44);
  assert.ok(mobileCardStats.minSortHeight >= 44);
  await page.click('.constructed-card-stats__list > li:first-child .constructed-card-stats__lead');
  assert.equal(await page.$$eval('.constructed-card-stats__list > li:first-child dl > div', phases => phases.length), 3);
  await page.click('.constructed-card-stats__list > li:first-child .card-stat-open');
  await page.waitForSelector('.card-preview-sheet__panel');
  assert.equal(await page.$eval('.card-preview-sheet__header h2', node => node.textContent), 'Душа Бездны');
  await page.click('.card-preview-sheet__close');
  await page.waitForSelector('.card-preview-sheet__panel', { hidden: true });
  await page.screenshot({ path: `${screenshotPrefix}-detail-mobile.png`, fullPage: true });

  for (const width of [1024, 768, 375, 320, 1440]) {
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    const responsiveDetail = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      mobileCardsDisplay: getComputedStyle(document.querySelector('.constructed-card-stats__list')).display,
      tableDisplay: getComputedStyle(document.querySelector('.constructed-card-stats__table')).display,
    }));
    assert.ok(responsiveDetail.overflow <= 1, `detail overflowed by ${responsiveDetail.overflow}px at ${width}px`);
    if (width <= 820) {
      assert.notEqual(responsiveDetail.mobileCardsDisplay, 'none', `mobile cards hidden at ${width}px`);
      assert.equal(responsiveDetail.tableDisplay, 'none', `desktop table visible at ${width}px`);
    } else {
      assert.equal(responsiveDetail.mobileCardsDisplay, 'none', `mobile cards visible at ${width}px`);
      assert.notEqual(responsiveDetail.tableDisplay, 'none', `desktop table hidden at ${width}px`);
    }
  }

  await page.click('.archetype-breadcrumb a');
  await page.waitForSelector('.archetype-row');
  await page.$$eval('.archetype-row', rows => {
    rows
      .find(row => row.textContent?.includes('Охотник на демонов Бездны'))
      ?.querySelector('.archetype-row__open')
      ?.click();
  });
  await page.waitForSelector('.archetype-dossier__art');
  assert.equal(
    await page.$eval('.archetype-dossier__art', image => new URL(image.src).pathname),
    '/archetype-art/void-soul-dh.webp',
  );
  await page.screenshot({ path: `${screenshotPrefix}-detail-void-soul.png`, fullPage: true });

  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    const result = await globalThis.axe.run(document.querySelector('.archetype-detail-page'));
    return result.violations.filter(violation => ['serious', 'critical'].includes(violation.impact));
  });
  assert.deepEqual(violations, []);

  // An archetype without a build keeps its statistics and explains why there is no gallery.
  await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 });
  await page.goto(fixture('format=wild&buildless=1'), { waitUntil: 'networkidle0' });
  await page.waitForSelector('.archetype-row__pending');
  assert.equal(await page.$$eval('.archetype-row', rows => rows.length), 4);
  assert.equal(await page.$eval('.archetypes-ledger__header span', label => label.textContent), '4 архетипов');
  // The heading names the catalog's HSGuru period by its menu label, not by its identifier.
  assert.match(await page.$eval('.archetypes-tools small', note => note.textContent), /^Баны · минимум 50 игр · /);
  assert.equal(
    await page.$eval('.archetype-row__pending', note => note.closest('.archetype-row').querySelector('h2').textContent),
    'Йогг-Воин',
  );
  assert.equal(await page.$$eval('.archetype-row__pending', notes => notes.length), 1);
  await page.$eval('.archetype-row__pending', note => note.closest('.archetype-row').querySelector('.archetype-row__open').click());
  await page.waitForSelector('#archetype-builds-pending-title');
  assert.equal(await page.$eval('.archetype-dossier h1', title => title.textContent), 'Йогг-Воин');
  assert.equal(await page.$eval('#archetype-builds-pending-title', title => title.textContent), 'Колоды появятся, когда наберётся выборка');
  assert.equal(await page.$('.archetype-main-build'), null, 'no empty main build gallery');
  assert.equal(await page.$('.archetype-builds'), null, 'no empty secondary build gallery');

  await page.goto(storybook.storyUrl('browser-test-fixtures-constructed-archetypes--archetype-detail'), { waitUntil: 'networkidle0' });
  await page.waitForSelector('.archetype-dossier__metrics');
  assert.deepEqual(runtimeErrors, []);
  console.log('Constructed archetype catalog/detail browser tests passed');
} finally {
  await browser?.close();
  await storybook.close();
}
