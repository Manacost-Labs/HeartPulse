import { isSafeMetadataText } from './diagnostic-text-policy.mjs';
import {
  MAX_EXCEPTION_AGE_DAYS,
  MODULE_EXCEPTION_GROUPS,
} from './module-boundary-contracts.mjs';
import { cycleKey, edgeKey } from './module-boundary-edges.mjs';
import { isSafeRelativePath } from './repository-path-policy.mjs';

function addError(errors, code, message, details = {}) {
  errors.push({ code, message, ...details });
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isIsoCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isValidCycleException(entry) {
  if (!Array.isArray(entry.nodes) || entry.nodes.length === 0 || !Array.isArray(entry.edges)) return false;
  if (entry.nodes.some(node => typeof node !== 'string')) return false;
  if (entry.edges.some(edge => (
    !isRecord(edge)
    || typeof edge.source !== 'string'
    || typeof edge.target !== 'string'
    || !['runtime', 'type'].includes(edge.kind)
  ))) return false;
  const nodes = [...entry.nodes].sort();
  return entry.source === nodes[0]
    && entry.target === nodes.at(-1)
    && entry.kind === 'type-cycle';
}

function isValidEdgeException(category, entry) {
  const validKind = category === 'missingPublicEntry'
    ? entry.kind === 'missing-public-entry'
    : ['runtime', 'type'].includes(entry.kind);
  return typeof entry.source === 'string'
    && entry.source.length > 0
    && typeof entry.target === 'string'
    && entry.target.length > 0
    && validKind;
}

function exceptionKey(category, entry, entryIndex) {
  if (category === 'typeCycle') {
    return isValidCycleException(entry) ? cycleKey(entry) : `invalid-cycle-${entryIndex}`;
  }
  return isValidEdgeException(category, entry) ? edgeKey(entry) : `invalid-edge-${entryIndex}`;
}

export function validateExceptionMetadata(config, errors, now) {
  const budgets = isRecord(config?.allowlistBudgets) ? config.allowlistBudgets : {};
  const exceptions = isRecord(config?.exceptions) ? config.exceptions : {};
  const today = now.toISOString().slice(0, 10);

  for (const category of MODULE_EXCEPTION_GROUPS) {
    const configuredEntries = exceptions[category];
    const entries = Array.isArray(configuredEntries) ? configuredEntries : [];
    if (!Array.isArray(configuredEntries)) {
      addError(
        errors,
        'invalid-exception-metadata',
        `${category} exceptions must be an array`,
        { category },
      );
    }
    const budget = budgets[category];
    if (!Number.isInteger(budget) || budget < 0 || budget !== entries.length) {
      addError(errors, 'exception-budget-mismatch', `${category} budget must equal its exact exception count`, {
        category,
        budget,
        exceptions: entries.length,
      });
    }

    const exceptionKeys = new Map();
    for (const [entryIndex, entry] of entries.entries()) {
      if (!isRecord(entry)) {
        addError(errors, 'invalid-exception-metadata', `${category} exceptions must be objects`);
        continue;
      }
      const validCycle = category !== 'typeCycle' || isValidCycleException(entry);
      if (!validCycle) {
        addError(
          errors,
          'invalid-cycle-exception',
          'typeCycle exception source, target, kind, nodes and edges must describe the exact cycle',
          { category },
        );
      }
      if (category !== 'typeCycle' && !isValidEdgeException(category, entry)) {
        addError(
          errors,
          'invalid-exception-metadata',
          `${category} exceptions require exact source, target and kind metadata`,
          { category },
        );
      }
      const cycleNodes = Array.isArray(entry.nodes) ? entry.nodes : [];
      const cycleEdges = Array.isArray(entry.edges) ? entry.edges.filter(isRecord) : [];
      const paths = category === 'typeCycle'
        ? [
            entry.source,
            entry.target,
            ...cycleNodes,
            ...cycleEdges.flatMap(edge => [edge.source, edge.target]),
          ]
        : [entry.source, entry.target];
      if (paths.some(path => !isSafeRelativePath(path))) {
        addError(errors, 'unsafe-exception', `${category} exception paths must be exact, safe repository paths`);
      }
      if (!isSafeMetadataText(entry.owner)
        || !isSafeMetadataText(entry.reason)
        || !isIsoCalendarDate(entry.expiresOn)) {
        addError(errors, 'invalid-exception-metadata', `${category} exceptions require owner, reason and ISO expiresOn`);
      } else if (entry.expiresOn < today) {
        addError(errors, 'expired-exception', `${category} exception expired on ${entry.expiresOn}`, { category });
      } else if ((Date.parse(`${entry.expiresOn}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`))
        > MAX_EXCEPTION_AGE_DAYS * 24 * 60 * 60 * 1000) {
        addError(
          errors,
          'exception-expiry-too-distant',
          `${category} exception expiry must be within ${MAX_EXCEPTION_AGE_DAYS} days`,
          { category },
        );
      }
      const key = exceptionKey(category, entry, entryIndex);
      if (exceptionKeys.has(key)) addError(errors, 'duplicate-exception', `duplicate ${category} exception`, { category });
      exceptionKeys.set(key, entry);
    }
  }
}

export function validateExceptionGraph(config, violations, errors) {
  const exceptions = isRecord(config?.exceptions) ? config.exceptions : {};
  for (const category of MODULE_EXCEPTION_GROUPS) {
    const entries = Array.isArray(exceptions[category]) ? exceptions[category] : [];
    const actual = violations[category];
    const actualKeys = new Map(actual.map(item => [
      category === 'typeCycle' ? cycleKey(item) : edgeKey(item),
      item,
    ]));
    const exceptionKeys = new Map();
    for (const [entryIndex, entry] of entries.entries()) {
      if (!isRecord(entry)) continue;
      const key = exceptionKey(category, entry, entryIndex);
      exceptionKeys.set(key, entry);
      if (!actualKeys.has(key)) {
        addError(
          errors,
          'stale-exception',
          `${category} exception no longer matches the graph`,
          { category, exception: entry },
        );
      }
    }
    for (const [key, item] of actualKeys) {
      if (!exceptionKeys.has(key)) {
        addError(
          errors,
          'unapproved-boundary',
          `unapproved ${category} violation`,
          { category, violation: item },
        );
      }
    }
  }
}
