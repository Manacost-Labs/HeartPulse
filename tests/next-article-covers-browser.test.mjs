import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

const proxied = name => `/api/article-cover?url=${encodeURIComponent(`https://kolodahearthstone.com/wp-content/uploads/2026/09/${name}.png`)}`;
const ARTICLES = Array.from({ length: 6 }, (_, index) => ({
  id: `cover-${index + 1}`,
  title: `Статья с обложкой ${index + 1}`,
  date: `2026-09-${String(28 - index).padStart(2, '0')}`,
  image: proxied(`cover-${index + 1}`),
  excerpt: 'Короткое описание статьи.',
  tag: 'Арена',
  mode: 'arena',
  url: `https://kolodahearthstone.com/article-${index + 1}/`,
}));

// Stands in for Express: the article feed, covers that are as wide as the
// requested variant, and a signed-out session for everything else.
async function startApi() {
  const coverRequests = [];
  const covers = new Map();
  const cover = width => {
    if (!covers.has(width)) {
      covers.set(width, sharp({ create: { width, height: Math.round(width * 597 / 1176), channels: 3, background: '#7a2a9c' } })
        .webp().toBuffer());
    }
    return covers.get(width);
  };
  const handle = async (request, response) => {
    const url = new URL(request.url, 'http://api.local');
    if (url.pathname === '/api/articles') {
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ articles: ARTICLES, updatedAt: null }));
      return;
    }
    if (url.pathname === '/api/article-cover') {
      coverRequests.push(url.search);
      const body = await cover(Number(url.searchParams.get('w')) || 1176);
      response.writeHead(200, { 'Content-Type': 'image/webp', 'Cache-Control': 'no-store' }).end(body);
      return;
    }
    response.writeHead(401, { 'Content-Type': 'application/json' }).end('{"error":"Unavailable"}');
  };
  const server = http.createServer((request, response) => { void handle(request, response); });
  return { server, handle, coverRequests, origin: await listenLocal(server) };
}

// Pages go to Next.js and `/api/` to the stub, as nginx routes them.
async function startGateway(nextOrigin, api) {
  const next = new URL(nextOrigin);
  const server = http.createServer((request, response) => {
    if (request.url.startsWith('/api/')) { void api.handle(request, response); return; }
    const upstream = http.request(next, { method: request.method, path: request.url, headers: request.headers },
      answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
    request.pipe(upstream);
  });
  return { server, origin: await listenLocal(server) };
}

async function openCovers(browser, url, viewport, selector) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.waitForFunction(sel => {
    const image = document.querySelector(sel);
    return image?.complete && image.naturalWidth > 0;
  }, { timeout: 15_000 }, selector);
  const covers = await page.$$eval(selector, images => images.map(image => ({
    loading: image.getAttribute('loading'),
    fetchPriority: image.getAttribute('fetchpriority'),
    srcset: image.getAttribute('srcset') || '',
    sizes: image.getAttribute('sizes') || '',
    width: image.getAttribute('width'),
    height: image.getAttribute('height'),
    currentSrc: image.currentSrc,
  })));
  await page.close();
  return covers;
}

const widthOf = src => new URL(src).searchParams.get('w');

test('article covers request the WebP variant that fits the card, and the first /articles/ cover loads first', async () => {
  const api = await startApi();
  const next = await startNextServer({ legacyOrigin: api.origin });
  const gateway = await startGateway(next.origin, api);
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true, args: ['--no-sandbox'] });
    const articleCovers = '#root .article-image-shell img';

    const phone = await openCovers(browser, `${gateway.origin}/articles/`,
      { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, articleCovers);
    assert.equal(phone.length, ARTICLES.length);
    const [lead, ...rest] = phone;
    assert.equal(lead.loading, 'eager', 'the first cover is the phone LCP and must not wait for layout');
    assert.equal(lead.fetchPriority, 'high');
    for (const cover of phone) {
      assert.match(cover.srcset, /&w=480 480w, .*&w=720 720w, .*&w=960 960w$/);
      assert.ok(cover.sizes, 'sizes tells the browser how wide the card is');
      assert.deepEqual([cover.width, cover.height], ['1176', '597']);
    }
    for (const cover of rest) {
      assert.equal(cover.loading, 'lazy');
      assert.equal(cover.fetchPriority, null);
    }
    assert.equal(widthOf(lead.currentSrc), '960', 'a 346 px card at DPR 3 takes the widest variant');

    const desktop = await openCovers(browser, `${gateway.origin}/articles/`,
      { width: 1440, height: 900, deviceScaleFactor: 1 }, articleCovers);
    assert.equal(widthOf(desktop[0].currentSrc), '480', 'a 347 px card at DPR 1 takes the narrowest variant');

    const home = await openCovers(browser, `${gateway.origin}/`,
      { width: 1440, height: 900, deviceScaleFactor: 1 }, '#root .home-latest-article__image img');
    assert.equal(home.length, 3);
    for (const cover of home) {
      assert.equal(cover.loading, 'lazy', 'home covers sit below the hero');
      assert.equal(cover.fetchPriority, null);
      assert.match(cover.srcset, /&w=480 480w, .*&w=960 960w$/);
    }
    assert.notEqual(home[0].sizes, home[1].sizes, 'the lead teaser is sized apart from the others');
    assert.equal(widthOf(home[0].currentSrc), '480', 'the 403 px lead teaser at DPR 1 takes the narrowest variant');

    assert.ok(api.coverRequests.length > 0);
    for (const search of api.coverRequests) {
      assert.match(search, /&w=(?:480|720|960)$/, `cover requested without an allowlisted width: ${search}`);
    }
  } finally {
    if (browser) await browser.close();
    await closeLocal(gateway.server);
    await next.close();
    await closeLocal(api.server);
  }
});
