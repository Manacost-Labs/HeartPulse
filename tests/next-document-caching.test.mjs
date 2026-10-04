import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { isPublicHomeDocument, publicDocumentHeaders, PUBLIC_DOCUMENT_CACHE_CONTROL } from '../apps/public-web/documentCaching.mjs';

// Next matches `headers()` sources with this matcher (strict trailing slash).
const { getPathMatch } = createRequire(import.meta.url)('next/dist/shared/lib/router/utils/path-match');
const rules = publicDocumentHeaders().map(rule => ({ ...rule, match: getPathMatch(rule.source, { strict: true, removeUnnamedParams: true }) }));
const cached = path => rules.some(rule => rule.match(path) !== false);

test('anonymous public route families may be restored from the back/forward cache', () => {
  for (const rule of rules) assert.deepEqual(rule.headers, [{ key: 'Cache-Control', value: 'private, no-cache' }]);
  assert.equal(PUBLIC_DOCUMENT_CACHE_CONTROL, 'private, no-cache');
  for (const path of ['/tierlist/', '/classes/', '/legendaries/', '/articles/', '/contests/', '/gallery/',
    '/standard/meta/', '/standard/meta/standard/aggro-paladin/', '/standard/matchups/', '/standard/archetypes/',
    '/standard/archetypes/standard/aggro-paladin/', '/standard/cards/', '/standard/cards/standard/',
    '/standard/cards/standard/blizzard:12345/', '/standard/fun-decks/', '/standard/vicious-gold/',
    '/heroes/', '/heroes/107183/', '/library/', '/library/minions/', '/library/minions/name-123/',
    '/library/archive/', '/library/archive/minions/name-123/', '/battlegrounds/tier-list/',
    '/battlegrounds/tier-builder/', '/battlegrounds/strategies/', '/cosmetics/', '/cosmetics/card-backs/',
    '/cosmetics/card-backs/123/', '/guides-archive/', '/guides-archive/some-guide/']) {
    assert.ok(cached(path), `${path} must send ${PUBLIC_DOCUMENT_CACHE_CONTROL}`);
  }
});

test('cookie-dependent, account, API and prerendered documents keep their own caching', () => {
  for (const path of ['/', '/admin/', '/deck-builder/', '/archetypes/', '/archetypes/wild/', '/archetypes/12/',
    '/connect/', '/id/abc/', '/profiles/abc/', '/identity/telegram/', '/api/auth/me', '/api/bg/tier-lists/',
    '/_next/static/chunks/main.js', '/faq/', '/privacy/', '/terms/', '/developers/api/', '/health/next/',
    '/tierlist', '/standard/', '/battlegrounds/', '/battlegrounds/other/', '/standard/other/', '/no-such-page/']) {
    assert.equal(cached(path), false, `${path} must keep the header Next or Nginx chooses`);
  }
});

test('the home page is public, its login query is the account page', () => {
  assert.equal(isPublicHomeDocument('/', new URLSearchParams('')), true);
  assert.equal(isPublicHomeDocument('/', new URLSearchParams('utm_source=x')), true);
  assert.equal(isPublicHomeDocument('/', new URLSearchParams('login')), false);
  assert.equal(isPublicHomeDocument('/', new URLSearchParams('login=1')), false);
  assert.equal(isPublicHomeDocument('/tierlist/', new URLSearchParams('')), false);
});
