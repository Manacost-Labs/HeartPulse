import {
  adminFixtures,
  fixtures,
  publicStandardFixtureAliases,
  qaArchetypeCatalog,
  qaArchetypeDetail,
  qaCardImage,
  qaDeckCards,
  subscriber,
  wildMatchupsFixture,
} from './fixtures.mjs';

const QA_SESSION_COOKIE = 'manacost_auth_token';

/**
 * The session cookie browser QA sends for an authenticated fixture account, so
 * server rendering (the Next.js admin guard) sees the same session as the page.
 */
export function qaSessionCookie({ admin = false } = {}) {
  return `${QA_SESSION_COOKIE}=${admin ? 'qa-admin' : 'qa-subscriber'}`;
}

/** Resolves the fixture account named by a `Cookie` request header. */
export function qaSessionFromCookie(header = '') {
  const token = header.split(';').map(part => part.trim())
    .find(part => part.startsWith(`${QA_SESSION_COOKIE}=`))?.slice(QA_SESSION_COOKIE.length + 1);
  return { authenticated: token === 'qa-admin' || token === 'qa-subscriber', admin: token === 'qa-admin' };
}

export function jsonResponse(body) {
  return {
    status: 200,
    contentType: 'application/json; charset=utf-8',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  };
}

/**
 * Answers application API requests from deterministic fixtures. The browser
 * QA intercepts page requests with it and the QA backend serves Next.js server
 * rendering with it. `respond` may run later because some scenarios delay a
 * response; the return value reports whether the request was answered.
 */
