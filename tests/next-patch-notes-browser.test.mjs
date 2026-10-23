import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import puppeteer from 'puppeteer';
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

test('patch notes render the stored article as compact change cards, and the home board ranks the public meta teaser', { timeout: 240000 }, async () => {
  const pilot = await startPublicCardPilot({ pagesEnabled: true });
  let browser;
  try {
    // The first request to a fresh server loads the route's modules, which can
    // outlast the 600 ms first-paint read budget on a busy runner.
    await (await fetch(`${pilot.origin}/standard/patches/`)).text();
    const document = await fetch(`${pilot.origin}/standard/patches/`);
    assert.equal(document.status, 200);
    const html = await document.text();
    assert.match(html, /Балансные изменения Стандарта и Полей сражений<\/h2>/, 'the newest patch with changes is in the server HTML, its title without the version prefix');
    assert.match(html, /<option value="36\.6\.3" selected="">Патч 36\.6\.3<\/option>/, 'the version is the switcher');
    assert.match(html, /Змей ветреных вершин/);
    assert.match(html, /<link rel="canonical" href="https:\/\/hearthpulse\.net\/standard\/patches\/"/);
    assert.match(html, /<link rel="preload" as="image" fetchPriority="high" imageSrcSet="\/(?:patch-notes|archetype-art\/classes)\//,
      'the header plate is preloaded from the server HTML');
    assert.match(html, /class="hp-patch-hero__plate"[^>]*fetchPriority="high"/);

    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const [width, height] of [[1440, 900], [412, 915]]) {
      await page.setViewport({ width, height, isMobile: width < 600, hasTouch: width < 600 });
      await page.goto(`${pilot.origin}/standard/patches/`, { waitUntil: 'networkidle2' });
      await page.waitForSelector('.hp-patch-card');
      const state = await pageState(page);
      assert.deepEqual(state.h1, ['Патчноуты Hearthstone']);
      assert.equal(state.overflow, false, `no horizontal overflow at ${width}px`);
      assert.deepEqual(state.violations, [], `axe at ${width}px`);
    }
    assert.deepEqual(await page.$$eval('.hp-patch-section .hp-patch-card', cards => cards.map(card => [
      card.querySelector('.hp-patch-card__name')?.textContent, card.dataset.kind])), [
      // The fixture blocks HearthstoneJSON, so Constructed cards stay unmatched; trinkets resolve through the catalog.
      ['Змей ветреных вершин', 'rework'], ['Паучок', 'nerf'], ['Пагубные благовония', 'buff'], ['Молот Сумерек', 'nerf'],
    ]);
    const modes = await page.$$eval('.hp-patch-bar__modes a', links => links.map(link => link.getAttribute('href')));
    assert.deepEqual(modes, await page.$$eval('.hp-patch-section', sections => sections.map(section => `#${section.id}`)),
      'the one bar links every section');
    assert.equal(await page.$$eval('.hp-patch-section .hp-change[data-stat="gold"] .hp-stat', nodes => nodes.length) > 0, true,
      'Battlegrounds costs are gold, not mana');
    assert.equal(await page.$eval('.hp-patch-drawer .hp-patch-archive [aria-current="page"] b', node => node.textContent), '36.6.3',
      'the archive drawer marks the open patch');
    assert.equal(await page.$eval('.hp-patch-drawer', node => node.open), false, 'the archive waits behind "Все патчи"');
    const incense = '.hp-patch-section .hp-patch-card[data-kind="buff"]';
    assert.equal(await page.$eval(`${incense} .hp-patch-card__meta`, node => node.checkVisibility()), false,
      'secondary details are folded');
    await page.click(`${incense} .hp-patch-card__more summary`);
    assert.match(await page.$eval(`${incense} .hp-patch-card__meta`, node => node.textContent ?? ''),
      /Малый аксессуар · Baleful Incense/, 'the article\'s English name stays behind the card\'s "…"');
    assert.equal(await page.$$eval('.hp-patch-card del', nodes => nodes.some(node => node.textContent?.includes('(3)'))), true,
      'the old text is struck out');
    await page.click('.hp-patch-kinds button[data-kind="nerf"]');
    await page.waitForFunction(() => document.querySelectorAll('.hp-patch-card').length === 2);
    // At 412 px the switcher sits in the header; the newer arrow leads back to the newest patch.
    await page.select('.hp-patch-versions select', '35.6.2');
    // Its title only names the version, so the header says "Патч 35.6.2".
    await page.waitForFunction(() => document.querySelector('.hp-patch-hero__title')?.textContent === 'Патч 35.6.2');
    assert.equal(await page.$eval('.hp-patch-versions a[rel="next"]', node => node.getAttribute('href')), '/standard/patches/',
      'the newer patch link leads back to the newest patch');
    assert.equal(new URL(page.url()).searchParams.get('version'), '35.6.2');
    assert.equal((await fetch(`${pilot.origin}/api/patch-notes/9.9.9`)).status, 404);

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
