import assert from 'node:assert/strict';
import test from 'node:test';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

test('Next card pilot uses real backend membership, SSR, access policy and recovery', { timeout: 90000 }, async () => {
  const runtime = await startPublicCardPilot();
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
  } finally { await runtime.close(); }
});
