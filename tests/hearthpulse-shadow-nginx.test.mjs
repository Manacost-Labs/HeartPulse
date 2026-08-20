import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const application = readFileSync('deploy/nginx/hearthpulse-shadow-app.conf', 'utf8');
const cdn = readFileSync('deploy/nginx/hearthpulse-shadow-cdn.conf', 'utf8');
const monitor = readFileSync('deploy/monitor-hearthpulse-shadow.sh', 'utf8');
const monitorService = readFileSync('deploy/systemd/hearthpulse-shadow-monitor.service', 'utf8');

assert.match(application, /server_name\s+hearthpulse\.net\s+www\.hearthpulse\.net;/,
  'the shadow application host must accept both the apex and www names');
assert.match(application, /listen\s+443\s+ssl\s+http2;/,
  'the shadow host must remain compatible with the Nginx 1.24 regional edge');
assert.doesNotMatch(application, /http2\s+on;/);
assert.match(application, /ssl_certificate\s+\/etc\/nginx\/ssl\/hearthpulse\.net\/fullchain\.pem;/);
assert.match(application, /ssl_certificate_key\s+\/etc\/nginx\/ssl\/hearthpulse\.net\/privkey\.pem;/);
assert.match(application, /proxy_set_header\s+Host\s+arena\.hs-manacost\.ru;/,
  'the shadow host must keep the established origin routing contract');
assert.match(application, /proxy_ssl_name\s+arena\.hs-manacost\.ru;/);
assert.match(application, /proxy_hide_header\s+Strict-Transport-Security;/,
  'the shadow host must never leak the origin long-lived HSTS policy');
assert.match(application, /location\s+\/\s*\{[^}]*Strict-Transport-Security\s+"max-age=300"/s,
  'location-level headers must preserve the reversible short HSTS policy');
assert.match(application, /add_header\s+X-Robots-Tag\s+"noindex, nofollow"\s+always;/,
  'the shadow host must not become an indexable duplicate before cutover');
assert.doesNotMatch(application, /return\s+30[18]\s+https:\/\/arena\.hs-manacost\.ru/,
  'the shadow host must render the application for pre-cutover verification');
assert.match(application, /sub_filter_types\s+application\/json;/,
  'shadow API responses must rewrite absolute resource URLs without changing HTML canonical tags');
assert.match(application, /sub_filter\s+'https:\/\/arena\.hs-manacost\.ru'\s+'https:\/\/hearthpulse\.net';/);

assert.match(cdn, /server_name\s+cdn\.hearthpulse\.net;/);
assert.match(cdn, /ssl_certificate\s+\/etc\/nginx\/ssl\/hearthpulse\.net\/fullchain\.pem;/);
assert.match(cdn, /location\s+~\s+\^\/\(\?:api\/card-image\//,
  'the shadow CDN must explicitly allow only public paths');
assert.match(cdn, /proxy_hide_header\s+Strict-Transport-Security;/);
assert.match(cdn, /add_header\s+Access-Control-Allow-Origin\s+"\*"\s+always;/,
  'public shadow resources must be usable from the new application origin');
assert.match(cdn, /location\s+\/\s*\{[^}]*return\s+404;/s,
  'the shadow CDN host must keep private and unknown paths closed');

for (const address of ['162.19.220.14', '194.67.92.242', '186.246.28.244']) {
  assert.ok(monitor.includes(address), `the shadow monitor must probe ${address} directly`);
}
assert.match(monitor, /X-Robots-Tag/,
  'the shadow monitor must prove that the application cannot be indexed');
assert.ok(monitor.includes('www.hearthpulse.net'),
  'the monitor must probe the www hostname as a first-class TLS and application endpoint');
assert.match(monitor, /ipv6_answers/,
  'the monitor must reject accidental IPv6 exposure');
assert.match(monitor, /ipv4_answers" == "\$expected_ipv4/,
  'the monitor must reject missing and additional IPv4 routes');
assert.match(monitor, /app_hsts" == "max-age=300/,
  'the monitor must reject leaked long-lived HSTS');
assert.match(monitor, /card_cors" == "\*"/,
  'the monitor must prove browser-usable CORS on public CDN resources');
assert.match(monitor, /api\/subscription\/status/,
  'the shadow monitor must prove that the CDN does not expose private APIs');
assert.match(monitorService,
  /ExecStart=\/bin\/bash \/var\/www\/koloda\/data\/www\/hs-arena\.ru\/current\/deploy\/monitor-hearthpulse-shadow\.sh/,
  'the service must run the immutable release script even when artifact transport strips executable bits');

console.log('HearthPulse shadow nginx contract passed');
