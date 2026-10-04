import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
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

// `private, no-cache` is safe only while the HTML of these routes is the same
// for every visitor. Walks the server modules of each listed route family
// (stopping at client components, which cannot read request cookies) and
// rejects any cookie read, header forwarding of cookies or the admin check.
const root = resolve(import.meta.dirname, '..');
const app = join(root, 'apps/public-web/app');
const FAMILY_DIRECTORIES = ['articles', 'classes', 'contests', 'gallery', 'legendaries', 'tierlist',
  'battlegrounds/strategies', 'battlegrounds/tier-builder', 'battlegrounds/tier-list', 'cosmetics',
  'guides-archive', 'heroes', 'library', 'standard/archetypes', 'standard/cards', 'standard/fun-decks',
  'standard/matchups', 'standard/meta', 'standard/vicious-gold'];
const COOKIE_READ = [/\bcookies\s*\(/, /adminAccess/, /get\(\s*['"]cookie['"]\s*\)/, /\bheaders\.cookie\b/, /\bdraftMode\s*\(/];

function files(directory) {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? files(path) : /\.(?:ts|tsx|mjs)$/.test(name) ? [path] : [];
  });
}

function resolveImport(from, specifier) {
  const base = specifier.startsWith('@/') ? join(root, specifier.slice(2))
    : specifier.startsWith('.') ? resolve(dirname(from), specifier) : null;
  if (!base) return null;
  return ['', '.ts', '.tsx', '.mjs', '/index.ts', '/index.tsx'].map(suffix => base + suffix)
    .find(path => existsSync(path) && statSync(path).isFile()) ?? null;
}

test('the cached route families render the same HTML for every visitor', () => {
  const pending = ['page.tsx', 'layout.tsx'].map(name => join(app, name)).filter(existsSync)
    .concat(FAMILY_DIRECTORIES.flatMap(directory => files(join(app, directory))));
  const seen = new Set();
  const offenders = [];
  while (pending.length) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    if (/^\s*['"]use client['"]/.test(source)) continue;
    for (const pattern of COOKIE_READ) {
      if (pattern.test(source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''))) offenders.push(`${relative(root, file)} ${pattern}`);
    }
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)['"]([^'"]+)['"]/g)) {
      const target = resolveImport(file, match[1]);
      if (target) pending.push(target);
    }
  }
  assert.ok(seen.size > 40, `the walk must reach the route modules (${seen.size})`);
  assert.deepEqual(offenders, [], 'a cached public document must not depend on the visitor\'s cookies');
});
