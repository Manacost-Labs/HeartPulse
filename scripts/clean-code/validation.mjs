import path from 'node:path';

export const SOURCE_DEBT_METRICS = [
  'explicitAny',
  'typeScriptSuppressions',
  'nonNullAssertions',
  'frontendRawFetch',
];

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function assertNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
}

export function assertSafePath(value, label) {
  const normalized = typeof value === 'string' ? path.posix.normalize(value) : '';
  if (typeof value !== 'string'
    || value.length === 0
    || value.includes('\\')
    || value.includes('\0')
    || path.posix.isAbsolute(value)
    || normalized !== value
    || value.startsWith('../')) {
    throw new Error(`unsafe ${label}: ${String(value)}`);
  }
}

function validateBudgetSource(value, label) {
  assertSafePath(value, `${label} budget source`);
  if (!value.startsWith('config/') || !value.endsWith('.json')) {
    throw new Error(`${label} budget source must be a config JSON path`);
  }
}

export function validateCleanCodeBaseline(baseline, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today ?? '')) {
    throw new Error('clean-code validation requires an injected YYYY-MM-DD date');
  }
  if (!isRecord(baseline)) throw new Error('clean-code baseline must be an object');
  if (baseline.schemaVersion !== 1) throw new Error('clean-code baseline schemaVersion must be 1');
  if (!isRecord(baseline.rules)) throw new Error('clean-code baseline rules must be an object');
  if (!Number.isInteger(baseline.rules.newFileMaxLines) || baseline.rules.newFileMaxLines < 1) {
    throw new Error('newFileMaxLines must be a positive integer');
  }
  if (!isRecord(baseline.budgetSources)) throw new Error('budgetSources must be an object');
  validateBudgetSource(baseline.budgetSources.sourceDebt, 'source debt');
  validateBudgetSource(baseline.budgetSources.functionSize, 'function size');
  if (!isRecord(baseline.legacy) || !isRecord(baseline.legacy.fileLines)) {
    throw new Error('legacy.fileLines must be an object');
  }
  for (const [file, maximum] of Object.entries(baseline.legacy.fileLines)) {
    assertSafePath(file, 'baseline path');
    assertNonNegativeInteger(maximum, `file line budget for ${file}`);
    if (maximum <= baseline.rules.newFileMaxLines) {
      throw new Error(`legacy file budget must exceed newFileMaxLines: ${file}`);
    }
  }
  validateExceptions(baseline.exceptions, today);
  return baseline;
}

function validateExceptions(exceptions, today) {
  if (!Array.isArray(exceptions)) throw new Error('exceptions must be an array');
  const exceptionIds = new Set();
  for (const exception of exceptions) {
    if (!isRecord(exception) || typeof exception.id !== 'string' || exception.id.trim() === '') {
      throw new Error('each clean-code exception requires an id');
    }
    if (exceptionIds.has(exception.id)) throw new Error(`duplicate clean-code exception: ${exception.id}`);
    exceptionIds.add(exception.id);
    if (typeof exception.owner !== 'string' || exception.owner.trim() === '') {
      throw new Error(`clean-code exception owner is required: ${exception.id}`);
    }
    if (typeof exception.reason !== 'string' || exception.reason.trim() === '') {
      throw new Error(`clean-code exception reason is required: ${exception.id}`);
    }
    if (typeof exception.expires !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(exception.expires)) {
      throw new Error(`clean-code exception expiry must be YYYY-MM-DD: ${exception.id}`);
    }
    if (exception.expires < today) {
      throw new Error(`expired clean-code exception: ${exception.id} (${exception.expires})`);
    }
  }
}

export function validateSourceDebtRegistry(registry) {
  if (!isRecord(registry) || registry.version !== 1 || !isRecord(registry.budgets)) {
    throw new Error('source debt registry version must be 1');
  }
  for (const metric of SOURCE_DEBT_METRICS) {
    const budgets = registry.budgets[metric];
    if (!isRecord(budgets)) throw new Error(`${metric} budgets must be an object`);
    for (const [file, maximum] of Object.entries(budgets)) {
      assertSafePath(file, `${metric} budget path`);
      assertNonNegativeInteger(maximum, `${metric} budget for ${file}`);
    }
  }
}

export function validateFunctionSizeRegistry(registry) {
  if (!isRecord(registry) || registry.version !== 1) {
    throw new Error('function size registry version must be 1');
  }
  if (!Number.isInteger(registry.defaultMaxLines) || registry.defaultMaxLines < 1) {
    throw new Error('function size defaultMaxLines must be a positive integer');
  }
  if (!isRecord(registry.exceptions)) throw new Error('function size exceptions must be an object');
  for (const [identity, maximum] of Object.entries(registry.exceptions)) {
    if (!identity.includes('#')) throw new Error(`invalid function size exception key: ${identity}`);
    assertNonNegativeInteger(maximum, `function size exception for ${identity}`);
    if (maximum <= registry.defaultMaxLines) {
      throw new Error(`function size exception must exceed the default: ${identity}`);
    }
  }
}
