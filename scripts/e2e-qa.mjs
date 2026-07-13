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
  '/api/admin/contests/qa-contest/entries': {
    entries: [
      {
        id: 'entry-qa-1', contestId: 'qa-contest', userId: 'user-qa-1', profileId: 'PROFILE-001', name: 'Одобренный участник',
        email: 'winner@example.test', status: 'approved', createdAt: '2026-07-11T01:00:00.000Z',
        contact: { telegram: '@winner' }, subscription: { hasAccess: true }, profileContacts: { vk: 'vk.com/winner', telegram: '@winner' },
      },
      {
        id: 'entry-qa-2', contestId: 'qa-contest', userId: 'user-qa-2', profileId: 'PROFILE-002', name: 'Участник на проверке',
        email: 'pending@example.test', status: 'pending', createdAt: '2026-07-11T02:00:00.000Z',
        contact: {}, subscription: { hasAccess: true }, profileContacts: {},
      },
    ],
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
    if (admin && adminState.boostyFailure && url.pathname === '/api/admin/boosty/status') {
      request.respond({
        ...jsonResponse({
          configured: true,
          ok: false,
          importStatus: 'error',
          source: 'unavailable',
          stale: true,
          lastErrorMessage: 'Boosty API временно недоступен.',
          warnings: ['boosty-api-unavailable'],
          summary: {},
          checkedAt: '2026-07-13T03:00:00.000Z',
        }),
        status: 502,
      });
      return;
    }
    if (admin && adminState.boostyFailure && url.pathname === '/api/admin/boosty/subscribers') {
      request.respond({
        ...jsonResponse({
          configured: true,
          source: 'unavailable',
          stale: true,
          subscribers: [],
          summary: {},
          levels: {},
          fetchedAt: '2026-07-13T03:00:00.000Z',
          error: 'Не удалось загрузить подписчиков Boosty',
        }),
        status: 502,
      });
      return;
    }
    if (admin && url.pathname === '/api/articles') {
      request.respond(jsonResponse({ articles: adminState.articles ?? adminFixtures['/api/articles'].articles }));
      return;
    }
    if (admin && url.pathname === '/api/admin-articles') {
      const payload = JSON.parse(request.postData() || '{}');
      const articles = adminState.articles ??= structuredClone(adminFixtures['/api/articles'].articles);
      if (request.method() === 'POST') {
        const article = { id: 'qa-created-article', ...payload.article };
        articles.unshift(article);
        request.respond(jsonResponse({ success: true, article }));
        return;
      }
      if (request.method() === 'PATCH') {
        const index = articles.findIndex(article => article.id === payload.id);
        const article = { ...articles[index], ...payload.article, id: payload.id };
        if (index >= 0) articles[index] = article;
        request.respond(jsonResponse({ success: true, article }));
        return;
      }
      if (request.method() === 'DELETE') {
        adminState.articles = articles.filter(article => article.id !== payload.id);
        request.respond(jsonResponse({ success: true }));
        return;
      }
    }
    if (admin && url.pathname === '/api/admin/contests') {
      const contests = adminState.contests ??= structuredClone(adminFixtures['/api/admin/contests'].contests);
      if (request.method() === 'GET') {
        request.respond(jsonResponse({ contests }));
        return;
      }
      if (request.method() === 'POST') {
        const payload = JSON.parse(request.postData() || '{}');
        const id = payload.id || 'qa-created-contest';
        const index = contests.findIndex(contest => contest.id === id);
        const contest = {
          ...(index >= 0 ? contests[index] : { entriesCount: 0, winners: [] }),
          ...payload,
          id,
        };
        if (index >= 0) contests[index] = contest;
        else contests.unshift(contest);
        request.respond(jsonResponse({ success: true, contest }));
        return;
      }
    }
    const contestEntriesMatch = admin && url.pathname.match(/^\/api\/admin\/contests\/([^/]+)\/entries$/);
    if (contestEntriesMatch) {
      const entries = contestEntriesMatch[1] === 'qa-contest'
        ? adminFixtures['/api/admin/contests/qa-contest/entries'].entries
        : [];
      request.respond(jsonResponse({ entries }));
      return;
    }
    const contestWinnersMatch = admin && url.pathname.match(/^\/api\/admin\/contests\/([^/]+)\/winners$/);
    if (contestWinnersMatch && request.method() === 'POST') {
      const payload = JSON.parse(request.postData() || '{}');
      const contests = adminState.contests ??= structuredClone(adminFixtures['/api/admin/contests'].contests);
      const contest = contests.find(item => item.id === contestWinnersMatch[1]);
      if (contest) {
        contest.winners = payload.winners;
        contest.status = 'completed';
      }
      request.respond(jsonResponse({ success: true, contest }));
      return;
    }
    const contestDeleteMatch = admin && url.pathname.match(/^\/api\/admin\/contests\/([^/]+)$/);
    if (contestDeleteMatch && request.method() === 'DELETE') {
      const contests = adminState.contests ??= structuredClone(adminFixtures['/api/admin/contests'].contests);
      adminState.contests = contests.filter(contest => contest.id !== contestDeleteMatch[1]);
      request.respond(jsonResponse({ success: true, deletedId: contestDeleteMatch[1] }));
      return;
    }
    if (admin && url.pathname === '/api/admin/users' && request.method() === 'GET') {
      const users = adminState.users ??= structuredClone(adminFixtures['/api/admin/users'].users);
      request.respond(jsonResponse({ users, total: users.length }));
      return;
    }
    const adminUserMatch = admin && url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (adminUserMatch && request.method() === 'PATCH') {
      const users = adminState.users ??= structuredClone(adminFixtures['/api/admin/users'].users);
      const user = users.find(item => item.id === decodeURIComponent(adminUserMatch[1]));
      const payload = JSON.parse(request.postData() || '{}');
      if (user) {
        if (payload.role === 'admin' || payload.role === 'user') user.role = payload.role;
        if (typeof payload.blocked === 'boolean') user.blockedAt = payload.blocked ? '2026-07-13T02:00:00.000Z' : '';
        if (typeof payload.lifetimeAccess === 'boolean') user.lifetimeAccess = payload.lifetimeAccess;
      }
      request.respond(jsonResponse({ success: true, user, lifetimeAccess: Boolean(user?.lifetimeAccess) }));
      return;
    }
    if (admin && url.pathname === '/api/admin/mailings/overview' && request.method() === 'GET') {
      const overview = structuredClone(adminFixtures['/api/admin/mailings/overview']);
      overview.campaigns = adminState.mailingCampaigns ??= structuredClone(overview.campaigns);
      request.respond(jsonResponse(overview));
      return;
    }
    if (admin && url.pathname === '/api/admin/mailings/test' && request.method() === 'POST') {
      request.respond(jsonResponse({ success: true, message: 'Тестовое письмо принято для qa@example.test' }));
      return;
    }
    if (admin && url.pathname === '/api/admin/mailings/send' && request.method() === 'POST') {
      const payload = JSON.parse(request.postData() || '{}');
      const campaigns = adminState.mailingCampaigns ??= structuredClone(adminFixtures['/api/admin/mailings/overview'].campaigns);
      campaigns.unshift({
        id: 'mailing-qa-created', subject: payload.subject, preheader: payload.preheader || '', templateKey: payload.templateKey || 'custom',
        segment: payload.segment || 'all-consented', status: 'queued', recipientCount: payload.expectedRecipients,
        acceptedCount: 0, failedCount: 0, skippedCount: 0, createdAt: '2026-07-13T03:00:00.000Z', startedAt: '', completedAt: '', error: '',
      });
      request.respond({ ...jsonResponse({ success: true, campaign: campaigns[0] }), status: 202 });
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
    const contentStyle = content ? getComputedStyle(content) : null;
    const workspace = document.querySelector('.arena-workspace');
    const workspaceRect = workspace?.getBoundingClientRect();
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
      wideWorkspace: content?.classList.contains('arena-content-wide') || false,
      workspaceRight: workspaceRect?.right || 0,
      contentMinWidth: contentStyle?.minWidth || '',
      shellOpacity: shellStyle?.opacity || null,
      shellFilter: shellStyle?.filter || null,
      routeParchmentExpected,
      routeParchmentLoaded,
      battlegroundsSurface: shell?.classList.contains('arena-app-battlegrounds') || false,
      battlegroundsBackground: shellStyle?.backgroundImage || '',
      battlegroundsSign: content ? getComputedStyle(content, '::before').backgroundImage : '',
      contentPadding: contentStyle?.padding || '',
      contentBorder: contentStyle?.borderTopWidth || '',
      contentRadius: contentStyle?.borderRadius || '',
      contentBackgroundColor: contentStyle?.backgroundColor || '',
      contentBackgroundImage: contentStyle?.backgroundImage || '',
      contentShadow: contentStyle?.boxShadow || '',
      contentFilter: contentStyle?.filter || '',
      contentBackdrop: contentStyle?.backdropFilter || '',
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
  if (layout.scrollWidth > layout.clientWidth + 1) {
    failures.push(`${path}: horizontal overflow ${layout.scrollWidth} > ${layout.clientWidth}`);
  }
  if (!layout.mobile && layout.wideWorkspace && (
    Math.abs(layout.workspaceRight - layout.clientWidth) > 0.5
    || layout.contentMinWidth !== '0px'
  )) {
    failures.push(`${path}: desktop full-width canvas escaped the workspace (${JSON.stringify({
      workspaceRight: layout.workspaceRight,
      viewportRight: layout.clientWidth,
      contentMinWidth: layout.contentMinWidth,
    })})`);
  }
  if (layout.shellOpacity !== '1') failures.push(`${path}: app shell opacity is ${layout.shellOpacity}`);
  if (layout.shellFilter && layout.shellFilter !== 'none') failures.push(`${path}: app shell filter is ${layout.shellFilter}`);
  if (layout.routeParchmentExpected && !layout.routeParchmentLoaded) failures.push(`${path}: route-owned parchment CSS was not loaded`);
  if (layout.routeParchmentExpected && (
    layout.contentBorder !== '0px'
    || layout.contentRadius !== '0px'
    || layout.contentShadow !== 'none'
    || layout.contentFilter !== 'none'
  )) {
    failures.push(`${path}: public content canvas fell back to the legacy dashboard frame (${JSON.stringify({
      border: layout.contentBorder,
      radius: layout.contentRadius,
      shadow: layout.contentShadow,
      filter: layout.contentFilter,
    })})`);
  }
  if (layout.routeParchmentExpected && !layout.battlegroundsSurface && (
    layout.contentBackgroundColor !== 'rgba(0, 0, 0, 0)'
    || layout.contentBackgroundImage !== 'none'
    || layout.contentBackdrop !== 'none'
  )) {
    failures.push(`${path}: editorial/game-data canvas inherited the legacy blue surface (${JSON.stringify({
      backgroundColor: layout.contentBackgroundColor,
      backgroundImage: layout.contentBackgroundImage,
      backdrop: layout.contentBackdrop,
    })})`);
  }
  if (layout.routeParchmentExpected && !layout.battlegroundsSurface) {
    const expectedPadding = layout.mobile ? '16px 12.8px 40px' : '36px 40.32px 56px';
    if (layout.contentPadding !== expectedPadding) {
      failures.push(`${path}: route content padding changed (${layout.contentPadding}; expected ${expectedPadding})`);
    }
  }
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
  const adminState = {
    galleryEmpty: false,
    boostyFailure: false,
    articles: structuredClone(adminFixtures['/api/articles'].articles),
    contests: structuredClone(adminFixtures['/api/admin/contests'].contests),
    users: structuredClone(adminFixtures['/api/admin/users'].users),
    mailingCampaigns: structuredClone(adminFixtures['/api/admin/mailings/overview'].campaigns),
  };
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
      const shell = document.querySelector('.bg-wood');
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
        shellAfterBackground: shell ? getComputedStyle(shell, '::after').backgroundImage : '',
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
    if (state.shellAfterBackground === 'none' || !state.shellAfterBackground.includes('linear-gradient')) {
      failures.push(`admin dashboard [${device}]: admin shell background overlay was lost`);
    }
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
    await page.click('.admin-article-form input[required]', { clickCount: 3 });
    await page.type('.admin-article-form input[required]', 'Первая статья — обновлена');
    await page.click('.admin-article-form button[type="submit"]');
    await page.waitForFunction(() => document.querySelector('.admin-toast')?.textContent?.includes('Статья обновлена.'));
    await page.waitForFunction(() => [...document.querySelectorAll('.admin-article-row strong')]
      .some(element => element.textContent?.trim() === 'Первая статья — обновлена'));

    await page.type('.admin-article-form input[required]', 'Новая QA статья');
    await page.click('.admin-article-form button[type="submit"]');
    await page.waitForFunction(() => document.querySelector('.admin-toast')?.textContent?.includes('Статья добавлена.'));
    await page.waitForFunction(() => document.querySelectorAll('.admin-article-row').length === 3);
    await page.evaluate(() => { window.confirm = () => true; });
    await page.evaluate(() => {
      const row = [...document.querySelectorAll('.admin-article-row')]
        .find(element => element.querySelector('strong')?.textContent?.trim() === 'Новая QA статья');
      const button = row?.querySelector('.admin-danger-button');
      if (!(button instanceof HTMLButtonElement)) throw new Error('Created article delete action is missing');
      button.click();
    });
    await page.waitForFunction(() => document.querySelector('.admin-toast')?.textContent?.includes('Статья удалена.'));
    await page.waitForFunction(() => document.querySelectorAll('.admin-article-row').length === 2);

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
    adminState.boostyFailure = true;
    await page.click('.contest-users-head .contest-secondary-button');
    await page.waitForFunction(() => {
      const text = document.querySelector('.admin-workspace-content')?.textContent || '';
      return text.includes('Boosty API: ошибка') && text.includes('Не удалось загрузить подписчиков Boosty');
    });
    const boostyFailureState = await page.$eval('.admin-workspace-content', element => ({
      text: element.textContent?.replace(/\s+/g, ' ').trim() || '',
      rows: element.querySelectorAll('.admin-boosty-row').length,
      alerts: element.querySelectorAll('[role="alert"]').length,
    }));
    if (boostyFailureState.rows !== 0
      || boostyFailureState.alerts < 1
      || /private|127\.0\.0\.1|token/i.test(boostyFailureState.text)) {
      failures.push(`admin Boosty [${device}]: upstream failure fallback is unsafe or incomplete (${JSON.stringify(boostyFailureState)})`);
    }
    adminState.boostyFailure = false;

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
    await page.evaluate(() => { window.confirm = () => true; });
    await page.click('.admin-mailing-actions button:nth-child(2)');
    await page.waitForFunction(() => document.querySelector('.admin-toast')?.textContent?.includes('Тестовое письмо принято'));
    await page.click('.admin-mailing-actions button:nth-child(3)');
    await page.waitForFunction(() => document.querySelector('.admin-toast')?.textContent?.includes('Рассылка поставлена в очередь'));
    await page.waitForFunction(() => document.querySelectorAll('.admin-mailing-history > div').length === 2);
    const mailingViolationCount = await auditAccessibility(page, `admin mailing [${device}]`, '.admin-workspace-content');

    await page.goto(`${BASE}/?admin&section=contests`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForFunction(() => document.querySelectorAll('.contest-entry-row').length === 2);
    const contestsState = await page.evaluate(() => ({
      summaryButtons: document.querySelectorAll('.admin-contest-summary-grid button').length,
      selectedTitle: document.querySelector('.admin-selected-contest h3')?.textContent?.trim() || '',
      entries: document.querySelectorAll('.contest-entry-row').length,
      disabledEntries: document.querySelectorAll('.contest-entry-row input:disabled').length,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (contestsState.summaryButtons !== 6 || contestsState.selectedTitle !== 'Контрольный конкурс' || contestsState.entries !== 2 || contestsState.disabledEntries !== 1) {
      failures.push(`admin contests [${device}]: summary, selection or entries fixture did not render`);
    }
    if (contestsState.scrollWidth > contestsState.clientWidth + 1) {
      failures.push(`admin contests [${device}]: horizontal overflow ${contestsState.scrollWidth} > ${contestsState.clientWidth}`);
    }
    await page.click('.contest-entry-row:not(.is-disabled) input[type="checkbox"]');
    await page.waitForFunction(() => document.querySelector('.admin-winner-publish button')?.disabled === false);
    await page.evaluate(() => { window.confirm = () => true; });
    await page.click('.admin-winner-publish button');
    await page.waitForFunction(() => document.querySelector('.admin-toast')?.textContent?.includes('Победители опубликованы.'));
    await page.waitForFunction(() => document.querySelector('.admin-selected-contest .admin-status-badge')?.textContent?.includes('Завершен'));

    await page.click('.admin-form-actions .contest-secondary-button');
    await page.waitForFunction(() => document.querySelector('.admin-contest-form h2')?.textContent?.includes('Редактирование'));
    const contestEditorState = await page.evaluate(() => ({
      title: document.querySelector('.admin-contest-form input:not([type="datetime-local"]):not([type="file"])')?.value || '',
      previewTitle: document.querySelector('.admin-contest-preview-card h3')?.textContent?.trim() || '',
    }));
    if (contestEditorState.title !== 'Контрольный конкурс' || contestEditorState.previewTitle !== 'Контрольный конкурс') {
      failures.push(`admin contests [${device}]: edit action did not populate form and preview`);
    }
    await page.click('.admin-contest-section:first-of-type input', { clickCount: 3 });
    await page.type('.admin-contest-section:first-of-type input', 'Контрольный конкурс — обновлён');
    await page.click('.admin-contest-submit-row button[type="submit"]');
    await page.waitForFunction(() => document.querySelector('.admin-toast')?.textContent?.includes('Конкурс сохранен.'));
    await page.goto(`${BASE}/?admin&section=contests`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('.admin-contest-manage-card', { timeout: 20_000 });
    await page.waitForFunction(() => [...document.querySelectorAll('.admin-contest-list button strong')]
      .some(element => element.textContent?.trim() === 'Контрольный конкурс — обновлён'));

    await page.click('.admin-contest-manage-card .admin-contest-form-head > button');
    await page.waitForFunction(() => document.querySelector('.admin-contest-form h2')?.textContent?.trim() === 'Новый конкурс');
    const contestMainInputs = await page.$$('.admin-contest-section:first-of-type input');
    if (contestMainInputs.length < 2) throw new Error('Contest title and prize inputs are missing');
    await contestMainInputs[0].type('Новый QA конкурс');
    await contestMainInputs[1].type('QA приз');
    await page.click('.admin-contest-submit-row button[type="submit"]');
    await page.waitForFunction(() => document.querySelector('.admin-toast')?.textContent?.includes('Конкурс сохранен.'));
    await page.goto(`${BASE}/?admin&section=contests`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('.admin-contest-manage-card', { timeout: 20_000 });
    await page.waitForFunction(() => document.querySelectorAll('.admin-contest-list > div').length === 2);
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('.admin-contest-list button')]
        .find(element => element.querySelector('strong')?.textContent?.trim() === 'Новый QA конкурс');
      if (!(button instanceof HTMLButtonElement)) throw new Error('Created contest is missing from manager');
      button.click();
    });
    await page.waitForFunction(() => document.querySelector('.admin-selected-contest h3')?.textContent?.trim() === 'Новый QA конкурс');
    await page.evaluate(() => { window.confirm = () => true; });
    await page.click('.admin-contest-detail .admin-danger-button');
    await page.waitForFunction(() => document.querySelector('.admin-toast')?.textContent?.includes('Конкурс удален.'));
    await page.waitForFunction(() => document.querySelectorAll('.admin-contest-list > div').length === 1);

    await page.click('.admin-contest-summary-grid button:nth-child(6)');
    await page.waitForFunction(() => document.querySelectorAll('.admin-contest-list button').length === 0);
    const contestEmptyState = await page.$eval('.admin-contest-list [role="status"]', element => element.textContent?.trim() || '');
    if (!contestEmptyState.includes('нет')) failures.push(`admin contests [${device}]: filtered empty state is missing`);
    const contestsViolationCount = await auditAccessibility(page, `admin contests [${device}]`, '.admin-workspace-content');

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
    await page.evaluate(() => { window.confirm = () => true; });
    for (const actionText of ['Дать бессрочную подписку', 'Сделать администратором', 'Заблокировать']) {
      await page.click('.contest-user-row:first-child .contest-user-menu-trigger');
      await page.waitForSelector('.contest-user-menu[role="menu"]', { visible: true });
      await page.evaluate(text => {
        const button = [...document.querySelectorAll('.contest-user-menu button[role="menuitem"]')]
          .find(element => element.textContent?.includes(text));
        if (!(button instanceof HTMLButtonElement)) throw new Error(`Missing user action: ${text}`);
        button.click();
      }, actionText);
      await page.waitForFunction(text => {
        const row = document.querySelector('.contest-user-row:first-child');
        if (!row) return false;
        if (text === 'Дать бессрочную подписку') return row.querySelector('.contest-access-ok')?.textContent?.includes('бессрочно');
        if (text === 'Сделать администратором') return row.textContent?.includes('администратор');
        return row.querySelector('.contest-role-blocked')?.textContent?.includes('заблокирован');
      }, {}, actionText);
      await page.waitForFunction(() => !document.querySelector('.contest-user-menu'));
      await page.waitForFunction(() => !document.querySelector('.contest-user-menu-trigger')?.hasAttribute('disabled'));
    }
    await page.goto(`${BASE}/?admin&section=users`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForFunction(() => document.querySelectorAll('.contest-user-row').length === 2);
    const persistedUser = await page.$eval('.contest-user-row:first-child', element => element.textContent?.replace(/\s+/g, ' ').trim() || '');
    if (!persistedUser.includes('администратор') || !persistedUser.includes('заблокирован') || !persistedUser.includes('бессрочно')) {
      failures.push(`admin users [${device}]: role/block/lifetime mutations did not persist after navigation`);
    }
    if (runtimeErrors.length) failures.push(`admin dashboard [${device}]: ${runtimeErrors.join(' | ')}`);
    await page.screenshot({ path: `${OUT}/admin-dashboard-${device}.png`, fullPage: false });
    console.log(`✓ admin dashboard/articles/gallery/Boosty/Telegram/mailing/contests/users [${device}] interactions + axe (${violationCount + articlesViolationCount + galleryViolationCount + boostyViolationCount + telegramViolationCount + mailingViolationCount + contestsViolationCount + usersViolationCount} violations)`);
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
    await page.waitForSelector('#faq-heading');
    await page.waitForSelector('.arena-footer__link');
    const homeLandmarks = await page.evaluate(() => ({
      stage: Boolean(document.querySelector('.home-stage')),
      character: Boolean(document.querySelector('.home-stage__character img')),
      articles: Boolean(document.querySelector('.home-latest-articles')),
      battlegrounds: Boolean(document.querySelector('.home-bg-directory')),
      arena: Boolean(document.querySelector('.home-arena-directory')),
      community: Boolean(document.querySelector('.home-community')),
      faq: Boolean(document.querySelector('#faq-heading')),
      faqIndexHref: document.querySelector('.home-page-index a[href="#faq-heading"]')?.getAttribute('href') || '',
    }));
    if (Object.entries(homeLandmarks).some(([, value]) => value === false) || homeLandmarks.faqIndexHref !== '#faq-heading') {
      failures.push(`home landmarks: one or more primary elements disappeared (${JSON.stringify(homeLandmarks)})`);
    }
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
        footerLinks: [...document.querySelectorAll('.arena-footer__link[href^="/"]')].map(link => link.getAttribute('href')),
      };
    });
    if (homeCssState.routeCssLoaded) failures.push('home lazy sections: route-only parchment CSS leaked into the initial home route');
    if (homeCssState.deferredRoutesCssLoaded) failures.push('home lazy sections: deferred route-owner CSS leaked into the initial home route');
    if (!homeCssState.arenaCss || !homeCssState.battlegroundsCss || !homeCssState.articlesCss) failures.push('home lazy sections: one or more owner CSS chunks did not load');
    if (!homeCssState.faqCss) failures.push('home lazy sections: FAQ owner CSS did not load');
    if (!homeCssState.supportCss) failures.push('home lazy sections: support-prompt owner CSS did not load');
    if (!homeCssState.footerCss || !homeCssState.footerMarkup) failures.push('home lazy sections: site-footer owner or markup did not load');
    const expectedFooterLinks = ['/', '/classes', '/tierlist', '/legendaries', '/articles', '/gallery'];
    if (JSON.stringify(homeCssState.footerLinks) !== JSON.stringify(expectedFooterLinks)) {
      failures.push(`home lazy sections: canonical footer links are incomplete (${homeCssState.footerLinks.join(', ')})`);
    }
    const initiallyVisibleHomeSections = await page.$$eval(
      '.home-latest-articles, .home-bg-directory, .home-arena-directory, .home-community, .home-faq-zone',
      elements => elements.map(element => ({
        classes: element.className,
        opacity: Number(getComputedStyle(element).opacity),
        visibility: getComputedStyle(element).visibility,
      })),
    );
    const hiddenHomeSection = initiallyVisibleHomeSections.find(section => section.opacity < 0.99 || section.visibility !== 'visible');
    if (hiddenHomeSection) {
      failures.push(`home sections: content is hidden before scrolling (${JSON.stringify(hiddenHomeSection)})`);
    }
    const desktopContentCanvas = await page.$eval('.arena-content-open', element => {
      const styles = getComputedStyle(element);
      return {
        maxWidth: styles.maxWidth,
        padding: styles.padding,
        border: styles.borderTopWidth,
        radius: styles.borderRadius,
        color: styles.color,
        backgroundColor: styles.backgroundColor,
        backgroundImage: styles.backgroundImage,
        shadow: styles.boxShadow,
        filter: styles.filter,
        backdrop: styles.backdropFilter,
      };
    });
    if (desktopContentCanvas.maxWidth !== '1480px'
      || desktopContentCanvas.padding !== '34.56px 38.88px 48px'
      || desktopContentCanvas.border !== '0px'
      || desktopContentCanvas.radius !== '0px'
      || desktopContentCanvas.color !== 'rgb(48, 37, 28)'
      || desktopContentCanvas.backgroundColor !== 'rgba(0, 0, 0, 0)'
      || desktopContentCanvas.backgroundImage !== 'none'
      || desktopContentCanvas.shadow !== 'none'
      || desktopContentCanvas.filter !== 'none'
      || desktopContentCanvas.backdrop !== 'none') {
      failures.push(`home content canvas: desktop contract changed (${JSON.stringify(desktopContentCanvas)})`);
    }
    const desktopHeading = await page.$eval('.home-latest-articles .home-section-heading', element => {
      const label = element.querySelector(':scope > div > span');
      const heading = element.querySelector('h2');
      const summary = element.querySelector(':scope > p');
      return {
        marginBottom: getComputedStyle(element).marginBottom,
        labelColor: label ? getComputedStyle(label).color : '',
        headingColor: heading ? getComputedStyle(heading).color : '',
        summaryColor: summary ? getComputedStyle(summary).color : '',
      };
    });
    if (desktopHeading.marginBottom !== '21.6px'
      || desktopHeading.labelColor !== 'rgb(123, 21, 27)'
      || desktopHeading.headingColor !== 'rgb(59, 42, 31)'
      || desktopHeading.summaryColor !== 'rgb(120, 101, 79)') {
      failures.push(`home headings: desktop parchment typography changed (${JSON.stringify(desktopHeading)})`);
    }
    const desktopArenaDirectory = await page.$eval('.home-arena-directory', element => {
      const headingRow = element.querySelector('.home-section-heading');
      const signLabel = element.querySelector('.home-arena-directory__sign > span');
      const signHeading = element.querySelector('.home-arena-directory__sign h2');
      const summary = element.querySelector('.home-section-heading > p');
      const links = element.querySelector('.home-arena-directory__links');
      const linkStyles = links ? getComputedStyle(links) : null;
      return {
        headingMargin: headingRow ? getComputedStyle(headingRow).marginBottom : '',
        labelColor: signLabel ? getComputedStyle(signLabel).color : '',
        labelSize: signLabel ? getComputedStyle(signLabel).fontSize : '',
        headingColor: signHeading ? getComputedStyle(signHeading).color : '',
        headingSize: signHeading ? getComputedStyle(signHeading).fontSize : '',
        summaryColor: summary ? getComputedStyle(summary).color : '',
        summaryMargin: summary ? getComputedStyle(summary).margin : '',
        gridGap: linkStyles?.gap || '',
        gridPadding: linkStyles?.padding || '',
        gridBorder: linkStyles?.borderTopWidth || '',
        gridBackground: linkStyles?.backgroundColor || '',
      };
    });
    if (desktopArenaDirectory.headingMargin !== '16px'
      || desktopArenaDirectory.labelColor !== 'rgb(239, 197, 104)'
      || desktopArenaDirectory.labelSize !== '9.92px'
      || desktopArenaDirectory.headingColor !== 'rgb(255, 240, 200)'
      || desktopArenaDirectory.headingSize !== '29.6px'
      || desktopArenaDirectory.summaryColor !== 'rgb(111, 89, 67)'
      || desktopArenaDirectory.summaryMargin !== '0px'
      || desktopArenaDirectory.gridGap !== '8.8px'
      || desktopArenaDirectory.gridPadding !== '11.2px'
      || desktopArenaDirectory.gridBorder !== '66px'
      || desktopArenaDirectory.gridBackground !== 'rgb(195, 167, 126)') {
      failures.push(`home Arena directory: desktop frame changed (${JSON.stringify(desktopArenaDirectory)})`);
    }
    const desktopBgDirectory = await page.$eval('.home-bg-directory', element => {
      const rootStyles = getComputedStyle(element);
      const headingRow = element.querySelector('.home-section-heading');
      const signLabel = element.querySelector('.home-bg-directory__sign > span');
      const signHeading = element.querySelector('.home-bg-directory__sign h2');
      const summary = element.querySelector('.home-section-heading > p');
      const links = element.querySelector('.home-bg-directory__links');
      const linkStyles = links ? getComputedStyle(links) : null;
      const featured = element.querySelector('.home-bg-directory__link[data-featured="true"]');
      const featuredStyles = featured ? getComputedStyle(featured) : null;
      const featuredLabel = featured?.querySelector('small');
      return {
        overflow: rootStyles.overflow,
        border: rootStyles.borderTopWidth,
        radius: rootStyles.borderRadius,
        color: rootStyles.color,
        backgroundImage: rootStyles.backgroundImage,
        shadow: rootStyles.boxShadow,
        headingMargin: headingRow ? getComputedStyle(headingRow).marginBottom : '',
        labelColor: signLabel ? getComputedStyle(signLabel).color : '',
        labelSize: signLabel ? getComputedStyle(signLabel).fontSize : '',
        headingColor: signHeading ? getComputedStyle(signHeading).color : '',
        headingSize: signHeading ? getComputedStyle(signHeading).fontSize : '',
        summaryColor: summary ? getComputedStyle(summary).color : '',
        gridGap: linkStyles?.gap || '',
        gridPadding: linkStyles?.padding || '',
        gridBorder: linkStyles?.borderTopWidth || '',
        gridBackground: linkStyles?.backgroundColor || '',
        featuredHeight: featuredStyles?.minHeight || '',
        featuredRadius: featuredStyles?.borderRadius || '',
        featuredColor: featuredStyles?.color || '',
        featuredBackground: featuredStyles?.backgroundColor || '',
        featuredLabel: featuredLabel ? getComputedStyle(featuredLabel).color : '',
      };
    });
    if (desktopBgDirectory.overflow !== 'visible'
      || desktopBgDirectory.border !== '0px'
      || desktopBgDirectory.radius !== '0px'
      || desktopBgDirectory.color !== 'rgb(48, 37, 28)'
      || desktopBgDirectory.backgroundImage !== 'none'
      || desktopBgDirectory.shadow !== 'none'
      || desktopBgDirectory.headingMargin !== '12.8px'
      || desktopBgDirectory.labelColor !== 'rgb(217, 185, 130)'
      || desktopBgDirectory.labelSize !== '9.28px'
      || desktopBgDirectory.headingColor !== 'rgb(255, 240, 200)'
      || desktopBgDirectory.headingSize !== '29.6px'
      || desktopBgDirectory.summaryColor !== 'rgb(111, 89, 67)'
      || desktopBgDirectory.gridGap !== '8.8px'
      || desktopBgDirectory.gridPadding !== '11.2px'
      || desktopBgDirectory.gridBorder !== '66px'
      || desktopBgDirectory.gridBackground !== 'rgb(195, 167, 126)'
      || desktopBgDirectory.featuredHeight !== '164px'
      || desktopBgDirectory.featuredRadius !== '0px'
      || desktopBgDirectory.featuredColor !== 'rgb(62, 47, 35)'
      || desktopBgDirectory.featuredBackground !== 'rgba(255, 245, 218, 0.52)'
      || desktopBgDirectory.featuredLabel !== 'rgb(125, 64, 91)') {
      failures.push(`home Battlegrounds directory: desktop frame changed (${JSON.stringify(desktopBgDirectory)})`);
    }
    await page.evaluate(() => {
      const board = document.querySelector('.home-draft-orbit__board');
      if (!document.querySelector('.home-orbit-class__copy')) {
        const fixture = document.createElement('div');
        fixture.dataset.qaHomeOrbitFixture = 'true';
        fixture.className = 'home-orbit-class';
        fixture.setAttribute('aria-hidden', 'true');
        fixture.style.visibility = 'hidden';
        fixture.innerHTML = `
          <span class="home-orbit-class__icon"><img alt="" width="44" height="44"></span>
          <span class="home-orbit-class__copy"><small>Class</small><strong>Name</strong><b>50%</b></span>`;
        board?.append(fixture);
      }
      if (!document.querySelector('.home-orbit-empty')) {
        const emptyFixture = document.createElement('div');
        emptyFixture.dataset.qaHomeOrbitEmptyFixture = 'true';
        emptyFixture.className = 'home-orbit-empty';
        emptyFixture.setAttribute('aria-hidden', 'true');
        emptyFixture.style.visibility = 'hidden';
        board?.append(emptyFixture);
      }
    });
    const desktopShell = await page.$eval('.home-workbench', element => {
      const stage = element.querySelector('.home-stage');
      const stageLabelDot = element.querySelector('.home-stage__label > span');
      const stageHeading = element.querySelector('.home-stage h1');
      const action = element.querySelector('.home-action');
      const orbit = element.querySelector('.home-draft-orbit');
      const orbitCaption = element.querySelector('.home-draft-orbit__caption');
      const orbitClass = element.querySelector('[data-qa-home-orbit-fixture]') || element.querySelector('.home-orbit-class');
      const orbitIcon = element.querySelector('.home-orbit-class__icon');
      const orbitSmall = element.querySelector('.home-orbit-class__copy small');
      const orbitStrong = element.querySelector('.home-orbit-class__copy strong');
      const orbitValue = element.querySelector('.home-orbit-class__copy b');
      const firstSection = element.querySelector('.home-latest-articles');
      const stageStyles = stage ? getComputedStyle(stage) : null;
      const labelDotStyles = stageLabelDot ? getComputedStyle(stageLabelDot) : null;
      const actionStyles = action ? getComputedStyle(action) : null;
      const orbitStyles = orbit ? getComputedStyle(orbit) : null;
      const orbitClassStyles = orbitClass ? getComputedStyle(orbitClass) : null;
      const orbitIconStyles = orbitIcon ? getComputedStyle(orbitIcon) : null;
      return {
        gap: Number.parseFloat(getComputedStyle(element).gap),
        color: getComputedStyle(element).color,
        stageRadius: stageStyles?.borderRadius || '',
        stageAfterDisplay: stage ? getComputedStyle(stage, '::after').display : '',
        labelDotWidth: labelDotStyles?.width || '',
        labelDotHeight: labelDotStyles?.height || '',
        labelDotBorder: labelDotStyles?.borderTopWidth || '',
        headingWeight: stageHeading ? getComputedStyle(stageHeading).fontWeight : '',
        actionMinHeight: actionStyles?.minHeight || '',
        actionRadius: actionStyles?.borderRadius || '',
        actionFontSize: actionStyles?.fontSize || '',
        actionShadow: actionStyles?.boxShadow || '',
        orbitRadius: orbitStyles?.borderRadius || '',
        orbitAfterDisplay: orbit ? getComputedStyle(orbit, '::after').display : '',
        orbitCaptionSpacing: orbitCaption ? Number.parseFloat(getComputedStyle(orbitCaption).letterSpacing) : Number.NaN,
        orbitBorderColor: orbitClassStyles?.borderTopColor || '',
        orbitClassRadius: orbitClassStyles?.borderRadius || '',
        orbitClassColor: orbitClassStyles?.color || '',
        orbitClassBackground: orbitClassStyles?.backgroundColor || '',
        orbitClassShadow: orbitClassStyles?.boxShadow || '',
        orbitIconBorderColor: orbitIconStyles?.borderTopColor || '',
        orbitIconBackground: orbitIconStyles?.backgroundColor || '',
        orbitSmallColor: orbitSmall ? getComputedStyle(orbitSmall).color : '',
        orbitStrongColor: orbitStrong ? getComputedStyle(orbitStrong).color : '',
        orbitValueColor: orbitValue ? getComputedStyle(orbitValue).color : '',
        sectionPaddingTop: firstSection ? Number.parseFloat(getComputedStyle(firstSection).paddingTop) : Number.NaN,
      };
    });
    const desktopStageLayout = await page.$eval('.home-stage', element => {
      const stageStyles = getComputedStyle(element);
      const copy = element.querySelector('.home-stage__copy');
      const label = element.querySelector('.home-stage__label');
      const labelDot = element.querySelector('.home-stage__label > span');
      const heading = element.querySelector('h1');
      const headingAccent = heading?.querySelector('span');
      const summary = element.querySelector('.home-stage__copy > p');
      const actions = element.querySelector('.home-stage__actions');
      const primary = element.querySelector('.home-action--primary');
      const secondary = element.querySelector('.home-action--secondary');
      const orbit = element.querySelector('.home-draft-orbit');
      const caption = element.querySelector('.home-draft-orbit__caption');
      const board = element.querySelector('.home-draft-orbit__board');
      const orbitClass = element.querySelector('[data-qa-home-orbit-fixture]') || element.querySelector('.home-orbit-class');
      const orbitIcon = orbitClass?.querySelector('.home-orbit-class__icon');
      const orbitImage = orbitIcon?.querySelector('img');
      const orbitAction = element.querySelector('.home-orbit-action');
      const orbitEmpty = element.querySelector('[data-qa-home-orbit-empty-fixture]') || element.querySelector('.home-orbit-empty');
      const pageIndex = element.parentElement?.querySelector('.home-page-index');
      const copyStyles = copy ? getComputedStyle(copy) : null;
      const headingStyles = heading ? getComputedStyle(heading) : null;
      const summaryStyles = summary ? getComputedStyle(summary) : null;
      const primaryStyles = primary ? getComputedStyle(primary) : null;
      const secondaryStyles = secondary ? getComputedStyle(secondary) : null;
      const orbitStyles = orbit ? getComputedStyle(orbit) : null;
      const boardStyles = board ? getComputedStyle(board) : null;
      const orbitClassStyles = orbitClass ? getComputedStyle(orbitClass) : null;
      return {
        gridColumns: stageStyles.gridTemplateColumns,
        gap: Number.parseFloat(stageStyles.gap),
        minHeight: stageStyles.minHeight,
        overflow: stageStyles.overflow,
        padding: stageStyles.padding,
        borderWidth: stageStyles.borderTopWidth,
        borderImageSource: stageStyles.borderImageSource,
        color: stageStyles.color,
        backgroundImage: stageStyles.backgroundImage,
        shadow: stageStyles.boxShadow,
        copyMaxWidth: copyStyles?.maxWidth || '',
        labelColor: label ? getComputedStyle(label).color : '',
        labelDotBackground: labelDot ? getComputedStyle(labelDot).backgroundColor : '',
        labelDotShadow: labelDot ? getComputedStyle(labelDot).boxShadow : '',
        headingMaxWidth: headingStyles?.maxWidth || '',
        headingMarginTop: headingStyles?.marginTop || '',
        headingColor: headingStyles?.color || '',
        headingSize: headingStyles?.fontSize || '',
        headingLineHeight: headingStyles?.lineHeight || '',
        headingShadow: headingStyles?.textShadow || '',
        headingAccent: headingAccent ? getComputedStyle(headingAccent).color : '',
        summaryMarginTop: summaryStyles?.marginTop || '',
        summaryColor: summaryStyles?.color || '',
        summarySize: summaryStyles?.fontSize || '',
        actionsMarginTop: actions ? getComputedStyle(actions).marginTop : '',
        primaryBorder: primaryStyles?.borderTopColor || '',
        primaryColor: primaryStyles?.color || '',
        primaryBackground: primaryStyles?.backgroundImage || '',
        secondaryBorder: secondaryStyles?.borderTopColor || '',
        secondaryColor: secondaryStyles?.color || '',
        secondaryBackground: secondaryStyles?.backgroundColor || '',
        orbitWidth: orbit?.getBoundingClientRect().width || 0,
        orbitMinHeight: orbitStyles?.minHeight || '',
        orbitAlignSelf: orbitStyles?.alignSelf || '',
        orbitPadding: orbitStyles?.padding || '',
        orbitBorder: orbitStyles?.borderTopWidth || '',
        orbitColor: orbitStyles?.color || '',
        orbitBackground: orbitStyles?.backgroundImage || '',
        orbitShadow: orbitStyles?.boxShadow || '',
        captionPosition: caption ? getComputedStyle(caption).position : '',
        captionColor: caption ? getComputedStyle(caption).color : '',
        captionTransform: caption ? getComputedStyle(caption).transform : '',
        boardPosition: boardStyles?.position || '',
        boardWidth: board?.getBoundingClientRect().width || 0,
        boardMinHeight: boardStyles?.minHeight || '',
        boardMargin: boardStyles?.margin || '',
        orbitClassPosition: orbitClassStyles?.position || '',
        orbitClassMinHeight: orbitClassStyles?.minHeight || '',
        orbitClassColumns: orbitClassStyles?.gridTemplateColumns || '',
        orbitClassPadding: orbitClassStyles?.padding || '',
        orbitClassTransform: orbitClassStyles?.transform || '',
        orbitIconSize: orbitIcon ? getComputedStyle(orbitIcon).width : '',
        orbitImageSize: orbitImage ? getComputedStyle(orbitImage).width : '',
        orbitActionPosition: orbitAction ? getComputedStyle(orbitAction).position : '',
        orbitEmptyPosition: orbitEmpty ? getComputedStyle(orbitEmpty).position : '',
        orbitEmptyWidth: orbitEmpty?.getBoundingClientRect().width || 0,
        pageIndexMarginTop: pageIndex ? getComputedStyle(pageIndex).marginTop : '',
      };
    });
    await page.evaluate(() => {
      document.querySelector('[data-qa-home-orbit-fixture]')?.remove();
      document.querySelector('[data-qa-home-orbit-empty-fixture]')?.remove();
    });
    if (Math.abs(desktopShell.gap - 74.88) > 0.1
      || desktopShell.color !== 'rgb(48, 37, 28)'
      || desktopShell.stageRadius !== '0px'
      || desktopShell.stageAfterDisplay !== 'none'
      || desktopShell.labelDotWidth !== '7px'
      || desktopShell.labelDotHeight !== '7px'
      || desktopShell.labelDotBorder !== '0px'
      || desktopShell.headingWeight !== '800'
      || desktopShell.actionMinHeight !== '44px'
      || desktopShell.actionRadius !== '3px'
      || desktopShell.actionFontSize !== '12.48px'
      || desktopShell.actionShadow !== 'none'
      || desktopShell.orbitRadius !== '2px'
      || desktopShell.orbitAfterDisplay !== 'none'
      || Math.abs(desktopShell.orbitCaptionSpacing - 1.3056) > 0.02
      || desktopShell.orbitBorderColor !== 'rgba(237, 199, 111, 0.32)'
      || desktopShell.orbitClassRadius !== '3px'
      || desktopShell.orbitClassColor !== 'rgb(255, 240, 202)'
      || desktopShell.orbitClassBackground !== 'rgba(47, 4, 7, 0.72)'
      || desktopShell.orbitClassShadow === 'none'
      || desktopShell.orbitIconBorderColor !== 'rgba(232, 191, 94, 0.31)'
      || desktopShell.orbitIconBackground !== 'rgba(236, 195, 102, 0.09)'
      || desktopShell.orbitSmallColor !== 'rgb(212, 174, 99)'
      || desktopShell.orbitStrongColor !== 'rgb(255, 243, 211)'
      || desktopShell.orbitValueColor !== 'rgb(229, 190, 96)'
      || Math.abs(desktopShell.sectionPaddingTop - 56) > 0.1) {
      failures.push(`home shell: desktop stage and live-orbit theme changed (${JSON.stringify(desktopShell)})`);
    }
    if (desktopStageLayout.gridColumns.split(/\s+/).length !== 2
      || Math.abs(desktopStageLayout.gap - 34.56) > 0.1
      || desktopStageLayout.minHeight !== '0px'
      || desktopStageLayout.overflow !== 'hidden'
      || desktopStageLayout.padding !== '32px'
      || desktopStageLayout.borderWidth !== '12px'
      || !desktopStageLayout.borderImageSource.includes('main-page-rail-border.png')
      || desktopStageLayout.color !== 'rgb(255, 240, 200)'
      || !desktopStageLayout.backgroundImage.includes('arena-rail-red.jpg')
      || desktopStageLayout.shadow === 'none'
      || desktopStageLayout.copyMaxWidth !== '610px'
      || desktopStageLayout.labelColor !== 'rgb(232, 190, 98)'
      || desktopStageLayout.labelDotBackground !== 'rgb(116, 183, 120)'
      || desktopStageLayout.labelDotShadow === 'none'
      || desktopStageLayout.headingMaxWidth !== 'none'
      || desktopStageLayout.headingMarginTop !== '8.8px'
      || desktopStageLayout.headingColor !== 'rgb(255, 240, 200)'
      || desktopStageLayout.headingSize !== '58.4px'
      || desktopStageLayout.headingLineHeight !== '58.4px'
      || desktopStageLayout.headingShadow === 'none'
      || desktopStageLayout.headingAccent !== 'rgb(226, 184, 88)'
      || desktopStageLayout.summaryMarginTop !== '12.8px'
      || desktopStageLayout.summaryColor !== 'rgb(222, 202, 160)'
      || desktopStageLayout.summarySize !== '14.56px'
      || desktopStageLayout.actionsMarginTop !== '17.6px'
      || desktopStageLayout.primaryBorder !== 'rgba(238, 196, 102, 0.72)'
      || desktopStageLayout.primaryColor !== 'rgb(59, 33, 18)'
      || desktopStageLayout.primaryBackground === 'none'
      || desktopStageLayout.secondaryBorder !== 'rgba(239, 203, 121, 0.34)'
      || desktopStageLayout.secondaryColor !== 'rgb(247, 228, 183)'
      || desktopStageLayout.secondaryBackground !== 'rgba(34, 4, 8, 0.28)'
      || desktopStageLayout.orbitWidth <= 0
      || desktopStageLayout.orbitMinHeight !== '0px'
      || desktopStageLayout.orbitAlignSelf !== 'stretch'
      || desktopStageLayout.orbitPadding !== '8.8px'
      || desktopStageLayout.orbitBorder !== '1px'
      || desktopStageLayout.orbitColor !== 'rgb(251, 233, 189)'
      || desktopStageLayout.orbitBackground === 'none'
      || desktopStageLayout.orbitShadow !== 'none'
      || desktopStageLayout.captionPosition !== 'static'
      || desktopStageLayout.captionColor !== 'rgb(217, 171, 73)'
      || desktopStageLayout.captionTransform !== 'none'
      || desktopStageLayout.boardPosition !== 'static'
      || desktopStageLayout.boardWidth <= 0
      || desktopStageLayout.boardMinHeight !== '0px'
      || desktopStageLayout.boardMargin !== '0px'
      || desktopStageLayout.orbitClassPosition !== 'static'
      || desktopStageLayout.orbitClassMinHeight !== '62px'
      || !desktopStageLayout.orbitClassColumns.startsWith('48px ')
      || desktopStageLayout.orbitClassPadding !== '7.2px 9.6px'
      || desktopStageLayout.orbitClassTransform !== 'none'
      || desktopStageLayout.orbitIconSize !== '46px'
      || desktopStageLayout.orbitImageSize !== '44px'
      || desktopStageLayout.orbitActionPosition !== 'static'
      || desktopStageLayout.orbitEmptyPosition !== 'static'
      || desktopStageLayout.orbitEmptyWidth <= 0
      || desktopStageLayout.pageIndexMarginTop !== '-24px') {
      failures.push(`home stage: desktop layout changed (${JSON.stringify(desktopStageLayout)})`);
    }
    const desktopCommunity = await page.$eval('.home-community', element => {
      const rootStyles = getComputedStyle(element);
      const lead = element.querySelector('.home-community__lead');
      const firstLink = element.querySelector(':scope > a');
      const small = lead?.querySelector('small');
      const strong = lead?.querySelector('strong');
      const leadStyles = lead ? getComputedStyle(lead) : null;
      const linkStyles = firstLink ? getComputedStyle(firstLink) : null;
      return {
        display: rootStyles.display,
        overflow: rootStyles.overflow,
        padding: rootStyles.padding,
        border: rootStyles.borderTopWidth,
        radius: rootStyles.borderRadius,
        color: rootStyles.color,
        backgroundImage: rootStyles.backgroundImage,
        shadow: rootStyles.boxShadow,
        beforeDisplay: getComputedStyle(element, '::before').display,
        leadMinHeight: leadStyles?.minHeight || '',
        leadPadding: leadStyles?.padding || '',
        leadColor: leadStyles?.color || '',
        leadBackground: leadStyles?.backgroundImage || '',
        linkBorderLeftWidth: linkStyles?.borderLeftWidth || '',
        linkBorderLeftColor: linkStyles?.borderLeftColor || '',
        smallColor: small ? getComputedStyle(small).color : '',
        strongColor: strong ? getComputedStyle(strong).color : '',
      };
    });
    if (desktopCommunity.display !== 'grid'
      || desktopCommunity.overflow !== 'hidden'
      || desktopCommunity.padding !== '5px 0px 0px'
      || desktopCommunity.border !== '0px'
      || desktopCommunity.radius !== '0px'
      || desktopCommunity.color !== 'rgb(247, 232, 195)'
      || desktopCommunity.backgroundImage === 'none'
      || desktopCommunity.shadow !== 'none'
      || desktopCommunity.beforeDisplay !== 'none'
      || desktopCommunity.leadMinHeight !== '105px'
      || desktopCommunity.leadPadding !== '19.2px'
      || desktopCommunity.leadColor !== 'rgb(247, 232, 195)'
      || !desktopCommunity.leadBackground.includes('arena-rail-red.jpg')
      || desktopCommunity.linkBorderLeftWidth !== '1px'
      || desktopCommunity.linkBorderLeftColor !== 'rgba(239, 202, 119, 0.23)'
      || desktopCommunity.smallColor !== 'rgb(212, 183, 123)'
      || desktopCommunity.strongColor !== 'rgb(255, 242, 205)') {
      failures.push(`home community: desktop tavern strip changed (${JSON.stringify(desktopCommunity)})`);
    }
    await page.$eval('.home-action', element => element.focus());
    const focusedAction = await page.$eval('.home-action', element => ({
      outlineWidth: getComputedStyle(element).outlineWidth,
      outlineColor: getComputedStyle(element).outlineColor,
      outlineOffset: getComputedStyle(element).outlineOffset,
    }));
    if (focusedAction.outlineWidth !== '3px'
      || focusedAction.outlineColor !== 'rgba(123, 21, 27, 0.72)'
      || focusedAction.outlineOffset !== '3px') {
      failures.push(`home shell: keyboard focus treatment changed (${JSON.stringify(focusedAction)})`);
    }
    await page.$eval('.home-action', element => element.blur());
    await page.hover('.home-action');
    await new Promise(resolve => setTimeout(resolve, 250));
    const hoveredAction = await page.$eval('.home-action', element => ({
      transform: getComputedStyle(element).transform,
      shadow: getComputedStyle(element).boxShadow,
    }));
    if (hoveredAction.transform !== 'matrix(1, 0, 0, 1, 0, -2)' || hoveredAction.shadow === 'none') {
      failures.push(`home shell: CTA hover treatment changed (${JSON.stringify(hoveredAction)})`);
    }
    await page.mouse.move(0, 0);
    await page.hover('.home-community > a');
    await new Promise(resolve => setTimeout(resolve, 220));
    const hoveredCommunityLink = await page.$eval('.home-community > a', element => getComputedStyle(element).backgroundColor);
    if (hoveredCommunityLink !== 'rgba(44, 3, 6, 0.25)') {
      failures.push(`home community: link hover treatment changed (${hoveredCommunityLink})`);
    }
    await page.mouse.move(0, 0);
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    const mobileContentCanvas = await page.$eval('.arena-content-open', element => {
      const styles = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        width: rect.width,
        viewportWidth: document.documentElement.clientWidth,
        maxWidth: styles.maxWidth,
        padding: styles.padding,
        border: styles.borderTopWidth,
        radius: styles.borderRadius,
        backgroundColor: styles.backgroundColor,
        backgroundImage: styles.backgroundImage,
        shadow: styles.boxShadow,
      };
    });
    if (Math.abs(mobileContentCanvas.width - mobileContentCanvas.viewportWidth) > 0.1
      || mobileContentCanvas.maxWidth !== '100%'
      || mobileContentCanvas.padding !== '0px 16px 32px'
      || mobileContentCanvas.border !== '0px'
      || mobileContentCanvas.radius !== '0px'
      || mobileContentCanvas.backgroundColor !== 'rgba(0, 0, 0, 0)'
      || mobileContentCanvas.backgroundImage !== 'none'
      || mobileContentCanvas.shadow !== 'none') {
      failures.push(`home content canvas: mobile contract changed (${JSON.stringify(mobileContentCanvas)})`);
    }
    const mobileHeading = await page.$eval('.home-latest-articles .home-section-heading', element => {
      const heading = element.querySelector('h2');
      const summary = element.querySelector(':scope > p');
      return {
        alignItems: getComputedStyle(element).alignItems,
        headingSize: heading ? getComputedStyle(heading).fontSize : '',
        summaryDisplay: summary ? getComputedStyle(summary).display : '',
        sectionPaddingTop: Number.parseFloat(getComputedStyle(element.closest('.home-latest-articles')).paddingTop),
      };
    });
    if (mobileHeading.alignItems !== 'flex-start'
      || mobileHeading.headingSize !== '32px'
      || mobileHeading.summaryDisplay !== 'none'
      || Math.abs(mobileHeading.sectionPaddingTop - 35.2) > 0.1) {
      failures.push(`home headings: mobile parchment typography changed (${JSON.stringify(mobileHeading)})`);
    }
    const mobileArenaDirectory = await page.$eval('.home-arena-directory', element => {
      const heading = element.querySelector('.home-arena-directory__sign h2');
      const links = element.querySelector('.home-arena-directory__links');
      const linkStyles = links ? getComputedStyle(links) : null;
      return {
        headingSize: heading ? getComputedStyle(heading).fontSize : '',
        gridPadding: linkStyles?.padding || '',
        gridBorder: linkStyles?.borderTopWidth || '',
        gridWidth: links?.getBoundingClientRect().width || 0,
        viewportWidth: document.documentElement.clientWidth,
      };
    });
    if (mobileArenaDirectory.headingSize !== '20.8px'
      || mobileArenaDirectory.gridPadding !== '0px'
      || mobileArenaDirectory.gridBorder !== '30px'
      || mobileArenaDirectory.gridWidth > mobileArenaDirectory.viewportWidth) {
      failures.push(`home Arena directory: mobile frame changed (${JSON.stringify(mobileArenaDirectory)})`);
    }
    const mobileBgDirectory = await page.$eval('.home-bg-directory', element => {
      const heading = element.querySelector('.home-bg-directory__sign h2');
      const links = element.querySelector('.home-bg-directory__links');
      const linkStyles = links ? getComputedStyle(links) : null;
      const featured = element.querySelector('.home-bg-directory__link[data-featured="true"]');
      const featuredStyles = featured ? getComputedStyle(featured) : null;
      return {
        headingSize: heading ? getComputedStyle(heading).fontSize : '',
        gridPadding: linkStyles?.padding || '',
        gridBorder: linkStyles?.borderTopWidth || '',
        gridWidth: links?.getBoundingClientRect().width || 0,
        featuredHeight: featuredStyles?.minHeight || '',
        featuredPadding: featuredStyles?.padding || '',
        viewportWidth: document.documentElement.clientWidth,
      };
    });
    if (mobileBgDirectory.headingSize !== '20.8px'
      || mobileBgDirectory.gridPadding !== '0px'
      || mobileBgDirectory.gridBorder !== '30px'
      || mobileBgDirectory.featuredHeight !== '124px'
      || mobileBgDirectory.featuredPadding !== '12.48px'
      || mobileBgDirectory.gridWidth > mobileBgDirectory.viewportWidth) {
      failures.push(`home Battlegrounds directory: mobile frame changed (${JSON.stringify(mobileBgDirectory)})`);
    }
    const mobileShell = await page.$eval('.home-workbench', element => {
      const actions = element.querySelector('.home-stage__actions');
      const actionLinks = Array.from(actions?.querySelectorAll('.home-action') || []);
      const firstActionRect = actionLinks[0]?.getBoundingClientRect();
      const secondActionRect = actionLinks[1]?.getBoundingClientRect();
      const actionsRect = actions?.getBoundingClientRect();
      const community = element.querySelector('.home-community');
      const communityLead = community?.querySelector('.home-community__lead');
      const communityLink = community?.querySelector(':scope > a');
      const communityStyles = community ? getComputedStyle(community) : null;
      const communityLinkStyles = communityLink ? getComputedStyle(communityLink) : null;
      return {
        workbenchGap: getComputedStyle(element).gap,
        actionsDisplay: actions ? getComputedStyle(actions).display : '',
        actionColumns: actions ? getComputedStyle(actions).gridTemplateColumns : '',
        actionWidth: firstActionRect?.width || 0,
        actionsWidth: actionsRect?.width || 0,
        actionsStacked: Boolean(firstActionRect && secondActionRect && secondActionRect.top >= firstActionRect.bottom),
        communityDisplay: communityStyles?.display || '',
        communityColumns: communityStyles?.gridTemplateColumns || '',
        communityWidth: community?.getBoundingClientRect().width || 0,
        viewportWidth: document.documentElement.clientWidth,
        communityLeadMinHeight: communityLead ? getComputedStyle(communityLead).minHeight : '',
        communityLinkBorderLeft: communityLinkStyles?.borderLeftWidth || '',
        communityLinkBorderTop: communityLinkStyles?.borderTopWidth || '',
        communityLinkBorderTopColor: communityLinkStyles?.borderTopColor || '',
      };
    });
    if (mobileShell.workbenchGap !== '51.2px'
      || mobileShell.actionsDisplay !== 'grid'
      || mobileShell.actionColumns.split(/\s+/).length !== 1
      || Math.abs(mobileShell.actionWidth - mobileShell.actionsWidth) > 0.5
      || !mobileShell.actionsStacked
      || mobileShell.communityDisplay !== 'grid'
      || mobileShell.communityColumns.split(/\s+/).length !== 1
      || mobileShell.communityWidth > mobileShell.viewportWidth
      || mobileShell.communityLeadMinHeight !== '84px'
      || mobileShell.communityLinkBorderLeft !== '0px'
      || mobileShell.communityLinkBorderTop !== '1px'
      || mobileShell.communityLinkBorderTopColor !== 'rgba(239, 202, 119, 0.23)') {
      failures.push(`home shell: mobile CTA/community layout changed (${JSON.stringify(mobileShell)})`);
    }
    const mobileStageLayout = await page.$eval('.home-stage', element => {
      const stageStyles = getComputedStyle(element);
      const heading = element.querySelector('h1');
      const summary = element.querySelector('.home-stage__copy > p');
      const character = element.querySelector('.home-stage__character');
      const characterImage = character?.querySelector('img');
      const orbit = element.querySelector('.home-draft-orbit');
      const board = element.querySelector('.home-draft-orbit__board');
      const pageIndex = element.parentElement?.querySelector('.home-page-index');
      const headingStyles = heading ? getComputedStyle(heading) : null;
      const characterStyles = character ? getComputedStyle(character) : null;
      const characterImageStyles = characterImage ? getComputedStyle(characterImage) : null;
      const orbitStyles = orbit ? getComputedStyle(orbit) : null;
      const boardStyles = board ? getComputedStyle(board) : null;
      return {
        gridColumns: stageStyles.gridTemplateColumns,
        stageWidth: element.getBoundingClientRect().width,
        gap: stageStyles.gap,
        padding: stageStyles.padding,
        borderWidth: stageStyles.borderTopWidth,
        borderImageWidth: stageStyles.borderImageWidth,
        headingMaxWidth: headingStyles?.maxWidth || '',
        headingSize: headingStyles?.fontSize || '',
        headingLineHeight: headingStyles?.lineHeight || '',
        summarySize: summary ? getComputedStyle(summary).fontSize : '',
        characterPosition: characterStyles?.position || '',
        characterWidth: character?.getBoundingClientRect().width || 0,
        characterHeight: character?.getBoundingClientRect().height || 0,
        characterMargin: characterStyles?.margin || '',
        characterBorderWidth: characterStyles?.borderTopWidth || '',
        characterImagePosition: characterImageStyles?.objectPosition || '',
        characterImageTransform: characterImageStyles?.transform || '',
        orbitWidth: orbit?.getBoundingClientRect().width || 0,
        orbitMinHeight: orbitStyles?.minHeight || '',
        boardWidth: board?.getBoundingClientRect().width || 0,
        boardTransform: boardStyles?.transform || '',
        pageIndexMarginTop: pageIndex ? getComputedStyle(pageIndex).marginTop : '',
        viewportWidth: document.documentElement.clientWidth,
      };
    });
    if (mobileStageLayout.gridColumns.split(/\s+/).length !== 1
      || mobileStageLayout.stageWidth > mobileStageLayout.viewportWidth
      || mobileStageLayout.gap !== '16px'
      || mobileStageLayout.padding !== '12.8px'
      || mobileStageLayout.borderWidth !== '9px'
      || mobileStageLayout.borderImageWidth !== '9px'
      || mobileStageLayout.headingMaxWidth !== 'none'
      || mobileStageLayout.headingSize !== '39px'
      || mobileStageLayout.headingLineHeight !== '39px'
      || mobileStageLayout.summarySize !== '12.8px'
      || mobileStageLayout.characterPosition !== 'relative'
      || mobileStageLayout.characterWidth <= 0
      || Math.abs(mobileStageLayout.characterHeight - 171.6) > 0.2
      || mobileStageLayout.characterMargin !== '0px -8.8px'
      || mobileStageLayout.characterBorderWidth !== '4px'
      || mobileStageLayout.characterImagePosition !== '55% 32%'
      || mobileStageLayout.characterImageTransform !== 'none'
      || mobileStageLayout.orbitWidth <= 0
      || mobileStageLayout.orbitMinHeight !== '0px'
      || mobileStageLayout.boardWidth <= 0
      || Math.abs(mobileStageLayout.boardWidth - mobileStageLayout.orbitWidth + 19.6) > 0.5
      || mobileStageLayout.boardTransform !== 'none'
      || mobileStageLayout.pageIndexMarginTop !== '-22.4px') {
      failures.push(`home stage: mobile responsive layout changed (${JSON.stringify(mobileStageLayout)})`);
    }
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    const faqTrigger = await page.$('.home-faq-zone .faq-card__trigger');
    if (!faqTrigger) {
      failures.push('home lazy sections: FAQ trigger is missing');
    } else {
      const initialFaqState = await faqTrigger.evaluate(element => element.getAttribute('aria-expanded'));
      if (initialFaqState !== 'false') failures.push(`home lazy sections: FAQ must start collapsed, got ${initialFaqState}`);
      await faqTrigger.click();
      const expandedFaqState = await faqTrigger.evaluate(element => ({
        expanded: element.getAttribute('aria-expanded'),
        panelHidden: document.getElementById(element.getAttribute('aria-controls') || '')?.hidden,
      }));
      if (expandedFaqState.expanded !== 'true' || expandedFaqState.panelHidden !== false) {
        failures.push('home lazy sections: FAQ trigger did not expose its controlled panel');
      }
      await faqTrigger.click();
    }
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

// Desktop sidebar: stable tavern frame, active/hover navigation and expandable groups.
{
  const page = await createQaPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await mockApplicationApi(page, { authenticated: true });
  try {
    await page.goto(`${BASE}/classes`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await waitForMeaningfulPage(page, 'Паладин');
    await page.waitForSelector('.arena-sidebar', { visible: true });
    const sidebarState = await page.evaluate(() => {
      const sidebar = document.querySelector('.arena-sidebar');
      const brand = sidebar?.querySelector('.arena-sidebar-brand');
      const brandName = brand?.querySelector('strong');
      const nav = sidebar?.querySelector('.arena-sidebar-nav');
      const section = sidebar?.querySelector('.arena-sidebar-section');
      const inactiveLink = sidebar?.querySelector('a.arena-sidebar-link:not(.arena-sidebar-link-active)');
      const activeLink = sidebar?.querySelector('.arena-sidebar-link-active');
      const inactiveIcon = inactiveLink?.querySelector('.arena-sidebar-link-icon');
      const status = sidebar?.querySelector('.arena-sidebar-status');
      const statusLabel = status?.querySelector('span');
      const statusValue = status?.querySelector('strong');
      const profile = sidebar?.querySelector('.arena-sidebar-profile');
      let profileIcon = profile?.querySelector('.arena-sidebar-profile-icon');
      let profileIconFixture = null;
      if (!profileIcon && profile) {
        profileIconFixture = document.createElement('span');
        profileIconFixture.className = 'arena-sidebar-profile-icon';
        profileIconFixture.setAttribute('aria-hidden', 'true');
        profileIconFixture.style.visibility = 'hidden';
        profile.append(profileIconFixture);
        profileIcon = profileIconFixture;
      }
      const profileLabel = profile?.querySelector('.arena-sidebar-profile-label');
      const profileHint = profile?.querySelector('.arena-sidebar-profile-hint');
      const workspace = document.querySelector('.arena-workspace');
      const shell = document.querySelector('.bg-wood');
      const main = document.querySelector('.arena-main');
      const sidebarStyles = sidebar ? getComputedStyle(sidebar) : null;
      const brandStyles = brand ? getComputedStyle(brand) : null;
      const navStyles = nav ? getComputedStyle(nav) : null;
      const sectionStyles = section ? getComputedStyle(section) : null;
      const inactiveStyles = inactiveLink ? getComputedStyle(inactiveLink) : null;
      const activeStyles = activeLink ? getComputedStyle(activeLink) : null;
      const statusStyles = status ? getComputedStyle(status) : null;
      const profileStyles = profile ? getComputedStyle(profile) : null;
      const profileIconStyles = profileIcon ? getComputedStyle(profileIcon) : null;
      const shellStyles = shell ? getComputedStyle(shell) : null;
      const workspaceStyles = workspace ? getComputedStyle(workspace) : null;
      const mainStyles = main ? getComputedStyle(main) : null;
      const profileIconContract = {
        border: profileIconStyles?.borderTopColor || '',
        color: profileIconStyles?.color || '',
        background: profileIconStyles?.backgroundColor || '',
      };
      profileIconFixture?.remove();
      const rect = sidebar?.getBoundingClientRect();
      return {
        width: rect?.width || 0,
        height: rect?.height || 0,
        viewportHeight: innerHeight,
        padding: sidebarStyles?.padding || '',
        borderRight: sidebarStyles?.borderRightWidth || '',
        borderImage: sidebarStyles?.borderImageSource || '',
        borderImageWidth: sidebarStyles?.borderImageWidth || '',
        color: sidebarStyles?.color || '',
        background: sidebarStyles?.backgroundImage || '',
        shadow: sidebarStyles?.boxShadow || '',
        beforeDisplay: sidebar ? getComputedStyle(sidebar, '::before').display : '',
        brandMinHeight: brandStyles?.minHeight || '',
        brandPadding: brandStyles?.padding || '',
        brandColor: brandName ? getComputedStyle(brandName).color : '',
        brandSize: brandName ? getComputedStyle(brandName).fontSize : '',
        brandLineHeight: brandName ? getComputedStyle(brandName).lineHeight : '',
        brandShadow: brandName ? getComputedStyle(brandName).textShadow : '',
        navGap: navStyles?.gap || '',
        navMarginTop: navStyles?.marginTop || '',
        navPadding: navStyles?.padding || '',
        navBorderColor: navStyles?.borderTopColor || '',
        sectionMargin: sectionStyles?.margin || '',
        sectionColor: sectionStyles?.color || '',
        sectionSize: sectionStyles?.fontSize || '',
        sectionWeight: sectionStyles?.fontWeight || '',
        linkMinHeight: inactiveStyles?.minHeight || '',
        linkGap: inactiveStyles?.gap || '',
        linkPadding: inactiveStyles?.padding || '',
        linkBorderTop: inactiveStyles?.borderTopWidth || '',
        linkBorderLeft: inactiveStyles?.borderLeftWidth || '',
        linkRadius: inactiveStyles?.borderRadius || '',
        linkColor: inactiveStyles?.color || '',
        linkBackground: inactiveStyles?.backgroundColor || '',
        linkSize: inactiveStyles?.fontSize || '',
        linkWeight: inactiveStyles?.fontWeight || '',
        linkShadow: inactiveStyles?.textShadow || '',
        linkBoxShadow: inactiveStyles?.boxShadow || '',
        iconColor: inactiveIcon ? getComputedStyle(inactiveIcon).color : '',
        activeBorder: activeStyles?.borderLeftColor || '',
        activeColor: activeStyles?.color || '',
        activeBackground: activeStyles?.backgroundImage || '',
        activeShadow: activeStyles?.boxShadow || '',
        activeBeforeDisplay: activeLink ? getComputedStyle(activeLink, '::before').display : '',
        statusPadding: statusStyles?.padding || '',
        statusBorderColor: statusStyles?.borderTopColor || '',
        statusDotBackground: status ? getComputedStyle(status, '::before').backgroundColor : '',
        statusDotShadow: status ? getComputedStyle(status, '::before').boxShadow : '',
        statusLabelColor: statusLabel ? getComputedStyle(statusLabel).color : '',
        statusValueColor: statusValue ? getComputedStyle(statusValue).color : '',
        profilePosition: profileStyles?.position || '',
        profileMinHeight: profileStyles?.minHeight || '',
        profilePadding: profileStyles?.padding || '',
        profileOverflow: profileStyles?.overflow || '',
        profileBorder: profileStyles?.borderTopWidth || '',
        profileRadius: profileStyles?.borderRadius || '',
        profileColor: profileStyles?.color || '',
        profileBackground: profileStyles?.backgroundColor || '',
        profileShadow: profileStyles?.boxShadow || '',
        profileAfterContent: profile ? getComputedStyle(profile, '::after').content : '',
        profileAfterInset: profile ? getComputedStyle(profile, '::after').top : '',
        profileAfterBackground: profile ? getComputedStyle(profile, '::after').backgroundImage : '',
        profileIconBorder: profileIconContract.border,
        profileIconColor: profileIconContract.color,
        profileIconBackground: profileIconContract.background,
        profileLabelColor: profileLabel ? getComputedStyle(profileLabel).color : '',
        profileLabelSize: profileLabel ? getComputedStyle(profileLabel).fontSize : '',
        profileLabelShadow: profileLabel ? getComputedStyle(profileLabel).textShadow : '',
        profileHintColor: profileHint ? getComputedStyle(profileHint).color : '',
        profileHintSize: profileHint ? getComputedStyle(profileHint).fontSize : '',
        workspaceMarginLeft: workspace ? getComputedStyle(workspace).marginLeft : '',
        workspaceLeft: workspace?.getBoundingClientRect().left || 0,
        shellBackgroundColor: shellStyles?.backgroundColor || '',
        shellBackgroundImage: shellStyles?.backgroundImage || '',
        shellBackgroundRepeat: shellStyles?.backgroundRepeat || '',
        shellBackgroundSize: shellStyles?.backgroundSize || '',
        shellAfterContent: shell ? getComputedStyle(shell, '::after').content : '',
        shellAfterDisplay: shell ? getComputedStyle(shell, '::after').display : '',
        shellAfterBackground: shell ? getComputedStyle(shell, '::after').backgroundImage : '',
        workspaceBackground: workspaceStyles?.backgroundImage || '',
        mainBackground: mainStyles?.backgroundImage || '',
        mainPaddingTop: mainStyles?.paddingTop || '',
      };
    });
    if (Math.abs(sidebarState.width - 258) > 0.1
      || sidebarState.height < sidebarState.viewportHeight
      || sidebarState.padding !== '14.4px 11.52px'
      || sidebarState.borderRight !== '14px'
      || !sidebarState.borderImage.includes('main-page-rail-border.png')
      || sidebarState.borderImageWidth !== '0 14px 0 0'
      || sidebarState.color !== 'rgb(234, 210, 161)'
      || !sidebarState.background.includes('arena-rail-red.jpg')
      || sidebarState.shadow === 'none'
      || sidebarState.beforeDisplay !== 'none'
      || sidebarState.brandMinHeight !== '64px'
      || sidebarState.brandPadding !== '10.4px 8.8px 12.8px'
      || sidebarState.brandColor !== 'rgb(255, 241, 200)'
      || sidebarState.brandSize !== '20px'
      || sidebarState.brandLineHeight !== '21px'
      || sidebarState.brandShadow === 'none'
      || sidebarState.navGap !== '2.08px'
      || sidebarState.navMarginTop !== '7.2px'
      || sidebarState.navPadding !== '7.2px 0px'
      || sidebarState.navBorderColor !== 'rgba(232, 192, 103, 0.2)'
      || sidebarState.sectionMargin !== '11.52px 8.8px 4px'
      || sidebarState.sectionColor !== 'rgb(220, 175, 85)'
      || sidebarState.sectionSize !== '9.76px'
      || sidebarState.sectionWeight !== '850'
      || sidebarState.linkMinHeight !== '40px'
      || sidebarState.linkGap !== '9.92px'
      || sidebarState.linkPadding !== '8.32px 9.92px'
      || sidebarState.linkBorderTop !== '0px'
      || sidebarState.linkBorderLeft !== '3px'
      || sidebarState.linkRadius !== '2px'
      || sidebarState.linkColor !== 'rgb(247, 223, 176)'
      || sidebarState.linkBackground !== 'rgba(0, 0, 0, 0)'
      || sidebarState.linkSize !== '13.44px'
      || sidebarState.linkWeight !== '700'
      || sidebarState.linkShadow === 'none'
      || sidebarState.linkBoxShadow !== 'none'
      || sidebarState.iconColor !== 'rgb(224, 171, 66)'
      || sidebarState.activeBorder !== 'rgb(242, 200, 93)'
      || sidebarState.activeColor !== 'rgb(255, 247, 223)'
      || sidebarState.activeBackground === 'none'
      || sidebarState.activeShadow === 'none'
      || sidebarState.activeBeforeDisplay !== 'none'
      || sidebarState.statusPadding !== '10.4px 7.2px 5.6px'
      || sidebarState.statusBorderColor !== 'rgba(232, 192, 103, 0.23)'
      || sidebarState.statusDotBackground !== 'rgb(114, 188, 117)'
      || sidebarState.statusDotShadow === 'none'
      || sidebarState.statusLabelColor !== 'rgb(197, 168, 115)'
      || sidebarState.statusValueColor !== 'rgb(255, 240, 199)'
      || sidebarState.profilePosition !== 'relative'
      || sidebarState.profileMinHeight !== '74px'
      || sidebarState.profilePadding !== '12.48px 16px'
      || sidebarState.profileOverflow !== 'visible'
      || sidebarState.profileBorder !== '0px'
      || sidebarState.profileRadius !== '0px'
      || sidebarState.profileColor !== 'rgb(243, 210, 122)'
      || sidebarState.profileBackground !== 'rgba(38, 3, 6, 0.4)'
      || sidebarState.profileShadow === 'none'
      || sidebarState.profileAfterContent !== '""'
      || sidebarState.profileAfterInset !== '-5px'
      || !sidebarState.profileAfterBackground.includes('deck-border.png')
      || sidebarState.profileIconBorder !== 'rgba(237, 196, 105, 0.32)'
      || sidebarState.profileIconColor !== 'rgb(231, 185, 78)'
      || sidebarState.profileIconBackground !== 'rgba(48, 4, 7, 0.31)'
      || sidebarState.profileLabelColor !== 'rgb(255, 244, 211)'
      || sidebarState.profileLabelSize !== '16.48px'
      || sidebarState.profileLabelShadow === 'none'
      || sidebarState.profileHintColor !== 'rgb(210, 183, 127)'
      || sidebarState.profileHintSize !== '11.36px'
      || sidebarState.workspaceMarginLeft !== '258px'
      || Math.abs(sidebarState.workspaceLeft - 258) > 0.1
      || sidebarState.shellBackgroundColor !== 'rgb(234, 214, 167)'
      || !sidebarState.shellBackgroundImage.includes('arena-parchment.jpg')
      || sidebarState.shellBackgroundRepeat !== 'repeat, repeat'
      || sidebarState.shellBackgroundSize !== 'auto, 865px 878px'
      || sidebarState.shellAfterContent !== 'none'
      || sidebarState.shellAfterDisplay !== 'none'
      || sidebarState.shellAfterBackground !== 'none'
      || !sidebarState.workspaceBackground.includes('arena-parchment.jpg')
      || !sidebarState.mainBackground.includes('arena-parchment.jpg')
      || sidebarState.mainPaddingTop !== '0px') {
      failures.push(`desktop sidebar: parchment frame changed (${JSON.stringify(sidebarState)})`);
    }
    const hoverTarget = '.arena-sidebar a.arena-sidebar-link:not(.arena-sidebar-link-active)';
    await page.hover(hoverTarget);
    await new Promise(resolve => setTimeout(resolve, 220));
    const hoveredLink = await page.$eval(hoverTarget, element => ({
      transform: getComputedStyle(element).transform,
      color: getComputedStyle(element).color,
      background: getComputedStyle(element).backgroundColor,
    }));
    if (hoveredLink.transform !== 'matrix(1, 0, 0, 1, 2, 0)'
      || hoveredLink.color !== 'rgb(255, 244, 212)'
      || hoveredLink.background !== 'rgba(50, 4, 7, 0.22)') {
      failures.push(`desktop sidebar: hover treatment changed (${JSON.stringify(hoveredLink)})`);
    }
    const constructorsTrigger = '[aria-controls="arena-sidebar-constructors"]';
    await page.click(constructorsTrigger);
    const expandedGroup = await page.$eval(constructorsTrigger, element => ({
      expanded: element.getAttribute('aria-expanded'),
      hidden: document.getElementById(element.getAttribute('aria-controls') || '')?.hidden,
    }));
    if (expandedGroup.expanded !== 'true' || expandedGroup.hidden !== false) failures.push('desktop sidebar: constructors group did not expand');
    await page.$eval(hoverTarget, element => element.focus());
    await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('aria-expanded') === 'false', { timeout: 5_000 }, constructorsTrigger);
    const collapsedGroup = await page.$eval(constructorsTrigger, element => ({
      expanded: element.getAttribute('aria-expanded'),
      hidden: document.getElementById(element.getAttribute('aria-controls') || '')?.hidden,
    }));
    if (collapsedGroup.expanded !== 'false' || collapsedGroup.hidden !== true) failures.push('desktop sidebar: constructors group did not collapse');
    await auditAccessibility(page, 'desktop sidebar');
    await page.screenshot({ path: `${OUT}/desktop-sidebar.png`, fullPage: false });
    console.log('✓ desktop sidebar frame, hover and expandable navigation');
  } catch (error) {
    failures.push(`desktop sidebar: ${error.message}`);
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
      const topbar = document.querySelector('.arena-mobile-topbar');
      const brand = document.querySelector('.arena-mobile-brand');
      const toggle = document.querySelector('.arena-mobile-nav-toggle');
      const menu = document.querySelector('.arena-mobile-menu');
      const profile = document.querySelector('.arena-mobile-menu-profile');
      const inactiveLink = menu?.querySelector('.arena-mobile-menu-link:not(.arena-mobile-menu-link-active)');
      let activeLink = menu?.querySelector('.arena-mobile-menu-link-active');
      let activeFixture = null;
      if (!activeLink && menu) {
        activeFixture = document.createElement('a');
        activeFixture.className = 'arena-mobile-menu-link arena-mobile-menu-link-active';
        activeFixture.setAttribute('aria-hidden', 'true');
        activeFixture.style.visibility = 'hidden';
        menu.append(activeFixture);
        activeLink = activeFixture;
      }
      const section = menu?.querySelector('.arena-mobile-menu-section');
      const rect = profile?.getBoundingClientRect();
      const topbarStyles = topbar ? getComputedStyle(topbar) : null;
      const toggleStyles = toggle ? getComputedStyle(toggle) : null;
      const menuStyles = menu ? getComputedStyle(menu) : null;
      const inactiveLinkStyles = inactiveLink ? getComputedStyle(inactiveLink) : null;
      const activeLinkStyles = activeLink ? getComputedStyle(activeLink) : null;
      const profileStyles = profile ? getComputedStyle(profile) : null;
      const activeContract = {
        borderColor: activeLinkStyles?.borderLeftColor || '',
        color: activeLinkStyles?.color || '',
        background: activeLinkStyles?.backgroundColor || '',
        beforeDisplay: activeLink ? getComputedStyle(activeLink, '::before').display : '',
      };
      activeFixture?.remove();
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
          const toggleRect = toggle?.getBoundingClientRect();
          return { width: toggleRect?.width || 0, height: toggleRect?.height || 0 };
        })(),
        topbarMinHeight: topbarStyles?.minHeight || '',
        topbarBorder: topbarStyles?.borderBottomWidth || '',
        topbarBorderImage: topbarStyles?.borderImageSource || '',
        topbarBorderImageWidth: topbarStyles?.borderImageWidth || '',
        topbarColor: topbarStyles?.color || '',
        topbarBackground: topbarStyles?.backgroundImage || '',
        topbarShadow: topbarStyles?.boxShadow || '',
        topbarBackdrop: topbarStyles?.backdropFilter || '',
        brandColor: brand ? getComputedStyle(brand).color : '',
        brandSize: brand ? getComputedStyle(brand).fontSize : '',
        toggleBorder: toggleStyles?.borderTopColor || '',
        toggleRadius: toggleStyles?.borderRadius || '',
        toggleColor: toggleStyles?.color || '',
        toggleBackground: toggleStyles?.backgroundColor || '',
        toggleShadow: toggleStyles?.boxShadow || '',
        menuTop: menuStyles?.top || '',
        menuGap: menuStyles?.gap || '',
        menuPadding: menuStyles?.padding || '',
        menuBorder: menuStyles?.borderTopWidth || '',
        menuBorderImage: menuStyles?.borderImageSource || '',
        menuBorderImageWidth: menuStyles?.borderImageWidth || '',
        menuRadius: menuStyles?.borderRadius || '',
        menuBackground: menuStyles?.backgroundImage || '',
        menuShadow: menuStyles?.boxShadow || '',
        menuBackdrop: menuStyles?.backdropFilter || '',
        linkMinHeight: inactiveLinkStyles?.minHeight || '',
        linkPadding: inactiveLinkStyles?.padding || '',
        linkBorderTop: inactiveLinkStyles?.borderTopWidth || '',
        linkBorderLeft: inactiveLinkStyles?.borderLeftWidth || '',
        linkRadius: inactiveLinkStyles?.borderRadius || '',
        linkColor: inactiveLinkStyles?.color || '',
        linkBackground: inactiveLinkStyles?.backgroundColor || '',
        linkSize: inactiveLinkStyles?.fontSize || '',
        linkWeight: inactiveLinkStyles?.fontWeight || '',
        linkShadow: inactiveLinkStyles?.textShadow || '',
        activeBorderColor: activeContract.borderColor,
        activeColor: activeContract.color,
        activeBackground: activeContract.background,
        activeBeforeDisplay: activeContract.beforeDisplay,
        sectionMarginTop: section ? getComputedStyle(section).marginTop : '',
        sectionColor: section ? getComputedStyle(section).color : '',
        sectionSize: section ? getComputedStyle(section).fontSize : '',
        profilePosition: profileStyles?.position || '',
        profileMinHeight: profileStyles?.minHeight || '',
        profilePadding: profileStyles?.padding || '',
        profileOverflow: profileStyles?.overflow || '',
        profileBorder: profileStyles?.borderTopWidth || '',
        profileRadius: profileStyles?.borderRadius || '',
        profileColor: profileStyles?.color || '',
        profileBackground: profileStyles?.backgroundImage || '',
        profileShadow: profileStyles?.boxShadow || '',
        profileAfterDisplay: profile ? getComputedStyle(profile, '::after').display : '',
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
    if (openState.topbarMinHeight !== '61px'
      || openState.topbarBorder !== '10px'
      || !openState.topbarBorderImage.includes('main-page-rail-border.png')
      || openState.topbarBorderImageWidth !== '0 0 10px'
      || openState.topbarColor !== 'rgb(255, 241, 202)'
      || !openState.topbarBackground.includes('arena-rail-red.jpg')
      || openState.topbarShadow === 'none'
      || openState.topbarBackdrop !== 'none'
      || openState.brandColor !== 'rgb(255, 240, 196)'
      || openState.brandSize !== '18.88px'
      || openState.toggleBorder !== 'rgb(241, 210, 126)'
      || openState.toggleRadius !== '4px'
      || openState.toggleColor !== 'rgb(255, 239, 199)'
      || openState.toggleBackground !== 'rgba(45, 4, 7, 0.62)'
      || openState.toggleShadow === 'none'
      || openState.menuTop !== '70px'
      || openState.menuGap !== '3.2px'
      || openState.menuPadding !== '12px 12.8px'
      || openState.menuBorder !== '7px'
      || !openState.menuBorderImage.includes('main-page-rail-border.png')
      || openState.menuBorderImageWidth !== '7px'
      || openState.menuRadius !== '2px'
      || !openState.menuBackground.includes('arena-rail-red.jpg')
      || openState.menuShadow === 'none'
      || openState.menuBackdrop !== 'none'
      || openState.linkMinHeight !== '44px'
      || openState.linkPadding !== '9.28px 10.88px'
      || openState.linkBorderTop !== '0px'
      || openState.linkBorderLeft !== '3px'
      || openState.linkRadius !== '2px'
      || openState.linkColor !== 'rgb(248, 223, 173)'
      || openState.linkBackground !== 'rgba(0, 0, 0, 0)'
      || openState.linkSize !== '15.04px'
      || openState.linkWeight !== '700'
      || openState.linkShadow === 'none'
      || openState.activeBorderColor !== 'rgb(217, 171, 73)'
      || openState.activeColor !== 'rgb(255, 246, 220)'
      || openState.activeBackground !== 'rgba(48, 4, 7, 0.42)'
      || openState.activeBeforeDisplay !== 'none'
      || openState.sectionMarginTop !== '10.4px'
      || openState.sectionColor !== 'rgb(223, 182, 95)'
      || openState.sectionSize !== '10.08px'
      || openState.profilePosition !== 'relative'
      || openState.profileMinHeight !== '50px'
      || openState.profilePadding !== '10.88px 12.8px'
      || openState.profileOverflow !== 'hidden'
      || openState.profileBorder !== '1px'
      || openState.profileRadius !== '2px'
      || openState.profileColor !== 'rgb(255, 240, 200)'
      || openState.profileBackground === 'none'
      || openState.profileShadow === 'none'
      || openState.profileAfterDisplay !== 'none') {
      failures.push(`mobile menu: parchment visual contract changed (${JSON.stringify(openState)})`);
    }
    await auditAccessibility(page, 'mobile menu open');
    await page.screenshot({ path: `${OUT}/mobile-menu-open.png`, fullPage: false });

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
