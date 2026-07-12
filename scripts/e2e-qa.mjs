// Deterministic browser QA for the high-risk authenticated/mobile flows.
// API responses are intercepted so mutable production data and a real paid
// account are not required. Screenshots are written outside the repository.
//
// Usage:
//   npm run qa:e2e
//   npm run qa:e2e -- --url=http://127.0.0.1:4173
import puppeteer from 'puppeteer';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
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
const fixtures = {
  '/api/winrates': JSON.parse(readFileSync('server/data/winrates.json', 'utf8')),
  '/api/tierlist': JSON.parse(readFileSync('server/data/hsreplay_tierlist.json', 'utf8')),
  '/api/legendaries': JSON.parse(readFileSync('server/data/legendaries.json', 'utf8')),
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

const authenticatedRoutes = [
  { path: '/classes', expected: 'Паладин', selector: '.arena-app-winrates' },
  { path: '/tierlist', expected: 'Тир-лист', selector: '.hs-tier-card' },
  { path: '/legendaries', expected: 'Медив Освященный', selector: '.legendary-group-card' },
  { path: '/guides-archive', expected: 'Контрольный гайд Арены', selector: '.guide-archive-card' },
];

for (const route of authenticatedRoutes) {
  for (const [device, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['mobile', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ]) {
    const page = await browser.newPage();
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
      await page.screenshot({ path: `${OUT}/${route.path.slice(1)}-${device}.png`, fullPage: false });
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

// Guest access must render the themed paywall instead of leaking private data.
{
  const page = await browser.newPage();
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

// Mobile drawer: visible controls, grouped navigation and background scroll lock.
{
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await mockApplicationApi(page, { authenticated: true });
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.click('.arena-mobile-nav-toggle');
    await page.waitForSelector('.arena-mobile-menu', { visible: true });
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
      };
    });
    if (openState.bodyPosition !== 'fixed' || openState.htmlOverflow !== 'hidden') failures.push('mobile menu: background is not scroll-locked');
    if (!openState.profileWidth || openState.profileRight > openState.viewportWidth + 1) failures.push('mobile menu: profile control frame overflows');
    if (!openState.constructors || !openState.misc) failures.push('mobile menu: grouped navigation controls are missing');
    if (openState.avatarFallback !== 'QS' || !openState.avatarImageHidden) failures.push('mobile menu: broken avatar did not fall back to user initials');
    await auditAccessibility(page, 'mobile menu open');
    await page.click('.arena-mobile-drawer-backdrop');
    await page.waitForSelector('.arena-mobile-menu', { hidden: true });
    const closedPosition = await page.evaluate(() => getComputedStyle(document.body).position);
    if (closedPosition === 'fixed') failures.push('mobile menu: scroll lock was not released');
    await page.screenshot({ path: `${OUT}/mobile-menu-closed.png`, fullPage: false });
    console.log('✓ mobile menu interaction and scroll lock');
  } catch (error) {
    failures.push(`mobile menu: ${error.message}`);
  } finally {
    await page.close();
  }
}

// Card lightbox: opening it must freeze the underlying mobile document and
// closing it must restore both the scroll position and inline styles.
{
  const page = await browser.newPage();
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
