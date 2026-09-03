import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import {
  EXPECTED_STATIC_SITEMAP_URL_COUNT,
  runProductionMonitor,
} from '../scripts/production-monitor.mjs';

let livenessAttempts = 0;
let dataFresh = true;
let unknownCardStatus = 404;
let partialKnownFormat = null;
let mismatchEnvelopeFormat = null;
let seoFailure = null;
let compressedSitemapEtag = false;
let healthBodyDelayMs = 0;

const EXTERNAL_TEST_TIMEOUT = Symbol('external test timeout');

async function settleWithin(operation, timeoutMs) {
  let timer;
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => resolve(EXTERNAL_TEST_TIMEOUT), timeoutMs);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function stalledResponse(contentType = 'application/json') {
  return new Response(new ReadableStream({ start() {} }), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
    },
  });
}

function endHealthResponse(res, payload) {
  const body = JSON.stringify(payload);
  if (!healthBodyDelayMs) {
    res.end(body);
    return;
  }
  res.flushHeaders();
  setTimeout(() => res.end(body), healthBodyDelayMs);
}

const sitemapCardIds = Array.from(
  { length: 500 },
  (_value, index) => `MONITOR_CARD_${String(index + 1).padStart(4, '0')}`,
);
const sitemapWildCardIds = Array.from(
  { length: 500 },
  (_value, index) => `MONITOR_WILD_${String(index + 1).padStart(4, '0')}`,
);
const sitemapMinionIds = Array.from({ length: 500 }, (_value, index) => 10_000 + index);
const sitemapSpellIds = Array.from({ length: 50 }, (_value, index) => 20_000 + index);
const sitemapHeroIds = Array.from({ length: 80 }, (_value, index) => 30_000 + index);

function xmlUrlset(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `  <url><loc>${url}</loc></url>`).join('\n')}\n</urlset>\n`;
}

function xmlIndex(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `  <sitemap><loc>${url}</loc></sitemap>`).join('\n')}\n</sitemapindex>\n`;
}

function cardHtml(origin, cardId, options = {}) {
  const canonical = options.canonical || `${origin}/standard/cards/standard/${cardId}/`;
  const identityFragment = options.identityFragment || 'card';
  const robots = options.robots || 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
  const jsonLd = options.invalidJsonLd
    ? '{invalid-json'
    : JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [{
          '@type': 'CreativeWork',
          '@id': `${canonical}#${identityFragment}`,
          url: canonical,
          identifier: options.identity || cardId,
          name: `Карта ${cardId}`,
        }],
      });
  const headings = options.missingH1 ? '' : `<h1>Карта ${cardId}</h1>`;
  return `<!doctype html><html lang="ru"><head><title>Карта ${cardId}</title><meta name="description" content="Публичная карточка Hearthstone"><meta name="robots" content="${robots}"><link rel="canonical" href="${canonical}"><script type="application/ld+json" data-server-entity-jsonld>${jsonLd}</script></head><body><main>${headings}${options.privatePayload || ''}</main></body></html>`;
}

async function captureFailure(operation) {
  try {
    await operation;
  } catch (error) {
    return error;
  }
  assert.fail('expected production monitor failure');
}

