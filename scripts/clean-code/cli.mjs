#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import { analyzeArchitecture } from '../architecture-baseline.mjs';
import { collectFunctionSizes } from '../check-function-size-budgets.mjs';
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
  changedFileMappings,
  resolveCleanCodeScope,
} from './git-scope.mjs';
import { isAuthoredSource } from './source-scope.mjs';

export { changedFileMappings } from './git-scope.mjs';
export { isAuthoredSource as isAuthoredTypeScript } from './source-scope.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASELINE_PATH = 'config/clean-code-baseline.json';
const PRODUCT_ROOTS = ['src', 'server', 'shared'];
const IGNORED_DIRECTORIES = new Set([
  '.git',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'storybook-static',
  'vendor',
]);
const SOURCE_DEBT_ENTRIES = {
  explicitAny: baseline => baseline.source.explicitAny.entries,
  typeScriptSuppressions: baseline => baseline.source.typeScriptSuppressions.entries,
  nonNullAssertions: baseline => baseline.source.nonNullAssertions.entries,
  frontendRawFetch: baseline => baseline.source.rawFetch.frontendEntries,
};

function relativePath(repositoryRoot, absolutePath) {
  return path.relative(repositoryRoot, absolutePath).split(path.sep).join('/');
}

function collectTypeScriptFiles(directory, repositoryRoot, files) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) {
        collectTypeScriptFiles(path.join(directory, entry.name), repositoryRoot, files);
      }
      continue;
    }
    if (!entry.isFile()) continue;
    const file = relativePath(repositoryRoot, path.join(directory, entry.name));
    if (isAuthoredSource(file)) files.push(file);
  }
}

function physicalLines(source) {
  if (source.length === 0) return 0;
  return (source.endsWith('\n') ? source.slice(0, -1) : source).split('\n').length;
}

function scriptKind(file) {
  return file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function diagnosticEntry(sourceFile, diagnostic) {
  const position = sourceFile.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
  return {
    code: diagnostic.code,
    line: position.line + 1,
    character: position.character + 1,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  };
}

export function collectCleanCodeSnapshot(repositoryRoot) {
  const absoluteRoot = path.resolve(repositoryRoot);
  const architecture = analyzeArchitecture(absoluteRoot);
  const metricMaps = Object.fromEntries(Object.entries(SOURCE_DEBT_ENTRIES).map(([metric, select]) => [
    metric,
    new Map(select(architecture).map(entry => [entry.file, entry.count])),
  ]));
  const files = [];
  for (const productRoot of PRODUCT_ROOTS) {
    const directory = path.join(absoluteRoot, productRoot);
    if (existsSync(directory)) collectTypeScriptFiles(directory, absoluteRoot, files);
  }
  files.sort((left, right) => left.localeCompare(right, 'en'));
  return {
    files: files.map(file => {
      const source = readFileSync(path.join(absoluteRoot, file), 'utf8');
      const sourceFile = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        scriptKind(file),
      );
      return {
        file,
        lines: physicalLines(source),
        metrics: Object.fromEntries(Object.entries(metricMaps).map(([metric, counts]) => [
          metric,
          counts.get(file) ?? 0,
        ])),
        parseDiagnostics: sourceFile.parseDiagnostics.map(diagnostic => diagnosticEntry(sourceFile, diagnostic)),
      };
    }),
    functions: collectFunctionSizes(absoluteRoot).filter(entry => isAuthoredSource(entry.file)),
  };
}

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

export function main(repositoryRoot = PROJECT_ROOT) {
  const command = process.argv[2] || 'check';
  const format = argumentValue('--format') || 'human';
  const baseline = readJson(repositoryRoot, BASELINE_PATH);
  validateCleanCodeBaseline(baseline);
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
    });
    const candidate = createCleanCodeBaselineCandidate(snapshot, migration.baseline);
    const initialize = process.argv.includes('--initialize')
      && Object.keys(baseline.legacy.fileLines).length === 0;
    const nextBaseline = candidate.baseline;
    const currentReport = evaluateCleanCodeSnapshot(snapshot, {
      baseline: nextBaseline,
      sourceDebtRegistry: migration.sourceDebtRegistry,
      functionSizeRegistry: migration.functionSizeRegistry,
      scope: { mode: 'full' },
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
