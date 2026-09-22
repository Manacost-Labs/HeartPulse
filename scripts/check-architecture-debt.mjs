import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { analyzeArchitecture } from './architecture-baseline.mjs';

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function boundaryKey(entry) {
  const target = typeof entry.target === 'string' ? entry.target : '';
  return [entry.rule, entry.file, entry.import, target].join('\0');
}

function cycleKey(files) {
  return [...files].sort().join('\0');
}

function assertMetadata(entry, label) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(`${label} exception must be an object`);
  }
  nonEmptyString(entry.owner, `${label} owner`);
  nonEmptyString(entry.reason, `${label} reason`);
  nonEmptyString(entry.removal, `${label} removal`);
}

function compareDebt(actualEntries, registeredEntries, keyForEntry, label) {
  const actualByKey = new Map(actualEntries.map(entry => [keyForEntry(entry), entry]));
  const registeredByKey = new Map();
  for (const entry of registeredEntries) {
    assertMetadata(entry, label);
    const key = keyForEntry(entry);
    if (registeredByKey.has(key)) throw new Error(`duplicate ${label} exception: ${key.replaceAll('\0', ' -> ')}`);
    registeredByKey.set(key, entry);
  }
  const unclassified = [...actualByKey.keys()].filter(key => !registeredByKey.has(key)).sort();
  const stale = [...registeredByKey.keys()].filter(key => !actualByKey.has(key)).sort();
  return { unclassified, stale };
}

export function validateArchitectureDebt(baseline, registry) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    throw new Error('architecture debt registry must be an object');
  }
  if (registry.version !== 1) throw new Error('architecture debt registry version must be 1');
  if (!Array.isArray(registry.boundaryViolations)) {
    throw new Error('architecture debt boundaryViolations must be an array');
  }
  if (!Array.isArray(registry.typeOnlyCycles)) {
    throw new Error('architecture debt typeOnlyCycles must be an array');
  }

  const dependencies = baseline?.dependencies;
  if (!dependencies
    || !Array.isArray(dependencies.boundaryViolations)
    || !Array.isArray(dependencies.runtimeCycles)
    || !Array.isArray(dependencies.typeOnlyCycles)) {
    throw new Error('architecture baseline dependency metrics are invalid');
  }

  const errors = [];
  if (dependencies.runtimeCycles.length > 0) {
    errors.push(`runtime import cycles are forbidden: ${dependencies.runtimeCycles.map(cycle => cycle.join(' -> ')).join('; ')}`);
  }

  for (const exception of registry.boundaryViolations) {
    assertMetadata(exception, 'boundary violation');
    nonEmptyString(exception.rule, 'boundary exception rule');
    nonEmptyString(exception.file, 'boundary exception file');
    nonEmptyString(exception.import, 'boundary exception import');
    if (exception.target !== undefined) nonEmptyString(exception.target, 'boundary exception target');
  }
  const boundaryDebt = compareDebt(
    dependencies.boundaryViolations,
    registry.boundaryViolations,
    boundaryKey,
    'boundary violation',
  );
  if (boundaryDebt.unclassified.length > 0) {
    errors.push(`unclassified boundary violations: ${boundaryDebt.unclassified.map(key => key.replaceAll('\0', ' -> ')).join('; ')}`);
  }
  if (boundaryDebt.stale.length > 0) {
    errors.push(`stale boundary violation exceptions: ${boundaryDebt.stale.map(key => key.replaceAll('\0', ' -> ')).join('; ')}`);
  }

  for (const exception of registry.typeOnlyCycles) {
    assertMetadata(exception, 'type-only cycle');
    if (!Array.isArray(exception.files) || exception.files.length < 2) {
      throw new Error('type-only cycle exception files must contain at least two paths');
    }
    for (const file of exception.files) nonEmptyString(file, 'type-only cycle file');
    if (new Set(exception.files).size !== exception.files.length) {
      throw new Error(`duplicate path in type-only cycle exception: ${exception.files.join(', ')}`);
    }
  }
  const typeOnlyDebt = compareDebt(
    dependencies.typeOnlyCycles,
    registry.typeOnlyCycles,
    entry => cycleKey(Array.isArray(entry) ? entry : entry.files),
    'type-only cycle',
  );
  if (typeOnlyDebt.unclassified.length > 0) {
    errors.push(`unclassified type-only cycles: ${typeOnlyDebt.unclassified.map(key => key.replaceAll('\0', ' -> ')).join('; ')}`);
  }
  if (typeOnlyDebt.stale.length > 0) {
    errors.push(`stale type-only cycle exceptions: ${typeOnlyDebt.stale.map(key => key.replaceAll('\0', ' -> ')).join('; ')}`);
  }

  if (errors.length > 0) throw new Error(errors.join('\n'));
  return {
    boundaryExceptions: registry.boundaryViolations.length,
    runtimeCycles: dependencies.runtimeCycles.length,
    typeOnlyCycleExceptions: registry.typeOnlyCycles.length,
  };
}

function main() {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const registry = JSON.parse(readFileSync(
    path.join(repositoryRoot, 'config', 'architecture-debt.json'),
    'utf8',
  ));
  const summary = validateArchitectureDebt(analyzeArchitecture(repositoryRoot), registry);
  console.log(
    `[module-boundaries] ok runtime-cycles=${summary.runtimeCycles} boundary-exceptions=${summary.boundaryExceptions} type-only-cycle-exceptions=${summary.typeOnlyCycleExceptions}`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(`[module-boundaries] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
