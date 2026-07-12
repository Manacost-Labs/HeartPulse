// Deterministic browser QA for the high-risk authenticated/mobile flows.
// API responses are intercepted so mutable production data and a real paid
// account are not required. Screenshots are written outside the repository.
//
// Usage:
//   npm run qa:e2e
//   npm run qa:e2e -- --url=http://127.0.0.1:4173
import puppeteer from 'puppeteer';
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AXE_PATH = require.resolve('axe-core/axe.min.js');
const CHROMIUM_PATH = [
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].find(candidate => candidate && existsSync(candidate));
if (!CHROMIUM_PATH) throw new Error('Chromium/Chrome executable is required for browser QA');

const BASE = (process.argv.find(arg => arg.startsWith('--url=')) || '--url=https://arena.hs-manacost.ru')
  .slice(6)
  .replace(/\/$/, '');
const OUT = process.env.QA_SCREENSHOT_DIR || `/tmp/hs-arena-qa-${process.getuid?.() ?? 'user'}`;
const failures = [];
const qaCard = {
  cardId: 'TIME_890',
  name: 'Медив Освященный',
  imageHa: 'https://cdn.heartharena.com/images/renders/ruRU/TIME_890.webp',
  imageRu: 'https://d15f34w2p8l1cc.cloudfront.net/hearthstone/5b1c3236a936971ce184478955f9f6802837a938fba48281b953dc37cc6998ad.png',
};
const qaClasses = [
  ['paladin', 'Паладин', '#a88a45', 54.6],
  ['hunter', 'Охотник', '#1d5921', 52.6],
  ['mage', 'Маг', '#2b5c85', 51.8],
  ['priest', 'Жрец', '#d1d1d1', 50.9],
  ['death-knight', 'Рыцарь смерти', '#1f252d', 49.8],
  ['demon-hunter', 'Охотник на демонов', '#224722', 48.7],
  ['rogue', 'Разбойник', '#333333', 47.6],
  ['shaman', 'Шаман', '#2a2e6b', 46.5],
  ['warlock', 'Чернокнижник', '#5c265c', 45.4],
  ['druid', 'Друид', '#704a16', 44.3],
  ['warrior', 'Воин', '#7a1e1e', 43.2],
].map(([id, name, color, winrate], index) => ({ id, name, color, winrate, games: 1500 - index * 50 }));
const fixtures = {
  '/api/winrates': {
    classes: qaClasses,
    updatedAt: '2026-07-11T00:00:00.000Z',
    source: 'qa-fixture',
  },
  '/api/tierlist': {
    sections: [{
      id: 'any',
      name: 'Нейтральные',
      color: '#4a4a4a',
      tiers: [{
        tier: 'S',
        label: 'Отлично',
        description: 'Контрольный тир.',
        cards: [{ ...qaCard, score: 100, winrate: 59.5, rarity: 'legendary', classKey: 'any' }],
      }],
    }],
    cards: {
      TIME_890: { cost: 10, attack: 7, health: 7, type: 'minion', rarity: 'legendary', imageHa: qaCard.imageHa, imageRu: qaCard.imageRu },
    },
    updatedAt: '2026-07-11T00:00:00.000Z',
    source: 'qa-fixture',
  },
  '/api/legendaries': {
    groups: [
      { keyCard: qaCard, cards: [], winRate: 66.3, classKey: 'priest' },
      { keyCard: { ...qaCard, cardId: 'TIME_890_BLUE', name: 'Медив Освященный II' }, cards: [], winRate: 55.2, classKey: 'mage' },
      { keyCard: { ...qaCard, cardId: 'TIME_890_RED', name: 'Медив Освященный III' }, cards: [], winRate: 42.1, classKey: 'warrior' },
    ],
    updatedAt: '2026-07-11T00:00:00.000Z',
    source: 'qa-fixture',
  },
  '/api/bg/tier-lists': {
    list: 'spells',
    source: 'qa-fixture',
    fetchedAt: '2026-07-11T00:00:00.000Z',
    count: 0,
    tierCounts: {},
    tiers: {},
  },
  '/api/bg/library/meta': {},
  '/api/bg/library/cards': { data: [] },
  '/api/guides-archive': {
    page: 1,
    limit: 18,
    total: 1,
    totalPages: 1,
    items: [{
      id: 1,
      slug: 'qa-guide',
      title: 'Контрольный гайд Арены',
      description: 'Детерминированная запись для проверки адаптивного архива.',
      image: null,
      publishedAt: '2026-07-11T00:00:00.000Z',
      menuName: 'Арена',
      menuCode: 'arena',
      kind: 'Гайд',
      kindSlug: 'guide',
      oldUrl: 'https://old.kolodahearthstone.ru/qa-guide',
    }],
    filters: {
      kinds: [{ slug: 'guide', label: 'Гайд', count: 1 }],
      menus: [{ slug: 'arena', label: 'Арена', count: 1 }],
    },
  },
};
const subscriber = {
  hasAccess: true,
  source: 'qa-fixture',
  checkedAt: new Date().toISOString(),
  stale: false,
  message: 'Deterministic browser QA subscriber',
  entitlements: {
    arena: true,
    battlegrounds: true,
    standard: true,
    contests: true,
    guidesArchive: true,
    arenaArticles: true,
    battlegroundsArticles: true,
  },
  boosty: { checked: true, found: true, hasAccess: true },
  telegram: { checked: false, hasAccess: false },
};

