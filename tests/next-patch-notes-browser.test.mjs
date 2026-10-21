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

test('patch notes render the stored article as VaryloUI patch notes, and the home board ranks the public meta teaser', { timeout: 240000 }, async () => {
  const pilot = await startPublicCardPilot({ pagesEnabled: true });
  let browser;
  try {
    const document = await fetch(`${pilot.origin}/standard/patches/`);
    assert.equal(document.status, 200);
    const html = await document.text();
    assert.match(html, /Обновление 36\.6\.3: балансные изменения/, 'the newest patch with changes is in the server HTML');
    assert.match(html, /Змей ветреных вершин/);
    assert.match(html, /<link rel="canonical" href="https:\/\/hearthpulse\.net\/standard\/patches\/"/);

    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const [width, height] of [[1440, 900], [412, 915]]) {
      await page.setViewport({ width, height, isMobile: width < 600, hasTouch: width < 600 });
      await page.goto(`${pilot.origin}/standard/patches/`, { waitUntil: 'networkidle2' });
      await page.waitForSelector('.ui-patch-notes__entry');
      const state = await pageState(page);
      assert.deepEqual(state.h1, ['Патчноуты Hearthstone']);
      assert.equal(state.overflow, false, `no horizontal overflow at ${width}px`);
      assert.deepEqual(state.violations, [], `axe at ${width}px`);
    }
    assert.deepEqual(await page.$$eval('.ui-patch-notes__entry', entries => entries.map(entry => [
      entry.querySelector('.ui-patch-notes__name')?.textContent, entry.dataset.kind])), [
      // Unmatched constructed cards (the fixture blocks HearthstoneJSON) close the list as "other changes".
      ['Baleful Incense', 'buff'], ['Hammer of Twilight', 'nerf'], ['Змей ветреных вершин', 'rework'], ['Паучок', 'nerf'],
    ]);
    assert.equal(await page.$$eval('.ui-patch-notes__entry del', nodes => nodes.some(node => node.textContent?.includes('(3)'))), true,
      'the old text is struck out');
    await page.click('.ui-patch-notes__chip[data-kind="nerf"]');
    await page.waitForFunction(() => document.querySelectorAll('.ui-patch-notes__entry').length === 2);
    await page.click('.hp-patch-archive a[href*="version=35.6.2"]');
    await page.waitForFunction(() => document.querySelector('.ui-patch-notes__title')?.textContent?.includes('35.6.2'));
    assert.equal(await page.$eval('.hp-patch-archive [aria-current="page"]', node => node.textContent?.includes('35.6.2')), true);
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
