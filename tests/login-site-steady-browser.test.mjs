import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

// The notice "Вход через hearthpulse.net для сайта …" must not move the form when the answer of
// /identity/interaction/<uid>/client arrives late. This runs on the real page: the built Next.js document and
// stylesheet, the page shell with its padding and the self-hosted Inter, at the widths of real phones.
const lateAnswerMs = 1000;
const sites = [
  { name: 'Манакост', host: 'hs-manacost.ru', uid: 'M'.repeat(24) },
  { name: 'Манакост — тест', host: 'test.hs-manacost.ru', uid: 'T'.repeat(24) },
];
const widths = [320, 340, 360, 375, 390, 414, 1280];
const chromiumPath = process.env.CHROMIUM_PATH || '/usr/bin/google-chrome';

function probe() {
  window.__shift = 0;
  window.__tops = [];
  window.__named = false;
  let firstSeen = null;
  // Once the card has settled (it fades in over its first half second) nothing on the page may shift: the footer
  // and everything below the card moves with the notice too, so the whole page counts, not only the card.
  const count = entries => {
    for (const entry of entries) {
      if (!entry.hadRecentInput && firstSeen !== null && entry.startTime > firstSeen + 600) window.__shift += entry.value;
    }
  };
  const observer = new PerformanceObserver(list => count(list.getEntries()));
  observer.observe({ type: 'layout-shift', buffered: true });
  window.__flushShifts = () => count(observer.takeRecords());
  const frame = () => {
    const form = document.querySelector('.login-card .login-form');
    // The card fades in over its first half second; from then on it must stand still.
    firstSeen ??= form ? performance.now() : null;
    if (form && performance.now() - firstSeen > 600) window.__tops.push(Math.round(form.getBoundingClientRect().top * 10) / 10);
    if (document.querySelector('.login-site')?.textContent.includes('для сайта')) window.__named = true;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

async function measure(page, origin, width, site) {
  await page.setViewport({ width, height: 900 });
  await page.goto('about:blank');
  await page.goto(`${origin}/?login#reader_interaction=${site.uid}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.login-card .login-form');
  const early = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  await new Promise(resolve => setTimeout(resolve, lateAnswerMs + 800));
  return page.evaluate(() => (window.__flushShifts(), {
    shift: window.__shift,
    spread: Math.max(...window.__tops) - Math.min(...window.__tops),
    frames: window.__tops.length,
    named: window.__named,
    text: document.body.innerText.replace(/\s+/g, ' '),
    inter: document.fonts.check('600 16px Inter', 'Вход через'),
    family: getComputedStyle(document.querySelector('.login-site')).fontFamily,
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    bannerHeight: document.querySelector('.login-site').getBoundingClientRect().height,
  })).then(result => ({ ...result, early }));
}

test('the sign-in notice does not move the form when the site name arrives late, on the real page', { timeout: 240_000 }, async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true });
  let browser;
  const identityRequests = [];
  // Every width is measured before the verdict, so a failure shows all the widths that move.
  const moved = [];
  try {
    browser = await launchBrowser({ executablePath: chromiumPath, headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(probe);
    await page.setRequestInterception(true);
    page.on('request', request => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith('/identity/')) identityRequests.push(pathname);
      const lookup = /^\/identity\/interaction\/([^/]+)\/client$/.exec(pathname);
      const site = lookup && sites.find(candidate => candidate.uid === lookup[1]);
      if (!lookup) { request.continue(); return; }
      setTimeout(() => {
        if (site) request.respond({ status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify({ name: site.name, host: site.host }) });
        else request.respond({ status: 404, contentType: 'application/json', body: '{}' });
      }, lateAnswerMs);
    });

    // Without a handle the card has no notice and nothing asks /identity/.
    await page.setViewport({ width: 390, height: 900 });
    await page.goto(`${runtime.origin}/?login`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.login-card .login-form');
    assert.equal(await page.$('.login-site'), null, 'no notice without a handle');
    assert.deepEqual(identityRequests, [], 'no request to /identity/ without a handle');

    // The fonts are fetched once; the measured visits below start with them in the cache, as a returning visitor's do.
    await page.goto(`${runtime.origin}/?login#reader_interaction=${sites[0].uid}`, { waitUntil: 'networkidle0' });

    for (const site of sites) {
      for (const width of widths) {
        const label = `${site.name} at ${width}px`;
        const result = await measure(page, runtime.origin, width, site);
        assert.equal(result.inter, true, `${label}: the page uses the self-hosted Inter`);
        assert.match(result.family, /Inter/, `${label}: the notice is set in Inter`);
        assert.match(result.early, /Вход через hearthpulse\.net Пароль вводится только на hearthpulse\.net/, `${label}: the neutral words are on the first frame`);
        assert.doesNotMatch(result.early, /для сайта/, `${label}: no name before the answer`);
        assert.ok(result.named && result.frames > 20, `${label}: the arrival of the name was observed`);
        assert.ok(result.text.includes(`Вход через hearthpulse.net для сайта ${site.name} (${site.host})`), `${label}: the name and the host are shown`);
        assert.equal(result.overflow, false, `${label}: no horizontal overflow`);
        if (result.shift >= 0.005) moved.push(`${label}: layout shift of the page ${result.shift.toFixed(4)}`);
        if (result.spread > 1) moved.push(`${label}: the form top moved by ${result.spread}px`);
        console.log(`${label}: page CLS ${result.shift.toFixed(4)}, form top moved ${result.spread}px, notice ${Math.round(result.bannerHeight)}px`);
      }
    }
    assert.deepEqual(moved, [], 'the form must stay where it is when the name arrives');
  } finally {
    await browser?.close();
    await runtime.close();
  }
});
