import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const projectRoot = resolve(new URL('..', import.meta.url).pathname);
const robots = readFileSync(join(projectRoot, 'public/robots.txt'), 'utf8');
const seoMap = readFileSync(join(projectRoot, 'deploy/nginx/arena-seo-map.conf'), 'utf8');
const htmlRouting = readFileSync(join(projectRoot, 'deploy/nginx/arena-html-routing.conf'), 'utf8');

function parseGroups(source) {
  const groups = [];
  let current = null;
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, '').trim();
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (name === 'user-agent') {
      current = { userAgent: value.toLowerCase(), rules: [] };
      groups.push(current);
    } else if (current && (name === 'allow' || name === 'disallow')) {
      current.rules.push({ type: name, value });
    }
  }
  return groups;
}

const groups = parseGroups(robots);
const wildcard = groups.find(group => group.userAgent === '*');
assert.ok(wildcard, 'robots.txt must define a wildcard crawler policy');

function effectiveRules(userAgent) {
  return groups.find(group => group.userAgent === userAgent.toLowerCase())?.rules
    ?? wildcard.rules;
}

function isAllowed(path, rules) {
  const matches = rules
    .filter(rule => rule.value && path.startsWith(rule.value))
    .sort((left, right) => right.value.length - left.value.length
      || (left.type === 'allow' ? -1 : 1));
  return matches[0]?.type !== 'disallow';
}

for (const crawler of ['googlebot', 'yandexbot', 'bingbot']) {
  const rules = effectiveRules(crawler);
  for (const technicalPath of [
    '/api',
    '/api/health/ready',
    '/health',
    '/health/live',
    '/metrics',
    '/_internal/tierlist/cache-bust',
  ]) {
    assert.equal(isAllowed(technicalPath, rules), false,
      `${crawler} must not spend crawl budget on ${technicalPath}`);
  }
  for (const publicResource of [
    '/',
    '/admin/',
    '/?login',
    '/assets/app.js',
    '/fonts/site.woff2',
    '/class_icon/mage.png',
    '/main_assets/frame.webp',
    '/wallpaper/arena.webp',
  ]) {
    assert.equal(isAllowed(publicResource, rules), true,
      `${crawler} must be able to crawl ${publicResource} and observe its HTTP/meta policy`);
  }
}

const sitemapLines = robots.split(/\r?\n/)
  .map(line => line.trim())
  .filter(line => /^sitemap:/i.test(line));
assert.deepEqual(sitemapLines, ['Sitemap: https://hearthpulse.net/sitemap.xml'],
  'robots.txt must expose the canonical sitemap exactly once');
assert.doesNotMatch(robots, /^\s*noindex\s*:/im,
  'robots.txt does not support a noindex directive');

for (const authParameter of ['login', 'profile', 'auth', 'code', 'state', 'returnTo', 'user_code']) {
  assert.match(seoMap, new RegExp(`(?:^|\\W)${authParameter}(?:\\W|$)`),
    `${authParameter} must be covered by the server-side auth noindex map`);
}
assert.match(htmlRouting, /location\s+=\s+\/admin\/\s*\{[\s\S]*?X-Robots-Tag\s+"noindex, nofollow"\s+always;/,
  'admin must stay crawlable but return a server-side noindex header');
assert.match(htmlRouting, /location\s+=\s+\/deck-builder\/\s*\{[\s\S]*?X-Robots-Tag\s+"noindex, nofollow"\s+always;/,
  'deck-builder must stay crawlable but return a server-side noindex header');
for (const endpoint of ['api', 'health', 'metrics']) {
  assert.match(htmlRouting, new RegExp(`location\\s+=\\s+/${endpoint}\\s*\\{[\\s\\S]*?X-Robots-Tag\\s+"noindex, nofollow"\\s+always;`),
    `/${endpoint} must combine crawl blocking with an X-Robots-Tag response`);
}

console.log(`robots policy contract passed (${groups.length} crawler groups)`);