export function createQaApiHandler({
  authenticated,
  admin = false,
  adminState = {},
  strictApi = false,
  origin,
}) {
  return function handleQaApiRequest({ url, method, postData }, respond) {
    if (url.pathname === '/api/auth/telegram/config') {
      respond(jsonResponse({
        enabled: true,
        mode: 'oidc',
        authUrl: '/api/auth/telegram/start',
        socialProviders: [
          { provider: 'google', authUrl: '/api/auth/google/start' },
          { provider: 'discord', authUrl: '/api/auth/discord/start' },
          { provider: 'yandex', authUrl: '/api/auth/yandex/start' },
          { provider: 'patreon', authUrl: '/api/auth/patreon/start' },
        ],
      }));
      return true;
    }
    if (url.pathname === '/api/telemetry/web-vitals' && method === 'POST') {
      respond({
        status: 204,
        headers: { 'cache-control': 'no-store' },
        body: '',
      });
      return true;
    }
    if (/^\/api\/card-image\/[A-Za-z0-9_]+\/(?:thumb|full)\.webp$/.test(url.pathname)) {
      respond({
        status: 200,
        contentType: 'image/svg+xml',
        headers: {
          'access-control-allow-origin': '*',
          'cache-control': 'public, max-age=2592000, immutable',
        },
        body: decodeURIComponent(qaCardImage.slice(qaCardImage.indexOf(',') + 1)),
      });
      return true;
    }
    if (!authenticated && url.pathname === '/api/auth/login' && method === 'POST') {
      respond({
        ...jsonResponse({ error: 'Контрольная ошибка входа' }),
        status: 401,
      });
      return true;
    }
    // The admin session ended: the account check finds nobody and admin endpoints refuse.
    if (admin && adminState.sessionLost && url.pathname === '/api/auth/me') {
      respond(jsonResponse({ user: null }));
      return true;
    }
    if (admin && adminState.sessionLost && /^\/api\/admin(?:\/|-)/.test(url.pathname)) {
      respond({ ...jsonResponse({ error: 'Требуется вход' }), status: 401 });
      return true;
    }
    if (url.pathname === '/api/telemetry/client-errors' && method === 'POST') {
      respond({ status: 204, headers: { 'cache-control': 'no-store' }, body: '' });
      return true;
    }
    if (url.pathname === '/api/auth/me') {
      respond(jsonResponse(authenticated ? {
        user: {
          id: admin ? 'qa-admin' : 'qa-subscriber',
          profileId: admin ? 'qa-admin' : 'qa-subscriber',
          publicProfileId: admin ? '901' : '902',
          email: 'qa@example.test',
          name: admin ? 'QA Administrator' : 'QA Subscriber',
          role: admin ? 'admin' : 'user',
          adminAllowed: admin,
          contestAdminAllowed: admin,
          photoUrl: '/__qa_missing_avatar__.png',
        },
        // Express repeats the access flags beside the user; the Next.js admin
        // guard reads these top-level copies.
        adminAllowed: admin,
        contestAdminAllowed: admin,
      } : { user: null, adminAllowed: false, contestAdminAllowed: false }));
      return true;
    }
    if (url.pathname === '/api/auth/profile' && method === 'PATCH') {
      if (adminState.profileSaveFailure) {
        respond({ ...jsonResponse({ error: 'Контрольная ошибка сохранения' }), status: 500 });
        return true;
      }
      const payload = JSON.parse(postData || '{}');
      respond(jsonResponse({
        success: true,
        user: {
          id: admin ? 'qa-admin' : 'qa-subscriber',
          profileId: admin ? 'qa-admin' : 'qa-subscriber',
          publicProfileId: admin ? '901' : '902',
          email: 'qa@example.test',
          name: admin ? 'QA Administrator' : 'QA Subscriber',
          role: admin ? 'admin' : 'user',
          adminAllowed: admin,
          contestAdminAllowed: admin,
          photoUrl: '/__qa_missing_avatar__.png',
          ...payload,
        },
      }));
      return true;
    }
    if (url.pathname === '/api/subscription/status' || url.pathname === '/api/subscription/refresh') {
      respond(jsonResponse(authenticated ? subscriber : {
        hasAccess: false,
        source: 'none',
        checkedAt: new Date().toISOString(),
        stale: false,
        message: 'Deterministic browser QA guest',
        entitlements: {},
        boosty: { checked: false, found: false, hasAccess: false },
        telegram: { checked: false, hasAccess: false },
      }));
      return true;
    }
    if (admin && adminState.galleryEmpty && url.pathname === '/api/admin/gallery') {
      respond(jsonResponse({ items: [] }));
      return true;
    }
    if (admin && adminState.boostyFailure && url.pathname === '/api/admin/boosty/status') {
      respond({
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
      return true;
    }
    if (admin && adminState.boostyFailure && url.pathname === '/api/admin/boosty/subscribers') {
      respond({
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
      return true;
    }
    if (admin && adminState.telegramFailure && url.pathname === '/api/admin/telegram/accounts') {
      respond({
        ...jsonResponse({ error: 'Не удалось загрузить Telegram-аккаунты' }),
        status: 500,
      });
      return true;
    }
    if (admin && url.pathname === '/api/articles') {
      respond(jsonResponse({ articles: adminState.articles ?? adminFixtures['/api/articles'].articles }));
      return true;
    }
    if (admin && url.pathname === '/api/admin/uploads/image' && method === 'POST') {
      const payload = JSON.parse(postData || '{}');
      if (payload.sourceUrl) {
        respond(jsonResponse({ success: true, url: '/uploads/admin/qa-article-cover.webp' }));
        return true;
      }
    }
    if (admin && url.pathname === '/api/admin-articles') {
      const payload = JSON.parse(postData || '{}');
      const articles = adminState.articles ??= structuredClone(adminFixtures['/api/articles'].articles);
      if (method === 'POST') {
        const article = { id: 'qa-created-article', ...payload.article };
        articles.unshift(article);
        respond(jsonResponse({ success: true, article }));
        return true;
      }
      if (method === 'PATCH') {
        const index = articles.findIndex(article => article.id === payload.id);
        const article = { ...articles[index], ...payload.article, id: payload.id };
        if (index >= 0) articles[index] = article;
        respond(jsonResponse({ success: true, article }));
        return true;
      }
      if (method === 'DELETE') {
        adminState.articles = articles.filter(article => article.id !== payload.id);
        respond(jsonResponse({ success: true }));
        return true;
      }
    }
    if (admin && url.pathname === '/api/admin/contests') {
      const contests = adminState.contests ??= structuredClone(adminFixtures['/api/admin/contests'].contests);
      if (method === 'GET') {
        if (adminState.contestReadFailure) {
          respond({ ...jsonResponse({ error: 'Не удалось загрузить конкурсы' }), status: 500 });
          return true;
        }
        respond(jsonResponse({ contests }));
        return true;
      }
      if (method === 'POST') {
        const payload = JSON.parse(postData || '{}');
        const id = payload.id || 'qa-created-contest';
        const index = contests.findIndex(contest => contest.id === id);
        const contest = {
          ...(index >= 0 ? contests[index] : { entriesCount: 0, winners: [] }),
          ...payload,
          id,
        };
        if (index >= 0) contests[index] = contest;
        else contests.unshift(contest);
        respond(jsonResponse({ success: true, contest }));
        return true;
      }
    }
    if (admin && url.pathname === '/api/admin/archetype-translations/untranslated') {
      const translations = adminState.translations ??= structuredClone(adminFixtures['/api/admin/archetype-translations'].items);
      const observed = [
        { nameEn: 'Control Warrior', ranks: ['Легенда', 'Алмаз 4-1'] },
        { nameEn: 'Rainbow Mage', ranks: ['Легенда'] },
        {
          nameEn: 'Void Soul DH',
          ranks: ['Легенда', 'Алмаз 4-1'],
          deckCode: 'AAECAea5AwSongaPzwbHpAbEuAYNgIUEtp8E0Z4G7Z8G7p8G17gG9OUGjfgGkfgGAAA=',
        },
        { nameEn: 'Starship Rogue', ranks: ['Легенда'] },
        { nameEn: 'Discover Hunter', ranks: ['Топ-5000'] },
        { nameEn: 'Imbue Paladin', ranks: ['Алмаз 4-1'] },
        { nameEn: 'Protoss Priest', ranks: ['Легенда'] },
        { nameEn: 'Zerg Death Knight', ranks: ['Топ-5000'] },
        { nameEn: 'Spell Damage Druid', ranks: ['Алмаз 4-1'] },
        { nameEn: 'Quest Shaman', ranks: ['Легенда'] },
        { nameEn: 'Location Warlock', ranks: ['Топ-5000'] },
        { nameEn: 'Menagerie Warrior', ranks: ['Легенда'] },
      ];
      const translatedKeys = translations.map(item => item.nameEn.toLocaleLowerCase('en-US'));
      const items = observed.filter(item => {
        const key = item.nameEn.toLocaleLowerCase('en-US');
        return !translatedKeys.some(translationKey => key === translationKey || key.includes(translationKey));
      });
      const send = () => respond(jsonResponse({
        items,
        totalObserved: observed.length,
        translated: observed.length - items.length,
        missing: items.length,
        coveragePercent: Math.round(((observed.length - items.length) / observed.length) * 1_000) / 10,
      }));
      if (adminState.delayNextTranslationCoverage) {
        adminState.delayNextTranslationCoverage = false;
        setTimeout(send, 900);
      } else {
        send();
      }
      return true;
    }
    if (admin && url.pathname === '/api/admin/archetype-translations') {
      const translations = adminState.translations ??= structuredClone(adminFixtures['/api/admin/archetype-translations'].items);
      if (method === 'POST') {
        const payload = JSON.parse(postData || '{}').translation || {};
        translations.push({
          id: Math.max(0, ...translations.map(item => item.id)) + 1,
          blizzcoreId: null,
          nameEn: payload.nameEn,
          nameRu: payload.nameRu,
          source: 'manual',
          createdAt: '2026-07-13T03:00:00.000Z',
          updatedAt: '2026-07-13T03:00:00.000Z',
          syncedAt: null,
          updatedBy: 'qa-admin',
        });
        adminState.delayNextTranslationCoverage = true;
        const send = () => respond({ ...jsonResponse({ success: true, translation: translations.at(-1) }), status: 201 });
        if (adminState.delayNextTranslationMutation) {
          adminState.delayNextTranslationMutation = false;
          setTimeout(send, 350);
        } else {
          send();
        }
        return true;
      }
      const query = (url.searchParams.get('q') || '').toLocaleLowerCase('ru-RU');
      const source = url.searchParams.get('source') || '';
      const items = translations.filter(item => (!query || `${item.nameEn} ${item.nameRu}`.toLocaleLowerCase('ru-RU').includes(query))
        && (!source || item.source === source));
      respond(jsonResponse({
        items,
        total: items.length,
        page: 1,
        pageSize: 40,
        pages: 1,
        stats: {
          total: translations.length,
          manual: translations.filter(item => item.source === 'manual').length,
          blizzcore: translations.filter(item => item.source === 'blizzcore').length,
          lastSyncedAt: '2026-07-11T00:00:00.000Z',
        },
      }));
      return true;
    }
    const translationEditMatch = admin && url.pathname.match(/^\/api\/admin\/archetype-translations\/(\d+)$/);
    if (translationEditMatch && method === 'PATCH') {
      const translations = adminState.translations ??= structuredClone(adminFixtures['/api/admin/archetype-translations'].items);
      const item = translations.find(row => row.id === Number(translationEditMatch[1]));
      const payload = JSON.parse(postData || '{}').translation || {};
      if (item) Object.assign(item, payload, { source: 'manual', updatedBy: 'qa-admin' });
      adminState.delayNextTranslationCoverage = true;
      respond(jsonResponse({ success: true, translation: item }));
      return true;
    }
    if (admin && url.pathname === '/api/admin/archetype-translations/sync' && method === 'POST') {
      respond(jsonResponse({ success: true, rows: 2, imported: 0, updated: 1, preservedManual: 1 }));
      return true;
    }
    if (admin && url.pathname === '/api/admin/mechanic-translations') {
      const mechanics = adminState.mechanics ??= structuredClone(adminFixtures['/api/admin/mechanic-translations'].items);
      const query = (url.searchParams.get('q') || '').toLocaleLowerCase('ru-RU');
      const status = url.searchParams.get('status') || '';
      const kind = url.searchParams.get('kind') || '';
      const items = mechanics.filter(item => (!query || `${item.nameEn} ${item.nameRu} ${item.example?.name?.ru || ''}`.toLocaleLowerCase('ru-RU').includes(query))
        && (!status || item.source === status) && (!kind || item.kind === kind || item.kind === 'both'));
      respond(jsonResponse({
        items, total: items.length, page: 1, pageSize: 40, pages: 1,
        stats: {
          total: mechanics.length,
          manual: mechanics.filter(item => item.source === 'manual').length,
          default: mechanics.filter(item => item.source === 'default').length,
          missing: mechanics.filter(item => item.source === 'missing').length,
          mechanics: mechanics.filter(item => item.kind === 'mechanic' || item.kind === 'both').length,
          tags: mechanics.filter(item => item.kind === 'tag' || item.kind === 'both').length,
        },
      }));
      return true;
    }
    if (admin && url.pathname === '/api/admin/standard-operations/reset' && method === 'POST') {
      const target = JSON.parse(postData || '{}').target;
      const status = structuredClone(adminFixtures['/api/admin/standard-operations']);
      if (target === 'previews' || target === 'all') status.caches.previews.entries = 0;
      respond(jsonResponse({ success: true, target, status }));
      return true;
    }
    const mechanicEditMatch = admin && url.pathname.match(/^\/api\/admin\/mechanic-translations\/([^/]+)$/);
    if (mechanicEditMatch && method === 'PUT') {
      const mechanics = adminState.mechanics ??= structuredClone(adminFixtures['/api/admin/mechanic-translations'].items);
      const key = decodeURIComponent(mechanicEditMatch[1]);
      const item = mechanics.find(row => row.key === key);
      const payload = JSON.parse(postData || '{}');
      if (item) Object.assign(item, { nameEn: payload.nameEn, nameRu: payload.nameRu, source: 'manual', updatedAt: '2026-07-16T12:30:00.000Z' });
      respond(jsonResponse({ success: true, translation: item }));
      return true;
    }
    const contestEntriesMatch = admin && url.pathname.match(/^\/api\/admin\/contests\/([^/]+)\/entries$/);
    if (contestEntriesMatch) {
      const entries = contestEntriesMatch[1] === 'qa-contest'
        ? adminFixtures['/api/admin/contests/qa-contest/entries'].entries
        : [];
      respond(jsonResponse({ entries }));
      return true;
    }
    const contestWinnersMatch = admin && url.pathname.match(/^\/api\/admin\/contests\/([^/]+)\/winners$/);
    if (contestWinnersMatch && method === 'POST') {
      const payload = JSON.parse(postData || '{}');
      const contests = adminState.contests ??= structuredClone(adminFixtures['/api/admin/contests'].contests);
      const contest = contests.find(item => item.id === contestWinnersMatch[1]);
      if (contest) {
        contest.winners = payload.winners;
        contest.status = 'completed';
      }
      respond(jsonResponse({ success: true, contest }));
      return true;
    }
    const contestDeleteMatch = admin && url.pathname.match(/^\/api\/admin\/contests\/([^/]+)$/);
    if (contestDeleteMatch && method === 'DELETE') {
      const contests = adminState.contests ??= structuredClone(adminFixtures['/api/admin/contests'].contests);
      adminState.contests = contests.filter(contest => contest.id !== contestDeleteMatch[1]);
      respond(jsonResponse({ success: true, deletedId: contestDeleteMatch[1] }));
      return true;
    }
    if (admin && url.pathname === '/api/admin/users' && method === 'GET') {
      const users = adminState.users ??= structuredClone(adminFixtures['/api/admin/users'].users);
      respond(jsonResponse({ users, total: users.length }));
      return true;
    }
    const adminUserMatch = admin && url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (adminUserMatch && method === 'PATCH') {
      const users = adminState.users ??= structuredClone(adminFixtures['/api/admin/users'].users);
      const user = users.find(item => item.id === decodeURIComponent(adminUserMatch[1]));
      const payload = JSON.parse(postData || '{}');
      if (user) {
        if (payload.role === 'admin' || payload.role === 'user') user.role = payload.role;
        if (typeof payload.blocked === 'boolean') user.blockedAt = payload.blocked ? '2026-07-13T02:00:00.000Z' : '';
        if (typeof payload.lifetimeAccess === 'boolean') user.lifetimeAccess = payload.lifetimeAccess;
        if (payload.manualAccess && typeof payload.manualAccess.enabled === 'boolean') {
          user.manualAccess = payload.manualAccess;
          user.lifetimeAccess = payload.manualAccess.enabled && payload.manualAccess.expiresAt === null;
          user.subscription = { ...user.subscription, hasAccess: payload.manualAccess.enabled || user.subscription?.hasAccess };
        }
      }
      respond(jsonResponse({
        success: true,
        user,
        manualAccess: user?.manualAccess,
        lifetimeAccess: Boolean(user?.lifetimeAccess),
      }));
      return true;
    }
    if (admin && url.pathname === '/api/admin/mailings/overview' && method === 'GET') {
      const overview = structuredClone(adminFixtures['/api/admin/mailings/overview']);
      overview.campaigns = adminState.mailingCampaigns ??= structuredClone(overview.campaigns);
      respond(jsonResponse(overview));
      return true;
    }
    if (admin && url.pathname === '/api/admin/mailings/test' && method === 'POST') {
      respond(jsonResponse({ success: true, message: 'Тестовое письмо принято для qa@example.test' }));
      return true;
    }
    if (admin && url.pathname === '/api/admin/mailings/send' && method === 'POST') {
      const payload = JSON.parse(postData || '{}');
      const campaigns = adminState.mailingCampaigns ??= structuredClone(adminFixtures['/api/admin/mailings/overview'].campaigns);
      campaigns.unshift({
        id: 'mailing-qa-created', subject: payload.subject, preheader: payload.preheader || '', templateKey: payload.templateKey || 'custom',
        segment: payload.segment || 'all-consented', status: 'queued', recipientCount: payload.expectedRecipients,
        acceptedCount: 0, failedCount: 0, skippedCount: 0, createdAt: '2026-07-13T03:00:00.000Z', startedAt: '', completedAt: '', error: '',
      });
      respond({ ...jsonResponse({ success: true, campaign: campaigns[0] }), status: 202 });
      return true;
    }
    if ((url.pathname === '/api/standard-meta/recommendation' || (admin && url.pathname === '/api/admin/standard-meta/recommendation')) && method === 'GET') {
      adminState.standardMetaRecommendationRequests = (adminState.standardMetaRecommendationRequests || 0) + 1;
      adminState.standardMetaRecommendationRank = url.searchParams.get('rank');
      respond(jsonResponse({
        recommendation: {
          archetype: 'Evenlock', archetypeLabel: 'Чётный Чернокнижник', format: 'standard',
          rank: 'legend',
          deckCode: 'AAECAf0GQaFixtureDeckCodeForBrowserQualityAssurance1234567890==',
          source: 'qa-fixture', sourceUrl: '', streamer: null, sampleGames: 6476, winrate: 61.1,
          updatedAt: '2026-07-13T00:00:00.000Z', classKey: 'warlock', matchedArchetype: 'Evenlock', matchMethod: 'exact',
          deckCards: qaDeckCards,
        },
      }));
      return true;
    }
    if ((url.pathname === '/api/standard-meta/preview' || (admin && url.pathname === '/api/admin/standard-meta/preview')) && method === 'POST') {
      adminState.standardMetaPreviewRequests = (adminState.standardMetaPreviewRequests || 0) + 1;
      adminState.standardMetaPreviewRank = JSON.parse(postData || '{}').rank;
      respond(jsonResponse({
        recommendation: {
          archetype: 'Evenlock', archetypeLabel: 'Чётный Чернокнижник', format: 'standard',
          rank: 'legend',
          deckCode: 'AAECAf0GQaFixtureDeckCodeForBrowserQualityAssurance1234567890==',
          source: 'qa-fixture', sourceUrl: '', streamer: null, sampleGames: 6476, winrate: 61.1,
          updatedAt: '2026-07-13T00:00:00.000Z', classKey: 'warlock', matchedArchetype: 'Evenlock', matchMethod: 'exact',
          deckCards: qaDeckCards,
        },
        preview: { hash: 'qa-preview-hash', state: 'done', ready: true, imageUrl: '/ad/wallpaper_info.webp', error: null },
      }));
      return true;
    }
    if ((url.pathname === '/api/constructed-archetypes'
      || url.pathname === '/api/constructed-archetypes/teaser')
      && method === 'GET') {
      if (adminState.constructedArchetypeReadFailureOnce) {
        adminState.constructedArchetypeReadFailureOnce = false;
        adminState.constructedArchetypeReadFailures = (adminState.constructedArchetypeReadFailures || 0) + 1;
        respond({ ...jsonResponse({ error: 'Контрольная ошибка загрузки меты' }), status: 503 });
        return true;
      }
      const requestedFormat = url.searchParams.get('format') === 'wild' ? 'wild' : 'standard';
      const items = qaArchetypeCatalog.items.map(item => ({
        ...item,
        format: requestedFormat,
        builds: url.pathname.endsWith('/teaser') ? [] : item.builds,
      }));
      respond(jsonResponse({
        ...qaArchetypeCatalog,
        format: requestedFormat,
        formatLabel: requestedFormat === 'wild' ? 'Вольный' : 'Стандарт',
        coverage: url.pathname.endsWith('/teaser') ? {} : qaArchetypeCatalog.coverage,
        items,
      }));
      return true;
    }
    if (url.pathname === '/api/constructed-archetypes/standard/qa-evenlock' && method === 'GET') {
      respond(jsonResponse(qaArchetypeDetail));
      return true;
    }
    if (url.pathname === '/api/deck/resolve' && method === 'GET') {
      respond(jsonResponse({
        ok: true,
        format: url.searchParams.get('format') === 'wild' ? 'wild' : 'standard',
        deckCode: url.searchParams.get('code') || '',
        cards: qaDeckCards,
        sideboards: [],
        totalCards: 30,
        deckSizeLimit: 30,
        archetype: {
          archetype: url.searchParams.get('archetype') || 'Evenlock',
          archetypeLabel: 'Чётный Чернокнижник',
          score: 1,
          deckCode: url.searchParams.get('code') || '',
        },
      }));
      return true;
    }
    if (url.pathname === '/api/deck/render' && method === 'POST') {
      respond(jsonResponse({
        ok: true,
        ready: true,
        renderer: 'rust',
        style: 'parchment',
        imageUrl: '/wallpaper/home-paladin-hero.webp',
        previewImageUrl: '/wallpaper/home-paladin-hero.webp',
      }));
      return true;
    }
    if ((url.pathname === '/api/standard-meta' || (admin && url.pathname === '/api/admin/standard-meta'))
      && method === 'GET' && adminState.standardMetaReadFailureOnce) {
      adminState.standardMetaReadFailureOnce = false;
      adminState.standardMetaReadFailures = (adminState.standardMetaReadFailures || 0) + 1;
      respond({ ...jsonResponse({ error: 'Контрольная ошибка загрузки меты' }), status: 503 });
      return true;
    }
    if ((url.pathname === '/api/standard-meta' || (admin && url.pathname === '/api/admin/standard-meta'))
      && method === 'GET' && adminState.standardMetaContractFailureOnce) {
      adminState.standardMetaContractFailureOnce = false;
      respond(jsonResponse({
        schemaVersion: 999,
        dataset: 'standard-meta',
        data: adminFixtures['/api/admin/standard-meta'],
      }));
      return true;
    }
    const standardFixturePath = publicStandardFixtureAliases[url.pathname] || url.pathname;
    if ((admin || Boolean(publicStandardFixtureAliases[url.pathname])) && adminFixtures[standardFixturePath]) {
      const fixture = structuredClone(adminFixtures[standardFixturePath]);
      if (standardFixturePath === '/api/admin/constructed-cards') {
        // Like Express, a catalog names the format it was asked for; the
        // Next.js catalog loader rejects a response for another format.
        fixture.format = url.searchParams.get('format') === 'wild' ? 'wild' : 'standard';
      }
      if (!authenticated && url.pathname === '/api/constructed-cards') {
        fixture.statsAccess = false;
        fixture.cards = fixture.cards.map(card => ({ ...card, stats: null }));
      }
      if (!authenticated && url.pathname === '/api/constructed-cards/CARD_QA_1') {
        fixture.statsAccess = false;
        fixture.card = { ...fixture.card, stats: null, statsUpdatedAt: null };
      }
      respond(jsonResponse(fixture));
      return true;
    }
    if (url.pathname === '/api/standard/matchups') {
      const requestedFormat = url.searchParams.get('format') === 'wild' ? 'wild' : 'standard';
      adminState.matchupFormats ??= [];
      adminState.matchupFormats.push(requestedFormat);
      respond(jsonResponse(
        requestedFormat === 'wild'
          ? wildMatchupsFixture
          : fixtures['/api/standard/matchups'],
      ));
      return true;
    }
    const fixtureKey = Object.keys(fixtures).find(key => url.pathname === key);
    if (fixtureKey) {
      respond(jsonResponse(fixtures[fixtureKey]));
      return true;
    }
    if (strictApi && url.origin === origin && url.pathname.startsWith('/api/')) {
      respond({
        ...jsonResponse({ error: `Unmocked browser QA endpoint: ${url.pathname}` }),
        status: 500,
      });
      return true;
    }
    return false;
  };
}
