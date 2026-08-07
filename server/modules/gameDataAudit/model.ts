import { createHash, randomUUID } from 'node:crypto';

import type {
  AuditIssue,
  AuditReport,
  AuditState,
  CatalogEvaluation,
  CatalogProfile,
  SourceObservation,
} from './types.js';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function valueAtPath(value: unknown, path: string): unknown {
  if (!path) return value;
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!isRecord(current)) return undefined;
    return current[segment];
  }, value);
}

function textAtPath(value: unknown, path: string): string {
  const candidate = valueAtPath(value, path);
  return typeof candidate === 'string' ? candidate.trim() : '';
}

function issue(code: string, message: string, affectedCount: number): AuditIssue {
  return { code, message, affectedCount, severity: 'error' };
}

function requiredPathsFor(profile: CatalogProfile): string[] {
  switch (profile) {
    case 'heroes':
      return ['card_id', 'name.ru', 'name.en', 'images.hero', 'hero_power.card.image'];
    case 'trinkets':
      return ['card_id', 'name.ru', 'name.en', 'images.card', 'images.full_art'];
    case 'darkGifts':
      return ['card_id', 'name.ru', 'name.en', 'images.card'];
    case 'battlegroundCards':
      return ['card_id', 'name.ru', 'name.en', 'images.card'];
    case 'constructedCards':
      return ['card_id', 'name.ru', 'name.en', 'images.card'];
    default:
      return ['card_id'];
  }
}

function hasGoldenVariant(record: UnknownRecord): boolean {
  return Boolean(
    textAtPath(record, 'images.golden')
      || textAtPath(record, 'golden_variant.images.card')
      || textAtPath(record, 'golden_variant.image')
      || textAtPath(record, 'golden_variant.card_id'),
  );
}

/**
 * Reduces untrusted catalog payloads to counts, stable identifiers and fixed
 * issue codes. Card names and card text intentionally never enter the report.
 */
export function evaluateCatalogRecords(profile: CatalogProfile, records: unknown[]): CatalogEvaluation {
  const identities: string[] = [];
  const seen = new Set<string>();
  let duplicateCount = 0;
  let missingRequiredCount = 0;
  let missingGoldenCount = 0;
  let activeCount = 0;

  const requiredPaths = requiredPathsFor(profile);
  for (const candidate of records) {
    if (!isRecord(candidate)) {
      missingRequiredCount += 1;
      continue;
    }
    const identity = textAtPath(candidate, 'card_id') || String(valueAtPath(candidate, 'dbf') ?? '').trim();
    if (identity) {
      if (seen.has(identity)) duplicateCount += 1;
      seen.add(identity);
      identities.push(identity);
    }

    if (requiredPaths.some(path => !textAtPath(candidate, path))) missingRequiredCount += 1;
    if (valueAtPath(candidate, 'in_pool') === true) activeCount += 1;

    if (profile === 'battlegroundCards') {
      const isActiveBaseMinion = valueAtPath(candidate, 'in_pool') === true
        && textAtPath(candidate, 'card_type.slug').toLowerCase() === 'minion'
        && textAtPath(candidate, 'variant.kind').toLowerCase() === 'base';
      if (isActiveBaseMinion && !hasGoldenVariant(candidate)) missingGoldenCount += 1;
    }
  }

  const issues: AuditIssue[] = [];
  if (duplicateCount > 0) issues.push(issue('DUPLICATE_ID', 'Обнаружены повторяющиеся идентификаторы', duplicateCount));
  if (missingRequiredCount > 0) issues.push(issue('MISSING_REQUIRED_FIELD', 'У записей отсутствуют обязательные локализации или изображения', missingRequiredCount));
  if (missingGoldenCount > 0) issues.push(issue('MISSING_GOLDEN_VARIANT', 'У активных существ отсутствует золотая версия', missingGoldenCount));

  return {
    identities: identities.sort(),
    issues,
    facts: {
      records: records.length,
      activeRecords: activeCount,
      duplicateIds: duplicateCount,
      missingRequired: missingRequiredCount,
      missingGolden: missingGoldenCount,
    },
  };
}

