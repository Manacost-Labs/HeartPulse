import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { analyzeArchitecture } from './architecture-baseline.mjs';

const METRICS = [
  ['explicitAny', baseline => baseline.source.explicitAny.entries],
  ['typeScriptSuppressions', baseline => baseline.source.typeScriptSuppressions.entries],
  ['nonNullAssertions', baseline => baseline.source.nonNullAssertions.entries],
  ['frontendRawFetch', baseline => baseline.source.rawFetch.frontendEntries],
];

function assertCount(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
}

function validateBudgetMap(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} budgets must be an object`);
  }
  for (const [file, maximum] of Object.entries(value)) {
    if (!file.trim()) throw new Error(`${label} budget path must not be empty`);
    assertCount(maximum, `${label} budget for ${file}`);
  }
}

export function validateSourceDebt(baseline, registry) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    throw new Error('source debt registry must be an object');
  }
  if (registry.version !== 1) throw new Error('source debt registry version must be 1');
  if (!registry.budgets || typeof registry.budgets !== 'object' || Array.isArray(registry.budgets)) {
    throw new Error('source debt budgets must be an object');
  }

  const summary = {};
  const errors = [];
  for (const [metric, selectEntries] of METRICS) {
    const budgets = registry.budgets[metric];
    validateBudgetMap(budgets, metric);
    const entries = selectEntries(baseline);
    if (!Array.isArray(entries)) throw new Error(`${metric} baseline entries must be an array`);
    let total = 0;
    for (const entry of entries) {
      if (!entry || typeof entry.file !== 'string') {
        throw new Error(`${metric} baseline entry must contain a file path`);
      }
      assertCount(entry.count, `${metric} count for ${entry.file}`);
      total += entry.count;
      const maximum = budgets[entry.file] ?? 0;
      if (entry.count > maximum) {
        errors.push(`${metric} debt grew in ${entry.file}: ${entry.count} / ${maximum}`);
      }
    }
    summary[metric] = total;
  }

  if (errors.length > 0) throw new Error(errors.join('\n'));
  return summary;
}

function main() {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const registry = JSON.parse(readFileSync(
    path.join(repositoryRoot, 'config', 'source-debt-budgets.json'),
    'utf8',
  ));
  const summary = validateSourceDebt(analyzeArchitecture(repositoryRoot), registry);
  console.log(`[source-debt] ok ${Object.entries(summary).map(([metric, count]) => `${metric}=${count}`).join(' ')}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(`[source-debt] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