mkdirSync(OUT, { recursive: true });

function jsonResponse(body) {
  return {
    status: 200,
    contentType: 'application/json; charset=utf-8',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  };
}

async function mockApplicationApi(page, { authenticated }) {
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === '/api/auth/me') {
      request.respond(jsonResponse(authenticated ? {
        user: {
          id: 'qa-subscriber',
          profileId: 'qa-subscriber',
          email: 'qa@example.test',
          name: 'QA Subscriber',
          role: 'user',
          photoUrl: '/__qa_missing_avatar__.png',
        },
      } : { user: null }));
      return;
    }
    if (url.pathname === '/api/subscription/status' || url.pathname === '/api/subscription/refresh') {
      request.respond(jsonResponse(subscriber));
      return;
    }
    const fixtureKey = Object.keys(fixtures).find(key => url.pathname === key);
    if (fixtureKey) {
      request.respond(jsonResponse(fixtures[fixtureKey]));
      return;
    }
    request.continue();
  });
}

function collectRuntimeErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    // Third-party image CDNs are not application runtime failures.
    if (/Failed to load resource|ERR_BLOCKED_BY_CLIENT/i.test(text)) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

async function waitForMeaningfulPage(page, expectedText) {
  await page.waitForFunction(
    text => document.body?.innerText.includes(text),
    { timeout: 45_000 },
    expectedText,
  );
  await page.waitForFunction(
    () => !document.body.innerText.includes('Загрузка данных'),
    { timeout: 15_000 },
  ).catch(() => {});
}

async function auditAccessibility(page, label, context = 'document') {
  await page.addScriptTag({ path: AXE_PATH });
  const results = await page.evaluate(async auditContext => {
    const target = auditContext === 'document' ? document : document.querySelector(auditContext);
    if (!target) throw new Error(`Accessibility audit target is missing: ${auditContext}`);
    return window.axe.run(target, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
      },
      resultTypes: ['violations'],
    });
  }, context);
  for (const violation of results.violations) {
    const selectors = violation.nodes.slice(0, 3).flatMap(node => node.target).join(' | ');
    const summary = violation.nodes[0]?.failureSummary?.replace(/\s+/g, ' ').trim() || '';
    failures.push(`${label} [a11y ${violation.impact || 'unknown'}] ${violation.id}: ${violation.help}; ${selectors}; ${summary}`);
  }
  return results.violations.length;
}

