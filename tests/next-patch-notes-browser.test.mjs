import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

const axe = readFileSync(fileURLToPath(import.meta.resolve('axe-core')), 'utf8');
const teaser = period => ({
  format: 'standard', rank: 'diamond_legend', period, updatedAt: '2026-10-21T00:00:00.000Z',
  items: (period === 'past_week' ? ['zoolock', 'c-thun-dh', 'quest-priest'] : ['c-thun-dh', 'zoolock', 'mill-rogue'])
    .map((slug, index) => ({ id: slug, slug, archetype: slug, archetypeLabel: `Колода ${slug}`, translated: true,
      classKey: ['warlock', 'demonhunter', 'priest', 'rogue'][index], winrate: 60 - index, popularity: 1, games: 500 + index })),
});

async function pageState(page) {
  await page.evaluate(axe);
  return page.evaluate(async () => ({
    h1: [...document.querySelectorAll('h1')].map(node => node.textContent?.trim()),
    overflow: document.documentElement.scrollWidth > innerWidth,
    violations: (await axe.run(document.querySelector('main'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
      .violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })),
  }));
}

// The card history of the data API, as the fixture serves it: Hammer of Twilight changed on 2026-10-02, a day after 36.6.3.
const ARCHIVE_PATH = '/uploads/card-history-media/';
const version = (observed, sha) => ({ observed_at: observed, media: { card_image: { status: 'archived', archive_url: `${ARCHIVE_PATH}${sha}.png`, sha256: sha } } });
const hammerHistory = { data: { card_id: 'BG36_MagicItem_403', versions: [
  version('2026-10-02 10:00:00.000000', 'b'.repeat(64)), version('2026-09-20 10:00:00.000000', 'a'.repeat(64)),
] } };
// Battlegrounds cards referenced by 37.0.2 general changes and 37.2.0 pool rotations, so their lines/pictures carry card buttons.
const battlegroundMinions = { data: [
  { card_id: 'BG33_Reflector', name: { ru: 'Неутомимый отражатель', en: 'Tireless Reflector' }, card_type: { slug: 'minion' }, tavern_tier: 4, images: {} },
  { card_id: 'BG28_707', name: { ru: 'Живой азерит', en: 'Living Azerite' }, card_type: { slug: 'minion' }, tavern_tier: 3, images: {} },
  { card_id: 'BG26_001', name: { ru: 'Воздушный баллист', en: 'Air Baller' }, card_type: { slug: 'minion' }, tavern_tier: 4, images: {} },
], pagination: { page: 1, has_next: false } };
const externalRoutes = {
  '/api/v1/card-history/card/BG36_MagicItem_403': () => hammerHistory,
  '/api/v1/cards': () => battlegroundMinions,
};

const MENTIONS = ['Неутомимый отражатель', 'живых азеритов'];

/** Scrolls a card name into view first: the tooltip closes on any scroll, so it must open on a still page. */
async function mention(page, text) {
  const handle = await page.evaluateHandle(label => [...document.querySelectorAll('.hp-card-mention')]
    .find(node => node.textContent === label), text);
  assert.ok(handle.asElement(), `the general changes name «${text}» as a card button`);
  await handle.evaluate(node => node.scrollIntoView({ block: 'center' }));
  await new Promise(resolve => setTimeout(resolve, 150));
  return handle;
}

/** The open tooltip: inside the viewport, naming the card, and gone once the pointer or the focus leaves. */
async function tooltipFor(page, name) {
  await page.waitForSelector('.card-preview-tooltip[role="tooltip"]', { visible: true, timeout: 5000 });
  return page.$eval('.card-preview-tooltip', (node, wanted) => {
    const rect = node.getBoundingClientRect();
    return { named: node.textContent?.includes(wanted) ?? false,
      inside: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight };
  }, name);
}

