import assert from 'node:assert/strict';
import test from 'node:test';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

test('Next card pilot uses real backend membership, SSR, access policy and recovery', { timeout: 90000 }, async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  try {
    const path = '/standard/cards/standard/blizzard%3A12345/';
    runtime.setUnavailable(true);
    let response = await fetch(runtime.origin + path);
    assert.equal(response.status, 500, 'an upstream outage must not turn into a cacheable 404');
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal((await fetch(runtime.origin + '/standard/cards/')).status, 500, 'catalog outage is not an empty successful page');
    runtime.setUnavailable(false);
    response = await fetch(runtime.origin + path);
    assert.equal(response.status, 200, runtime.output());
    const html = await response.text();
    assert.match(html, /<h1>Публичная карта 1<\/h1>/);
    assert.match(html, /Боевой клич: возьмите карту/);
    assert.match(html, /rel="canonical" href="https:\/\/hearthpulse.net\/standard\/cards\/standard\/blizzard%3A12345\/"/);
    assert.match(html, /application\/ld\+json/);
    assert.match(html, /"identifier":"blizzard:12345"/);
    assert.doesNotMatch(html, /"deckWinrate":53|card-reader@example|manacost_auth_token/);
    for (const catalogPath of ['/standard/cards/', '/standard/cards/standard/', '/standard/cards/wild/']) {
      const catalog = await fetch(runtime.origin + catalogPath);
      assert.equal(catalog.status, 200, runtime.output());
      assert.match(catalog.headers.get('cache-control'), /no-store/);
      const catalogHtml = await catalog.text();
      assert.match(catalogHtml, /<h1>Карты<\/h1>/);
      assert.match(catalogHtml, /Публичная карта 1/);
      assert.match(catalogHtml, /application\/ld\+json/);
      assert.ok(catalogHtml.includes(`rel="canonical" href="https://hearthpulse.net${catalogPath}"`));
      assert.doesNotMatch(catalogHtml, /deckWinrate[^<]{0,10}:53|card-reader@example/);
    }
    const filtered = await fetch(runtime.origin + '/standard/cards/wild/?query=Public+Card+2&class=MAGE&mana=2&view=table&page=2&perPage=60&period=7d&rank=diamond');
    const filteredHtml = await filtered.text();
    assert.equal(filtered.status, 200);
    assert.match(filteredHtml, /value="Public Card 2"/);
    assert.match(filteredHtml, /constructed-cards__table/);
    assert.match(filteredHtml, /name="robots" content="noindex, follow/);
    assert.match(filteredHtml, /Страница <!-- -->2/);
    const empty = await fetch(runtime.origin + '/standard/cards/?query=ABSENT_SEARCH');
    assert.equal(empty.status, 200);
    assert.match(await empty.text(), /Карты не найдены/);
    assert.equal((await fetch(runtime.origin + '/standard/cards/invalid/')).status, 404);
    for (const userAgent of ['Mozilla/5.0', 'Googlebot']) {
      for (const id of ['ABSENT_CARD', 'blizzard%253A12345']) {
        const missing = await fetch(`${runtime.origin}/standard/cards/wild/${id}/`, { headers: { 'User-Agent': userAgent, 'x-hearthpulse-card-id': 'blizzard:12345', 'x-hearthpulse-card-format': 'standard' } });
        assert.equal(missing.status, 404, `${id}: ${runtime.output()}`);
        const missingHtml = await missing.text();
        assert.match(missingHtml, /noindex/); assert.doesNotMatch(missingHtml, /rel="canonical"/);
      }
    }
    for (const segment of ['blizzard:12345', 'blizzard%3a12345']) {
      const alias = await fetch(`${runtime.origin}/standard/cards/standard/${segment}/`);
      assert.equal(alias.status, 200);
      assert.match(await alias.text(), /rel="canonical" href="https:\/\/hearthpulse.net\/standard\/cards\/standard\/blizzard%3A12345\/"/);
    }
    const ordinary = await fetch(`${runtime.origin}/standard/cards/wild/CARD_QA_0002/`);
    assert.equal(ordinary.status, 200);
    const redirect = await fetch(`${runtime.origin}${path.slice(0, -1)}?period=7d&rank=diamond`, { redirect: 'manual' });
    assert.equal(redirect.status, 308);
    assert.ok(redirect.headers.get('location').endsWith(`${path}?period=7d&rank=diamond`));
    const api = '/api/constructed-cards/blizzard%3A12345?format=standard&period=1d&rank=legend';
    const anonymous = await (await fetch(runtime.origin + api)).json();
    assert.equal(anonymous.statsAccess, false); assert.equal(anonymous.card.stats, null);
    const cookie = { Cookie: runtime.cookie };
    const identity = await (await fetch(`${runtime.origin}/api/auth/me`, { headers: cookie })).json();
    assert.equal(identity.user?.id, 'card-reader', 'session is valid before testing subscription policy');
    const unsubscribed = await (await fetch(runtime.origin + api, { headers: cookie })).json();
    assert.equal(unsubscribed.statsAccess, false);
    runtime.grant();
    const subscribed = await (await fetch(runtime.origin + api, { headers: cookie })).json();
    assert.equal(subscribed.statsAccess, true); assert.equal(subscribed.card.stats.deckWinrate, 53);
    const privateRequest = await fetch(runtime.origin + path, { headers: cookie });
    assert.doesNotMatch(await privateRequest.text(), /"deckWinrate":53|card-reader@example/);
    const privateCatalog = await fetch(runtime.origin + '/standard/cards/wild/?sort=winrate', { headers: cookie });
    assert.doesNotMatch(await privateCatalog.text(), /deckWinrate[^<]{0,10}:53|card-reader@example/);
    runtime.backend.database.prepare('UPDATE users SET blocked_at = ? WHERE id = ?').run(new Date().toISOString(), 'card-reader');
    const blocked = await (await fetch(runtime.origin + api, { headers: cookie })).json();
    assert.equal(blocked.statsAccess, false); assert.equal(blocked.card.stats, null);
    const sitemap = await fetch(`${runtime.origin}/sitemaps/standard-cards.xml`);
    assert.equal(sitemap.status, 200);
    assert.match(await sitemap.text(), /standard\/cards\/standard\/blizzard%3A12345\//);
    for (const [page, heading] of [['faq', 'Частые вопросы'], ['privacy', 'Политика конфиденциальности'], ['terms', 'Условия использования']]) {
      const support = await fetch(`${runtime.origin}/${page}/`, { headers: cookie });
      assert.equal(support.status, 200);
      const supportHtml = await support.text();
      assert.ok(supportHtml.includes(heading));
      assert.match(supportHtml, /\/_next\/static\//);
      assert.ok(supportHtml.includes(`rel="canonical" href="https://hearthpulse.net/${page}/"`));
      assert.equal((supportHtml.match(/<main\b/g) || []).length, 1);
      assert.doesNotMatch(supportHtml, /card-reader@example/);
    }
    const galleryImage = 'qa-gallery.webp';
    const uploadDirectory = join(runtime.backend.dataDirectory, 'uploads', 'gallery');
    mkdirSync(uploadDirectory, { recursive: true });
    copyFileSync(resolve('public/arena-logo-icon.webp'), join(uploadDirectory, galleryImage));
    writeFileSync(join(runtime.backend.dataDirectory, 'gallery.json'), JSON.stringify({
      items: [{ id: 'qa-gallery', title: 'Контрольный арт', description: 'Проверка серверной галереи',
        tag: 'Тест', source: 'HearthPulse', width: 128, height: 128, bytes: 2048,
        format: 'webp', originalFile: galleryImage, previewFile: galleryImage,
        thumbFile: galleryImage, createdAt: '2026-09-24T00:00:00.000Z', updatedAt: '2026-09-24T00:00:00.000Z' }],
      updatedAt: '2026-09-24T00:00:00.000Z',
    }));
    const gallery = await fetch(`${runtime.origin}/gallery/`, { headers: cookie });
    assert.equal(gallery.status, 200, runtime.output());
    const galleryHtml = await gallery.text();
    assert.match(galleryHtml, /Контрольный арт/);
    assert.match(galleryHtml, /rel="canonical" href="https:\/\/hearthpulse.net\/gallery\/"/);
    assert.match(galleryHtml, /property="og:title" content="Галерея артов Hearthstone \| HS-Arena"/);
    assert.match(galleryHtml, /property="og:image" content="https:\/\/hearthpulse.net\/assets\/og-preview.png"/);
    assert.match(galleryHtml, /name="twitter:card" content="summary_large_image"/);
    assert.match(galleryHtml, /\/api\/gallery\/qa-gallery\/thumb/);
    assert.equal((galleryHtml.match(/<main\b/g) || []).length, 1);
    assert.doesNotMatch(galleryHtml, /card-reader@example/);
    assert.equal((await fetch(`${runtime.origin}/api/gallery/qa-gallery/thumb`)).status, 200);

    const developerApi = await fetch(`${runtime.origin}/developers/api/`);
    assert.equal(developerApi.status, 200, runtime.output());
    const developerApiHtml = await developerApi.text();
    assert.match(developerApiHtml, /<h1>Manacost Public API<\/h1>/);
    assert.match(developerApiHtml, /rel="canonical" href="https:\/\/hearthpulse.net\/developers\/api\/"/);
    assert.equal((developerApiHtml.match(/<main\b/g) || []).length, 1);
    assert.doesNotMatch(developerApiHtml, /card-reader@example/);

    const emptyArticles = await fetch(`${runtime.origin}/articles/`);
    assert.equal(emptyArticles.status, 200, runtime.output());
    assert.match(await emptyArticles.text(), /Статьи скоро появятся/);

    writeFileSync(join(runtime.backend.dataDirectory, 'articles.json'), JSON.stringify({
      articles: [{ id: 'qa-public-article', title: 'Публичная статья Next', date: '2026-09-24',
        image: '/arena-logo-icon.webp', excerpt: 'Контрольный материал', tag: 'Арена',
        mode: 'general', url: 'https://example.com/article' }], updatedAt: '2026-09-24T00:00:00.000Z',
    }));
    const articles = await fetch(`${runtime.origin}/articles/`, { headers: cookie });
    assert.equal(articles.status, 200, runtime.output());
    const articlesHtml = await articles.text();
    assert.match(articlesHtml, /Публичная статья Next/);
    assert.match(articlesHtml, /rel="canonical" href="https:\/\/hearthpulse.net\/articles\/"/);
    assert.equal((articlesHtml.match(/<main\b/g) || []).length, 1);
    assert.doesNotMatch(articlesHtml, /card-reader@example|manacost_auth_token/);
    const facetedArticles = await fetch(`${runtime.origin}/articles/?search=meta`);
    assert.match(await facetedArticles.text(), /name="robots" content="noindex, follow"/);

    const home = await fetch(`${runtime.origin}/`, { headers: cookie });
    assert.equal(home.status, 200, runtime.output());
    const homeHtml = await home.text();
    assert.match(homeHtml, /Мета/);
    assert.match(homeHtml, /Публичная статья Next/);
    assert.match(homeHtml, /rel="canonical" href="https:\/\/hearthpulse.net\/"/);
    assert.equal((homeHtml.match(/<main\b/g) || []).length, 1);
    assert.doesNotMatch(homeHtml, /card-reader@example|manacost_auth_token/);
    const loginHome = await fetch(`${runtime.origin}/?login`, { headers: cookie });
    assert.equal(loginHome.status, 200, runtime.output());
    assert.match(await loginHome.text(), /name="robots" content="noindex, nofollow"/);

    const classes = await fetch(`${runtime.origin}/classes/`, { headers: cookie });
    assert.equal(classes.status, 200, runtime.output());
    const classesHtml = await classes.text();
    assert.match(classesHtml, /<h1>Классы<\/h1>/);
    assert.match(classesHtml, /Винрейт классов на Арене Hearthstone/);
    assert.match(classesHtml, /rel="canonical" href="https:\/\/hearthpulse.net\/classes\/"/);
    assert.equal((classesHtml.match(/<main\b/g) || []).length, 1);
    assert.doesNotMatch(classesHtml, /arena-class-rank|card-reader@example|manacost_auth_token/);

    const tierlist = await fetch(`${runtime.origin}/tierlist/`, { headers: cookie });
    assert.equal(tierlist.status, 200, runtime.output());
    const tierlistHtml = await tierlist.text();
    assert.match(tierlistHtml, /<h1>Тир-лист карт Арены Hearthstone<\/h1>/);
    assert.match(tierlistHtml, /rel="canonical" href="https:\/\/hearthpulse.net\/tierlist\/"/);
    assert.equal((tierlistHtml.match(/<main\b/g) || []).length, 1);
    assert.doesNotMatch(tierlistHtml, /CARD_1|card-reader@example|manacost_auth_token/);

    const legendaries = await fetch(`${runtime.origin}/legendaries/`, { headers: cookie });
    assert.equal(legendaries.status, 200, runtime.output());
    const legendariesHtml = await legendaries.text();
    assert.match(legendariesHtml, /<h1>Легендарки<\/h1>/);
    assert.match(legendariesHtml, /rel="canonical" href="https:\/\/hearthpulse.net\/legendaries\/"/);
    assert.equal((legendariesHtml.match(/<main\b/g) || []).length, 1);
    assert.doesNotMatch(legendariesHtml, /CARD_1|card-reader@example|manacost_auth_token/);

    const matchups = await fetch(`${runtime.origin}/standard/matchups/`, { headers: cookie });
    assert.equal(matchups.status, 200, runtime.output());
    const matchupsHtml = await matchups.text();
    assert.match(matchupsHtml, /<h1>Матчапы<\/h1>/);
    assert.match(matchupsHtml, /rel="canonical" href="https:\/\/hearthpulse.net\/standard\/matchups\/"/);
    assert.equal((matchupsHtml.match(/<main\b/g) || []).length, 1);
    assert.doesNotMatch(matchupsHtml, /Control Warrior|card-reader@example|manacost_auth_token/);

    const meta = await fetch(`${runtime.origin}/standard/meta/`, { headers: cookie });
    assert.equal(meta.status, 200, runtime.output());
    const metaHtml = await meta.text();
    assert.match(metaHtml, /rel="canonical" href="https:\/\/hearthpulse.net\/standard\/meta\/"/);
    assert.equal((metaHtml.match(/<main\b/g) || []).length, 1);
    assert.doesNotMatch(metaHtml, /deckCode|card-reader@example|manacost_auth_token/);

    const emptyContests = await fetch(`${runtime.origin}/contests/`);
    assert.equal(emptyContests.status, 200, runtime.output());
    assert.match(await emptyContests.text(), /Сейчас активных конкурсов нет/);
    const now = new Date().toISOString();
    runtime.backend.database.prepare(`INSERT INTO contests
      (id, title, description, prize, image_url, starts_at, ends_at, status,
       winners_json, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'qa-next-contest', 'Проверочный конкурс Next', 'Публичное описание', 'Приз', '',
      null, null, 'active', '[]', 'card-reader', now, now,
    );
    const contests = await fetch(`${runtime.origin}/contests/`, { headers: cookie });
    assert.equal(contests.status, 200, runtime.output());
    const contestsHtml = await contests.text();
    assert.match(contestsHtml, /Проверочный конкурс Next/);
    assert.match(contestsHtml, /rel="canonical" href="https:\/\/hearthpulse.net\/contests\/"/);
    assert.equal((contestsHtml.match(/<main\b/g) || []).length, 1);
    assert.doesNotMatch(contestsHtml, /createdBy|card-reader@example|manacost_auth_token/);
  } finally { await runtime.close(); }
});