async function inspectLayout(page, { mobile }) {
  return page.evaluate(isMobile => {
    const root = document.documentElement;
    const shell = document.querySelector('.arena-app-shell');
    const banner = document.querySelector('.section-banner-modern');
    const shellStyle = shell ? getComputedStyle(shell) : null;
    const routeParchmentExpected = Boolean(shell && (
      shell.classList.contains('arena-app-editorial')
      || shell.classList.contains('arena-app-game-data')
      || shell.classList.contains('arena-app-battlegrounds')
    ));
    const routeParchmentLoaded = [...document.styleSheets]
      .some(sheet => sheet.href?.includes('/assets/route-parchment-'));
    const content = document.querySelector('.arena-content-open');
    const bannerStyle = banner ? getComputedStyle(banner) : null;
    const suspiciousOverlays = [...document.querySelectorAll('body *')]
      .map(element => ({ element, style: getComputedStyle(element), rect: element.getBoundingClientRect() }))
      .filter(({ style, rect }) => (
        ['fixed', 'absolute'].includes(style.position)
        && rect.width >= innerWidth * 0.8
        && rect.height >= innerHeight * 0.8
        && Number(style.opacity || 1) > 0.05
        && style.visibility !== 'hidden'
        && style.display !== 'none'
        && !element.classList.contains('arena-mobile-drawer-backdrop')
      ))
      .filter(({ style }) => {
        const rgb = style.backgroundColor.match(/[\d.]+/g)?.map(Number) || [];
        const isDark = rgb.length >= 3 && rgb[0] < 70 && rgb[1] < 70 && rgb[2] < 70;
        const alpha = rgb.length >= 4 ? rgb[3] : 1;
        return isDark && alpha > 0.08;
      })
      .map(({ element }) => element.className || element.tagName)
      .slice(0, 5);

    return {
      title: document.title,
      textLength: document.body?.innerText.length || 0,
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      shellOpacity: shellStyle?.opacity || null,
      shellFilter: shellStyle?.filter || null,
      routeParchmentExpected,
      routeParchmentLoaded,
      battlegroundsSurface: shell?.classList.contains('arena-app-battlegrounds') || false,
      battlegroundsBackground: shellStyle?.backgroundImage || '',
      battlegroundsSign: content ? getComputedStyle(content, '::before').backgroundImage : '',
      bannerPosition: bannerStyle?.position || null,
      bannerOverflow: bannerStyle?.overflow || null,
      bannerHeight: banner?.getBoundingClientRect().height || 0,
      suspiciousOverlays,
      mobile: isMobile,
    };
  }, mobile);
}

function assertLayout(path, layout) {
  if (!layout.title || layout.textLength < 100) failures.push(`${path}: blank or unidentified page`);
  if (layout.mobile && layout.scrollWidth > layout.clientWidth + 1) {
    failures.push(`${path}: horizontal overflow ${layout.scrollWidth} > ${layout.clientWidth}`);
  }
  if (layout.shellOpacity !== '1') failures.push(`${path}: app shell opacity is ${layout.shellOpacity}`);
  if (layout.shellFilter && layout.shellFilter !== 'none') failures.push(`${path}: app shell filter is ${layout.shellFilter}`);
  if (layout.routeParchmentExpected && !layout.routeParchmentLoaded) failures.push(`${path}: route-owned parchment CSS was not loaded`);
  if (layout.battlegroundsSurface && !layout.battlegroundsBackground.includes('arena-parchment')) {
    failures.push(`${path}: route-owned Battlegrounds parchment CSS was not loaded`);
  }
  if (layout.battlegroundsSurface && !layout.battlegroundsSign.includes('battlegrounds-bartender-header')) {
    failures.push(`${path}: route-owned Battlegrounds sign CSS was not loaded`);
  }
  if (layout.bannerPosition && layout.bannerPosition !== 'relative') {
    failures.push(`${path}: banner is not a containing block (${layout.bannerPosition})`);
  }
  if (layout.bannerOverflow && layout.bannerOverflow !== 'hidden') {
    failures.push(`${path}: banner decoration is not contained (${layout.bannerOverflow})`);
  }
  if (layout.mobile && layout.bannerHeight > 260) failures.push(`${path}: mobile banner is unexpectedly tall (${layout.bannerHeight}px)`);
  if (layout.suspiciousOverlays.length) {
    failures.push(`${path}: dark viewport overlay detected (${layout.suspiciousOverlays.join(', ')})`);
  }
}

