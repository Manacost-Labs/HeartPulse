import { valueAtPath } from './model.js';
import type { AuditIssue } from './types.js';

export function errorIssue(code: string, message: string): AuditIssue {
  return { code, message, severity: 'error' };
}

export function warningIssue(code: string, message: string, affectedCount?: number): AuditIssue {
  return { code, message, severity: 'warning', affectedCount };
}

function recordsFrom(payload: unknown, path = 'data'): unknown[] {
  const value = valueAtPath(payload, path);
  return Array.isArray(value) ? value : [];
}

export function identitiesFrom(records: unknown[], path: string): string[] {
  return records.map(record => String(valueAtPath(record, path) ?? '').trim()).filter(Boolean).sort();
}

export function inspectArenaHealth(payload: unknown): { issues: AuditIssue[]; facts: Record<string, string | number | boolean | null> } {
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

export function inspectHsDataHealth(payload: unknown): { issues: AuditIssue[]; facts: Record<string, string | number | boolean | null> } {
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

export function inspectParserControl(payload: unknown): {
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