function cardHeaders(format) {
  const lkg = format === 'wild';
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Data-Cache': lkg ? 'LKG' : 'fresh',
    'X-Dataset-Version': `ccc1-sha256:${format === 'wild' ? '2'.repeat(64) : '1'.repeat(64)}`,
  };
  if (lkg && mismatchEnvelopeFormat !== format) headers.Warning = '110 - "Response is Stale"';
  return headers;
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url || '/', 'http://monitor.test');
  const origin = `http://${req.headers.host}`;
  if (req.url === '/api/health/live') {
    livenessAttempts += 1;
    if (livenessAttempts === 1) {
      res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      endHealthResponse(res, { status: 'starting' });
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    endHealthResponse(res, { status: 'alive', release: 'abcdef1234567890' });
    return;
  }
  if (req.url === '/api/health/ready') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    endHealthResponse(res, { status: 'ready', dataStatus: dataFresh ? 'ok' : 'degraded' });
    return;
  }
  if (req.url === '/api/health/data') {
    res.writeHead(dataFresh ? 200 : 503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    endHealthResponse(res, {
      status: dataFresh ? 'ok' : 'degraded',
      fresh: dataFresh,
      datasets: ['winrates', 'tierlist', 'legendaries', 'constructed-cards-standard', 'constructed-cards-wild'].map(name => ({
        name,
        state: dataFresh ? 'fresh' : 'stale',
        records: 1,
      })),
    });
    return;
  }
  if (requestUrl.pathname === '/api/constructed-cards') {
    const format = requestUrl.searchParams.get('format') || 'standard';
    const datasetVersion = `ccc1-sha256:${format === 'wild' ? '2'.repeat(64) : '1'.repeat(64)}`;
    res.writeHead(200, cardHeaders(format));
    res.end(JSON.stringify({
      format,
      datasetVersion,
      dataStatus: format === 'wild' && mismatchEnvelopeFormat !== format ? 'stale' : 'fresh',
      partial: false,
      cards: [{ card_id: `${format.toUpperCase()}_CARD_1` }],
    }));
    return;
  }
  if (/^\/api\/constructed-cards\/(?:STANDARD|WILD)_CARD_1$/.test(requestUrl.pathname)) {
    const format = requestUrl.searchParams.get('format') || 'standard';
    const cardId = requestUrl.pathname.split('/').pop();
    const datasetVersion = `ccc1-sha256:${format === 'wild' ? '2'.repeat(64) : '1'.repeat(64)}`;
    res.writeHead(200, cardHeaders(format));
    res.end(JSON.stringify({
      dataStatus: format === 'wild' && mismatchEnvelopeFormat !== format ? 'stale' : 'fresh',
      datasetVersion,
      partial: partialKnownFormat === format,
      card: { card_id: cardId },
    }));
    return;
  }
  if (requestUrl.pathname === '/api/constructed-cards/MANACOST_MONITOR_ABSENT_CARD') {
    res.writeHead(unknownCardStatus, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: unknownCardStatus === 404 ? 'Карта не найдена' : 'Ошибка' }));
    return;
  }
  if (requestUrl.pathname === '/robots.txt') {
    const body = seoFailure === 'robots'
      ? 'User-agent: *\nDisallow: /\n'
      : `User-agent: *\nAllow: /\nDisallow: /api\nDisallow: /health\nDisallow: /metrics\nDisallow: /_internal\nAllow: /assets/\nSitemap: ${origin}/sitemap.xml\n`;
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(body);
    return;
  }
  if (requestUrl.pathname === '/sitemap.xml') {
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
    res.end(xmlIndex([
      `${origin}/sitemaps/static.xml`,
      `${origin}/sitemaps/standard-cards.xml`,
      `${origin}/sitemaps/wild-cards.xml`,
      `${origin}/sitemaps/battleground-minions.xml`,
      `${origin}/sitemaps/battleground-spells.xml`,
      `${origin}/sitemaps/battleground-heroes.xml`,
    ]));
    return;
  }
  if (requestUrl.pathname === '/sitemaps/static.xml') {
    const urls = Array.from({ length: EXPECTED_STATIC_SITEMAP_URL_COUNT }, (_value, index) => (
      index === 0 ? `${origin}/` : `${origin}/static-${index}/`
    ));
    let body = xmlUrlset(urls);
    if (seoFailure === 'comment-loc') {
      body = body.replace(
        '</urlset>',
        `<!-- <url><loc>${origin}/must-not-count/</loc></url> -->\n</urlset>`,
      );
    }
    if (seoFailure === 'malformed-xml') body = body.replace('</urlset>', '</loc></urlset>');
    if (seoFailure === 'malformed-comment') body += '<!-- unterminated';
    if (seoFailure === 'trailing-xml-garbage') body += 'not-xml';
    if (seoFailure === 'unexpected-xml-structure') {
      body = body.replaceAll('<url>', '<sitemap>').replaceAll('</url>', '</sitemap>');
    }
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
    res.end(body);
    return;
  }
  if (requestUrl.pathname === '/sitemaps/standard-cards.xml') {
    const urls = sitemapCardIds.map(cardId => `${origin}/standard/cards/standard/${cardId}/`);
    if (seoFailure === 'duplicate-sitemap') urls[urls.length - 1] = urls[0];
    res.writeHead(200, {
      'Content-Type': 'application/xml; charset=utf-8',
      ETag: seoFailure === 'etag'
        ? 'W/"weak"'
        : `${compressedSitemapEtag ? 'W/' : ''}"sha256-${'a'.repeat(64)}"`,
      'X-Sitemap-Source': seoFailure === 'source' ? 'upstream-error' : 'catalog',
      ...(seoFailure === 'oversized-sitemap' ? { 'Content-Length': String(9 * 1024 * 1024) } : {}),
    });
    res.end(xmlUrlset(urls));
    return;
  }
  const additionalSitemaps = {
    '/sitemaps/wild-cards.xml': sitemapWildCardIds.map(cardId => (
      `${origin}/standard/cards/wild/${cardId}/`
    )),
    '/sitemaps/battleground-minions.xml': sitemapMinionIds.map(dbfId => (
      `${origin}/library/minions/monitor-minion-${dbfId}/`
    )),
    '/sitemaps/battleground-spells.xml': sitemapSpellIds.map(dbfId => (
      `${origin}/library/spells/monitor-spell-${dbfId}/`
    )),
    '/sitemaps/battleground-heroes.xml': sitemapHeroIds.map(dbfId => `${origin}/heroes/${dbfId}/`),
  };
  if (additionalSitemaps[requestUrl.pathname]) {
    res.writeHead(200, {
      'Content-Type': 'application/xml; charset=utf-8',
      ETag: `${compressedSitemapEtag ? 'W/' : ''}"sha256-${'b'.repeat(64)}"`,
      'X-Sitemap-Source': 'catalog',
    });
    res.end(xmlUrlset(additionalSitemaps[requestUrl.pathname]));
    return;
  }
  const sitemapCardMatch = requestUrl.pathname.match(/^\/standard\/cards\/standard\/(MONITOR_CARD_[0-9]{4})\/?$/);
  if (sitemapCardMatch) {
    const cardId = sitemapCardMatch[1];
    const canonical = `${origin}/standard/cards/standard/${cardId}/`;
    if (!requestUrl.pathname.endsWith('/')) {
      const location = seoFailure === 'redirect' ? `${origin}/unexpected-hop/` : canonical;
      res.writeHead(301, { Location: location, 'Cache-Control': 'no-store' });
      res.end('');
      return;
    }
    const html = cardHtml(origin, cardId, {
      ...(seoFailure === 'canonical' ? { canonical: `${origin}/standard/cards/standard/WRONG_CARD/` } : {}),
      ...(seoFailure === 'robots-meta' ? { robots: 'noindex, nofollow' } : {}),
      ...(seoFailure === 'jsonld' ? { invalidJsonLd: true } : {}),
      ...(seoFailure === 'jsonld-identity' ? { identity: 'WRONG_CARD' } : {}),
      ...(seoFailure === 'h1' ? { missingH1: true } : {}),
      ...(seoFailure === 'private' ? { privatePayload: 'QA_PRIVATE_DECK_CODE_AAECA_TEST_ONLY' } : {}),
    });
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': seoFailure === 'robots-header' ? 'noindex, nofollow' : 'index, follow',
    });
    res.end(html);
    return;
  }
  const wildCardMatch = requestUrl.pathname.match(/^\/standard\/cards\/wild\/(MONITOR_WILD_[0-9]{4})\/$/);
  if (wildCardMatch) {
    const cardId = wildCardMatch[1];
    const canonical = `${origin}/standard/cards/wild/${cardId}/`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'index, follow' });
    res.end(cardHtml(origin, cardId, { canonical }));
    return;
  }
  const battlegroundCardMatch = requestUrl.pathname.match(
    /^\/library\/(minions|spells)\/monitor-(?:minion|spell)-(\d+)\/$/,
  );
  if (battlegroundCardMatch) {
    const dbfId = battlegroundCardMatch[2];
    const canonical = `${origin}${requestUrl.pathname}`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'index, follow' });
    res.end(cardHtml(origin, dbfId, { canonical }));
    return;
  }
  const heroMatch = requestUrl.pathname.match(/^\/heroes\/(\d+)\/$/);
  if (heroMatch) {
    const dbfId = heroMatch[1];
    const canonical = `${origin}${requestUrl.pathname}`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'index, follow' });
    res.end(cardHtml(origin, dbfId, { canonical, identityFragment: 'hero' }));
    return;
  }
  if (requestUrl.pathname === '/standard/cards/standard/MANACOST_MONITOR_ABSENT_CARD/') {
    const includeCanonical = seoFailure === 'unknown-canonical';
    res.writeHead(seoFailure === 'unknown-status' ? 200 : 404, {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
    });
    res.end(`<!doctype html><html><head><meta name="robots" content="noindex, nofollow">${includeCanonical ? `<link rel="canonical" href="${origin}/standard/cards/standard/MANACOST_MONITOR_ABSENT_CARD/">` : ''}</head><body><main><h1>Карта не найдена</h1></main></body></html>`);
    return;
  }
  if (['/classes', '/battlegrounds/tier-list'].includes(requestUrl.pathname)) {
    res.writeHead(301, { Location: `${origin}${requestUrl.pathname}/` });
    res.end('');
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<!doctype html><html><body><main>HS Arena</main></body></html>');
});

