import { readFile } from 'node:fs/promises';
import { stableFingerprint } from './model.js';
import { createDocumentCollector } from './documentCollector.js';
import { errorIssue, warningIssue } from './healthEvaluation.js';
import { collectJsonSource } from './jsonCollection.js';
import { assertSafeSourceUrl, fetchChecked, type FetchLike, type Environment } from './sourceTransport.js';
import type { AuditManifest, SourceDefinition, SourceObservation } from './types.js';

export { assertSafeSourceUrl, readResponseBody } from './sourceTransport.js';
export { createDocumentCollector } from './documentCollector.js';

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

    return { ...base, ...await collectJsonSource(source, safeUrl, fetchImpl, env) };
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
