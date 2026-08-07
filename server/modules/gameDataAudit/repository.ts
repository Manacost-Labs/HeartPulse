import { readFile } from 'node:fs/promises';

import { evaluateCatalogRecords, stableFingerprint, valueAtPath } from './model.js';
import type {
  AuditIssue,
  AuditManifest,
  CatalogProfile,
  SourceDefinition,
  SourceObservation,
} from './types.js';

type FetchLike = typeof fetch;
type Environment = Record<string, string | undefined>;

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const DOCUMENT_PROVIDERS = ['scrape.do', 'firecrawl', 'scrapfly'] as const;

export function assertSafeSourceUrl(rawUrl: string, allowedHosts: string[]): URL {
  const url = new URL(rawUrl);
  const allowed = new Set(allowedHosts.map(host => host.trim().toLowerCase()));
  if (!allowed.has(url.hostname.toLowerCase())) throw new Error(`Source host is outside the allowlist: ${url.hostname}`);
  if (url.protocol === 'https:') return url;
  if (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname)) return url;
  if (url.protocol === 'http:') throw new Error('HTTPS is required; plain HTTP is allowed for loopback sources only');
  throw new Error('Source URL must use HTTPS');
}

export async function readResponseBody(response: Response, maxBytes: number): Promise<string> {
  const length = Number(response.headers.get('content-length') || 0);
  if (length > maxBytes) throw new Error('Response exceeds maximum size');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let body = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new Error('Response exceeds maximum size');
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

function providerError(provider: string, status: number): Error {
  return new Error(`${provider} returned HTTP ${status}`);
}

export function createDocumentCollector(options: { fetchImpl?: FetchLike; env?: Environment } = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const env = options.env ?? process.env;

  return async (targetUrl: string, limits: { timeoutMs: number; maxBytes: number }) => {
    const attempts: string[] = [];
    for (const provider of DOCUMENT_PROVIDERS) {
      try {
        if (provider === 'scrape.do' && env.SCRAPE_DO_TOKEN) {
          attempts.push(provider);
          const url = new URL('https://api.scrape.do/');
          url.searchParams.set('token', env.SCRAPE_DO_TOKEN);
          url.searchParams.set('url', targetUrl);
          const response = await fetchImpl(url, { signal: AbortSignal.timeout(limits.timeoutMs), redirect: 'error' });
          if (!response.ok) throw providerError(provider, response.status);
          return { provider, content: await readResponseBody(response, limits.maxBytes), attempts };
        }
        if (provider === 'firecrawl' && env.FIRECRAWL_API_KEYS) {
          attempts.push(provider);
          const apiKeys = env.FIRECRAWL_API_KEYS.split(',').map(item => item.trim()).filter(Boolean);
          for (const apiKey of apiKeys) {
            try {
              const response = await fetchImpl('https://api.firecrawl.dev/v2/scrape', {
                method: 'POST',
                headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
                body: JSON.stringify({ url: targetUrl, formats: ['markdown'], onlyMainContent: true }),
                signal: AbortSignal.timeout(limits.timeoutMs),
                redirect: 'error',
              });
              if (!response.ok) throw providerError(provider, response.status);
              const payload = JSON.parse(await readResponseBody(response, limits.maxBytes)) as Record<string, any>;
              const content = String(payload?.data?.markdown ?? payload?.markdown ?? '');
              if (!content) throw new Error('firecrawl returned an empty document');
              return { provider, content, attempts };
            } catch {
              // Rotate through every configured key before falling back to Scrapfly.
            }
          }
          continue;
        }
        if (provider === 'scrapfly' && env.SCRAPFLY_API_KEY) {
          attempts.push(provider);
          const url = new URL('https://api.scrapfly.io/scrape');
          url.searchParams.set('key', env.SCRAPFLY_API_KEY);
          url.searchParams.set('url', targetUrl);
          url.searchParams.set('format', 'json');
          const response = await fetchImpl(url, { method: 'GET', signal: AbortSignal.timeout(limits.timeoutMs), redirect: 'error' });
          if (!response.ok) throw providerError(provider, response.status);
          const payload = JSON.parse(await readResponseBody(response, limits.maxBytes)) as Record<string, any>;
          const content = String(payload?.result?.content ?? payload?.content ?? '');
          if (!content) throw new Error('scrapfly returned an empty document');
          return { provider, content, attempts };
        }
      } catch {
        // Continue through the documented provider chain. Errors are summarized
        // after all configured providers have been attempted; secrets are never logged.
      }
    }
    throw new Error(attempts.length > 0
      ? `All document providers failed: ${attempts.join(', ')}`
      : 'No document provider credentials are configured');
  };
}

function errorIssue(code: string, message: string): AuditIssue {
  return { code, message, severity: 'error' };
}

function warningIssue(code: string, message: string, affectedCount?: number): AuditIssue {
  return { code, message, severity: 'warning', affectedCount };
}

function recordsFrom(payload: unknown, path = 'data'): unknown[] {
  const value = valueAtPath(payload, path);
  return Array.isArray(value) ? value : [];
}

function identitiesFrom(records: unknown[], path: string): string[] {
  return records.map(record => String(valueAtPath(record, path) ?? '').trim()).filter(Boolean).sort();
}

function inspectArenaHealth(payload: unknown): { issues: AuditIssue[]; facts: Record<string, string | number | boolean | null> } {
  const datasets = recordsFrom(payload, 'datasets');
  const staleRequired = datasets.filter(item => valueAtPath(item, 'requiredForReadiness') === true && valueAtPath(item, 'state') !== 'fresh');
  const staleTotal = datasets.filter(item => valueAtPath(item, 'state') !== 'fresh');
  return {
    issues: [
      ...(valueAtPath(payload, 'ready') === true ? [] : [errorIssue('ARENA_NOT_READY', 'Приложение не готово обслуживать данные')]),
      ...(staleRequired.length > 0 ? [errorIssue('REQUIRED_DATASET_STALE', 'Обязательные наборы данных устарели')] : []),
      ...(staleTotal.length > staleRequired.length ? [warningIssue('OPTIONAL_DATASET_STALE', 'Часть необязательных наборов данных устарела', staleTotal.length - staleRequired.length)] : []),
    ],
    facts: { datasets: datasets.length, staleDatasets: staleTotal.length, staleRequired: staleRequired.length },
  };
}

function inspectHsDataHealth(payload: unknown): { issues: AuditIssue[]; facts: Record<string, string | number | boolean | null> } {
  const data = valueAtPath(payload, 'data');
  const hard = recordsFrom(data, 'hard_failed_sources');
  const semantic = recordsFrom(data, 'semantic_failed_sources');
  const publication = recordsFrom(data, 'publication_failed_sources');
  const stale = recordsFrom(data, 'stale_sources');
  return {
    issues: [
      ...(hard.length + semantic.length + publication.length > 0 ? [errorIssue('DATA_SOURCE_FAILED', 'API статистики сообщает об ошибках источников или публикации')] : []),
      ...(stale.length > 0 ? [warningIssue('SOURCE_LAG', 'Часть статистических источников использует устаревший кэш', stale.length)] : []),
    ],
    facts: {
      sources: Number(valueAtPath(data, 'sources') ?? 0),
      staleSources: stale.length,
      hardFailures: hard.length,
      semanticFailures: semantic.length,
      publicationFailures: publication.length,
    },
  };
}

function inspectParserControl(payload: unknown): {
  identities: string[];
  issues: AuditIssue[];
  facts: Record<string, string | number | boolean | null>;
} {
  const sections = valueAtPath(payload, 'sections');
  const sectionValues = sections && typeof sections === 'object' && !Array.isArray(sections)
    ? Object.values(sections as Record<string, unknown>)
    : [];
  const sources = sectionValues.flatMap(section => recordsFrom(section, 'sources'));
  const failed = sources.filter(source => /(?:^|_)(?:error|failed)$|blocked|unhealthy/i.test(String(
    valueAtPath(source, 'state') ?? valueAtPath(source, 'health') ?? '',
  )) && valueAtPath(source, 'stable_baseline_available') !== true);
  const stale = sources.filter(source => /warning|stale|cached_after_failure|fetch_error/i.test(String(
    valueAtPath(source, 'state') ?? valueAtPath(source, 'health') ?? '',
  )));
  const identities = sources.map(source => [
    valueAtPath(source, 'source_id'),
    valueAtPath(source, 'last_success_at'),
    valueAtPath(source, 'item_count'),
    valueAtPath(source, 'state'),
  ].map(value => String(value ?? '')).join(':')).sort();
  return {
    identities,
    issues: [
      ...(failed.length > 0 ? [errorIssue('PARSER_SOURCE_FAILED', 'Один или несколько парсеров завершились ошибкой')] : []),
      ...(stale.length > 0 ? [warningIssue('PARSER_SOURCE_STALE', 'Один или несколько парсеров отдают last-known-good данные', stale.length)] : []),
    ],
    facts: { sources: sources.length, failedSources: failed.length, staleSources: stale.length },
  };
}

async function fetchChecked(fetchImpl: FetchLike, url: URL, source: SourceDefinition, env: Environment, method = 'GET'): Promise<Response> {
  const headers = new Headers({ accept: source.kind === 'head' ? '*/*' : 'application/json' });
  if (source.authHeaderEnv) {
    const key = env[source.authHeaderEnv]?.trim();
    if (key) headers.set('X-API-Key', key);
  }
  return fetchImpl(url, {
    method,
    headers,
    signal: AbortSignal.timeout(source.timeoutMs ?? 15_000),
    redirect: 'error',
    cache: 'no-store',
  });
}

export async function collectSource(
  source: SourceDefinition,
  options: { fetchImpl?: FetchLike; env?: Environment; now?: Date } = {},
): Promise<SourceObservation> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const env = options.env ?? process.env;
  const checkedAt = (options.now ?? new Date()).toISOString();
  const required = source.required !== false;
  const base = {
    id: source.id,
    label: source.label,
    role: source.role,
    required,
    escalateOnChange: source.escalateOnChange,
    trackChanges: source.trackChanges,
    checkedAt,
  };
  if (source.optionalWhenEnvMissing && !env[source.optionalWhenEnvMissing]?.trim()) {
    return { ...base, ok: true, fingerprint: null, recordCount: null, facts: { skipped: true }, issues: [] };
  }

  try {
    const safeUrl = assertSafeSourceUrl(source.url, source.allowedHosts);
    if (source.kind === 'head') {
      const response = await fetchChecked(fetchImpl, safeUrl, source, env, 'HEAD');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const signal = {
        etag: response.headers.get('etag'),
        lastModified: response.headers.get('last-modified'),
        contentLength: response.headers.get('content-length'),
      };
      return { ...base, ok: true, fingerprint: stableFingerprint(signal), recordCount: null, facts: signal, issues: [] };
    }

    if (source.kind === 'document') {
      const collect = createDocumentCollector({ fetchImpl, env });
      const document = await collect(safeUrl.href, { timeoutMs: source.timeoutMs ?? 20_000, maxBytes: source.maxBytes ?? 2_000_000 });
      const pattern = new RegExp(source.documentPattern ?? 'Patch\\s+(\\d+(?:\\.\\d+){1,2})', 'i');
      const match = document.content.match(pattern);
      if (!match?.[1]) throw new Error('Document pattern was not found');
      const latest = match[1];
      return {
        ...base,
        ok: true,
        fingerprint: stableFingerprint({ latest }),
        recordCount: null,
        facts: { latestVersion: latest, provider: document.provider },
        issues: [],
      };
    }

    const payloads: unknown[] = [];
    const allRecords: unknown[] = [];
    let paginationTruncated = false;
    let invalidRecordsShape = false;
    let invalidPagination = false;
    let advertisedTotal: number | null = null;
    let page = 1;
    let totalPages = 1;
    do {
      const url = new URL(safeUrl);
      if (source.pagination) {
        url.searchParams.set(source.pagination.pageParameter ?? 'page', String(page));
        url.searchParams.set(source.pagination.perPageParameter ?? 'per_page', String(source.pagination.perPage ?? 100));
      }
      const response = await fetchChecked(fetchImpl, url, source, env);
      const structuredDegradedHealth = (source.profile === 'arenaHealth' || source.profile === 'hsDataHealth')
        && response.status === 503
        && response.headers.get('content-type')?.includes('application/json');
      if (!response.ok && !structuredDegradedHealth) throw new Error(`HTTP ${response.status}`);
      const payload = JSON.parse(await readResponseBody(response, source.maxBytes ?? 4_000_000));
      payloads.push(payload);
      const recordValue = source.recordsPath ? valueAtPath(payload, source.recordsPath) : undefined;
      if (source.recordsPath && !Array.isArray(recordValue)) invalidRecordsShape = true;
      allRecords.push(...(Array.isArray(recordValue) ? recordValue : []));
      if (source.pagination) {
        const reportedPages = Number(valueAtPath(payload, source.pagination.totalPagesPath ?? 'pagination.total_pages') ?? 1);
        const reportedTotal = Number(valueAtPath(payload, 'pagination.total'));
        if (!Number.isInteger(reportedPages) || reportedPages < 1) invalidPagination = true;
        if (page === 1 && Number.isFinite(reportedTotal) && reportedTotal >= 0) advertisedTotal = reportedTotal;
        const maximumPages = source.pagination.maxPages ?? 25;
        paginationTruncated ||= reportedPages > maximumPages;
        totalPages = invalidPagination ? page : Math.min(reportedPages, maximumPages);
      }
      page += 1;
    } while (page <= totalPages);

    let issues: AuditIssue[] = [];
    let facts: Record<string, string | number | boolean | null> = {};
    let identities: string[] = [];
    if (source.profile === 'arenaHealth') {
      ({ issues, facts } = inspectArenaHealth(payloads[0]));
    } else if (source.profile === 'hsDataHealth') {
      ({ issues, facts } = inspectHsDataHealth(payloads[0]));
    } else if (source.profile === 'parserControl') {
      ({ issues, facts, identities } = inspectParserControl(payloads[0]));
    } else if (source.profile && ['battlegroundCards', 'constructedCards', 'heroes', 'trinkets', 'darkGifts', 'generic'].includes(source.profile)) {
      const evaluation = evaluateCatalogRecords(source.profile as CatalogProfile, allRecords);
      issues = evaluation.issues;
      facts = evaluation.facts;
      identities = evaluation.identities;
    } else {
      identities = identitiesFrom(allRecords, source.identityPath ?? 'card_id');
      facts = { records: allRecords.length };
    }

    const recordCount = allRecords.length > 0 ? allRecords.length : null;
    const measuredCount = Number(facts.records ?? facts.sources ?? recordCount ?? 0);
    if (paginationTruncated) {
      issues.push(errorIssue('PAGINATION_TRUNCATED', 'Число страниц источника превысило установленную границу аудита'));
    }
    if (invalidRecordsShape) {
      issues.push(errorIssue('MALFORMED_SOURCE_SCHEMA', 'Источник вернул некорректную структуру списка записей'));
    }
    if (invalidPagination) {
      issues.push(errorIssue('MALFORMED_PAGINATION', 'Источник вернул некорректные метаданные пагинации'));
    } else if (source.pagination && advertisedTotal != null && advertisedTotal !== allRecords.length) {
      issues.push(errorIssue('PAGINATION_COUNT_MISMATCH', 'Количество полученных записей не совпало с метаданными пагинации'));
    }
    if (source.expectedRecords != null && measuredCount !== source.expectedRecords) {
      issues.push(errorIssue('UNEXPECTED_RECORD_COUNT', `Ожидалось записей: ${source.expectedRecords}, получено: ${measuredCount}`));
    } else if (source.minRecords != null && measuredCount < source.minRecords) {
      issues.push(errorIssue('TOO_FEW_RECORDS', `Минимум записей: ${source.minRecords}, получено: ${measuredCount}`));
    }
    const fingerprintValue = identities.length > 0 ? { identities, facts } : { facts };
    return { ...base, ok: issues.every(item => item.severity !== 'error'), fingerprint: stableFingerprint(fingerprintValue), recordCount: measuredCount || recordCount, facts, issues };
  } catch (error) {
    return {
      ...base,
      ok: false,
      fingerprint: null,
      recordCount: null,
      facts: {},
      issues: [required
        ? errorIssue('FETCH_FAILED', 'Источник не прошёл ограниченную сетевую проверку')
        : warningIssue('SOURCE_LAG', 'Необязательный источник временно недоступен')],
    };
  }
}

export async function loadAuditManifest(path: string): Promise<AuditManifest> {
  const manifest = JSON.parse(await readFile(path, 'utf8')) as AuditManifest;
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.sources) || manifest.sources.length === 0) {
    throw new Error('Invalid game-data audit manifest');
  }
  if (![manifest.normalIntervalHours, manifest.fastIntervalHours, manifest.fastModeHours]
    .every(value => Number.isFinite(value) && value > 0)) {
    throw new Error('Audit intervals must be positive finite numbers');
  }
  if (manifest.fastIntervalHours > manifest.normalIntervalHours) {
    throw new Error('Fast audit interval cannot exceed the normal interval');
  }
  const ids = new Set<string>();
  for (const source of manifest.sources) {
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(source.id) || ids.has(source.id)) throw new Error(`Invalid or duplicate source id: ${source.id}`);
    ids.add(source.id);
    assertSafeSourceUrl(source.url, source.allowedHosts);
  }
  return manifest;
}
