#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createCleanCodeBaselineCandidate,
  evaluateCleanCodeSnapshot,
  renderCleanCodeReport,
  validateCleanCodeBaseline,
} from './core.mjs';
import {
  acceptBudgetMigration,
  createBudgetMigration,
} from './baseline-migration.mjs';
import {
  resolveCleanCodeScope,
} from './git-scope.mjs';
import { collectCleanCodeSnapshot } from './source-collection.mjs';

export { changedFileMappings } from './git-scope.mjs';
export { isAuthoredSource as isAuthoredTypeScript } from './source-scope.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASELINE_PATH = 'config/clean-code-baseline.json';
function readJson(repositoryRoot, file) {
  try {
    return JSON.parse(readFileSync(path.join(repositoryRoot, file), 'utf8'));
  } catch (error) {
    throw new Error(`cannot read ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function argumentValue(name) {
  return process.argv.find(argument => argument.startsWith(`${name}=`))?.slice(name.length + 1);
}

function resolveScope(command, repositoryRoot) {
  const moduleName = argumentValue('--module');
  if (moduleName) return { mode: 'module', module: moduleName };
  if (!process.argv.includes('--changed') && !command.includes('changed')) return { mode: 'full' };
  return resolveCleanCodeScope({ env: process.env, repositoryRoot });
}

export function main(repositoryRoot = PROJECT_ROOT, { clock = () => new Date() } = {}) {
  const command = process.argv[2] || 'check';
  const format = argumentValue('--format') || 'human';
  const today = clock().toISOString().slice(0, 10);
  const baseline = readJson(repositoryRoot, BASELINE_PATH);
  validateCleanCodeBaseline(baseline, today);
  const sourceDebtRegistry = readJson(repositoryRoot, baseline.budgetSources.sourceDebt);
  const functionSizeRegistry = readJson(repositoryRoot, baseline.budgetSources.functionSize);
  const snapshot = collectCleanCodeSnapshot(repositoryRoot);

  if (command === 'baseline') {
    const renameScope = resolveCleanCodeScope({ env: process.env, repositoryRoot });
    const migration = createBudgetMigration({
      snapshot,
      baseline,
      sourceDebtRegistry,
      functionSizeRegistry,
      mappings: renameScope.files,
      today,
    });
    const candidate = createCleanCodeBaselineCandidate(snapshot, migration.baseline, today);
    const initialize = process.argv.includes('--initialize')
      && Object.keys(baseline.legacy.fileLines).length === 0;
    const nextBaseline = candidate.baseline;
    const currentReport = evaluateCleanCodeSnapshot(snapshot, {
      baseline: nextBaseline,
      sourceDebtRegistry: migration.sourceDebtRegistry,
      functionSizeRegistry: migration.functionSizeRegistry,
      scope: { mode: 'full' },
      today,
    });
    const violations = [...new Map([
      ...migration.violations,
      ...(!candidate.canAccept && !initialize ? candidate.increases : []),
      ...currentReport.violations,
    ].map(entry => [entry.id, entry])).values()]
      .sort((left, right) => left.id.localeCompare(right.id, 'en'));
    if (violations.length > 0) {
      process.stdout.write(renderCleanCodeReport({
        schemaVersion: 1,
        scope: 'full',
        status: 'fail',
        files: [],
        violations,
        suppressed: [],
        summary: { files: snapshot.files.length, functions: snapshot.functions.length, violations: violations.length, suppressed: 0 },
      }, format));
      return 1;
    }
    if (process.argv.includes('--accept')) {
      acceptBudgetMigration(repositoryRoot, {
        ...migration,
        canAccept: true,
        baseline: nextBaseline,
      });
    }
    process.stdout.write(format === 'json'
      ? `${JSON.stringify({
        schemaVersion: 1,
        status: 'pass',
        head: renameScope.head,
        base: renameScope.base,
        baseSource: renameScope.baseSource,
        renames: migration.renames,
        baseline: nextBaseline,
        sourceDebtRegistry: migration.sourceDebtRegistry,
        functionSizeRegistry: migration.functionSizeRegistry,
      }, null, 2)}\n`
      : `[clean-code] baseline ${process.argv.includes('--accept') ? 'accepted' : 'candidate'}: ${Object.keys(nextBaseline.legacy.fileLines).length} legacy files; renames=${migration.renames.length}\n`);
    return 0;
  }

  if (!['check', 'changed', 'report'].includes(command)) {
    throw new Error(`unsupported clean-code command: ${command}`);
  }
  const scope = resolveScope(command, repositoryRoot);
  const report = evaluateCleanCodeSnapshot(snapshot, {
    baseline,
    sourceDebtRegistry,
    functionSizeRegistry,
    scope,
    today,
  });
  const output = scope.head ? {
    ...report,
    head: scope.head,
    base: scope.base,
    baseSource: scope.baseSource,
    changedSourceFiles: scope.changedSourceFiles,
    ...(scope.fallbackReason ? { fallbackReason: scope.fallbackReason } : {}),
  } : report;
  process.stdout.write(renderCleanCodeReport(output, format));
  return report.status === 'pass' ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`[clean-code] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
