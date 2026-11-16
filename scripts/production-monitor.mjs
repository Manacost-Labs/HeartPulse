#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { pageTemplateSamples } from './production-monitor-templates.mjs';

const publicSeoRegistry = JSON.parse(readFileSync(
  new URL('../config/public-seo-pages.json', import.meta.url),
  'utf8',
));
export const EXPECTED_STATIC_SITEMAP_URL_COUNT = Object.values(publicSeoRegistry.pages)
  .filter(page => page?.sitemap === true)
  .length;
const DEFAULT_BASE_URL = 'https://hearthpulse.net';
const DEFAULT_ROUTES = ['/', '/classes/', '/battlegrounds/tier-list/'];
const REQUIRED_DATASETS = [
  'winrates',
  'tierlist',
  'legendaries',
  'constructed-cards-standard',
  'constructed-cards-wild',
];
const MAX_ROBOTS_BYTES = 64 * 1024;
const MAX_SITEMAP_INDEX_BYTES = 64 * 1024;
const MAX_STATIC_SITEMAP_BYTES = 1024 * 1024;
const MAX_CARD_SITEMAP_BYTES = 8 * 1024 * 1024;
const MAX_ENTITY_HTML_BYTES = 2 * 1024 * 1024;
const MAX_HEALTH_JSON_BYTES = 256 * 1024;
const MAX_CONSTRUCTED_JSON_BYTES = 4 * 1024 * 1024;
const MAX_EMPTY_RESPONSE_BYTES = 64 * 1024;
const DEFAULT_MONITOR_DEADLINE_MS = 4 * 60 * 1000;
// Slow answers are a warning; only the request timeout (10 s) is an error.
const DEFAULT_PAGE_WARN_MS = 1_000;
const DEFAULT_SITEMAP_WARN_MS = 2_000;
const DEFAULT_REQUEST_PAUSE_MS = 150;
// A required dataset that only reports `stale` on last-known-good for less
// than this is a warning; older is a failure. Real staleness (8 h) always fails.
const DEFAULT_LKG_MAX_AGE_MS = 30 * 60 * 1000;
// Non-required datasets (they never block readiness) are reported, not failed.
// A known problem stays visible in every report with a link to its issue.
const KNOWN_DATASET_ISSUES = {
  'hs-data-api': '#398',
};
const PRIVATE_PAYLOAD_PATTERN = /QA_PRIVATE|\b(?:deckCode|statsAccess|subscriptionPayload|privateSentinel)\b/i;
const MONITOR_PROFILES = new Set(['full', 'release', 'freshness']);
const DEFAULT_SAMPLE_COUNT = 3;
const ENTITY_SITEMAP_SEGMENTS = [
  {
    key: 'standard',
    path: '/sitemaps/standard-cards.xml',
    label: 'standard card sitemap',
    minimumUrls: 500,
    pathPattern: /^\/standard\/cards\/standard\/(?:[A-Za-z0-9_]{2,80}|blizzard%3A[1-9][0-9]{0,18})\/$/,
    identityFromPath: pathname => decodeURIComponent(pathname.split('/').filter(Boolean).at(-1)),
    identityFragment: 'card',
  },
  {
    key: 'wild',
    path: '/sitemaps/wild-cards.xml',
    label: 'wild card sitemap',
    minimumUrls: 500,
    pathPattern: /^\/standard\/cards\/wild\/(?:[A-Za-z0-9_]{2,80}|blizzard%3A[1-9][0-9]{0,18})\/$/,
    identityFromPath: pathname => decodeURIComponent(pathname.split('/').filter(Boolean).at(-1)),
    identityFragment: 'card',
  },
  {
    key: 'battlegroundMinions',
    path: '/sitemaps/battleground-minions.xml',
    label: 'battleground minion sitemap',
    minimumUrls: 500,
    pathPattern: /^\/library\/minions\/[^/]+-\d+\/$/,
    identityFromPath: pathname => pathname.match(/-(\d+)\/$/)?.[1],
    identityFragment: 'card',
  },
  {
    key: 'battlegroundSpells',
    path: '/sitemaps/battleground-spells.xml',
    label: 'battleground spell sitemap',
    minimumUrls: 50,
    pathPattern: /^\/library\/spells\/[^/]+-\d+\/$/,
    identityFromPath: pathname => pathname.match(/-(\d+)\/$/)?.[1],
    identityFragment: 'card',
  },
  {
    key: 'battlegroundHeroes',
    path: '/sitemaps/battleground-heroes.xml',
    label: 'battleground hero sitemap',
    minimumUrls: 80,
    pathPattern: /^\/heroes\/\d+\/$/,
    identityFromPath: pathname => pathname.split('/').filter(Boolean).at(-1),
    identityFragment: 'hero',
  },
  // Editorial detail pages: a sample must be an indexable canonical page, but
  // these pages carry no card-style JSON-LD identifier (identityFragment null).
  {
    key: 'cosmetics',
    path: '/sitemaps/cosmetics.xml',
    label: 'cosmetics sitemap',
    minimumUrls: 500,
    pathPattern: /^\/cosmetics\/(?:heroes|coins|pets)\/[A-Za-z0-9_-]{1,100}\/$/,
    identityFromPath: pathname => pathname.split('/').filter(Boolean).at(-1),
    identityFragment: null,
  },
  {
    key: 'guidesArchive',
    path: '/sitemaps/guides-archive.xml',
    label: 'guides archive sitemap',
    minimumUrls: 500,
    pathPattern: /^\/guides-archive\/[A-Za-z0-9][A-Za-z0-9._~-]{0,159}\/$/,
    identityFromPath: pathname => pathname.split('/').filter(Boolean).at(-1),
    identityFragment: null,
  },
  // Standard archetypes that pass the indexing rule (`isIndexableArchetype`, about
  // 70 of 200 today; the floor equals the server's `SITEMAP_ARCHETYPES_MIN`). A
  // page is Next.js-rendered, its JSON-LD is the ItemPage/Dataset graph of the
  // page itself (no entity identifier), and the list moves with the period, so
  // five URLs are sampled.
  {
    key: 'archetypes',
    path: '/sitemaps/archetypes.xml',
    label: 'archetype sitemap',
    minimumUrls: 30,
    pathPattern: /^\/standard\/archetypes\/standard\/[a-z0-9-]{1,90}\/$/,
    identityFromPath: pathname => pathname.split('/').filter(Boolean).at(-1),
    identityFragment: null,
    pageJsonLd: true,
    sampleCount: 5,
  },
];

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function abortMessage(reason, fallback) {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

async function readBoundedText(response, maximumBytes, label, signal) {
  const declaredLength = Number(response.headers.get('content-length'));
  ensure(!Number.isFinite(declaredLength) || declaredLength <= maximumBytes,
    `${label} exceeds the ${maximumBytes}-byte monitor limit`);
  ensure(response.body && typeof response.body.getReader === 'function',
    `${label} does not expose a readable response body`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let total = 0;
  let body = '';
  const cancelReader = () => {
    void reader.cancel(signal.reason).catch(() => {});
  };
  if (signal.aborted) cancelReader();
  else signal.addEventListener('abort', cancelReader, { once: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new Error(`${label} exceeds the ${maximumBytes}-byte monitor limit`);
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return body;
  } finally {
    signal.removeEventListener('abort', cancelReader);
    reader.releaseLock();
  }
}

async function fetchBoundedText(
  url,
  fetchImpl,
  timeoutMs,
  maximumBytes,
  label,
  parentSignal,
  redirect = 'manual',
) {
  const controller = new AbortController();
  let response;
  let completed = false;
  let rejectAbort;
  const aborted = new Promise((_resolve, reject) => {
    rejectAbort = reject;
  });
  const abort = reason => {
    const message = abortMessage(reason, `${label}: request aborted`);
    if (!controller.signal.aborted) controller.abort(new Error(message));
    rejectAbort(new Error(message));
  };
  const onParentAbort = () => abort(parentSignal.reason);
  if (parentSignal.aborted) onParentAbort();
  else parentSignal.addEventListener('abort', onParentAbort, { once: true });
  const timeout = setTimeout(
    () => abort(new Error(`${label} ${new URL(url).pathname}: request timed out after ${timeoutMs}ms`)),
    timeoutMs,
  );

  const consume = (async () => {
    response = await fetchImpl(url, {
      redirect,
      signal: controller.signal,
      headers: { 'User-Agent': 'hs-arena-external-monitor/1.1 (+https://hearthpulse.net; read-only GET)' },
    });
    const body = await readBoundedText(response, maximumBytes, label, controller.signal);
    return { response, body };
  })();

  try {
    const result = await Promise.race([consume, aborted]);
    completed = true;
    return result;
  } finally {
    clearTimeout(timeout);
    parentSignal.removeEventListener('abort', onParentAbort);
    if (!completed && response?.body && !response.body.locked) {
      await response.body.cancel(controller.signal.reason).catch(() => {});
    }
  }
}

async function fetchBoundedJson(
  url,
  fetchImpl,
  timeoutMs,
  maximumBytes,
  label,
  parentSignal,
) {
  const { response, body } = await fetchBoundedText(
    url,
    fetchImpl,
    timeoutMs,
    maximumBytes,
    label,
    parentSignal,
  );
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error(`${label}: response is not valid JSON`);
  }
  return { response, payload };
}

const XML_NAME = /^[A-Za-z_][A-Za-z0-9_.:-]*/;
const SITEMAP_NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9';

function invalidXml(label, reason) {
  throw new Error(`${label}: invalid XML (${reason})`);
}

function isValidXmlCodePoint(codePoint) {
  return codePoint === 0x9 || codePoint === 0xa || codePoint === 0xd
    || (codePoint >= 0x20 && codePoint <= 0xd7ff)
    || (codePoint >= 0xe000 && codePoint <= 0xfffd)
    || (codePoint >= 0x10000 && codePoint <= 0x10ffff);
}

function decodeXmlEntities(value, label) {
  for (const character of value) {
    if (!isValidXmlCodePoint(character.codePointAt(0))) {
      invalidXml(label, 'invalid XML character');
    }
  }
  let decoded = '';
  let cursor = 0;
  while (cursor < value.length) {
    const ampersand = value.indexOf('&', cursor);
    if (ampersand === -1) {
      decoded += value.slice(cursor);
      break;
    }
    decoded += value.slice(cursor, ampersand);
    const semicolon = value.indexOf(';', ampersand + 1);
    if (semicolon === -1) invalidXml(label, 'unterminated entity');
    const entity = value.slice(ampersand + 1, semicolon);
    const named = { amp: '&', apos: "'", gt: '>', lt: '<', quot: '"' }[entity];
    if (named !== undefined) {
      decoded += named;
    } else {
      const numeric = entity.match(/^#(?:x([a-f0-9]+)|([0-9]+))$/i);
      if (!numeric) invalidXml(label, `unknown entity &${entity};`);
      const codePoint = Number.parseInt(numeric[1] || numeric[2], numeric[1] ? 16 : 10);
      if (!isValidXmlCodePoint(codePoint)) invalidXml(label, 'invalid character reference');
      decoded += String.fromCodePoint(codePoint);
    }
    cursor = semicolon + 1;
  }
  return decoded;
}

function parseXmlAttributes(source, start, label) {
  const attributes = new Map();
  let cursor = start;
  while (cursor < source.length) {
    const whitespace = source.slice(cursor).match(/^\s+/)?.[0] || '';
    if (!whitespace) invalidXml(label, 'attributes must be separated by whitespace');
    cursor += whitespace.length;
    if (cursor === source.length) break;
    const name = source.slice(cursor).match(XML_NAME)?.[0];
    if (!name) invalidXml(label, 'invalid attribute name');
    cursor += name.length;
    cursor += source.slice(cursor).match(/^\s*/)?.[0].length || 0;
    if (source[cursor] !== '=') invalidXml(label, `attribute ${name} has no value`);
    cursor += 1;
    cursor += source.slice(cursor).match(/^\s*/)?.[0].length || 0;
    const quote = source[cursor];
    if (quote !== '"' && quote !== "'") invalidXml(label, `attribute ${name} is not quoted`);
    cursor += 1;
    const end = source.indexOf(quote, cursor);
    if (end === -1) invalidXml(label, `attribute ${name} is unterminated`);
    const rawValue = source.slice(cursor, end);
    if (rawValue.includes('<')) invalidXml(label, `attribute ${name} contains an unescaped <`);
    if (attributes.has(name)) invalidXml(label, `duplicate attribute ${name}`);
    attributes.set(name, decodeXmlEntities(rawValue, label));
    cursor = end + 1;
  }
  return attributes;
}

function findXmlTagEnd(xml, start, label) {
  let quote = '';
  for (let cursor = start; cursor < xml.length; cursor += 1) {
    const character = xml[cursor];
    if (quote) {
      if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '<') {
      invalidXml(label, 'nested < inside a tag');
    } else if (character === '>') {
      return cursor;
    }
  }
  invalidXml(label, 'unterminated tag');
}

function parseXmlDocument(xml, label) {
  const stack = [];
  let root = null;
  let cursor = xml.charCodeAt(0) === 0xfeff ? 1 : 0;
  const declarationPosition = cursor;
  let declarationSeen = false;

  while (cursor < xml.length) {
    if (xml[cursor] !== '<') {
      const nextTag = xml.indexOf('<', cursor);
      const end = nextTag === -1 ? xml.length : nextTag;
      const rawText = xml.slice(cursor, end);
      if (rawText.includes(']]>')) invalidXml(label, 'reserved ]]> sequence in text');
      const text = decodeXmlEntities(rawText, label);
      if (stack.length) stack.at(-1).text += text;
      else if (text.trim()) invalidXml(label, 'text outside the document element');
      cursor = end;
      continue;
    }

    if (xml.startsWith('<!--', cursor)) {
      const end = xml.indexOf('-->', cursor + 4);
      if (end === -1) invalidXml(label, 'unterminated comment');
      if (xml.slice(cursor + 4, end).includes('--')) invalidXml(label, 'invalid comment');
      cursor = end + 3;
      continue;
    }

    if (xml.startsWith('<?', cursor)) {
      const end = xml.indexOf('?>', cursor + 2);
      if (end === -1) invalidXml(label, 'unterminated processing instruction');
      const instruction = xml.slice(cursor + 2, end);
      if (cursor !== declarationPosition || declarationSeen || root
        || !/^xml\s+version=(?:"1\.0"|'1\.0')(?:\s+encoding=(?:"UTF-8"|'UTF-8'))?(?:\s+standalone=(?:"(?:yes|no)"|'(?:yes|no)'))?\s*$/i.test(instruction)) {
        invalidXml(label, 'invalid XML declaration or processing instruction');
      }
      declarationSeen = true;
      cursor = end + 2;
      continue;
    }

    if (xml.startsWith('</', cursor)) {
      const end = findXmlTagEnd(xml, cursor + 2, label);
      const closing = xml.slice(cursor + 2, end).match(/^([A-Za-z_][A-Za-z0-9_.:-]*)\s*$/)?.[1];
      if (!closing) invalidXml(label, 'invalid closing tag');
      const open = stack.pop();
      if (!open || open.name !== closing) invalidXml(label, `unexpected closing tag ${closing}`);
      cursor = end + 1;
      continue;
    }

    if (xml.startsWith('<!', cursor)) invalidXml(label, 'unsupported declaration');

    const end = findXmlTagEnd(xml, cursor + 1, label);
    let source = xml.slice(cursor + 1, end);
    const selfClosing = source.endsWith('/');
    if (selfClosing) source = source.slice(0, -1);
    const name = source.match(XML_NAME)?.[0];
    if (!name) invalidXml(label, 'invalid opening tag');
    const node = {
      name,
      attributes: parseXmlAttributes(source, name.length, label),
      children: [],
      text: '',
    };
    if (stack.length) {
      stack.at(-1).children.push(node);
    } else if (root) {
      invalidXml(label, 'multiple document elements');
    } else {
      root = node;
    }
    if (!selfClosing) stack.push(node);
    cursor = end + 1;
  }

  if (stack.length) invalidXml(label, `unclosed tag ${stack.at(-1).name}`);
  if (!root) invalidXml(label, 'document element is missing');
  return root;
}

function assertTextOnlyXmlElement(node, label) {
  if (node.attributes.size || node.children.length) {
    invalidXml(label, `${node.name} has invalid content`);
  }
}

/**
 * The entries of a sitemap or sitemap index with their `lastmod`. Every entry
 * must carry one (a `YYYY-MM-DD` date) unless `requireLastmod` is off.
 */
export function sitemapEntries(xml, rootElement, label, { requireLastmod = true } = {}) {
  const root = parseXmlDocument(xml, label);
  ensure(root.name === rootElement, `${label}: invalid XML root ${root.name}`);
  ensure(root.attributes.size === 1 && root.attributes.get('xmlns') === SITEMAP_NAMESPACE,
    `${label}: invalid XML namespace`);
  ensure(!root.text.trim(), `${label}: invalid text in XML root`);
  const entryElement = rootElement === 'sitemapindex' ? 'sitemap' : 'url';
  const entries = root.children.map((entry, index) => {
    ensure(entry.name === entryElement, `${label}: invalid XML structure at entry ${index + 1}`);
    ensure(entry.attributes.size === 0 && !entry.text.trim(),
      `${label}: invalid XML attributes or text at entry ${index + 1}`);
    ensure(entry.children.length >= 1 && entry.children.length <= 2
      && entry.children[0].name === 'loc',
    `${label}: invalid XML structure at entry ${index + 1}`);
    const [location, lastmod] = entry.children;
    assertTextOnlyXmlElement(location, label);
    ensure(location.text.trim(), `${label}: empty XML location at entry ${index + 1}`);
    ensure(lastmod || !requireLastmod, `${label}: entry ${index + 1} has no lastmod`);
    if (lastmod) {
      ensure(lastmod.name === 'lastmod', `${label}: invalid XML structure at entry ${index + 1}`);
      assertTextOnlyXmlElement(lastmod, label);
      ensure(/^\d{4}-\d{2}-\d{2}$/.test(lastmod.text.trim())
        && !Number.isNaN(Date.parse(`${lastmod.text.trim()}T00:00:00Z`)),
      `${label}: invalid XML lastmod at entry ${index + 1}`);
    }
    return { location: location.text.trim(), lastmod: lastmod?.text.trim() };
  });
  ensure(entries.length > 0, `${label} contains no locations`);
  ensure(new Set(entries.map(entry => entry.location)).size === entries.length, `${label} contains duplicate locations`);
  return entries;
}

function sitemapLocations(xml, rootElement, label, options) {
  return sitemapEntries(xml, rootElement, label, options).map(entry => entry.location);
}

/** The index dates a sitemap by the latest `lastmod` among its entries. */
function assertIndexLastmod(indexEntries, location, entries, label) {
  const listed = indexEntries.find(entry => entry.location === location)?.lastmod;
  const latest = entries.map(entry => entry.lastmod).sort().at(-1);
  ensure(listed === latest, `${label}: sitemap index lastmod ${listed} is not the latest entry lastmod ${latest}`);
}

function assertXmlResponse(response, label) {
  ensure(response.status === 200, `${label}: HTTP ${response.status}`);
  ensure(/^application\/xml(?:;|$)/i.test(response.headers.get('content-type') || ''),
    `${label}: response is not XML`);
  ensure(!/noindex/i.test(response.headers.get('x-robots-tag') || ''),
    `${label}: response is unexpectedly noindex`);
}

function htmlAttributeValues(html, tag, attribute, value) {
  const values = [];
  const tagPattern = new RegExp(`<${tag}\\b[^>]*>`, 'gi');
  for (const match of html.matchAll(tagPattern)) {
    const source = match[0];
    const requested = value
      ? new RegExp(`\\b${attribute}=["']${value}["']`, 'i').test(source)
      : true;
    if (!requested) continue;
    const content = source.match(/\bcontent=["']([^"']*)["']/i)?.[1]
      ?? source.match(/\bhref=["']([^"']*)["']/i)?.[1];
    if (content !== undefined) values.push(content);
  }
  return values;
}

function structuredDataHasEntityIdentity(value, canonical, identity, identityFragment) {
  if (Array.isArray(value)) {
    return value.some(item => structuredDataHasEntityIdentity(item, canonical, identity, identityFragment));
  }
  if (!value || typeof value !== 'object') return false;
  const record = value;
  if ((record.url === canonical || record['@id'] === `${canonical}#${identityFragment}`)
    && String(record.identifier ?? '') === identity) return true;
  return Object.values(record).some(item => (
    structuredDataHasEntityIdentity(item, canonical, identity, identityFragment)
  ));
}

function structuredDataDescribesUrl(value, canonical) {
  if (Array.isArray(value)) return value.some(item => structuredDataDescribesUrl(item, canonical));
  if (!value || typeof value !== 'object') return false;
  return value.url === canonical || Object.values(value).some(item => structuredDataDescribesUrl(item, canonical));
}

// A page without an entity identifier still has to describe itself in JSON-LD.
function assertPageJsonLd(html, canonical, label) {
  const scripts = [...html.matchAll(/<script\b(?=[^>]*\btype=["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script>/gi)];
  ensure(scripts.length > 0, `${label}: JSON-LD is missing`);
  let describesPage = false;
  for (const script of scripts) {
    let parsed;
    try {
      parsed = JSON.parse(script[1]);
    } catch {
      throw new Error(`${label}: JSON-LD is invalid`);
    }
    if (structuredDataDescribesUrl(parsed, canonical)) describesPage = true;
  }
  ensure(describesPage, `${label}: JSON-LD does not describe the page`);
}

function assertIndexableEntityHtml(html, response, canonical, identity, identityFragment, label, options = {}) {
  ensure(response.status === 200, `${label} ${identity}: HTTP ${response.status}`);
  ensure((response.headers.get('content-type') || '').includes('text/html'),
    `${label} ${identity}: response is not HTML`);
  ensure(!/noindex/i.test(response.headers.get('x-robots-tag') || ''),
    `${label} ${identity}: X-Robots-Tag is noindex`);
  ensure(!PRIVATE_PAYLOAD_PATTERN.test(html), `${label} ${identity}: private payload marker found`);
  ensure([...html.matchAll(/<h1(?:\s[^>]*)?>/gi)].length === 1,
    `${label} ${identity}: expected exactly one H1`);
  const canonicals = [...html.matchAll(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)]
    .map(match => match[1]);
  ensure(canonicals.length === 1 && canonicals[0] === canonical,
    `${label} ${identity}: canonical mismatch`);
  const robots = htmlAttributeValues(html, 'meta', 'name', 'robots');
  ensure(robots.length === 1 && /(?:^|,)\s*index\b/i.test(robots[0]) && !/noindex/i.test(robots[0]),
    `${label} ${identity}: index robots metadata is missing`);
  if (identityFragment === null) {
    if (options.pageJsonLd) assertPageJsonLd(html, canonical, `${label} ${identity}`);
    return;
  }
  const scripts = [...html.matchAll(/<script\b(?=[^>]*\btype=["']application\/ld\+json["'])(?=[^>]*\bdata-server-entity-jsonld\b)[^>]*>([\s\S]*?)<\/script>/gi)];
  ensure(scripts.length > 0, `${label} ${identity}: entity JSON-LD is missing`);
  let identityFound = false;
  for (const script of scripts) {
    let parsed;
    try {
      parsed = JSON.parse(script[1]);
    } catch {
      throw new Error(`${label} ${identity}: entity JSON-LD is invalid`);
    }
    if (structuredDataHasEntityIdentity(parsed, canonical, identity, identityFragment)) identityFound = true;
  }
  ensure(identityFound, `${label} ${identity}: JSON-LD identity mismatch`);
}

function slowWarning(warnings, label, path, startedAt, limitMs) {
  const elapsed = Date.now() - startedAt;
  if (elapsed > limitMs) warnings.push({ label, message: `${path} answered in ${elapsed} ms (warning above ${limitMs} ms)` });
}

async function checkSeoCrawl(baseUrl, fetchImpl, timeoutMs, signal, sitemapWarnMs = DEFAULT_SITEMAP_WARN_MS) {
  const startedAt = Date.now();
  const origin = new URL(baseUrl).origin;
  const warnings = [];

  const { response: robotsResponse, body: robots } = await fetchBoundedText(
    new URL('/robots.txt', origin),
    fetchImpl,
    timeoutMs,
    MAX_ROBOTS_BYTES,
    'robots.txt',
    signal,
  );
  ensure(robotsResponse.status === 200, `robots.txt: HTTP ${robotsResponse.status}`);
  ensure((robotsResponse.headers.get('content-type') || '').includes('text/plain'), 'robots.txt: response is not text');
  ensure(/^User-agent:\s*\*\s*$/mi.test(robots), 'robots.txt: wildcard policy is missing');
  for (const path of ['/api', '/health', '/metrics', '/_internal']) {
    ensure(new RegExp(`^Disallow:\\s*${path.replace('/', '\\/')}\\s*$`, 'mi').test(robots),
      `robots.txt: ${path} disallow is missing`);
  }
  ensure(/^Allow:\s*\/assets\/\s*$/mi.test(robots), 'robots.txt: public assets are not explicitly allowed');
  ensure(new RegExp(`^Sitemap:\\s*${origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\/sitemap\\.xml\\s*$`, 'mi').test(robots),
    'robots.txt: canonical sitemap pointer is missing');

  const indexStartedAt = Date.now();
  const { response: indexResponse, body: indexXml } = await fetchBoundedText(
    new URL('/sitemap.xml', origin),
    fetchImpl,
    timeoutMs,
    MAX_SITEMAP_INDEX_BYTES,
    'sitemap index',
    signal,
  );
  slowWarning(warnings, 'sitemap index', '/sitemap.xml', indexStartedAt, sitemapWarnMs);
  assertXmlResponse(indexResponse, 'sitemap index');
  const indexEntries = sitemapEntries(indexXml, 'sitemapindex', 'sitemap index');
  const indexLocations = indexEntries.map(entry => entry.location);
  ensure(JSON.stringify(indexLocations) === JSON.stringify([
    `${origin}/sitemaps/static.xml`,
    ...ENTITY_SITEMAP_SEGMENTS.map(segment => `${origin}${segment.path}`),
  ]), 'sitemap index does not contain the exact public segment set');

  const staticStartedAt = Date.now();
  const { response: staticResponse, body: staticXml } = await fetchBoundedText(
    new URL('/sitemaps/static.xml', origin),
    fetchImpl,
    timeoutMs,
    MAX_STATIC_SITEMAP_BYTES,
    'static sitemap',
    signal,
  );
  slowWarning(warnings, 'static sitemap', '/sitemaps/static.xml', staticStartedAt, sitemapWarnMs);
  assertXmlResponse(staticResponse, 'static sitemap');
  const staticEntries = sitemapEntries(staticXml, 'urlset', 'static sitemap');
  const staticLocations = staticEntries.map(entry => entry.location);
  assertIndexLastmod(indexEntries, `${origin}/sitemaps/static.xml`, staticEntries, 'static sitemap');
  ensure(
    staticLocations.length === EXPECTED_STATIC_SITEMAP_URL_COUNT,
    `static sitemap contains ${staticLocations.length}/${EXPECTED_STATIC_SITEMAP_URL_COUNT} URLs`,
  );
  for (const location of staticLocations) {
    const parsed = new URL(location);
    ensure(parsed.origin === origin && !parsed.search && !parsed.hash
      && (parsed.pathname === '/' || parsed.pathname.endsWith('/')),
    'static sitemap contains a non-canonical URL');
  }

  const entityCounts = {};
  const sitemapSources = {};
  let firstStandardCanonical = '';
  let sampledDetails = 0;
  for (const segment of ENTITY_SITEMAP_SEGMENTS) {
    const segmentStartedAt = Date.now();
    const { response, body } = await fetchBoundedText(
      new URL(segment.path, origin),
      fetchImpl,
      timeoutMs,
      MAX_CARD_SITEMAP_BYTES,
      segment.label,
      signal,
    );
    slowWarning(warnings, segment.label, segment.path, segmentStartedAt, sitemapWarnMs);
    assertXmlResponse(response, segment.label);
    // Nginx correctly weakens an upstream strong validator when it compresses
    // the representation, so both strong and weak SHA-256 validators are valid.
    ensure(/^(?:W\/)?"sha256-[a-f0-9]{64}"$/i.test(response.headers.get('etag') || ''),
      `${segment.label}: SHA-256 ETag is missing`);
    const sitemapSource = response.headers.get('x-sitemap-source') || '';
    ensure(['catalog', 'last-known-good'].includes(sitemapSource),
      `${segment.label}: invalid X-Sitemap-Source`);
    if (sitemapSource === 'last-known-good') {
      warnings.push({ label: segment.label, message: `${segment.path} is served from the last-known-good copy` });
    }
    ensure(!PRIVATE_PAYLOAD_PATTERN.test(body), `${segment.label} contains private payload fields`);
    const segmentEntries = sitemapEntries(body, 'urlset', segment.label);
    const locations = segmentEntries.map(entry => entry.location);
    assertIndexLastmod(indexEntries, `${origin}${segment.path}`, segmentEntries, segment.label);
    ensure(locations.length >= segment.minimumUrls && locations.length <= 50_000,
      `${segment.label} has invalid entry count ${locations.length}`);
    for (const location of locations) {
      const parsed = new URL(location);
      ensure(parsed.origin === origin && !parsed.search && !parsed.hash
        && segment.pathPattern.test(parsed.pathname),
      `${segment.label} contains a non-canonical URL`);
    }
    // First, middle and last for most segments; evenly spread when a segment asks for more.
    const sampleCount = segment.sampleCount ?? DEFAULT_SAMPLE_COUNT;
    const sampleIndices = [...new Set(Array.from(
      { length: sampleCount },
      (_value, position) => Math.floor(position * (locations.length - 1) / (sampleCount - 1)),
    ))];
    for (const index of sampleIndices) {
      const canonical = locations[index];
      const identity = segment.identityFromPath(new URL(canonical).pathname);
      ensure(identity, `${segment.label}: sampled URL has no entity identity`);
      const sampleLabel = `sample ${segment.key} entity`;
      const { response: detailResponse, body: detailHtml } = await fetchBoundedText(
        new URL(canonical),
        fetchImpl,
        timeoutMs,
        MAX_ENTITY_HTML_BYTES,
        `${sampleLabel} ${identity}`,
        signal,
      );
      assertIndexableEntityHtml(
        detailHtml,
        detailResponse,
        canonical,
        identity,
        segment.identityFragment,
        sampleLabel,
        { pageJsonLd: segment.pageJsonLd === true },
      );
    }
    entityCounts[segment.key] = locations.length;
    sitemapSources[segment.key] = sitemapSource;
    if (segment.key === 'standard') firstStandardCanonical = locations[0];
    sampledDetails += sampleIndices.length;
  }

  ensure(firstStandardCanonical, 'standard card sitemap has no canonical URL for redirect sampling');
  const canonical = firstStandardCanonical;
  const withoutSlash = canonical.slice(0, -1);
  const { response: redirectResponse } = await fetchBoundedText(
    new URL(withoutSlash),
    fetchImpl,
    timeoutMs,
    MAX_EMPTY_RESPONSE_BYTES,
    'canonical redirect',
    signal,
  );
  ensure(redirectResponse.status === 301, `canonical redirect: HTTP ${redirectResponse.status}`);
  const redirectLocation = redirectResponse.headers.get('location') || '';
  ensure(new URL(redirectLocation, withoutSlash).href === canonical, 'canonical redirect does not resolve in one hop');

  const unknownCanonical = `${origin}/standard/cards/standard/MANACOST_MONITOR_ABSENT_CARD/`;
  const { response: unknownResponse, body: unknownHtml } = await fetchBoundedText(
    new URL(unknownCanonical),
    fetchImpl,
    timeoutMs,
    MAX_ENTITY_HTML_BYTES,
    'unknown card HTML',
    signal,
  );
  // A last-known-good catalog cannot prove that a card is absent. The
  // documented answer is then a retryable 503, which is healthy for a release.
  const unknownCard = unknownResponse.status === 503 ? 'unverifiable' : 'absent';
  if (unknownCard === 'unverifiable') {
    const { response: catalogResponse } = await fetchBoundedText(
      new URL('/api/constructed-cards?format=standard&perPage=1', origin),
      fetchImpl,
      timeoutMs,
      MAX_CONSTRUCTED_JSON_BYTES,
      'unknown card catalog state',
      signal,
    );
    const catalogCache = catalogResponse.headers.get('x-data-cache') || 'none';
    ensure(catalogResponse.status === 200 && catalogCache === 'LKG',
      `unknown card HTML: HTTP 503 while the card catalog answers HTTP ${catalogResponse.status} with X-Data-Cache ${catalogCache}`);
    ensure(/^[1-9][0-9]{0,3}$/.test(unknownResponse.headers.get('retry-after') || ''),
      'unknown card HTML: retryable 503 has no Retry-After');
  } else {
    ensure(unknownResponse.status === 404, `unknown card HTML: HTTP ${unknownResponse.status}`);
  }
  ensure(/noindex/i.test(unknownResponse.headers.get('x-robots-tag') || ''),
    'unknown card HTML: noindex response header is missing');
  ensure(!PRIVATE_PAYLOAD_PATTERN.test(unknownHtml), 'unknown card HTML contains private payload fields');
  ensure(htmlAttributeValues(unknownHtml, 'meta', 'name', 'robots').some(value => /noindex/i.test(value)),
    'unknown card HTML: noindex metadata is missing');
  ensure(!/<link\b[^>]*\brel=["']canonical["']/i.test(unknownHtml),
    'unknown card HTML must not expose a canonical URL');

  return {
    status: 200,
    durationMs: Date.now() - startedAt,
    staticUrls: staticLocations.length,
    standardUrls: entityCounts.standard,
    entityUrls: entityCounts,
    sampledDetails,
    unknownCard,
    sitemapSources,
    warnings,
  };
}

async function retryCheck(label, check, attempts, retryDelayMs, signal) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (signal.aborted) {
      lastError = signal.reason;
      break;
    }
    try {
      const result = await check();
      return { label, attempts: attempt, ...result };
    } catch (error) {
      lastError = error;
      if (signal.aborted) break;
      if (attempt < attempts) {
        try {
          await delay(retryDelayMs, undefined, { signal });
        } catch (delayError) {
          lastError = delayError;
          break;
        }
      }
    }
  }
  const failure = new Error(`${label}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  if (Array.isArray(lastError?.failures)) failure.failures = lastError.failures;
  throw failure;
}

function sanitizedFailureMessage(error) {
  return (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/\b(authorization|cookie|token|secret|state|code|deckCode)=([^&\s,;]+)/gi, '$1=[redacted]')
    .replace(/QA_PRIVATE_[A-Za-z0-9_]+/g, '[redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 500) || 'monitor check failed';
}

export class ProductionMonitorFailure extends Error {
  constructor(report) {
    super(`Production monitor failed: ${report.failures.map(failure => `${failure.label}: ${failure.message}`).join('; ')}`);
    this.name = 'ProductionMonitorFailure';
    this.report = report;
  }
}

async function checkJsonEndpoint(baseUrl, path, fetchImpl, timeoutMs, signal, validate) {
  const startedAt = Date.now();
  const { response, payload } = await fetchBoundedJson(
    new URL(path, baseUrl),
    fetchImpl,
    timeoutMs,
    MAX_HEALTH_JSON_BYTES,
    path,
    signal,
  );
  ensure(response.status === 200, `HTTP ${response.status}`);
  ensure((response.headers.get('cache-control') || '').includes('no-store'), 'missing Cache-Control: no-store');
  validate(payload);
  return { status: response.status, durationMs: Date.now() - startedAt };
}

async function checkHtmlRoute(baseUrl, path, fetchImpl, timeoutMs, signal) {
  const startedAt = Date.now();
  const { response, body } = await fetchBoundedText(
    new URL(path, baseUrl),
    fetchImpl,
    timeoutMs,
    MAX_ENTITY_HTML_BYTES,
    `page ${path}`,
    signal,
  );
  ensure(response.status === 200, `HTTP ${response.status}`);
  ensure((response.headers.get('content-type') || '').includes('text/html'), 'response is not HTML');
  ensure(/<html[\s>]/i.test(body), 'HTML document marker is missing');
  ensure(!/application error|internal server error/i.test(body), 'error document returned');
  return { status: response.status, durationMs: Date.now() - startedAt };
}

function validateConstructedCardEnvelope(response, payload, label) {
  const cacheSource = response.headers.get('x-data-cache') || '';
  const dataStatus = String(payload?.dataStatus || '');
  const warning = response.headers.get('warning') || '';
  const datasetVersion = response.headers.get('x-dataset-version') || '';
  ensure(['fresh', 'LKG'].includes(cacheSource), `${label}: invalid X-Data-Cache`);
  ensure(/^ccc1-sha256:[a-f0-9]{64}$/i.test(datasetVersion),
    `${label}: constructed-card dataset version is missing`);
  ensure(String(payload?.datasetVersion || '') === datasetVersion,
    `${label}: X-Dataset-Version does not match the response envelope`);
  ensure((response.headers.get('cache-control') || '').includes('no-store'), `${label}: missing Cache-Control: no-store`);
  if (cacheSource === 'fresh') {
    ensure(dataStatus === 'fresh', `${label}: fresh cache must have dataStatus fresh`);
    ensure(!warning, `${label}: fresh cache must not include a stale Warning`);
  } else {
    ensure(dataStatus === 'stale', `${label}: LKG cache must have dataStatus stale`);
    ensure(/^110\b/.test(warning), `${label}: LKG cache must include Warning 110`);
  }
}

async function checkConstructedCards(baseUrl, fetchImpl, timeoutMs, signal) {
  const checks = [];
  for (const format of ['standard', 'wild']) {
    const listStartedAt = Date.now();
    const { response: listResponse, payload: list } = await fetchBoundedJson(
      new URL(`/api/constructed-cards?format=${format}&perPage=1`, baseUrl),
      fetchImpl,
      timeoutMs,
      MAX_CONSTRUCTED_JSON_BYTES,
      `constructed cards ${format} list`,
      signal,
    );
    ensure(listResponse.status === 200, `constructed cards ${format} list: HTTP ${listResponse.status}`);
    validateConstructedCardEnvelope(listResponse, list, `constructed cards ${format} list`);
    ensure(list?.partial === false, `constructed cards ${format} catalog is partial`);
    const knownId = String(list?.cards?.[0]?.card_id || '');
    ensure(/^(?:[A-Za-z0-9_]{2,80}|blizzard:[1-9][0-9]{0,18})$/.test(knownId), `constructed cards ${format} catalog has no monitorable card`);
    checks.push({ label: `constructed cards ${format} list`, attempts: 1, status: 200, durationMs: Date.now() - listStartedAt });

    const detailStartedAt = Date.now();
    const { response: detailResponse, payload: detail } = await fetchBoundedJson(
      new URL(`/api/constructed-cards/${encodeURIComponent(knownId)}?format=${format}`, baseUrl),
      fetchImpl,
      timeoutMs,
      MAX_CONSTRUCTED_JSON_BYTES,
      `constructed cards ${format} known`,
      signal,
    );
    ensure(detailResponse.status === 200, `constructed cards ${format} known: HTTP ${detailResponse.status}`);
    validateConstructedCardEnvelope(detailResponse, detail, `constructed cards ${format} known`);
    ensure(String(detail?.card?.card_id || '').toUpperCase() === knownId.toUpperCase(),
      `constructed cards ${format} known detail identity mismatch`);
    ensure(detail?.partial === false, `constructed cards ${format} known detail is partial`);
    checks.push({ label: `constructed cards ${format} known`, attempts: 1, status: 200, durationMs: Date.now() - detailStartedAt });

    const unknownStartedAt = Date.now();
    const { response: unknownResponse } = await fetchBoundedText(
      new URL(`/api/constructed-cards/MANACOST_MONITOR_ABSENT_CARD?format=${format}`, baseUrl),
      fetchImpl,
      timeoutMs,
      MAX_EMPTY_RESPONSE_BYTES,
      `constructed cards ${format} unknown`,
      signal,
    );
    ensure(unknownResponse.status === 404, `constructed cards ${format} unknown: HTTP ${unknownResponse.status}`);
    ensure((unknownResponse.headers.get('cache-control') || '').includes('no-store'),
      `constructed cards ${format} unknown: missing Cache-Control: no-store`);
    checks.push({ label: `constructed cards ${format} unknown`, attempts: 1, status: 404, durationMs: Date.now() - unknownStartedAt });
  }
  return checks;
}

function assertIndexablePage(response, body) {
  ensure(response.status === 200, `HTTP ${response.status}`);
  ensure((response.headers.get('content-type') || '').includes('text/html'), 'response is not HTML');
  ensure(/<html[\s>]/i.test(body), 'HTML document marker is missing');
  ensure(!/application error|internal server error/i.test(body), 'error document returned');
  ensure(!/noindex/i.test(response.headers.get('x-robots-tag') || ''), 'X-Robots-Tag is noindex');
  ensure(!htmlAttributeValues(body, 'meta', 'name', 'robots').some(value => /noindex/i.test(value)),
    'robots metadata is noindex');
}

async function sitemapSampleLocations(origin, segmentKey, fetchImpl, timeoutMs, signal) {
  const segment = ENTITY_SITEMAP_SEGMENTS.find(item => item.key === segmentKey);
  ensure(segment, `unknown sitemap segment ${segmentKey}`);
  const { response, body } = await fetchBoundedText(
    new URL(segment.path, origin),
    fetchImpl,
    timeoutMs,
    MAX_CARD_SITEMAP_BYTES,
    `${segment.label} (template sample)`,
    signal,
  );
  ensure(response.status === 200, `${segment.path}: HTTP ${response.status}`);
  const locations = sitemapLocations(body, 'urlset', segment.label, { requireLastmod: false });
  ensure(locations.length > 0, `${segment.path} has no URLs`);
  return locations;
}

// One GET per sample, one at a time with a pause, so the monitor never loads
// the origin. Every failed template is reported with its URL, status and time.
async function checkPageTemplates(baseUrl, fetchImpl, timeoutMs, signal, settings) {
  const startedAt = Date.now();
  const origin = new URL(baseUrl).origin;
  const { samples, uncovered } = pageTemplateSamples();
  const warnings = uncovered.map(id => ({
    label: `page template ${id}`,
    message: 'indexable template has no monitor sample (add it to production-monitor-templates.mjs)',
  }));
  const failures = [];
  const segmentLocations = new Map();
  const probe = async (label, resolveUrl) => {
    const url = await resolveUrl();
    const pageStartedAt = Date.now();
    try {
      const { response, body } = await fetchBoundedText(
        url, fetchImpl, timeoutMs, MAX_ENTITY_HTML_BYTES, label, signal,
      );
      assertIndexablePage(response, body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${url.pathname}: ${message} (${Date.now() - pageStartedAt} ms)`);
    }
    const elapsed = Date.now() - pageStartedAt;
    if (elapsed > settings.pageWarnMs) {
      warnings.push({ label, message: `${url.pathname} answered in ${elapsed} ms (warning above ${settings.pageWarnMs} ms)` });
    }
    return { status: 200, durationMs: elapsed };
  };

  for (const [index, sample] of samples.entries()) {
    if (signal.aborted) throw signal.reason;
    if (index > 0 && settings.pauseMs > 0) await delay(settings.pauseMs, undefined, { signal });
    const label = `page template ${sample.id}`;
    const resolveUrl = async () => {
      if (sample.path) return new URL(sample.path, origin);
      if (!segmentLocations.has(sample.segment)) {
        segmentLocations.set(sample.segment, sitemapSampleLocations(
          origin, sample.segment, fetchImpl, timeoutMs, signal,
        ).catch(error => {
          segmentLocations.delete(sample.segment);
          throw error;
        }));
      }
      const locations = await segmentLocations.get(sample.segment);
      return new URL(locations[0]);
    };
    try {
      await retryCheck(label, () => probe(label, resolveUrl), settings.attempts, settings.retryDelayMs, signal);
    } catch (error) {
      if (signal.aborted) throw error;
      failures.push({ label, message: error.message.slice(label.length + 2) });
    }
  }
  if (failures.length) {
    const failure = new Error(`${failures.length} of ${samples.length} page templates failed`);
    failure.failures = failures;
    throw failure;
  }
  return {
    status: 200,
    durationMs: Date.now() - startedAt,
    templates: new Set(samples.map(sample => sample.id)).size,
    urls: samples.length,
    unmonitored: uncovered.length,
    warnings,
  };
}

// /api/health/data answers 503 when ANY dataset is not fresh, including the
// optional Data API one (#398), so the status code alone cannot tell a broken
// storefront from a degraded upstream. Judge the required datasets by their
// own state; report the rest as warnings (known ones with their issue).
function evaluateDataHealth(status, payload, lkgMaxAgeMs) {
  const datasets = Array.isArray(payload?.datasets) ? payload.datasets : [];
  const problems = [];
  const warnings = [];
  const knownIssues = [];
  if (payload?.ready !== true) problems.push('service reports it is not ready');
  for (const name of REQUIRED_DATASETS) {
    const dataset = datasets.find(item => item?.name === name);
    if (!dataset) {
      problems.push(`${name} is missing from the report`);
    } else if (!(Number(dataset.records) > 0)) {
      problems.push(`${name} is empty`);
    } else if (dataset.state !== 'fresh') {
      const ageMs = Number(dataset.ageMs);
      const minutes = Number.isFinite(ageMs) ? Math.round(ageMs / 60_000) : null;
      if (dataset.state === 'stale' && dataset.cacheSource === 'LKG' && Number.isFinite(ageMs) && ageMs <= lkgMaxAgeMs) {
        warnings.push({ label: 'data freshness', message: `${name} is served from last-known-good (${minutes} min)` });
      } else {
        problems.push(`${name} is ${dataset.state}${minutes === null ? '' : ` (${minutes} min old)`}`);
      }
    }
  }
  for (const dataset of datasets) {
    if (REQUIRED_DATASETS.includes(dataset?.name) || dataset?.state === 'fresh') continue;
    const issue = KNOWN_DATASET_ISSUES[dataset?.name];
    const detail = `${dataset?.name} is ${dataset?.state}${dataset?.warning ? `: ${dataset.warning}` : ''}`;
    warnings.push({ label: 'data freshness', message: `${detail}${issue ? ` (known issue ${issue})` : ''}` });
    if (issue) knownIssues.push({ dataset: dataset.name, issue });
  }
  if (problems.length) throw new Error(`HTTP ${status}: ${problems.join('; ')}`);
  return { warnings, knownIssues };
}

async function checkDataFreshness(baseUrl, fetchImpl, timeoutMs, signal, lkgMaxAgeMs) {
  const startedAt = Date.now();
  const { response, body } = await fetchBoundedText(
    new URL('/api/health/data', baseUrl), fetchImpl, timeoutMs, MAX_HEALTH_JSON_BYTES, '/api/health/data', signal,
  );
  ensure([200, 503].includes(response.status), `HTTP ${response.status}`);
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error(`HTTP ${response.status}: response is not valid JSON`);
  }
  ensure((response.headers.get('cache-control') || '').includes('no-store'), 'missing Cache-Control: no-store');
  const verdict = evaluateDataHealth(response.status, payload, lkgMaxAgeMs);
  return { status: response.status, durationMs: Date.now() - startedAt, ...verdict };
}

export async function runProductionMonitor(options = {}) {
  const parsedBaseUrl = new URL(String(options.baseUrl || DEFAULT_BASE_URL));
  ensure(['http:', 'https:'].includes(parsedBaseUrl.protocol)
    && !parsedBaseUrl.username && !parsedBaseUrl.password,
  'invalid production monitor base URL');
  const baseUrl = parsedBaseUrl.origin;
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = Number(options.timeoutMs ?? 10_000);
  const attempts = Number(options.attempts ?? 2);
  const retryDelayMs = Number(options.retryDelayMs ?? 5_000);
  const deadlineMs = Number(options.deadlineMs ?? DEFAULT_MONITOR_DEADLINE_MS);
  const pageWarnMs = Number(options.pageWarnMs ?? DEFAULT_PAGE_WARN_MS);
  const sitemapWarnMs = Number(options.sitemapWarnMs ?? DEFAULT_SITEMAP_WARN_MS);
  const requestPauseMs = Number(options.requestPauseMs ?? DEFAULT_REQUEST_PAUSE_MS);
  const lkgMaxAgeMs = Number(options.lkgMaxAgeMs ?? DEFAULT_LKG_MAX_AGE_MS);
  const profile = String(options.profile || 'full').trim().toLowerCase();
  const expectedRelease = String(options.expectedRelease || '').trim().toLowerCase();
  ensure(Number.isFinite(timeoutMs) && timeoutMs > 0, 'invalid request timeout');
  ensure(Number.isInteger(attempts) && attempts > 0, 'invalid monitor attempt count');
  ensure(Number.isFinite(retryDelayMs) && retryDelayMs >= 0, 'invalid retry delay');
  ensure(Number.isFinite(deadlineMs) && deadlineMs > 0, 'invalid monitor deadline');
  for (const [name, value] of Object.entries({ pageWarnMs, sitemapWarnMs, requestPauseMs, lkgMaxAgeMs })) {
    ensure(Number.isFinite(value) && value >= 0, `invalid ${name}`);
  }
  ensure(MONITOR_PROFILES.has(profile), `invalid production monitor profile: ${profile}`);
  ensure(!expectedRelease || /^[a-f0-9]{7,40}$/.test(expectedRelease), 'invalid expected release SHA');
  const routes = options.routes || DEFAULT_ROUTES;
  const checks = [];
  const failures = [];
  const warnings = [];
  const knownIssues = [];
  const deadlineController = new AbortController();
  const deadline = setTimeout(() => {
    deadlineController.abort(new Error(`global monitor deadline exceeded after ${deadlineMs}ms`));
  }, deadlineMs);
  const signal = deadlineController.signal;
  const groups = [
    {
      label: 'liveness',
      profiles: ['full', 'release'],
      operation: () => checkJsonEndpoint(
        baseUrl,
        '/api/health/live',
        fetchImpl,
        timeoutMs,
        signal,
        payload => {
          ensure(payload?.status === 'alive', 'status is not alive');
          const actualRelease = String(payload?.release || '').toLowerCase();
          ensure(/^[a-f0-9]{7,40}$/.test(actualRelease), 'release SHA is missing');
          ensure(!expectedRelease || actualRelease === expectedRelease,
            `expected release ${expectedRelease}, received ${actualRelease}`);
        },
      ),
    },
    {
      label: 'readiness',
      profiles: ['full', 'release'],
      operation: () => checkJsonEndpoint(
        baseUrl,
        '/api/health/ready',
        fetchImpl,
        timeoutMs,
        signal,
        payload => {
          ensure(payload?.status === 'ready', 'status is not ready');
          ensure(['ok', 'degraded'].includes(payload?.dataStatus),
            `data status is ${String(payload?.dataStatus)}`);
        },
      ),
    },
    {
      label: 'data freshness',
      profiles: ['full', 'freshness'],
      operation: () => checkDataFreshness(baseUrl, fetchImpl, timeoutMs, signal, lkgMaxAgeMs),
    },
    {
      label: 'SEO crawl contract',
      profiles: ['full', 'release'],
      operation: () => checkSeoCrawl(baseUrl, fetchImpl, timeoutMs, signal, sitemapWarnMs),
    },
    {
      label: 'constructed cards',
      profiles: ['full', 'release'],
      nested: true,
      operation: async () => ({
        status: 200,
        durationMs: 0,
        nested: await checkConstructedCards(baseUrl, fetchImpl, timeoutMs, signal),
      }),
    },
    ...routes.map(route => ({
      label: `page ${route}`,
      profiles: ['full', 'release'],
      operation: () => checkHtmlRoute(baseUrl, route, fetchImpl, timeoutMs, signal),
    })),
    {
      label: 'page templates',
      profiles: ['full', 'release'],
      attempts: 1, // retries are per template inside the check
      operation: () => checkPageTemplates(baseUrl, fetchImpl, timeoutMs, signal, {
        attempts, retryDelayMs, pageWarnMs, pauseMs: requestPauseMs,
      }),
    },
  ].filter(group => group.profiles.includes(profile));

  try {
    const outcomes = await Promise.all(groups.map(async group => {
      try {
        const result = await retryCheck(
          group.label,
          group.operation,
          group.attempts ?? attempts,
          retryDelayMs,
          signal,
        );
        const groupChecks = group.nested
          ? result.nested.map(check => ({ ...check, attempts: result.attempts }))
          : [result];
        return { checks: groupChecks };
      } catch (error) {
        if (Array.isArray(error?.failures)) {
          return {
            failures: error.failures.map(failure => ({
              label: failure.label,
              message: sanitizedFailureMessage(failure.message),
            })),
          };
        }
        return {
          failures: [{ label: group.label, message: sanitizedFailureMessage(error) }],
        };
      }
    }));
    for (const outcome of outcomes) {
      if (outcome.failures) failures.push(...outcome.failures);
      else {
        for (const { warnings: found = [], knownIssues: known = [], ...check } of outcome.checks) {
          checks.push(check);
          warnings.push(...found);
          knownIssues.push(...known);
        }
      }
    }
  } finally {
    clearTimeout(deadline);
  }

  const report = {
    status: failures.length ? 'error' : 'ok',
    profile,
    baseUrl,
    checkedAt: new Date().toISOString(),
    checks,
    warnings,
    knownIssues,
    failures,
  };
  if (failures.length) throw new ProductionMonitorFailure(report);
  return report;
}

// The workflow reads this file to decide on the alert (production-monitor-alert.mjs).
function writeReportFile(report) {
  const file = process.env.MONITOR_REPORT_FILE;
  if (file) writeFileSync(file, `${JSON.stringify(report)}\n`);
}

async function main() {
  try {
    const report = await runProductionMonitor({
      baseUrl: process.env.PRODUCTION_BASE_URL,
      profile: process.env.PRODUCTION_MONITOR_PROFILE,
      expectedRelease: process.env.EXPECTED_RELEASE_SHA,
      timeoutMs: process.env.MONITOR_TIMEOUT_MS,
      attempts: process.env.MONITOR_ATTEMPTS,
      retryDelayMs: process.env.MONITOR_RETRY_DELAY_MS,
      deadlineMs: process.env.MONITOR_DEADLINE_MS,
      pageWarnMs: process.env.MONITOR_PAGE_WARN_MS,
      sitemapWarnMs: process.env.MONITOR_SITEMAP_WARN_MS,
      requestPauseMs: process.env.MONITOR_REQUEST_PAUSE_MS,
      lkgMaxAgeMs: process.env.MONITOR_LKG_MAX_AGE_MS,
    });
    writeReportFile(report);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    const diagnostic = error instanceof ProductionMonitorFailure
      ? error.report
      : { status: 'error', failures: [{ label: 'monitor', message: sanitizedFailureMessage(error) }] };
    writeReportFile(diagnostic);
    console.error(`[production-monitor] ${JSON.stringify(diagnostic)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
