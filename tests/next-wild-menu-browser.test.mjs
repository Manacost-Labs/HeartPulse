import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

// «Вольный» is a mode of its own: its banner opens meta in Wild, the page's format buttons and the
// menu are one state (also on Back), and a direct load of a Wild address never shows Standard's list.

function signedOut(response) {
  response.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' }).end('{"error":"Unavailable"}');
}

async function startGateway(nextOrigin) {
  const next = new URL(nextOrigin);
  const server = http.createServer((request, response) => {
    if (request.url.startsWith('/api/')) { signedOut(response); return; }
    const upstream = http.request(next, { method: request.method, path: request.url, headers: request.headers },
      answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
    request.pipe(upstream);
  });
  return { server, origin: await listenLocal(server) };
}

/** What a reader sees in the sidebar: the visible list's mode, its current item, the mode on the button and the page's pressed format. */
const readMenu = page => page.evaluate(() => {
  const side = document.querySelector('.arena-sidebar');
  const lists = [...side.querySelectorAll('.hp-nav-list')].filter(list => list.checkVisibility());
  return {
    lists: lists.map(list => list.dataset.for),
    current: lists.flatMap(list => [...list.querySelectorAll('a[aria-current="page"]')].map(link => link.textContent.trim())),
    mode: [...side.querySelectorAll('.hp-mode-name')].find(name => name.checkVisibility())?.textContent,
    format: [...document.querySelectorAll('#main-content .standard-meta__format-control button[aria-pressed="true"]')].map(button => /^(?:Стандарт|Вольный)/.exec(button.textContent.trim())?.[0]),
    where: location.pathname + location.search,
  };
});

test('the Wild banner, the format buttons and Back keep the menu and the page in one state', { timeout: 120_000 }, async () => {
  const express = http.createServer((_request, response) => signedOut(response));
  let next; let gateway; let browser;
  try {
    next = await startNextServer({ legacyOrigin: await listenLocal(express) });
    gateway = await startGateway(next.origin);
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${gateway.origin}/classes/`, { waitUntil: 'networkidle2' });
    assert.deepEqual((await readMenu(page)).lists, ['arena']);

    // The banner opens meta in Wild: the Wild list, Мета current, the page's Wild button pressed, «Текущий» on the Wild banner.
    await page.click('.arena-sidebar details.hp-mode > summary');
    await page.waitForFunction(() => [...document.querySelectorAll('.arena-sidebar [data-mode-card]')].every(card => card.checkVisibility() && !card.getAnimations({ subtree: true }).length));
    assert.equal(await page.$$eval('.arena-sidebar [data-mode-card]', cards => cards.map(card => card.dataset.mode).join()), 'standard,wild,arena,battlegrounds,community', 'five banners in order');
    await page.click('.arena-sidebar [data-mode-card][data-mode="wild"]');
    await page.waitForFunction(() => location.pathname === '/standard/meta/' && location.search === '?format=wild');
    await page.waitForSelector('#main-content .standard-meta__format-control button[aria-pressed="true"]');
    assert.deepEqual(await readMenu(page), { lists: ['wild'], current: ['Мета'], mode: 'Вольный', format: ['Вольный'], where: '/standard/meta/?format=wild' });
    await page.click('.arena-sidebar details.hp-mode > summary');
    await page.waitForFunction(() => [...document.querySelectorAll('.arena-sidebar [data-mode-card]')].every(card => card.checkVisibility()));
    assert.equal(await page.$$eval('.arena-sidebar [data-mode-card]', cards => cards.filter(card => getComputedStyle(card.querySelector('.hp-mode-badge')).display !== 'none').map(card => card.dataset.mode).join()), 'wild');
    await page.keyboard.press('Escape');

    // The page's button changes the address and the menu follows, and back.
    const press = label => page.evaluate(text => [...document.querySelectorAll('#main-content .standard-meta__format-control button')].find(button => button.textContent.trim().startsWith(text)).click(), label);
    await press('Стандарт');
    await page.waitForFunction(() => location.search === '');
    assert.deepEqual(await readMenu(page), { lists: ['standard'], current: ['Мета'], mode: 'Стандарт', format: ['Стандарт'], where: '/standard/meta/' });
    await press('Вольный');
    await page.waitForFunction(() => location.search === '?format=wild');
    assert.deepEqual(await readMenu(page), { lists: ['wild'], current: ['Мета'], mode: 'Вольный', format: ['Вольный'], where: '/standard/meta/?format=wild' });

    // Back restores the format of the page and the mode of the menu, without a reload.
    await page.evaluate(() => { window.__same = true; });
    await page.goBack();
    await page.waitForFunction(() => location.search === '');
    assert.deepEqual(await readMenu(page), { lists: ['standard'], current: ['Мета'], mode: 'Стандарт', format: ['Стандарт'], where: '/standard/meta/' });
    await page.goForward();
    await page.waitForFunction(() => location.search === '?format=wild');
    assert.deepEqual(await readMenu(page), { lists: ['wild'], current: ['Мета'], mode: 'Вольный', format: ['Вольный'], where: '/standard/meta/?format=wild' });
    assert.equal(await page.evaluate(() => window.__same), true, 'the page was not reloaded');

    // A Wild item opens its page in Wild; patch notes keep the mode.
    await page.click('.arena-sidebar .hp-nav-list[data-for="wild"] a[href="/standard/cards/wild/"]');
    await page.waitForFunction(() => location.pathname === '/standard/cards/wild/');
    assert.deepEqual((await readMenu(page)).lists.concat((await readMenu(page)).current), ['wild', 'Карты']);
    await page.click('.arena-sidebar .hp-nav-list[data-for="wild"] a[href="/standard/patches/"]');
    await page.waitForFunction(() => location.pathname === '/standard/patches/');
    assert.deepEqual((await readMenu(page)).lists.concat((await readMenu(page)).current), ['wild', 'Патчноуты'], 'patch notes after Wild stay in Wild');

    // The deck builder's own format select is the same state: a switch adds a history entry, Back returns the format and the mode.
    const builderFormat = () => page.evaluate(() => [...document.querySelectorAll('#main-content .hp-builder-context select')].find(select => select.querySelector('option[value="wild"]'))?.value);
    await page.click('.arena-sidebar .hp-nav-list[data-for="wild"] a[href="/standard/deck-builder/?format=wild"]');
    await page.waitForFunction(() => location.pathname === '/standard/deck-builder/' && location.search === '?format=wild');
    await page.waitForFunction(() => [...document.querySelectorAll('#main-content .hp-builder-context select')].some(select => select.value === 'wild'));
    assert.deepEqual((await readMenu(page)).lists.concat((await readMenu(page)).current), ['wild', 'Конструктор колод']);
    await page.evaluate(() => { window.__builder = true; });
    const formatSelect = await page.evaluateHandle(() => [...document.querySelectorAll('#main-content .hp-builder-context select')].find(select => select.querySelector('option[value="wild"]')));
    await formatSelect.select('standard');
    await page.waitForFunction(() => location.search === '');
    assert.equal(await builderFormat(), 'standard');
    assert.deepEqual((await readMenu(page)).lists.concat((await readMenu(page)).current), ['standard', 'Конструктор колод'], 'the menu follows the builder to Standard');
    await page.goBack();
    await page.waitForFunction(() => location.pathname === '/standard/deck-builder/' && location.search === '?format=wild');
    await page.waitForFunction(() => [...document.querySelectorAll('#main-content .hp-builder-context select')].some(select => select.value === 'wild'));
    assert.deepEqual((await readMenu(page)).lists.concat((await readMenu(page)).current), ['wild', 'Конструктор колод'], 'Back returns the builder and the menu to Wild');
    assert.equal(await page.evaluate(() => window.__builder), true, 'Back stayed on the builder without a reload');
    assert.deepEqual(errors, []);
    await page.close();

    // A direct load of a Wild address: no frame ever shows the list of Standard.
    const direct = await browser.newPage();
    await direct.setViewport({ width: 1440, height: 900 });
    await direct.evaluateOnNewDocument(() => {
      window.__lists = [];
      const sample = () => {
        const side = document.querySelector('.arena-sidebar');
        if (side) window.__lists.push([...side.querySelectorAll('.hp-nav-list')].filter(list => list.checkVisibility()).map(list => list.dataset.for).join());
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await direct.goto(`${gateway.origin}/standard/meta/?format=wild`, { waitUntil: 'domcontentloaded' });
    await direct.waitForSelector('#main-content .standard-meta__format-control button[aria-pressed="true"]');
    await new Promise(resolve => setTimeout(resolve, 1500));
    const frames = await direct.evaluate(() => window.__lists);
    assert.ok(frames.length > 5, 'frames were sampled');
    assert.deepEqual([...new Set(frames)], ['wild'], 'only the Wild list is ever shown');
  } finally {
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway.server);
    if (next) await next.close();
    await closeLocal(express);
  }
});