test('patch notes show the two newest patches as cards before → after, and the home board ranks the public meta teaser', { timeout: 420000 }, async () => {
  const pilot = await startPublicCardPilot({ pagesEnabled: true, externalRoutes });
  let browser;
  try {
    const recent = await (await fetch(`${pilot.origin}/api/patch-notes/recent`)).json();
    // Reviewed official notes (37.2.0, 37.0.2) come before the upstream fixture's 36.6.3 article; older patches are not on the page.
    assert.deepEqual(recent.patches.map(patch => patch.version), ['37.2.0', '37.0.2']);
    assert.equal(recent.patches[0].poolChanges?.length, 5, '37.2.0 carries all five Battlegrounds pool-rotation groups');
    assert.equal(recent.patches[0].sections?.length, 9, '37.2.0 carries structured overview, event, rewards, cosmetics and bug-fix sections');
    const v3663 = await (await fetch(`${pilot.origin}/api/patch-notes/36.6.3`)).json();
    const hammer = v3663.entries.find(entry => entry.cardId === 'BG36_MagicItem_403');
    assert.equal(hammer.beforeRenderUrl, `${pilot.externalOrigin}${ARCHIVE_PATH}${'a'.repeat(64)}.png`,
      'the last picture before the patch is "before"');
    assert.equal(hammer.afterRenderUrl, `${pilot.externalOrigin}${ARCHIVE_PATH}${'b'.repeat(64)}.png`,
      'the first different picture inside the patch is "after"');
    assert.equal(recent.patches[0].entries.some(entry => entry.beforeRenderUrl !== null), false, 'a patch the history does not reach has no pairs');
    // The first request to a fresh server loads the route's modules, which can
    // outlast the 600 ms first-paint read budget on a busy runner.
    await (await fetch(`${pilot.origin}/standard/patches/`)).text();
    const latestHtml = await (await fetch(`${pilot.origin}/standard/patches/`)).text();
    assert.deepEqual([...latestHtml.matchAll(/<h2[^>]*>(Патч [\d.]+)<\/h2>/g)].map(match => match[1]), ['Патч 37.2.0', 'Патч 37.0.2'],
      'the default page is the two newest patches, newest first');
    // The site's own header and menu keep their search and mode switch; the patch column has none of them.
    const column = latestHtml.slice(latestHtml.indexOf('class="hp-patch"'));
    for (const gone of ['<select', '<details', 'type="search"', 'hp-patch-toc', 'Главное в патче']) {
      assert.ok(!column.includes(gone), `${gone} is not in the patch column`);
    }
    const fixturePath = '/standard/patches/?version=36.6.3';
    await (await fetch(`${pilot.origin}${fixturePath}`)).text();
    const document = await fetch(`${pilot.origin}${fixturePath}`);
    assert.equal(document.status, 200);
    const html = await document.text();
    assert.deepEqual([...html.matchAll(/<h2[^>]*>(Патч [\d.]+)<\/h2>/g)].map(match => match[1]), ['Патч 36.6.3'], 'one version is one patch');
    assert.doesNotMatch(html, /Балансные изменения Стандарта и Полей сражений/, 'the header is the version, the date and the sources: no article title');
    assert.match(html, /Змей ветреных вершин/);
    assert.match(html, /<link rel="canonical" href="https:\/\/hearthpulse\.net\/standard\/patches\/"/);
    assert.match(html, /class="hp-release__title"/, 'the marker of the post-deploy check is in the server HTML');

    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const [width, height] of [[1440, 900], [412, 915]]) {
      await page.setViewport({ width, height, isMobile: width < 600, hasTouch: width < 600 });
      await page.goto(`${pilot.origin}/standard/patches/`, { waitUntil: 'networkidle2' });
      await page.waitForSelector('.hp-pc');
      const state = await pageState(page);
      assert.deepEqual(state.h1, ['Патчноуты Hearthstone']);
      assert.equal(state.overflow, false, `no horizontal overflow at ${width}px`);
      assert.deepEqual(state.violations, [], `axe at ${width}px`);
      assert.deepEqual(await page.$$eval('.hp-release__title', nodes => nodes.map(node => node.textContent)), ['Патч 37.2.0', 'Патч 37.0.2']);
      assert.equal(await page.$$eval('.hp-patch input, .hp-patch select, .hp-patch details, .hp-patch nav', nodes => nodes.length), 0,
        'no search, filters, contents, switcher or card menus');
    }
    // 37.2.0 pool explorer & collapsible sections: switch tabs/statuses, expand rewards table, check overflow and axe.
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${pilot.origin}/standard/patches/`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.hp-pool');
    assert.equal(await page.$$eval('.hp-pool [role="tab"]', nodes => nodes.length), 5, 'five Battlegrounds pool tabs');
    // The fixture catalog lists few cards: unresolved ones are drawn cards, so the counts are of gallery tiles.
    assert.equal(await page.$$eval('.hp-pool .hp-gal[data-status="removed"] .hp-gal__item', nodes => nodes.length), 108,
      'all 108 removed minions render under Удалены');
    await page.click('.hp-pool__status[data-status="added"]');
    await page.waitForSelector('.hp-pool .hp-gal[data-status="added"]');
    assert.equal(await page.$$eval('.hp-pool .hp-gal__item', nodes => nodes.length), 66, 'all 66 new minions render under Новые');
    await page.click('.hp-pool__status[data-status="returning"]');
    await page.waitForSelector('.hp-pool .hp-gal[data-status="returning"]');
    assert.equal(await page.$$eval('.hp-pool .hp-gal__item', nodes => nodes.length), 23, 'all 23 returning minions render under Возвращаются');
    assert.ok(await page.$$eval('.hp-csec .hp-figs__img', nodes => nodes.length) >= 10, 'sections show their illustrations');
    assert.ok(await page.$$eval('.hp-csec .hp-gal__item', nodes => nodes.length) >= 49, 'heroes, functionality cards and 30 skins are pictures');
    await page.click('.hp-csec__toggle');
    await page.waitForSelector('.hp-csec__table');
    const expandedState = await pageState(page);
    assert.equal(expandedState.overflow, false, 'no horizontal overflow with expanded rewards table');
    assert.deepEqual(expandedState.violations, [], 'no axe violations with pool explorer and expanded rewards table');
    // 1440 px: two cards in a row; a phone: one.
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${pilot.origin}${fixturePath}`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.hp-pc');
    const tops = await page.$$eval('.hp-pc-grid > li', items => items.slice(0, 2).map(item => Math.round(item.getBoundingClientRect().top)));
    assert.equal(tops[0], tops[1], 'two cards share a row on a wide page');
    assert.deepEqual(await page.$$eval('.hp-pc', cards => cards.map(card => [
      card.querySelector('.hp-pc__name')?.textContent, [...card.querySelectorAll('.hp-plate__label')].map(label => label.textContent)])), [
      // The fixture blocks HearthstoneJSON, so Constructed cards stay unmatched lines; trinkets resolve through the catalog.
      ['Змей ветреных вершин', ['Текст']], ['Паучок', ['Здоровье']], ['Пагубные благовония', ['Золото']], ['Молот Сумерек', ['Золото']],
    ], 'cards and their plates read in the article\'s own order, mode by mode');
    assert.equal(await page.$$eval('.hp-pc[data-variant="pair"]', nodes => nodes.length), 0,
      'an archive picture from a host the image proxy does not know is not drawn as a pair');
    assert.equal(await page.$$eval('.hp-patch-toc', nodes => nodes.length), 0);
    // A card with no picture prints its text once, the changed words marked; no "Было / Стало" blocks anywhere.
    assert.equal(await page.$$eval('.hp-pc[data-variant="line"] .hp-plate__text ins', nodes => nodes.length > 0), true);
    assert.equal(await page.$$eval('.hp-patch', nodes => /Было:|Стало:|только картинками/.test(nodes[0].textContent ?? '')), false);
    assert.equal(await page.$$eval('.hp-mode__head', nodes => nodes.every(node => node.querySelector('img.hp-mode__art') && node.querySelector('h3'))), true,
      'every mode is a heading on a strip of its art');
    assert.equal((await fetch(`${pilot.origin}/api/patch-notes/9.9.9`)).status, 404);

    // A card named in the general changes opens: on hover and keyboard focus a tooltip (1440 px), on a tap a sheet (390 px).
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${pilot.origin}/standard/patches/`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.hp-card-mention');
    assert.deepEqual(await page.$$eval('.hp-card-mention', nodes => nodes.map(node => node.textContent)), MENTIONS);
    for (const [label, card] of [[MENTIONS[0], 'Неутомимый отражатель'], [MENTIONS[1], 'Живой азерит']]) {
      const button = await mention(page, label);
      await button.hover();
      assert.deepEqual(await tooltipFor(page, card), { named: true, inside: true }, `hover on «${label}» shows the card inside the page`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'an open tooltip adds no horizontal scroll');
      await page.mouse.move(5, 5);
      await page.waitForSelector('.card-preview-tooltip', { hidden: true });
    }
    // Keyboard: Tab reaches the button, its focus opens the tooltip, the next Tab closes it.
    await page.mouse.move(5, 5);
    await (await mention(page, MENTIONS[0])).evaluate(node => {
      const before = [...document.querySelectorAll('a[href], button')].filter(item => item.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING).at(-1);
      before?.focus();
    });
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), MENTIONS[0], 'Tab lands on the card name');
    assert.equal(await page.evaluate(() => document.activeElement?.matches(':focus-visible')), true, 'the keyboard focus is visible');
    assert.deepEqual(await tooltipFor(page, 'Неутомимый отражатель'), { named: true, inside: true }, 'keyboard focus shows the card');
    await page.keyboard.press('Tab');
    await page.waitForSelector('.card-preview-tooltip', { hidden: true });

    // The page and an open preview at 390/768/1440 px and at 90–150 % zoom of a 1440 px window: no sideways scroll, no axe violations.
    const sizes = [[390, 844, 1], [768, 1024, 1], [1440, 900, 1], ...[0.9, 1.1, 1.25, 1.5].map(zoom => [Math.round(1440 / zoom), Math.round(900 / zoom), zoom])];
    for (const [width, height, zoom] of sizes) {
      const touch = width < 600;
      const where = zoom === 1 ? `${width}px` : `${Math.round(zoom * 100)}% zoom`;
      await page.setViewport({ width, height, deviceScaleFactor: zoom, isMobile: touch, hasTouch: touch });
      await page.goto(`${pilot.origin}/standard/patches/`, { waitUntil: 'networkidle2' });
      await page.waitForSelector('.hp-card-mention');
      const state = await pageState(page);
      assert.equal(state.overflow, false, `no horizontal overflow at ${where}`);
      assert.deepEqual(state.violations, [], `axe at ${where}`);
      const button = await mention(page, MENTIONS[1]);
      if (touch) {
        await button.tap();
        await page.waitForSelector('.card-preview-sheet', { visible: true, timeout: 5000 });
        assert.equal(await page.$('.card-preview-tooltip'), null, 'a tap opens the sheet, not a hover tooltip');
        const sheet = await page.$eval('.card-preview-sheet__panel', node => {
          const rect = node.getBoundingClientRect();
          return { text: node.textContent ?? '', inside: rect.left >= 0 && rect.right <= innerWidth };
        });
        assert.match(sheet.text, /Живой азерит/);
        assert.equal(sheet.inside, true, `the sheet fits the ${where} screen`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `an open sheet adds no horizontal scroll at ${where}`);
        await page.evaluate(axe);
        assert.deepEqual(await page.evaluate(async () => (await axe.run(document.querySelector('.card-preview-sheet'), {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })).violations.map(item => item.id)), [], `axe of the open sheet at ${where}`);
        await page.click('.card-preview-sheet__close');
        await page.waitForSelector('.card-preview-sheet', { hidden: true });
      } else {
        await button.hover();
        assert.deepEqual(await tooltipFor(page, 'Живой азерит'), { named: true, inside: true }, `the tooltip fits the page at ${where}`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `an open tooltip adds no horizontal scroll at ${where}`);
        await page.mouse.move(5, 5);
      }
    }

    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname !== '/api/standard-meta/teaser') return void request.continue();
      void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(teaser(url.searchParams.get('period'))) });
    });
    for (const [width, height] of [[1440, 900], [412, 915]]) {
      await page.setViewport({ width, height, isMobile: width < 600, hasTouch: width < 600 });
      await page.goto(`${pilot.origin}/`, { waitUntil: 'networkidle2' });
      const reserved = await page.$eval('#home-decks', node => node.getBoundingClientRect().height);
      await page.$eval('#home-decks', node => node.scrollIntoView());
      await page.waitForFunction(() => document.querySelectorAll('.weekly-decks .ui-leaderboard__item').length === 3);
      const board = await page.$eval('#home-decks', node => ({
        height: node.getBoundingClientRect().height,
        titles: [...node.querySelectorAll('.ui-leaderboard__item-title')].map(item => item.textContent),
        medals: [...node.querySelectorAll('.ui-leaderboard__medal')].map(medal => medal.dataset.medal),
        links: [...node.querySelectorAll('.ui-leaderboard__row')].map(row => row.getAttribute('href')),
        subtitles: [...node.querySelectorAll('.ui-leaderboard__subtitle')].map(item => item.textContent),
      }));
      assert.ok(Math.abs(board.height - reserved) <= 2, `the reserved ${reserved}px hold the ${board.height}px board at ${width}px`);
      assert.deepEqual(board.titles, ['Колода zoolock', 'Колода c-thun-dh', 'Колода quest-priest']);
      assert.deepEqual(board.medals, ['gold', 'silver', 'bronze']);
      assert.equal(board.links[0], '/standard/archetypes/standard/zoolock/');
      assert.match(board.subtitles[0], /2-е место за 2 недели/);
      assert.match(board.subtitles[2], /не было в топ-3 за 2 недели/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    await page.click('.weekly-decks [role="radio"]:first-child');
    await page.waitForFunction(() => document.querySelector('.weekly-decks .ui-leaderboard__title')?.textContent === 'Лучшие колоды за сутки');
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    await pilot.close();
  }
});