export function stableFingerprint(value: unknown): string {
  const canonical = JSON.stringify(value, (_key, current) => {
    if (!isRecord(current)) return current;
    return Object.fromEntries(Object.entries(current).sort(([left], [right]) => left.localeCompare(right)));
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function issueFingerprint(source: SourceObservation): string {
  return stableFingerprint({
    ok: source.ok,
    issues: source.issues.map(({ code, severity, affectedCount }) => ({ code, severity, affectedCount })),
  });
}

export function buildAuditReport(options: {
  now: Date;
  previous: AuditState | null;
  observations: SourceObservation[];
  fastModeHours: number;
}): AuditReport {
  const { now, previous, observations } = options;
  const checkedAt = now.toISOString();
  const baselineCreated = !previous || Object.keys(previous.sources).length === 0;
  const changes = baselineCreated ? [] : observations.flatMap(source => {
    if (source.trackChanges === false) return [];
    const old = previous?.sources[source.id];
    if (!old || !source.fingerprint || old.fingerprint === source.fingerprint) return [];
    return [{
      sourceId: source.id,
      previousFingerprint: old.fingerprint,
      currentFingerprint: source.fingerprint,
      previousRecordCount: old.recordCount,
      currentRecordCount: source.recordCount,
    }];
  });
  const patchSignal = changes.some(change => observations.find(source => source.id === change.sourceId)?.role === 'release-signal');
  const actionableChange = changes.some(change => observations.find(source => source.id === change.sourceId)?.escalateOnChange === true);
  const inheritedFastMode = previous?.fastModeUntil && Date.parse(previous.fastModeUntil) > now.getTime()
    ? previous.fastModeUntil
    : null;
  const fastModeUntil = patchSignal
    ? new Date(now.getTime() + options.fastModeHours * 60 * 60 * 1_000).toISOString()
    : inheritedFastMode;
  const issues = observations.flatMap(source => source.issues.map(item => ({ ...item, sourceId: source.id })));
  const errors = issues.filter(item => item.severity === 'error').length;
  const warnings = issues.filter(item => item.severity === 'warning').length;
  const requiredFailure = observations.some(source => source.required && (!source.ok || source.issues.some(item => item.severity === 'error')));
  const issueStateChanged = baselineCreated || observations.some(source => (
    previous?.sources[source.id]?.issueFingerprint !== issueFingerprint(source)
  ));

  let status: AuditReport['status'] = 'no_change';
  if (requiredFailure || errors > 0) status = 'incomplete';
  else if (changes.length > 0) status = 'change_detected';
  else if (issues.length > 0) status = 'source_lag';

  return {
    schemaVersion: 1,
    auditId: `game-data-${randomUUID()}`,
    checkedAt,
    status,
    patchSignal,
    fastModeUntil,
    shouldInvokeCodex: (status === 'incomplete' && issueStateChanged)
      || (!baselineCreated && status === 'change_detected' && (patchSignal || actionableChange)),
    baselineCreated,
    summary: { sources: observations.length, changed: changes.length, warnings, errors },
    changes,
    issues,
    sources: observations,
  };
}

export function stateFromReport(report: AuditReport, previous: AuditState | null = null): AuditState {
  return {
    schemaVersion: 1,
    lastCompletedAt: report.checkedAt,
    fastModeUntil: report.fastModeUntil,
    sources: {
      ...(previous?.sources ?? {}),
      ...Object.fromEntries(report.sources.map(source => [
        source.id,
        {
          fingerprint: source.ok && source.fingerprint
            ? source.fingerprint
            : previous?.sources[source.id]?.fingerprint ?? null,
          issueFingerprint: issueFingerprint(source),
          recordCount: source.ok && source.recordCount != null
            ? source.recordCount
            : previous?.sources[source.id]?.recordCount ?? null,
          checkedAt: source.checkedAt,
        },
      ])),
    },
  };
}

export function isAuditDue(
  state: AuditState | null,
  now: Date,
  intervals: { normalIntervalHours: number; fastIntervalHours: number },
): boolean {
  if (!state?.lastCompletedAt) return true;
  const lastCompletedAt = Date.parse(state.lastCompletedAt);
  if (!Number.isFinite(lastCompletedAt)) return true;
  const fastModeUntil = state.fastModeUntil ? Date.parse(state.fastModeUntil) : Number.NaN;
  const fast = Number.isFinite(fastModeUntil) && fastModeUntil > now.getTime();
  const hours = fast ? intervals.fastIntervalHours : intervals.normalIntervalHours;
  return now.getTime() - lastCompletedAt >= hours * 60 * 60 * 1_000;
}
