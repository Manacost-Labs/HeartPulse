import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

const axe = readFileSync(fileURLToPath(import.meta.resolve('axe-core')), 'utf8');
const BE044 = JSON.parse(readFileSync(new URL('./fixtures/card-assemble-contract-be044.json', import.meta.url), 'utf8')).data;
const CHECKED = '2026-11-20T03:10:00+00:00';

// The data API's list of the cards with «Собирает» and its answer for one card, as the proxy projects them.
const row = (card_id, dbf_id, name_ru, card_class, state, bases_total, win_rate, formats = ['standard', 'wild']) => ({
  card: { card_id, dbf_id, name: name_ru, name_ru, card_class, cost: 3, type: 'MINION', rarity: 'RARE' }, formats, state, checked_at: CHECKED, stale: false, bases_total, win_rate,
});
const LISTS = {
  standard: [row('BE_004', 132353, 'Радж', 'PALADIN', 'ok', 13, 52.5), row('BE_044', 128892, 'РЕ-3-ВЕР', 'NEUTRAL', 'ok', 38, 48.6), row('BE_087', 129804, 'Непроглядные глубины', 'WARLOCK', 'no_data', null, null)],
  wild: [row('BE_044', 128892, 'РЕ-3-ВЕР', 'NEUTRAL', 'ok', 38, 48.6)],
};
const cardAnswer = url => {
  const id = url.searchParams.get('card');
  const format = url.searchParams.get('format');
  const row = LISTS[format]?.find(item => item.card.card_id === id);
  if (!row || row.state !== 'ok') return null;
  return { data: { ...BE044, card: { ...BE044.card, ...row.card }, format, summary: { bases_total: row.bases_total, win_rate: row.win_rate },
    donor_pool_status: { state: 'ok', class_dependent: row.card.card_class === 'NEUTRAL', player_class: null } }, meta: {} };
};
const externalRoutes = {
  '/v1/hsreplay/assemble/cards': url => ({ data: LISTS[url.searchParams.get('format')] ?? [], meta: { fetched_at: CHECKED, stale: false, count: 3 } }),
  '/v1/hsreplay/assemble': cardAnswer,
};

async function pageState(page) {
  await page.evaluate(axe);
  return page.evaluate(async () => ({
    h1: [...document.querySelectorAll('h1')].map(node => node.textContent?.trim()),
    overflow: document.documentElement.scrollWidth > innerWidth,
    violations: (await axe.run(document.querySelector('main'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
      .violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })),
  }));
}

/** The visible text of a server HTML: parsed by the browser with scripts off, then script and style nodes dropped. */
async function visibleText(browser, html) {
  const page = await browser.newPage();
  try {
    await page.setJavaScriptEnabled(false);
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    return await page.evaluate(() => {
      document.querySelectorAll('script, style, noscript').forEach(node => node.remove());
      document.body.querySelectorAll('*').forEach(node => node.append(' '));
      return (document.body.textContent ?? '').replace(/\s+/g, ' ');
    });
  } finally { await page.close(); }
}