server.listen(0, '127.0.0.1');
await new Promise((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});

try {
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const report = await runProductionMonitor({ baseUrl, attempts: 2, retryDelayMs: 0, timeoutMs: 2_000 });
  assert.equal(report.status, 'ok');
  assert.equal(report.profile, 'full');
  assert.ok(report.checks.some(check => check.label === 'SEO crawl contract'));
  const seoCheck = report.checks.find(check => check.label === 'SEO crawl contract');
  assert.equal(seoCheck.standardUrls, 500);
  assert.deepEqual(seoCheck.entityUrls, {
    standard: 500,
    wild: 500,
    battlegroundMinions: 500,
    battlegroundSpells: 50,
    battlegroundHeroes: 80,
  });
  assert.equal(seoCheck.staticUrls, EXPECTED_STATIC_SITEMAP_URL_COUNT);
  assert.equal(seoCheck.sampledDetails, 15);
  assert.equal(report.checks[0].attempts, 2);
  assert.deepEqual(report.checks.map(check => check.status), [200, 200, 200, 200, 200, 200, 404, 200, 200, 404, 200, 200, 200]);

  compressedSitemapEtag = true;
  const compressedReport = await runProductionMonitor({
    baseUrl,
    attempts: 1,
    retryDelayMs: 0,
    timeoutMs: 2_000,
  });
  assert.equal(compressedReport.status, 'ok',
    'a compressed sitemap keeps its SHA-256 validator even when nginx weakens the ETag');
  compressedSitemapEtag = false;

  const releaseReport = await runProductionMonitor({
    baseUrl,
    profile: 'release',
    expectedRelease: 'abcdef1234567890',
    attempts: 1,
    retryDelayMs: 0,
    timeoutMs: 2_000,
  });
  assert.equal(releaseReport.status, 'ok');
  assert.equal(releaseReport.profile, 'release');
  assert.ok(!releaseReport.checks.some(check => check.label === 'data freshness'));

  await assert.rejects(
    runProductionMonitor({
      baseUrl,
      profile: 'release',
      expectedRelease: 'deadbeef12345678',
      attempts: 1,
      retryDelayMs: 0,
      timeoutMs: 2_000,
    }),
    /expected release deadbeef12345678/i,
  );

  partialKnownFormat = 'wild';
  await assert.rejects(
    runProductionMonitor({ baseUrl, attempts: 1, retryDelayMs: 0, timeoutMs: 2_000 }),
    /known detail is partial/i,
  );
  partialKnownFormat = null;

  mismatchEnvelopeFormat = 'wild';
  await assert.rejects(
    runProductionMonitor({ baseUrl, attempts: 1, retryDelayMs: 0, timeoutMs: 2_000 }),
    /LKG.*stale|Warning 110/i,
  );
  mismatchEnvelopeFormat = null;

  unknownCardStatus = 500;
  await assert.rejects(
    runProductionMonitor({ baseUrl, attempts: 1, retryDelayMs: 0, timeoutMs: 2_000 }),
    /constructed cards standard unknown: HTTP 500/,
  );
  unknownCardStatus = 404;

  dataFresh = false;
  const staleReleaseReport = await runProductionMonitor({
    baseUrl,
    profile: 'release',
    expectedRelease: 'abcdef1234567890',
    attempts: 1,
    retryDelayMs: 0,
    timeoutMs: 2_000,
  });
  assert.equal(staleReleaseReport.status, 'ok',
    'stale data must not classify the exact healthy release as broken');

  const freshnessFailure = await captureFailure(runProductionMonitor({
    baseUrl,
    profile: 'freshness',
    attempts: 1,
    retryDelayMs: 0,
    timeoutMs: 2_000,
  }));
  assert.equal(freshnessFailure.report?.profile, 'freshness');
  assert.deepEqual(freshnessFailure.report?.failures.map(failure => failure.label), ['data freshness']);

  await assert.rejects(
    runProductionMonitor({ baseUrl, attempts: 1, retryDelayMs: 0, timeoutMs: 2_000 }),
    /data freshness: HTTP 503/,
  );
  dataFresh = true;

  for (const [mode, expected] of [
    ['robots', /robots\.txt.*(?:Disallow|assets|sitemap)/i],
    ['duplicate-sitemap', /duplicate locations/i],
    ['etag', /ETag/i],
    ['source', /X-Sitemap-Source/i],
    ['oversized-sitemap', /byte monitor limit/i],
    ['canonical', /canonical mismatch/i],
    ['robots-header', /X-Robots-Tag is noindex/i],
    ['robots-meta', /index robots metadata is missing/i],
    ['h1', /exactly one H1/i],
    ['jsonld', /JSON-LD is invalid/i],
    ['jsonld-identity', /JSON-LD identity mismatch/i],
    ['private', /private payload marker/i],
    ['redirect', /one hop/i],
    ['unknown-status', /unknown card HTML: HTTP 200/i],
    ['unknown-canonical', /must not expose a canonical/i],
    ['malformed-xml', /XML|well-formed|closing/i],
    ['malformed-comment', /XML|well-formed|comment/i],
    ['trailing-xml-garbage', /XML|well-formed|trailing/i],
    ['unexpected-xml-structure', /XML|structure|url/i],
  ]) {
    seoFailure = mode;
    await assert.rejects(
      runProductionMonitor({ baseUrl, attempts: 1, retryDelayMs: 0, timeoutMs: 2_000 }),
      expected,
      `${mode} must fail the crawl contract`,
    );
  }
  seoFailure = null;

  seoFailure = 'comment-loc';
  const commentReport = await runProductionMonitor({
    baseUrl,
    attempts: 1,
    retryDelayMs: 0,
    timeoutMs: 2_000,
  });
  assert.equal(commentReport.status, 'ok', 'XML comments must not contribute sitemap locations');
  seoFailure = null;

  dataFresh = false;
  seoFailure = 'duplicate-sitemap';
  unknownCardStatus = 500;
  const aggregated = await captureFailure(runProductionMonitor({
    baseUrl,
    attempts: 1,
    retryDelayMs: 0,
    timeoutMs: 2_000,
  }));
  assert.equal(aggregated.report?.status, 'error');
  assert.deepEqual(
    aggregated.report?.failures.map(failure => failure.label),
    ['data freshness', 'SEO crawl contract', 'constructed cards'],
    'independent failures must be reported together instead of short-circuiting',
  );
  dataFresh = true;
  seoFailure = null;
  unknownCardStatus = 404;

  const secret = 'QA_PRIVATE_TOKEN_SHOULD_NOT_LEAK';
  const sanitized = await captureFailure(runProductionMonitor({
    baseUrl,
    attempts: 1,
    retryDelayMs: 0,
    timeoutMs: 2_000,
    routes: [],
    fetchImpl: async () => {
      throw new Error(`request failed token=${secret}&state=PRIVATE_STATE Bearer PRIVATE_BEARER`);
    },
  }));
  const serializedFailure = JSON.stringify({ message: sanitized.message, report: sanitized.report });
  assert.doesNotMatch(serializedFailure, /QA_PRIVATE_TOKEN_SHOULD_NOT_LEAK|PRIVATE_STATE|PRIVATE_BEARER/,
    'aggregated diagnostics must redact credentials and private sentinels');
  assert.match(serializedFailure, /\[redacted]/i);

  healthBodyDelayMs = 150;
  const concurrentStartedAt = Date.now();
  const concurrentReport = await runProductionMonitor({
    baseUrl,
    attempts: 1,
    retryDelayMs: 0,
    timeoutMs: 2_000,
    deadlineMs: 2_000,
  });
  const concurrentDurationMs = Date.now() - concurrentStartedAt;
  assert.equal(concurrentReport.status, 'ok');
  assert.ok(concurrentDurationMs < 350,
    `independent monitor groups must overlap; took ${concurrentDurationMs}ms`);
  healthBodyDelayMs = 0;

  const bodyTimeoutStartedAt = Date.now();
  const bodyTimeoutResult = await settleWithin(captureFailure(runProductionMonitor({
    baseUrl,
    attempts: 1,
    retryDelayMs: 0,
    timeoutMs: 40,
    deadlineMs: 2_000,
    routes: [],
    fetchImpl: async (input, options) => {
      if (new URL(input).pathname === '/api/health/live') return stalledResponse();
      return fetch(input, options);
    },
  })), 500);
  assert.notEqual(bodyTimeoutResult, EXTERNAL_TEST_TIMEOUT,
    'request timeout must include a body stream that never completes');
  assert.ok(Date.now() - bodyTimeoutStartedAt < 400, 'stalled response body exceeded its request timeout');
  assert.deepEqual(bodyTimeoutResult.report?.failures.map(failure => failure.label), ['liveness']);

  const globalDeadlineStartedAt = Date.now();
  const globalDeadlineResult = await settleWithin(captureFailure(runProductionMonitor({
    baseUrl,
    attempts: 3,
    retryDelayMs: 5_000,
    timeoutMs: 10_000,
    deadlineMs: 80,
    fetchImpl: async input => stalledResponse(
      new URL(input).pathname.startsWith('/api/') ? 'application/json' : 'text/html',
    ),
  })), 500);
  assert.notEqual(globalDeadlineResult, EXTERNAL_TEST_TIMEOUT,
    'the monitor must settle before the workflow safety deadline');
  assert.ok(Date.now() - globalDeadlineStartedAt < 400,
    'global monitor deadline did not leave workflow timeout margin');
  assert.ok(globalDeadlineResult.report?.failures.length >= 8,
    'global deadline must still aggregate independent top-level failures');
  assert.deepEqual(
    globalDeadlineResult.report?.failures.slice(0, 5).map(failure => failure.label),
    ['liveness', 'readiness', 'data freshness', 'SEO crawl contract', 'constructed cards'],
  );

  const monitorSource = readFileSync(new URL('../scripts/production-monitor.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(monitorSource, /\.(?:json|text|arrayBuffer)\s*\(/,
    'all response bodies must use the bounded request reader');
} finally {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('production monitor tests passed');
