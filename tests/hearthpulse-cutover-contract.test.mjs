import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const application = readFileSync('deploy/nginx/hearthpulse-shadow-app.conf', 'utf8');
const legacyRedirect = readFileSync('deploy/nginx/arena-canonical-host-redirect.conf', 'utf8');
const legacyApplication = readFileSync('deploy/nginx/arena-legacy-app-redirect.conf', 'utf8');
const legacyCdn = readFileSync('deploy/nginx/arena-legacy-cdn-redirect.conf', 'utf8');
const monitor = readFileSync('deploy/monitor-hearthpulse-shadow.sh', 'utf8');
const domain = readFileSync('src/config/domain.ts', 'utf8');
const routeInventory = JSON.parse(readFileSync('config/public-route-inventory.json', 'utf8'));
const runtimeConfig = readFileSync('public/runtime-config.js', 'utf8');
const publicAssetDelivery = readFileSync('shared/publicAssetDelivery.ts', 'utf8');
const robots = readFileSync('public/robots.txt', 'utf8');

assert.match(domain, /CANONICAL_HOST = 'hearthpulse\.net'/,
  'the browser canonical host must switch to hearthpulse.net');
assert.equal(routeInventory.canonicalOrigin, 'https://hearthpulse.net');
assert.match(runtimeConfig, /enabled:\s*true/,
  'the final application must use the public HearthPulse CDN');
assert.match(runtimeConfig, /origin:\s*'https:\/\/cdn\.hearthpulse\.net'/);
assert.match(publicAssetDelivery, /PUBLIC_CARD_IMAGE_CDN_ORIGIN = 'https:\/\/cdn\.hearthpulse\.net'/,
  'the browser CDN allowlist must accept the final public image host');
assert.match(robots, /Sitemap:\s+https:\/\/hearthpulse\.net\/sitemap\.xml/);

assert.match(application, /server_name\s+hearthpulse\.net;/,
  'the canonical application server must own only the apex host');
assert.match(application,
  /server_name\s+www\.hearthpulse\.net;[\s\S]*return\s+301\s+https:\/\/hearthpulse\.net\$request_uri;/,
  'www must redirect to the apex while preserving path and query');
assert.match(application, /proxy_set_header\s+X-Forwarded-Host\s+\$host;/,
  'the application must observe the new public host for cookies and callbacks');
assert.doesNotMatch(application,
  /location\s+\/\s*\{[^}]*X-Robots-Tag\s+"noindex, nofollow"/s,
  'the canonical application must be indexable after cutover');
assert.match(application, /Strict-Transport-Security\s+"max-age=31536000"/,
  'the canonical host must use the long-lived HSTS policy after verification');

assert.match(legacyRedirect,
  /return\s+301\s+https:\/\/hearthpulse\.net\$arena_canonical_edge_path\$is_args\$args;/,
  'the former canonical host must redirect paths and query strings to HearthPulse');
assert.match(legacyApplication, /server_name\s+arena\.hs-manacost\.ru;/);
assert.match(legacyApplication, /return\s+301\s+https:\/\/hearthpulse\.net\$request_uri;/);
assert.match(legacyCdn, /server_name\s+cdn\.arena\.hs-manacost\.ru;/);
assert.match(legacyCdn, /return\s+301\s+https:\/\/cdn\.hearthpulse\.net\$request_uri;/);
for (const host of ['arena.hs-manacost.ru', 'cdn.arena.hs-manacost.ru']) {
  assert.ok(monitor.includes(host), `the regional monitor must verify legacy redirect host ${host}`);
}
assert.match(monitor, /194\.67\.92\.242[\s\S]*moscow|moscow[\s\S]*194\.67\.92\.242/i,
  'the monitor must keep an explicit Moscow availability check');

console.log('HearthPulse final cutover contract passed');