const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: CHROMIUM_PATH,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

async function createQaPage() {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  return page;
}

const authenticatedRoutes = [
  { path: '/classes', expected: 'Паладин', selector: '.arena-app-winrates' },
  { path: '/tierlist', expected: 'Тир-лист', selector: '.hs-tier-card' },
  { path: '/legendaries', expected: 'Медив Освященный', selector: '.legendary-group-card' },
  { path: '/guides-archive', expected: 'Контрольный гайд Арены', selector: '.guide-archive-card' },
  { path: '/battlegrounds/tier-list?list=spells', expected: 'Тир-лист заклинаний', selector: '.bg-tier-list-page' },
  { path: '/library', expected: 'Библиотека Полей Сражений', selector: '.bg-library-page' },
];

for (const route of authenticatedRoutes) {
  for (const [device, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['mobile', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ]) {
    const page = await createQaPage();
    const runtimeErrors = collectRuntimeErrors(page);
    await page.setViewport(viewport);
    await mockApplicationApi(page, { authenticated: true });
    try {
      await page.goto(BASE + route.path, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await waitForMeaningfulPage(page, route.expected);
      await page.waitForSelector(route.selector, { timeout: 20_000 });
      const violationCount = await auditAccessibility(page, `${route.path} [${device}]`);
      const paywallVisible = await page.$eval('.arena-paywall', element => getComputedStyle(element).display !== 'none').catch(() => false);
      if (paywallVisible) failures.push(`${route.path} [${device}]: subscriber still sees paywall`);
      const layout = await inspectLayout(page, { mobile: device === 'mobile' });
      assertLayout(`${route.path} [${device}]`, layout);
      const screenshotName = route.path.replace(/^\//, '').replace(/[^a-z0-9-]+/gi, '-');
      await page.screenshot({ path: `${OUT}/${screenshotName}-${device}.png`, fullPage: false });
      if (runtimeErrors.length) failures.push(`${route.path} [${device}]: ${runtimeErrors.join(' | ')}`);
      console.log(`✓ ${route.path} [${device}] subscriber layout + axe (${violationCount} violations)`);
    } catch (error) {
      const diagnostic = await page.evaluate(() => document.body?.innerText.slice(0, 240).replace(/\s+/g, ' ') || 'empty body').catch(() => 'unavailable body');
      failures.push(`${route.path} [${device}]: ${error.message}; page: ${diagnostic}`);
    } finally {
      await page.close();
    }
  }
}

// Reflow and operating-system accessibility modes. A 640 CSS-pixel viewport
// is the layout width of a 1280-pixel desktop viewport at 200% zoom.
{
  const page = await createQaPage();
  await page.setViewport({ width: 640, height: 900, deviceScaleFactor: 2 });
  await mockApplicationApi(page, { authenticated: true });
  const client = await page.createCDPSession();
  try {
    await client.send('Emulation.setEmulatedMedia', {
      media: 'screen',
      features: [
        { name: 'forced-colors', value: 'active' },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    });
    await page.goto(`${BASE}/classes`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await waitForMeaningfulPage(page, 'Паладин');
    await page.waitForSelector('.arena-app-winrates');
    await page.focus('.arena-skip-link');
    const state = await page.evaluate(() => {
      const skip = document.querySelector('.arena-skip-link');
      const style = getComputedStyle(skip);
      return {
        forcedColors: matchMedia('(forced-colors: active)').matches,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        transitionSeconds: Math.max(...style.transitionDuration.split(',').map(value => parseFloat(value) || 0)),
        focusOutlineWidth: parseFloat(style.outlineWidth) || 0,
        focusOutlineStyle: style.outlineStyle,
      };
    });
    if (!state.forcedColors || !state.reducedMotion) failures.push('accessibility media: Chromium did not activate the requested modes');
    if (state.scrollWidth > state.clientWidth + 1) failures.push(`200% reflow: horizontal overflow ${state.scrollWidth} > ${state.clientWidth}`);
    if (state.transitionSeconds > 0.001) failures.push(`reduced motion: skip-link transition still lasts ${state.transitionSeconds}s`);
    if (state.focusOutlineWidth < 2 || state.focusOutlineStyle === 'none') failures.push('forced colors: focused skip link has no durable outline');
    const violationCount = await auditAccessibility(page, '/classes [200% reflow + forced colors + reduced motion]');
    console.log(`✓ 200% reflow, forced colors and reduced motion (${violationCount} axe violations)`);
  } catch (error) {
    failures.push(`accessibility media and reflow: ${error.message}`);
  } finally {
    await client.detach().catch(() => {});
    await page.close();
  }
}

// Guest access must render the themed paywall instead of leaking private data.
{
  const page = await createQaPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await mockApplicationApi(page, { authenticated: false });
  try {
    await page.goto(`${BASE}/classes`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('.arena-paywall', { visible: true, timeout: 20_000 });
    const state = await page.$eval('.arena-paywall', element => {
      const preview = element.querySelector('.arena-paywall__preview');
      const dialog = element.querySelector('.arena-paywall__dialog');
      return {
        text: element.textContent || '',
        previewInert: preview?.hasAttribute('inert') || false,
        previewHidden: preview?.getAttribute('aria-hidden') === 'true',
        landmark: dialog?.tagName || '',
        purchaseLinks: element.querySelectorAll('.arena-paywall__purchase-options a').length,
      };
    });
    if (!state.text.includes('подпис')) failures.push('/classes [guest]: paywall copy is missing');
    if (!state.previewInert || !state.previewHidden) failures.push('/classes [guest]: private preview is exposed to interaction or assistive technology');
    if (state.landmark !== 'SECTION') failures.push(`/classes [guest]: paywall must be a section, got ${state.landmark || 'nothing'}`);
    if (state.purchaseLinks !== 2) failures.push(`/classes [guest]: expected 2 purchase links, got ${state.purchaseLinks}`);
    const violationCount = await auditAccessibility(page, '/classes [mobile guest]');
    console.log(`✓ /classes [mobile guest] paywall + axe (${violationCount} violations)`);
  } catch (error) {
    failures.push(`/classes [mobile guest]: ${error.message}`);
  } finally {
    await page.close();
  }
}

// Below-fold home chunks and the delayed prompt must remain independently usable.
{
  const page = await createQaPage();
  const runtimeErrors = collectRuntimeErrors(page);
  await page.setViewport({ width: 1440, height: 900 });
  await mockApplicationApi(page, { authenticated: true });
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('.home-latest-articles');
    await page.waitForSelector('.home-bg-directory');
    await page.waitForSelector('.home-arena-directory');
    const homeCssState = await page.evaluate(() => {
      const hrefs = [...document.styleSheets].map(sheet => sheet.href || '');
      return {
        routeCssLoaded: hrefs.some(href => href.includes('/assets/route-parchment-')),
        arenaCss: hrefs.some(href => href.includes('/assets/HomeArenaDirectory-')),
        battlegroundsCss: hrefs.some(href => href.includes('/assets/HomeBattlegrounds-')),
        articlesCss: hrefs.some(href => href.includes('/assets/HomeLatestArticles-')),
        supportCss: hrefs.some(href => href.includes('/assets/SupportPrompt-')),
        footerCss: hrefs.some(href => href.includes('/assets/SiteFooter-')),
        footerMarkup: Boolean(document.querySelector('.arena-footer')),
      };
    });
    if (homeCssState.routeCssLoaded) failures.push('home lazy sections: route-only parchment CSS leaked into the initial home route');
    if (!homeCssState.arenaCss || !homeCssState.battlegroundsCss || !homeCssState.articlesCss) failures.push('home lazy sections: one or more owner CSS chunks did not load');
    if (!homeCssState.supportCss) failures.push('home lazy sections: support-prompt owner CSS did not load');
    if (!homeCssState.footerCss || !homeCssState.footerMarkup) failures.push('home lazy sections: site-footer owner or markup did not load');
    const routeMetaLoadedInitially = await page.evaluate(() => performance.getEntriesByType('resource')
      .some(entry => entry.name.includes('/assets/route-meta-')));
    if (routeMetaLoadedInitially) failures.push('home lazy sections: route metadata loaded before client navigation');
    await page.evaluate(() => window.scrollTo(0, 900));
    await page.waitForSelector('.support-prompt--collapsed', { visible: true, timeout: 5_000 });
    await page.click('.support-prompt__trigger');
    await page.waitForSelector('.support-prompt--expanded', { visible: true });
    await auditAccessibility(page, 'home lazy sections and support prompt');
    if (runtimeErrors.length) failures.push(`home lazy sections: ${runtimeErrors.join(' | ')}`);
    await page.click('.support-prompt__close');
    await page.click('.arena-sidebar a[href="/classes"]');
    await page.waitForFunction(() => document.title.startsWith('Винрейт классов'), { timeout: 5_000 });
    const routeMetaState = await page.evaluate(() => ({
      path: location.pathname,
      description: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
      chunkLoaded: performance.getEntriesByType('resource').some(entry => entry.name.includes('/assets/route-meta-')),
    }));
    if (routeMetaState.path !== '/classes' || !routeMetaState.description.includes('винрейты всех 11 классов') || !routeMetaState.chunkLoaded) {
      failures.push(`home lazy sections: client route metadata did not update (${JSON.stringify(routeMetaState)})`);
    }
    console.log('✓ home lazy sections and delayed support prompt');
  } catch (error) {
    failures.push(`home lazy sections: ${error.message}`);
  } finally {
    await page.close();
  }
}

// Keyboard entry: the skip link must be the first application control, become
// visible on focus and move focus to the main landmark without a pointer.
{
  const page = await createQaPage();
  await page.setViewport({ width: 1440, height: 900 });
  await mockApplicationApi(page, { authenticated: true });
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.focus('.arena-skip-link');
    const skipState = await page.evaluate(() => {
      const element = document.activeElement;
      const rect = element?.getBoundingClientRect();
      return {
        className: element?.className || '',
        firstAppChild: document.querySelector('#root > .arena-app-shell')?.firstElementChild === element,
        width: rect?.width || 0,
        height: rect?.height || 0,
        top: rect?.top || 0,
      };
    });
    if (!String(skipState.className).includes('arena-skip-link') || !skipState.firstAppChild) failures.push('keyboard: skip link is not the first application control');
    if (skipState.height < 44 || skipState.width < 44 || skipState.top < 0) failures.push(`keyboard: skip link is not visibly actionable (${skipState.width}×${skipState.height}, top ${skipState.top})`);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => location.hash === '#main-content' && document.activeElement?.id === 'main-content');
    console.log('✓ keyboard skip link and main landmark focus');
  } catch (error) {
    failures.push(`keyboard skip link: ${error.message}`);
  } finally {
    await page.close();
  }
}

// Mobile drawer: visible controls, grouped navigation and background scroll lock.
{
  const page = await createQaPage();
  let stage = 'load';
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await mockApplicationApi(page, { authenticated: true });
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    stage = 'open';
    await page.click('.arena-mobile-nav-toggle');
    await page.waitForSelector('.arena-mobile-menu', { visible: true });
    stage = 'initial focus';
    await page.waitForFunction(() => document.querySelector('#arena-mobile-menu')?.contains(document.activeElement), { timeout: 5_000 });
    await page.waitForFunction(() => (
      document.querySelector('.auth-avatar > span')?.textContent === 'QS'
      && getComputedStyle(document.querySelector('.auth-avatar img')).display === 'none'
    ), { timeout: 5_000 }).catch(() => {});
    const openState = await page.evaluate(() => {
      const profile = document.querySelector('.arena-mobile-menu-profile');
      const rect = profile?.getBoundingClientRect();
      return {
        bodyPosition: getComputedStyle(document.body).position,
        htmlOverflow: getComputedStyle(document.documentElement).overflow,
        profileWidth: rect?.width || 0,
        profileRight: rect?.right || 0,
        viewportWidth: innerWidth,
        constructors: Boolean(document.querySelector('[aria-controls="arena-mobile-constructors"]')),
        misc: Boolean(document.querySelector('[aria-controls="arena-mobile-misc"]')),
        avatarFallback: document.querySelector('.auth-avatar > span')?.textContent || '',
        avatarImageHidden: getComputedStyle(document.querySelector('.auth-avatar img')).display === 'none',
        missingRoutes: [
          '/articles', '/standard/matchups', '/classes', '/tierlist', '/legendaries',
          '/heroes', '/library', '/battlegrounds/tier-list', '/battlegrounds/strategies',
          '/battlegrounds/tier-builder', '/gallery', '/guides-archive', '/contests',
        ].filter(path => !document.querySelector(`#arena-mobile-menu a[href="${path}"]`)),
        toggleSize: (() => {
          const toggleRect = document.querySelector('.arena-mobile-nav-toggle')?.getBoundingClientRect();
          return { width: toggleRect?.width || 0, height: toggleRect?.height || 0 };
        })(),
        undersizedControls: [...document.querySelectorAll('#arena-mobile-menu a[href], #arena-mobile-menu button:not([disabled])')]
          .filter(element => !element.closest('[hidden]'))
          .map(element => element.getBoundingClientRect())
          .filter(rect => rect.width < 44 || rect.height < 44)
          .length,
      };
    });
    if (openState.bodyPosition !== 'fixed' || openState.htmlOverflow !== 'hidden') failures.push('mobile menu: background is not scroll-locked');
    if (!openState.profileWidth || openState.profileRight > openState.viewportWidth + 1) failures.push('mobile menu: profile control frame overflows');
    if (!openState.constructors || !openState.misc) failures.push('mobile menu: grouped navigation controls are missing');
    if (openState.missingRoutes.length) failures.push(`mobile menu: missing routes ${openState.missingRoutes.join(', ')}`);
    if (openState.avatarFallback !== 'QS' || !openState.avatarImageHidden) failures.push('mobile menu: broken avatar did not fall back to user initials');
    if (openState.toggleSize.width < 44 || openState.toggleSize.height < 44) failures.push(`mobile menu: toggle target is ${openState.toggleSize.width}×${openState.toggleSize.height}`);
    if (openState.undersizedControls) failures.push(`mobile menu: ${openState.undersizedControls} visible controls are smaller than 44×44`);
    await auditAccessibility(page, 'mobile menu open');

    stage = 'forward focus trap';
    await page.evaluate(() => {
      const menu = document.querySelector('#arena-mobile-menu');
      const visible = [...menu.querySelectorAll('a[href], button:not([disabled])')]
        .filter(element => !element.closest('[hidden]'));
      visible.at(-1)?.focus();
    });
    await page.keyboard.press('Tab');
    const cycledToFirst = await page.evaluate(() => document.activeElement === document.querySelector('#arena-mobile-menu a[href], #arena-mobile-menu button:not([disabled])'));
    if (!cycledToFirst) failures.push('mobile menu: Tab escaped instead of cycling to the first control');
    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    const cycledToLast = await page.evaluate(() => {
      const visible = [...document.querySelectorAll('#arena-mobile-menu a[href], #arena-mobile-menu button:not([disabled])')]
        .filter(element => !element.closest('[hidden]'));
      return document.activeElement === visible.at(-1);
    });
    if (!cycledToLast) failures.push('mobile menu: Shift+Tab escaped instead of cycling to the last control');
    stage = 'escape close and restore';
    await page.keyboard.press('Escape');
    await page.waitForSelector('.arena-mobile-menu', { hidden: true });
    await page.waitForFunction(() => document.activeElement?.classList.contains('arena-mobile-nav-toggle'), { timeout: 5_000 });

    stage = 'backdrop close';
    await page.click('.arena-mobile-nav-toggle');
    await page.waitForSelector('.arena-mobile-menu', { visible: true });
    await page.click('.arena-mobile-drawer-backdrop');
    await page.waitForSelector('.arena-mobile-menu', { hidden: true });
    const closedPosition = await page.evaluate(() => getComputedStyle(document.body).position);
    if (closedPosition === 'fixed') failures.push('mobile menu: scroll lock was not released');
    await page.screenshot({ path: `${OUT}/mobile-menu-closed.png`, fullPage: false });
    console.log('✓ mobile menu interaction and scroll lock');
  } catch (error) {
    const active = await page.evaluate(() => ({
      tag: document.activeElement?.tagName || '',
      className: document.activeElement?.className || '',
      label: document.activeElement?.getAttribute('aria-label') || '',
    })).catch(() => ({}));
    failures.push(`mobile menu [${stage}]: ${error.message}; active=${JSON.stringify(active)}`);
  } finally {
    await page.close();
  }
}

// Card lightbox: opening it must freeze the underlying mobile document and
// closing it must restore both the scroll position and inline styles.
{
  const page = await createQaPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await mockApplicationApi(page, { authenticated: true });
  try {
    await page.goto(`${BASE}/tierlist`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await waitForMeaningfulPage(page, 'Тир-лист');
    await page.waitForSelector('.hs-tier-card');
    await page.evaluate(() => window.scrollTo(0, 650));
    await new Promise(resolve => setTimeout(resolve, 150));
    await page.$eval('.hs-tier-card', element => element.click());
    await page.waitForSelector('.card-modal-lightbox', { visible: true });
    await auditAccessibility(page, 'mobile lightbox open', '.card-modal-lightbox');
    const locked = await page.evaluate(() => ({
      bodyPosition: getComputedStyle(document.body).position,
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      bodyTop: document.body.style.top,
      scrollY: window.scrollY,
    }));
    await page.evaluate(() => window.scrollBy(0, 500));
    const afterAttempt = await page.evaluate(() => ({ bodyTop: document.body.style.top, scrollY: window.scrollY }));
    if (locked.bodyPosition !== 'fixed' || locked.htmlOverflow !== 'hidden') failures.push('lightbox: background is not scroll-locked');
    if (afterAttempt.bodyTop !== locked.bodyTop || afterAttempt.scrollY !== locked.scrollY) failures.push('lightbox: background moved while open');
    await page.click('.card-modal-lightbox [aria-label="Закрыть"]');
    await page.waitForSelector('.card-modal-lightbox', { hidden: true });
    const restored = await page.evaluate(() => ({ position: getComputedStyle(document.body).position, scrollY: window.scrollY }));
    if (restored.position === 'fixed') failures.push('lightbox: body remained fixed after close');
    if (restored.scrollY < 500) failures.push(`lightbox: scroll position was not restored (${restored.scrollY})`);
    console.log('✓ mobile lightbox scroll lock and restore');
  } catch (error) {
    const diagnostic = await page.evaluate(() => document.body?.innerText.slice(0, 240).replace(/\s+/g, ' ') || 'empty body').catch(() => 'unavailable body');
    failures.push(`mobile lightbox: ${error.message}; page: ${diagnostic}`);
  } finally {
    await page.close();
  }
}

await browser.close();

if (failures.length) {
  console.error('\nE2E QA FAILURES:');
  failures.forEach(failure => console.error(`  ✗ ${failure}`));
  process.exit(1);
}

console.log(`\nAll authenticated/mobile E2E checks passed. Screenshots: ${OUT}`);
