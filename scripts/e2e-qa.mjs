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
const adminFixtures = {
  '/api/admin/contests': {
    contests: [{
      id: 'qa-contest',
      title: 'Контрольный конкурс',
      description: 'Детерминированный конкурс для browser QA.',
      prize: 'Приз',
      imageUrl: '',
      startsAt: '2026-07-11T00:00:00.000Z',
      endsAt: '2026-07-20T00:00:00.000Z',
      status: 'active',
      winners: [],
      entriesCount: 3,
    }],
  },
  '/api/articles': {
    articles: [
      { id: 'qa-article-1', title: 'Первая статья', date: '2026-07-11', tag: 'Арена', excerpt: 'Контрольная статья Арены.', mode: 'arena', image: '', url: '/articles/qa-1' },
      { id: 'qa-article-2', title: 'Вторая статья', date: '2026-07-10', tag: 'Общее', excerpt: 'Контрольный общий материал.', mode: 'general', image: '', url: '/articles/qa-2' },
    ],
  },
  '/api/admin/gallery': {
    items: [{
      id: 'qa-art',
      title: 'Контрольный арт',
      description: 'Детерминированный арт для browser QA.',
      tag: 'QA',
      source: 'fixture',
      width: 1920,
      height: 1080,
      bytes: 125000,
      previewUrl: '/favicon-192.png',
      thumbUrl: '/favicon-192.png',
      imageUrl: '/favicon-192.png',
      downloadUrl: '/favicon-192.png',
      createdAt: '2026-07-11T00:00:00.000Z',
    }],
  },
  '/api/admin/referrals': {
    referrals: [{
      id: 'qa-referral',
      slug: 'qa-campaign',
      label: 'QA campaign',
      campaign: 'qa',
      targetPath: '/',
      status: 'active',
      createdAt: '2026-07-11T00:00:00.000Z',
      updatedAt: '2026-07-11T00:00:00.000Z',
      url: 'https://arena.hs-manacost.ru/r/qa-campaign',
      clicks: 7,
      uniqueClicks: 5,
      lastClickAt: '2026-07-11T00:00:00.000Z',
    }],
    recentClicks: [],
  },
  '/api/admin/boosty/status': {
    configured: true,
    ok: true,
    importStatus: 'ok',
    source: 'qa-fixture',
    stale: false,
    summary: { boostyPaid: 4, activePaid: 4 },
    checkedAt: '2026-07-11T00:00:00.000Z',
  },
  '/api/admin/boosty/subscribers': {
    configured: true,
    source: 'qa-fixture',
    stale: false,
    summary: { boostyPaid: 2, activePaid: 1 },
    levels: { 'Любитель Арены': 1, 'Зритель': 1 },
    subscribers: [
      {
        id: 'boosty-qa-1', name: 'Активный подписчик', email: 'active@example.test', hasEmail: true,
        avatarUrl: '', status: 'active', subscribed: true, active: true, paid: true, hasActivePaidAccess: true,
        willRenew: true, blacklisted: false, canWrite: true, audienceType: 'boosty-paid', contactStatus: 'known',
        level: { id: 1, name: 'Любитель Арены', price: 500, currency: 'RUB' },
        money: { currentPrice: 500, totalPayments: 1500, currency: 'RUB' },
        dates: { subscribedAt: '2026-06-01T00:00:00.000Z', unsubscribedAt: null, nextPaymentAt: '2026-08-01T00:00:00.000Z' },
        entitlements: { arena: true, battlegrounds: true }, siteAccess: true,
      },
      {
        id: 'boosty-qa-2', name: 'Неактивный подписчик', email: '', hasEmail: false,
        avatarUrl: '', status: 'inactive', subscribed: false, active: false, paid: false, hasActivePaidAccess: false,
        willRenew: false, blacklisted: false, canWrite: false, audienceType: 'boosty-free', contactStatus: 'missing-email',
        level: { id: 2, name: 'Зритель', price: 0, currency: 'RUB' },
        money: { currentPrice: 0, totalPayments: 0, currency: 'RUB' },
        dates: { subscribedAt: null, unsubscribedAt: '2026-06-02T00:00:00.000Z', nextPaymentAt: null },
        entitlements: {}, siteAccess: false,
      },
    ],
    fetchedAt: '2026-07-11T00:00:00.000Z',
  },
  '/api/admin/telegram/accounts': {
    configured: true,
    chatIds: ['-100123456'],
    summary: { total: 2, access: 1, checkable: 1, contactOnly: 1, stale: 1, blocked: 0 },
    accounts: [
      {
        id: 'telegram-qa-1', profileId: 'TG-0001', name: 'Участник VIP', email: 'vip@example.test', role: 'user', blockedAt: '',
        telegramId: '10001', telegramOidcId: 'oidc-10001', telegramUsername: 'vip_member', contactTelegram: 'vip_member', photoUrl: '',
        hasTelegramIdentity: true, hasContactOnly: false, canBeChecked: true, hasAccess: true, telegramHasAccess: true,
        accessState: 'access', source: 'telegram', message: 'Участник найден', checkedAt: '2026-07-11T00:00:00.000Z',
        updatedAt: '2026-07-11T00:00:00.000Z', stale: false, entitlements: { arena: true, battlegrounds: true },
        chats: [{ chatId: '-100123456', status: 'member', isMember: true, hasAccess: true }], boostyHasAccess: false,
        createdAt: '2026-07-01T00:00:00.000Z', userUpdatedAt: '2026-07-11T00:00:00.000Z',
      },
      {
        id: 'telegram-qa-2', profileId: 'TG-0002', name: 'Контакт без привязки', email: 'contact@example.test', role: 'user', blockedAt: '',
        telegramId: '', telegramOidcId: '', telegramUsername: 'contact_only', contactTelegram: 'contact_only', photoUrl: '',
        hasTelegramIdentity: false, hasContactOnly: true, canBeChecked: false, hasAccess: false, telegramHasAccess: false,
        accessState: 'contact-only', source: 'profile', message: 'Нужна привязка Telegram', checkedAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-07-11T00:00:00.000Z', stale: true, entitlements: {}, chats: [], boostyHasAccess: false,
        createdAt: '2026-07-02T00:00:00.000Z', userUpdatedAt: '2026-07-11T00:00:00.000Z',
      },
    ],
    fetchedAt: '2026-07-11T00:00:00.000Z',
  },
  '/api/admin/users': {
    users: [
      {
        id: 'qa-user-1',
        profileId: 'QA-0001',
        name: 'Первый пользователь',
        email: 'first@example.test',
        role: 'user',
        country: 'RU',
        telegramUsername: 'first_user',
        contactVkUrl: '',
        contactTelegram: '@first_user',
        contactEmail: 'first@example.test',
        lifetimeAccess: false,
        subscription: { hasAccess: true, source: 'qa', checkedAt: '2026-07-11T00:00:00.000Z' },
        contestEntriesCount: 2,
        createdAt: '2026-07-01T00:00:00.000Z',
      },
      {
        id: 'qa-user-2',
        profileId: 'QA-0002',
        name: 'Заблокированный пользователь',
        email: 'blocked@example.test',
        role: 'user',
        country: 'KZ',
        telegramUsername: '',
        contactVkUrl: '',
        contactTelegram: '',
        contactEmail: 'blocked@example.test',
        lifetimeAccess: false,
        blockedAt: '2026-07-10T00:00:00.000Z',
        subscription: { hasAccess: false, source: 'qa', checkedAt: '2026-07-11T00:00:00.000Z' },
        contestEntriesCount: 0,
        createdAt: '2026-07-02T00:00:00.000Z',
      },
    ],
    total: 2,
  },
  '/api/admin/mailings/overview': {
    campaigns: [{
      id: 'mailing-qa-1', subject: 'Прошлая рассылка', preheader: 'Архив', templateKey: 'blank', segment: 'active',
      status: 'completed', recipientCount: 3, acceptedCount: 3, failedCount: 0, skippedCount: 0,
      createdAt: '2026-07-10T00:00:00.000Z', startedAt: '2026-07-10T00:01:00.000Z', completedAt: '2026-07-10T00:02:00.000Z', error: '',
    }],
    templates: [{
      id: 'latest-article', label: 'Свежая статья', description: 'Анонс нового материала',
      subject: 'Новая статья Manacost', preheader: 'Читайте свежий материал', htmlBody: '<h2>Новая статья</h2><p>Текст анонса.</p>',
    }],
    contacts: [{
      id: 'mail-contact-1', email: 'reader@example.test', name: 'Читатель', consentStatus: 'subscribed', consentSource: 'profile',
      lifecycle: 'active', accountState: 'current', eligible: true, updatedAt: '2026-07-11T00:00:00.000Z',
    }],
    summary: { total: 4, eligible: 3, active: 2, former: 1, excluded: 1, unsubscribed: 1, pendingConsent: 0, suppressed: 0 },
    transport: { configured: true, from: 'Manacost <news@example.test>' },
  },
  '/api/admin/mailings/preview': {
    html: '<!doctype html><html lang="ru"><body><h1>Предпросмотр QA</h1></body></html>',
    recipientCount: 3,
    sanitizedHtmlBody: '<h1>Предпросмотр QA</h1>',
    previewDigest: 'qa-preview-digest',
  },
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

async function mockApplicationApi(page, { authenticated, admin = false, adminState = {} }) {
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === '/api/auth/me') {
      request.respond(jsonResponse(authenticated ? {
        user: {
          id: admin ? 'qa-admin' : 'qa-subscriber',
          profileId: admin ? 'qa-admin' : 'qa-subscriber',
          email: 'qa@example.test',
          name: admin ? 'QA Administrator' : 'QA Subscriber',
          role: admin ? 'admin' : 'user',
          adminAllowed: admin,
          contestAdminAllowed: admin,
          photoUrl: '/__qa_missing_avatar__.png',
        },
      } : { user: null }));
      return;
    }
    if (url.pathname === '/api/subscription/status' || url.pathname === '/api/subscription/refresh') {
      request.respond(jsonResponse(subscriber));
      return;
    }
    if (admin && adminState.galleryEmpty && url.pathname === '/api/admin/gallery') {
      request.respond(jsonResponse({ items: [] }));
      return;
    }
    if (admin && adminFixtures[url.pathname]) {
      request.respond(jsonResponse(adminFixtures[url.pathname]));
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

// Full-admin dashboard: deterministic KPI rendering, empty state, quick
// navigation, responsive layout and accessibility after component extraction.
for (const [device, viewport] of [
  ['desktop', { width: 1440, height: 900 }],
  ['mobile', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
]) {
  const page = await createQaPage();
  const runtimeErrors = collectRuntimeErrors(page);
  const adminState = { galleryEmpty: false };
  await page.setViewport(viewport);
  await mockApplicationApi(page, { authenticated: true, admin: true, adminState });
  try {
    await page.goto(`${BASE}/?admin&section=dashboard`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('.admin-stat-grid', { timeout: 20_000 });
    await page.waitForFunction(() => {
      const cards = [...document.querySelectorAll('.admin-stat-grid > div')];
      return cards.length === 4
        && cards[0]?.querySelector('strong')?.textContent?.trim() === '2'
        && cards[1]?.querySelector('strong')?.textContent?.trim() === '4'
        && cards[2]?.querySelector('small')?.textContent?.includes('3 заявок')
        && cards[3]?.querySelector('small')?.textContent?.includes('7 переходов');
    });
    const state = await page.evaluate(() => {
      const root = document.documentElement;
      const stats = [...document.querySelectorAll('.admin-stat-grid > div')].map(element => ({
        label: element.querySelector('span')?.textContent?.trim() || '',
        value: element.querySelector('strong')?.textContent?.trim() || '',
        detail: element.querySelector('small')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      }));
      const quickActions = [...document.querySelectorAll('.admin-quick-actions button')].map(element => element.textContent?.trim() || '');
      return {
        stats,
        quickActions,
        emptyClicksStatus: document.querySelector('.admin-referral-clicks [role="status"]')?.textContent?.trim() || '',
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
      };
    });
    if (state.stats.length !== 4) failures.push(`admin dashboard [${device}]: expected 4 KPI cards, got ${state.stats.length}`);
    const expectedStats = [
      { label: 'Контент', value: '2', detail: 'статей · 1 артов' },
      { label: 'Аудитория', value: '4', detail: 'платных Boosty · Telegram 1' },
      { label: 'Конкурсы', value: '1', detail: '3 заявок' },
      { label: 'Кампании', value: '1', detail: '7 переходов' },
    ];
    for (const [index, expected] of expectedStats.entries()) {
      if (JSON.stringify(state.stats[index]) !== JSON.stringify(expected)) {
        failures.push(`admin dashboard [${device}]: KPI ${index + 1} mismatch ${JSON.stringify(state.stats[index])}`);
      }
    }
    if (state.quickActions.length !== 8) failures.push(`admin dashboard [${device}]: expected 8 quick actions, got ${state.quickActions.length}`);
    if (!state.emptyClicksStatus.includes('Переходов пока нет')) failures.push(`admin dashboard [${device}]: recent-click empty state is not exposed`);
    if (state.scrollWidth > state.clientWidth + 1) failures.push(`admin dashboard [${device}]: horizontal overflow ${state.scrollWidth} > ${state.clientWidth}`);
    const violationCount = await auditAccessibility(page, `admin dashboard [${device}]`, '.admin-workspace-content');
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('.admin-quick-actions button')]
        .find(element => element.textContent?.trim() === 'Добавить статью');
      if (!(button instanceof HTMLButtonElement)) throw new Error('Add article quick action is missing');
      button.click();
    });
    await page.waitForFunction(() => document.querySelector('#admin-section-title')?.textContent?.trim() === 'Статьи');
    if (!new URL(page.url()).searchParams.has('section') || !page.url().includes('section=articles')) {
      failures.push(`admin dashboard [${device}]: quick navigation did not update URL`);
    }
    await page.waitForFunction(() => document.querySelectorAll('.admin-article-row').length === 2);
    await page.click('.admin-article-row button:not(.admin-danger-button)');
    await page.waitForFunction(() => document.querySelector('.admin-article-form h2')?.textContent?.trim() === 'Редактирование статьи');
    const editedArticleTitle = await page.$eval('.admin-article-form input[required]', element => element.value);
    if (editedArticleTitle !== 'Первая статья') failures.push(`admin articles [${device}]: edit did not populate the form`);
    await page.click('.admin-article-form .contest-secondary-button');
    await page.waitForFunction(() => document.querySelector('.admin-article-form h2')?.textContent?.trim() === 'Новая статья');
    const articleSearch = await page.$('.admin-list-toolbar input');
    if (!articleSearch) throw new Error('Article search input is missing');
    await articleSearch.type('несуществующий материал');
    await page.waitForFunction(() => document.querySelectorAll('.admin-article-row').length === 0);
    const articleEmptyState = await page.$eval('.admin-article-list [role="status"]', element => element.textContent?.trim() || '');
    if (!articleEmptyState.includes('ничего не найдено')) failures.push(`admin articles [${device}]: filtered empty state is missing`);
    const articleLayout = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (articleLayout.scrollWidth > articleLayout.clientWidth + 1) {
      failures.push(`admin articles [${device}]: horizontal overflow ${articleLayout.scrollWidth} > ${articleLayout.clientWidth}`);
    }
    const articlesViolationCount = await auditAccessibility(page, `admin articles [${device}]`, '.admin-workspace-content');

    await page.goto(`${BASE}/?admin&section=gallery`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForFunction(() => document.querySelectorAll('.admin-gallery-row').length === 1);
    await page.type('.admin-gallery-form input:not([type="file"])', 'Новый контрольный арт');
    const galleryFileInput = await page.$('.admin-gallery-form input[type="file"]');
    if (!galleryFileInput) throw new Error('Gallery file input is missing');
    await galleryFileInput.uploadFile(`${process.cwd()}/public/favicon-192.png`);
    await page.waitForFunction(() => document.querySelector('.admin-gallery-selected')?.textContent?.includes('favicon-192.png'));
    await page.click('.admin-gallery-form button[type="submit"]');
    await page.waitForFunction(() => {
      const title = document.querySelector('.admin-gallery-form input:not([type="file"])');
      return title?.value === '' && !document.querySelector('.admin-gallery-selected');
    });
    const galleryLayout = await page.evaluate(() => ({
      rows: document.querySelectorAll('.admin-gallery-row').length,
      downloadHref: document.querySelector('.admin-gallery-actions a')?.getAttribute('href') || '',
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (galleryLayout.rows !== 1 || galleryLayout.downloadHref !== '/favicon-192.png') {
      failures.push(`admin gallery [${device}]: upload/list fixture did not render correctly`);
    }
    if (galleryLayout.scrollWidth > galleryLayout.clientWidth + 1) {
      failures.push(`admin gallery [${device}]: horizontal overflow ${galleryLayout.scrollWidth} > ${galleryLayout.clientWidth}`);
    }
    adminState.galleryEmpty = true;
    await page.click('.admin-gallery-layout .contest-secondary-button');
    await page.waitForFunction(() => document.querySelectorAll('.admin-gallery-row').length === 0);
    const galleryEmptyState = await page.$eval('.admin-gallery-list [role="status"]', element => element.textContent?.trim() || '');
    if (!galleryEmptyState.includes('пока нет артов')) failures.push(`admin gallery [${device}]: empty state is missing`);
    const galleryViolationCount = await auditAccessibility(page, `admin gallery [${device}]`, '.admin-workspace-content');

    await page.goto(`${BASE}/?admin&section=boosty`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForFunction(() => document.querySelectorAll('.admin-boosty-row').length === 2);
    const boostyState = await page.evaluate(() => ({
      rows: document.querySelectorAll('.admin-boosty-row').length,
      stats: [...document.querySelectorAll('.admin-boosty-stats strong')].map(element => element.textContent?.trim() || ''),
      apiStatus: document.querySelector('.admin-boosty-status strong')?.textContent?.trim() || '',
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (boostyState.rows !== 2 || boostyState.stats.join(',') !== '2,2,1,1' || !boostyState.apiStatus.includes('работает')) {
      failures.push(`admin Boosty [${device}]: deterministic status, KPI or subscriber list did not render`);
    }
    if (boostyState.scrollWidth > boostyState.clientWidth + 1) {
      failures.push(`admin Boosty [${device}]: horizontal overflow ${boostyState.scrollWidth} > ${boostyState.clientWidth}`);
    }
    await page.select('.admin-boosty-filters label:last-child select', 'inactive');
    await page.waitForFunction(() => document.querySelectorAll('.admin-boosty-row').length === 1);
    await page.type('.admin-boosty-filters input', 'нет такого подписчика');
    await page.waitForFunction(() => document.querySelectorAll('.admin-boosty-row').length === 0);
    const boostyEmptyState = await page.$eval('.admin-boosty-list [role="status"]', element => element.textContent?.trim() || '');
    if (!boostyEmptyState.includes('не найдены')) failures.push(`admin Boosty [${device}]: filtered empty state is missing`);
    const boostyViolationCount = await auditAccessibility(page, `admin Boosty [${device}]`, '.admin-workspace-content');

    await page.goto(`${BASE}/?admin&section=telegram`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForFunction(() => document.querySelectorAll('.admin-telegram-row').length === 2);
    const telegramState = await page.evaluate(() => ({
      rows: document.querySelectorAll('.admin-telegram-row').length,
      stats: [...document.querySelectorAll('.admin-telegram-stats strong')].map(element => element.textContent?.trim() || ''),
      botStatus: document.querySelector('.admin-telegram-status strong')?.textContent?.trim() || '',
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (telegramState.rows !== 2 || telegramState.stats.join(',') !== '2,1,1,1' || !telegramState.botStatus.includes('настроен')) {
      failures.push(`admin Telegram [${device}]: deterministic status, KPI or account list did not render`);
    }
    if (telegramState.scrollWidth > telegramState.clientWidth + 1) {
      failures.push(`admin Telegram [${device}]: horizontal overflow ${telegramState.scrollWidth} > ${telegramState.clientWidth}`);
    }
    await page.select('.admin-telegram-filters select', 'contact-only');
    await page.waitForFunction(() => document.querySelectorAll('.admin-telegram-row').length === 1);
    await page.type('.admin-telegram-filters input', 'нет такого аккаунта');
    await page.waitForFunction(() => document.querySelectorAll('.admin-telegram-row').length === 0);
    const telegramEmptyState = await page.$eval('.admin-telegram-list [role="status"]', element => element.textContent?.trim() || '');
    if (!telegramEmptyState.includes('не найдены')) failures.push(`admin Telegram [${device}]: filtered empty state is missing`);
    const telegramViolationCount = await auditAccessibility(page, `admin Telegram [${device}]`, '.admin-workspace-content');

    await page.goto(`${BASE}/?admin&section=mailing`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForFunction(() => document.querySelectorAll('.admin-mailing-template-grid button').length === 1);
    await page.waitForFunction(() => document.querySelector('.admin-mailing-preview-stage iframe'));
    const mailingInitial = await page.evaluate(() => ({
      stats: [...document.querySelectorAll('.admin-mailing-stats strong')].map(element => element.textContent?.trim() || ''),
      campaigns: document.querySelectorAll('.admin-mailing-history > div').length,
      contacts: document.querySelectorAll('.admin-mailing-contacts > div').length,
      previewCount: document.querySelector('.admin-mailing-preview-meta strong')?.textContent?.trim() || '',
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (mailingInitial.stats.join(',') !== '3,2,1,1' || mailingInitial.campaigns !== 1 || mailingInitial.contacts !== 1 || mailingInitial.previewCount !== '3') {
      failures.push(`admin mailing [${device}]: KPI, preview, history or contacts fixture did not render`);
    }
    if (mailingInitial.scrollWidth > mailingInitial.clientWidth + 1) {
      failures.push(`admin mailing [${device}]: horizontal overflow ${mailingInitial.scrollWidth} > ${mailingInitial.clientWidth}`);
    }
    await page.click('.admin-mailing-template-grid button');
    await page.waitForFunction(() => document.querySelector('.admin-mailing-field input')?.value === 'Новая статья Manacost');
    await page.click('.admin-mailing-preview-toolbar fieldset button:last-child');
    const mobilePreviewSelected = await page.$eval('.admin-mailing-preview-stage', element => element.classList.contains('is-mobile'));
    if (!mobilePreviewSelected) failures.push(`admin mailing [${device}]: mobile preview mode did not activate`);
    const mailingViolationCount = await auditAccessibility(page, `admin mailing [${device}]`, '.admin-workspace-content');

    await page.goto(`${BASE}/?admin&section=users`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForFunction(() => document.querySelectorAll('.contest-user-row').length === 2);
    const usersState = await page.evaluate(() => ({
      rows: document.querySelectorAll('.contest-user-row').length,
      summary: document.querySelector('.contest-users-head .contest-muted')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (usersState.rows !== 2 || !usersState.summary.includes('Показано 2 из 2')) {
      failures.push(`admin users [${device}]: deterministic user list did not render`);
    }
    if (usersState.scrollWidth > usersState.clientWidth + 1) {
      failures.push(`admin users [${device}]: horizontal overflow ${usersState.scrollWidth} > ${usersState.clientWidth}`);
    }
    await page.click('.contest-user-menu-trigger');
    await page.waitForSelector('.contest-user-menu[role="menu"]', { visible: true });
    await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'menuitem');
    await page.keyboard.press('ArrowDown');
    const focusedMenuItem = await page.evaluate(() => document.activeElement?.textContent?.replace(/\s+/g, ' ').trim() || '');
    if (!focusedMenuItem.includes('Сделать администратором')) {
      failures.push(`admin users [${device}]: ArrowDown did not move focus to the next menu action`);
    }
    const usersViolationCount = await auditAccessibility(page, `admin users menu [${device}]`, '.admin-workspace-content');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.contest-user-menu'));
    const focusRestored = await page.evaluate(() => document.activeElement?.classList.contains('contest-user-menu-trigger') === true);
    if (!focusRestored) failures.push(`admin users [${device}]: Escape did not restore focus to the action trigger`);
    if (runtimeErrors.length) failures.push(`admin dashboard [${device}]: ${runtimeErrors.join(' | ')}`);
    await page.screenshot({ path: `${OUT}/admin-dashboard-${device}.png`, fullPage: false });
    console.log(`✓ admin dashboard/articles/gallery/Boosty/Telegram/mailing/users [${device}] interactions + axe (${violationCount + articlesViolationCount + galleryViolationCount + boostyViolationCount + telegramViolationCount + mailingViolationCount + usersViolationCount} violations)`);
  } catch (error) {
    const diagnostic = await page.evaluate(() => document.body?.innerText.slice(0, 320).replace(/\s+/g, ' ') || 'empty body').catch(() => 'unavailable body');
    failures.push(`admin dashboard [${device}]: ${error.message}; page: ${diagnostic}`);
  } finally {
    await page.close();
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
    await page.waitForSelector('.home-faq-zone');
    const homeCssState = await page.evaluate(() => {
      const hrefs = [...document.styleSheets].map(sheet => sheet.href || '');
      return {
        routeCssLoaded: hrefs.some(href => href.includes('/assets/route-parchment-')),
        deferredRoutesCssLoaded: hrefs.some(href => href.includes('/assets/DeferredRoutes-') && href.endsWith('.css')),
        arenaCss: hrefs.some(href => href.includes('/assets/HomeArenaDirectory-')),
        battlegroundsCss: hrefs.some(href => href.includes('/assets/HomeBattlegrounds-')),
        articlesCss: hrefs.some(href => href.includes('/assets/HomeLatestArticles-')),
        faqCss: hrefs.some(href => href.includes('/assets/FAQSection-')),
        supportCss: hrefs.some(href => href.includes('/assets/SupportPrompt-')),
        footerCss: hrefs.some(href => href.includes('/assets/SiteFooter-')),
        footerMarkup: Boolean(document.querySelector('.arena-footer')),
      };
    });
    if (homeCssState.routeCssLoaded) failures.push('home lazy sections: route-only parchment CSS leaked into the initial home route');
    if (homeCssState.deferredRoutesCssLoaded) failures.push('home lazy sections: deferred route-owner CSS leaked into the initial home route');
    if (!homeCssState.arenaCss || !homeCssState.battlegroundsCss || !homeCssState.articlesCss) failures.push('home lazy sections: one or more owner CSS chunks did not load');
    if (!homeCssState.faqCss) failures.push('home lazy sections: FAQ owner CSS did not load');
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