test('the Assemble tool page draws the chosen card on the server, takes the choice from the address and works on a phone', { timeout: 420000 }, async () => {
  const pilot = await startPublicCardPilot({ pagesEnabled: true, externalRoutes });
  let browser;
  try {
    // The first request loads the route's modules, which can outlast the first-paint read budget on a busy runner.
    await (await fetch(`${pilot.origin}/standard/assemble/`)).text();
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
    const get = async path => { const response = await fetch(`${pilot.origin}${path}`); return { response, html: await response.text() }; };

    const rajh = await get('/standard/assemble/?card=BE_004');
    assert.equal(rajh.response.status, 200);
    assert.match(rajh.html, /<link rel="canonical" href="https:\/\/hearthpulse\.net\/standard\/assemble\/"/, 'the canonical of a chosen card is the tool');
    const rajhText = await visibleText(browser, rajh.html);
    assert.match(rajhText, /Радж Пул 13 существ/, 'the section of the requested card is in the HTML without JavaScript');
    assert.match(rajhText, /призывает Бейна Кровавое Копыто 5\/5/, 'the texts of the best builds are in the HTML');
    assert.match(rajh.html, /href="https:\/\/hsreplay\.net\/[^"]*"/, 'HSReplay is linked as the source');
    assert.equal([...rajh.html.matchAll(/class="assemble-card"[^>]*href="([^"]+)"|href="([^"]+)"[^>]*class="assemble-card"/g)].length, 3, 'every card of the list is a link');
    assert.match(rajh.html, /href="\/standard\/assemble\/\?card=BE_044"/);
    assert.match(rajhText, /Непроглядные глубины [^ ]+ Нет данных/, 'a card without data says so in the choice');

    const wild = await get('/standard/assemble/?card=BE_044&format=wild');
    assert.match(await visibleText(browser, wild.html), /РЕ-3-ВЕР Пул 38 существ/);
    assert.match(wild.html, /href="\/standard\/assemble\/\?card=BE_044&(?:amp;)?format=wild"/, 'the links keep the format');
    assert.doesNotMatch(wild.html, /Радж/, 'the Wild list has no Rajh');

    for (const path of ['/standard/assemble/?card=XYZ', '/standard/assemble/']) {
      const page = await get(path);
      assert.equal(page.response.status, 200, `${path} is a page, not a 404`);
      assert.match(await visibleText(browser, page.html), /РЕ-3-ВЕР Пул 38 существ/, `${path} shows the neutral card with data`);
    }
    assert.match(await visibleText(browser, (await get('/standard/assemble/?card=BE_087')).html), /Выберите другую карту|не собрал данных/, 'a card without data is not hidden, it is explained');

    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (new URL(request.url()).pathname.startsWith('/api/public-resource/')) void request.respond({ status: 200, contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64') });
      else void request.continue();
    });
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      await page.setViewport({ width, height, isMobile: width < 600, hasTouch: width < 600 });
      await page.goto(`${pilot.origin}/standard/assemble/?card=BE_004`, { waitUntil: 'networkidle2' });
      await page.waitForSelector('[data-card-assemble] .assemble-row');
      const state = await pageState(page);
      assert.deepEqual(state.h1, ['Сборка']);
      assert.equal(state.overflow, false, `no horizontal overflow at ${width}px`);
      assert.deepEqual(state.violations, [], `axe at ${width}px`);
      if (width < 600) continue;
      const tile = await page.$eval('.assemble-card', node => { const box = node.getBoundingClientRect(); return [box.width, box.height]; });
      assert.ok(tile[0] >= 120 && tile[1] >= 120, `the tiles are big enough to tap at ${width}px: ${tile}`);
    }

    // A phone folds the choice behind one line: the tool starts on the first screens, all 13 links stay in the markup.
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(`${pilot.origin}/standard/assemble/?card=BE_004`, { waitUntil: 'networkidle2' });
    assert.equal(await page.$$eval('a.assemble-card', cards => cards.length), 3, 'the links stay in the markup');
    assert.equal(await page.$eval('.assemble-cards', node => getComputedStyle(node).display), 'none', 'the grid is folded on a phone');
    assert.match(await page.$eval('.assemble-current', node => node.textContent), /Радж\s*Паладин\s*Пул 13 существ/);
    assert.ok(await page.$eval('.assemble-tool .assemble', node => node.getBoundingClientRect().top) < 1266, 'the tool starts within the first two screens');
    assert.ok(await page.$eval('.arena-skip-link', node => node.getBoundingClientRect().bottom) <= 0, 'the skip link is out of sight without focus');
    await page.click('.assemble-current__change');
    const phoneTile = await page.$eval('.assemble-card', node => { const box = node.getBoundingClientRect(); return [box.width, box.height]; });
    assert.ok(phoneTile[0] >= 100 && phoneTile[1] >= 90, `a tile is a finger target: ${phoneTile}`);
    assert.equal(await page.$eval('.assemble-cards', node => getComputedStyle(node).display), 'grid');
    assert.equal(await page.$eval('.assemble-cards', node => getComputedStyle(node).gridTemplateColumns.split(' ').length), 3, 'three columns on a phone');
    await page.click('a.assemble-card[data-card="BE_044"]');
    await page.waitForFunction(() => location.search === '?card=BE_044' && document.querySelector('[data-card-assemble] h2')?.textContent === 'РЕ-3-ВЕР');
    assert.equal(await page.$eval('.assemble-cards', node => getComputedStyle(node).display), 'none', 'the grid folds after the choice');
    await page.setJavaScriptEnabled(false);
    await page.goto(`${pilot.origin}/standard/assemble/?card=BE_004`, { waitUntil: 'load' });
    assert.equal(await page.$eval('.assemble-cards', node => getComputedStyle(node).display), 'grid', 'without scripting the grid is open');
    await page.setJavaScriptEnabled(true);

    // A tile is a soft navigation: the address changes, the page does not reload, Back returns to the first card.
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${pilot.origin}/standard/assemble/?card=BE_004`, { waitUntil: 'networkidle2' });
    await page.evaluate(() => { window.__sameDocument = true; });
    await page.click('a.assemble-card[data-card="BE_044"]');
    await page.waitForFunction(() => location.search === '?card=BE_044' && document.querySelector('[data-card-assemble] h2')?.textContent === 'РЕ-3-ВЕР');
    assert.equal(await page.evaluate(() => window.__sameDocument === true), true, 'choosing a card does not reload the document');
    assert.equal(await page.$eval('a.assemble-card[aria-current="true"]', node => node.dataset.card), 'BE_044');
    assert.ok(await page.$('.assemble-classes'), 'F3TCH3R offers the class choice');
    await page.goBack();
    await page.waitForFunction(() => document.querySelector('[data-card-assemble] h2')?.textContent === 'Радж');
    assert.equal(await page.evaluate(() => location.search), '?card=BE_004');

    // The menu lists the page after the deck builder and highlights it; Wild has its twin.
    const menu = await page.$$eval('.arena-sidebar-nav .hp-nav-list[data-for="standard"] a', links => links.map(link => [link.textContent?.trim(), link.getAttribute('aria-current')]));
    const labels = menu.map(item => item[0]);
    assert.equal(labels[labels.indexOf('Конструктор колод') + 1], 'Сборка');
    assert.equal(menu.find(item => item[0] === 'Сборка')?.[1], 'page');
    assert.ok(await page.$('.arena-sidebar-nav .hp-nav-list[data-for="wild"] a[href="/standard/assemble/?format=wild"]'), 'Wild menu has the twin');

    await page.goto(`${pilot.origin}/standard/assemble/?format=wild`, { waitUntil: 'networkidle2' });
    assert.equal(await page.$$eval('a.assemble-card', cards => cards.length), 1, 'the Wild list is its own');
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    await pilot.close();
  }
});
