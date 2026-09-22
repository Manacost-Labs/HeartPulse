import { evaluateCatalogRecords, stableFingerprint, valueAtPath } from './model.js';
import { errorIssue, identitiesFrom, inspectArenaHealth, inspectHsDataHealth, inspectParserControl } from './healthEvaluation.js';
import { fetchChecked, readResponseBody, type FetchLike, type Environment } from './sourceTransport.js';
import type { AuditIssue, CatalogProfile, SourceDefinition, SourceObservation } from './types.js';

export async function collectJsonSource(source: SourceDefinition, safeUrl: URL, fetchImpl: FetchLike, env: Environment): Promise<Pick<SourceObservation, 'ok' | 'fingerprint' | 'recordCount' | 'facts' | 'issues'>> {
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
  return { ok: issues.every(item => item.severity !== 'error'), fingerprint: stableFingerprint(fingerprintValue), recordCount: measuredCount || recordCount, facts, issues };
}
