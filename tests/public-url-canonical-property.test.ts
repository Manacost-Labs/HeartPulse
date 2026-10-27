import assert from 'node:assert/strict';
import test from 'node:test';
import fc from 'fast-check';
import { normalizePublicPathname, resolvePublicUrlPolicy } from '../src/shared/seo/publicUrlPolicy.js';
import { assertAsyncProperty, assertProperty } from './helpers/propertyRuns.js';

const ORIGIN = 'https://hearthpulse.net';
const STRICTNESS = { index: 0, 'noindex-follow': 1, 'noindex-nofollow': 2 } as const;

// Path segments from the site's own sections mixed with what links, typos and bots send.
const segment = fc.oneof(
  fc.constantFrom('standard', 'wild', 'cards', 'archetypes', 'meta', 'library', 'archive', 'minions', 'spells',
    'heroes', 'cosmetics', 'coins', 'guides-archive', 'streamers', 'articles', 'id', 'u', 'r', 'decks', 'admin'),
  fc.constantFrom('blizzard:12345', 'blizzard%3a12345', 'CORE_CS2_023', 'murloc-tidehunter-976', '%D1%91%D0%B6-5',
    'a%2Fb-7', '%', '%25', 'x%20y', '2147483647', '2147483648', '..', '.', ''),
  fc.stringMatching(/^[A-Za-z0-9._~:%-]{1,12}$/),
);
const pathname = fc.tuple(fc.array(segment, { maxLength: 5 }), fc.constantFrom('', '/', '//'), fc.constantFrom('', '?a=1', '#top'))
  .map(([segments, end, rest]) => `/${segments.join('/')}${end}${rest}`);
const search = fc.array(fc.tuple(fc.constantFrom('page', 'sort', 'q', 'login', 'admin', 'utm_source', 'list'), fc.string({ maxLength: 4 })),
  { maxLength: 3 }).map(pairs => new URLSearchParams(pairs).toString());

test('the canonical URL of a canonical URL is itself, on the same page', async () => {
  await assertAsyncProperty(fc.asyncProperty(pathname, async path => {
    const first = await resolvePublicUrlPolicy(path);
    if (!first.canonicalUrl) return;
    const again = await resolvePublicUrlPolicy(new URL(first.canonicalUrl).pathname);

    assert.equal(again.canonicalUrl, first.canonicalUrl);
    assert.equal(again.routeId, first.routeId);
  }));
});

test('a canonical URL is the site origin plus a clean path with one trailing slash', async () => {
  await assertAsyncProperty(fc.asyncProperty(pathname, search, async (path, query) => {
    const { canonicalUrl } = await resolvePublicUrlPolicy(path, query);
    if (!canonicalUrl) return;

    assert.ok(canonicalUrl.startsWith(`${ORIGIN}/`), canonicalUrl);
    assert.match(canonicalUrl.slice(ORIGIN.length), /^\/(?:[^/?#]+\/)*$/);
  }));
});

test('query parameters never change the canonical URL and can only make indexing stricter', async () => {
  await assertAsyncProperty(fc.asyncProperty(pathname, search, async (path, query) => {
    const clean = await resolvePublicUrlPolicy(path);
    const withQuery = await resolvePublicUrlPolicy(path, `?${query}`);

    assert.equal(withQuery.canonicalUrl, clean.canonicalUrl);
    assert.equal(withQuery.routeId, clean.routeId);
    assert.ok(STRICTNESS[withQuery.indexPolicy] >= STRICTNESS[clean.indexPolicy]);
  }));
});

test('normalizing a path twice changes nothing', () => {
  assertProperty(fc.property(fc.oneof(pathname, fc.string({ maxLength: 20 })), path => {
    assert.equal(normalizePublicPathname(normalizePublicPathname(path)), normalizePublicPathname(path));
  }));
});

test('a path is read without its query, fragment and trailing slashes', () => {
  assert.equal(normalizePublicPathname(''), '/');
  assert.equal(normalizePublicPathname('?login=1'), '/');
  assert.equal(normalizePublicPathname('#top'), '/');
  assert.equal(normalizePublicPathname('heroes'), '/heroes');
  assert.equal(normalizePublicPathname('/heroes///'), '/heroes');
  assert.equal(normalizePublicPathname('/heroes/?page=2#list'), '/heroes');
});

test('removed sections and their old deep links are closed to indexing', async () => {
  for (const [path, routeId] of [['/decks/', 'removed-decks'], ['/decks/old/list/', 'removed-decks'], ['/jobs', 'removed-jobs']]) {
    const policy = await resolvePublicUrlPolicy(path);
    assert.equal(policy.routeId, routeId, path);
    assert.equal(policy.known, true, path);
    assert.equal(policy.canonicalUrl, null, path);
  }
  const unknown = await resolvePublicUrlPolicy('/no-such-page/');
  assert.deepEqual([unknown.routeId, unknown.known, unknown.canonicalUrl, unknown.indexPolicy],
    ['unknown-path', false, null, 'noindex-nofollow']);
});

test('a public profile id must fit the site’s id range', async () => {
  assert.equal((await resolvePublicUrlPolicy('/id/2147483647/')).canonicalUrl, `${ORIGIN}/id/2147483647/`);
  assert.equal((await resolvePublicUrlPolicy('/id/1/')).routeId, 'public-profile');
  assert.equal((await resolvePublicUrlPolicy('/id/2147483648/')).routeId, 'unknown-path');
  assert.equal((await resolvePublicUrlPolicy('/id/0/')).routeId, 'unknown-path');
});

test('an encoded spelling of a fixed section name is not that section', async () => {
  assert.equal((await resolvePublicUrlPolicy('/cosmetics/heroes/')).routeId, 'cosmetics-kind');
  assert.equal((await resolvePublicUrlPolicy('/cosmetics/%68eroes/')).routeId, 'unknown-path');
  assert.equal((await resolvePublicUrlPolicy('/streamers/abc%5F1/')).routeId, 'unknown-path');
  assert.equal((await resolvePublicUrlPolicy('/library/minions/%/')).routeId, 'unknown-path');
});

test('a search string reads the same with or without its question mark', async () => {
  const withMark = await resolvePublicUrlPolicy('/standard/cards/wild/', '?page=2');
  const withoutMark = await resolvePublicUrlPolicy('/standard/cards/wild/', 'page=2');

  assert.equal(withMark.indexPolicy, 'noindex-follow');
  assert.equal(withoutMark.indexPolicy, 'noindex-follow');
  assert.equal(withMark.canonicalUrl, `${ORIGIN}/standard/cards/wild/`);
  assert.equal((await resolvePublicUrlPolicy('/', '?page=2')).indexPolicy, 'index');
});
