import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const application = readFileSync('deploy/nginx/hearthpulse-shadow-app.conf', 'utf8');
const cdn = readFileSync('deploy/nginx/hearthpulse-shadow-cdn.conf', 'utf8');
const monitor = readFileSync('deploy/monitor-hearthpulse-shadow.sh', 'utf8');
const monitorService = readFileSync('deploy/systemd/hearthpulse-shadow-monitor.service', 'utf8');

assert.match(application, /server_name\s+hearthpulse\.net;/);
assert.match(application, /server_name\s+www\.hearthpulse\.net;/);
assert.match(application, /listen\s+443\s+ssl\s+http2;/,
  'the application must remain compatible with the Nginx 1.24 regional edge');
assert.doesNotMatch(application, /http2\s+on;/);
assert.match(application, /ssl_certificate\s+\/etc\/nginx\/ssl\/hearthpulse\.net\/fullchain\.pem;/);
assert.match(application, /ssl_certificate_key\s+\/etc\/nginx\/ssl\/hearthpulse\.net\/privkey\.pem;/);
assert.match(application, /proxy_set_header\s+Host\s+arena\.hs-manacost\.ru;/,
  'origin transport must keep the established routing host');
assert.match(application, /proxy_set_header\s+X-Forwarded-Host\s+\$host;/,
  'the application must receive the canonical public host');
assert.match(application, /proxy_ssl_name\s+arena\.hs-manacost\.ru;/);
assert.match(application, /proxy_hide_header\s+Strict-Transport-Security;/);
assert.match(application, /Strict-Transport-Security\s+"max-age=31536000"/);
assert.doesNotMatch(application,
  /location\s+\/\s*\{[^}]*X-Robots-Tag\s+"noindex, nofollow"/s,
  'the canonical application location must be indexable');
assert.match(application,
  /server_name\s+www\.hearthpulse\.net;[\s\S]*return\s+301\s+https:\/\/hearthpulse\.net\$request_uri;/,
  'www must normalize to the apex in one hop');

const canonicalApplicationLocation = application.match(
  /location \/ \{\n\s+proxy_pass https:\/\/hs_arena_origin;[\s\S]*?\n\s+\}/,
)?.[0];
assert.ok(canonicalApplicationLocation, 'the canonical proxy location must exist');
assert.match(canonicalApplicationLocation, /proxy_no_cache\s+1;/,
  'the canonical edge must not store application responses in its proxy cache');
assert.match(canonicalApplicationLocation, /proxy_cache_bypass\s+1;/,
  'the canonical edge must always bypass its proxy cache');
assert.doesNotMatch(canonicalApplicationLocation, /add_header\s+Cache-Control/,
  'the canonical edge must preserve the application Cache-Control policy');
assert.match(application,
  /location = \/_proxy_health \{[\s\S]*?add_header Cache-Control "no-store" always;/,
  'the synthetic health endpoint must remain uncacheable');

assert.match(cdn, /server_name\s+cdn\.hearthpulse\.net;/);
assert.match(cdn, /ssl_certificate\s+\/etc\/nginx\/ssl\/hearthpulse\.net\/fullchain\.pem;/);
assert.match(cdn, /location\s+~\s+\^\/\(\?:api\/card-image\//,
  'the CDN must explicitly allow only public paths');
assert.match(cdn, /add_header\s+Access-Control-Allow-Origin\s+"\*"\s+always;/);
assert.match(cdn, /location\s+\/\s*\{[^}]*return\s+404;/s,
  'the CDN must keep private and unknown paths closed');
assert.match(cdn, /Strict-Transport-Security\s+"max-age=31536000"/);

for (const address of ['162.19.220.14', '194.67.92.242', '186.246.28.244']) {
  assert.ok(monitor.includes(address), `the monitor must probe ${address} directly`);
}
for (const host of ['www.hearthpulse.net', 'arena.hs-manacost.ru', 'cdn.arena.hs-manacost.ru']) {
  assert.ok(monitor.includes(host), `the monitor must verify ${host}`);
}
assert.match(monitor, /moscow:194\.67\.92\.242/,
  'Moscow availability must remain a named first-class check');
assert.match(monitor, /ipv6_answers/);
assert.match(monitor, /app_robots[\s\S]*!= \*noindex\*/,
  'the monitor must reject an accidentally noindexed canonical site');
assert.match(monitor, /app_hsts[\s\S]*max-age=31536000/);
assert.match(monitor, /api\/subscription\/status/,
  'the monitor must prove that the CDN does not expose private APIs');
assert.match(monitorService,
  /ExecStart=\/bin\/bash \/var\/www\/koloda\/data\/www\/hs-arena\.ru\/current\/deploy\/monitor-hearthpulse-shadow\.sh/,
  'the service must run the immutable release script');

console.log('HearthPulse canonical nginx contract passed');
