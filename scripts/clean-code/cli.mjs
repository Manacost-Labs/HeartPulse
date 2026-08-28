#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import { analyzeArchitecture } from '../architecture-baseline.mjs';
import { collectFunctionSizes } from '../check-function-size-budgets.mjs';
import { resolveSemgrepBase } from '../semgrep-changed.mjs';
import {
  createCleanCodeBaselineCandidate,
  evaluateCleanCodeSnapshot,
  renderCleanCodeReport,
  validateCleanCodeBaseline,
} from './core.mjs';

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

export function isAuthoredTypeScript(file) {
  const normalized = String(file || '').replaceAll('\\', '/');
  return /^(?:src|server|shared)\/.+\.tsx?$/.test(normalized)
    && !normalized.split('/').includes('vendor');
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
    if (isAuthoredTypeScript(file)) files.push(file);
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
    functions: collectFunctionSizes(absoluteRoot).filter(entry => isAuthoredTypeScript(entry.file)),
  };
}

function runGit(args, cwd) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || `git ${args.join(' ')} failed`).trim());
  }
  return result.stdout;
}

function nulFields(output) {
  return output.split('\0').filter(Boolean);
}

export function changedFileMappings(base, repositoryRoot) {
  const fields = nulFields(runGit(
    ['diff', '--name-status', '-z', '-M', '--diff-filter=AMR', base, '--', ...PRODUCT_ROOTS],
    repositoryRoot,
  ));
  const mappings = new Map();
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (status.startsWith('R')) {
      const baselineFile = fields[index++];
      const file = fields[index++];
      if (isAuthoredTypeScript(file)) mappings.set(file, baselineFile);
      continue;
    }
    const file = fields[index++];
    if (isAuthoredTypeScript(file)) mappings.set(file, file);
  }
  for (const file of nulFields(runGit(
    ['ls-files', '-z', '--others', '--exclude-standard', '--', ...PRODUCT_ROOTS],
    repositoryRoot,
  ))) {
    if (isAuthoredTypeScript(file)) mappings.set(file, file);
  }
  return [...mappings]
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([file, baselineFile]) => ({ file, baselineFile }));
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
  const environment = {
    ...process.env,
    SEMGREP_BASE: process.env.CLEAN_CODE_BASE || process.env.SEMGREP_BASE,
  };
  const base = resolveSemgrepBase(environment, ref => {
    const result = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
    return result.status === 0 ? result.stdout.trim() : null;
  });
  return { mode: 'changed', base, files: changedFileMappings(base, repositoryRoot) };
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
    const currentReport = evaluateCleanCodeSnapshot(snapshot, {
      baseline,
      sourceDebtRegistry,
      functionSizeRegistry,
      scope: { mode: 'full' },
    });
    const blockingViolations = currentReport.violations.filter(entry => entry.rule !== 'file-lines');
    if (blockingViolations.length > 0) {
      process.stdout.write(renderCleanCodeReport({
        ...currentReport,
        status: 'fail',
        violations: blockingViolations,
        summary: { ...currentReport.summary, violations: blockingViolations.length },
      }, format));
      return 1;
    }
    const candidate = createCleanCodeBaselineCandidate(snapshot, baseline);
    const initialize = process.argv.includes('--initialize')
      && Object.keys(baseline.legacy.fileLines).length === 0;
    if (!candidate.canAccept && !initialize) {
      process.stdout.write(renderCleanCodeReport({
        schemaVersion: 1,
        scope: 'full',
        status: 'fail',
        files: [],
        violations: candidate.increases,
        suppressed: [],
        summary: { files: snapshot.files.length, functions: snapshot.functions.length, violations: candidate.increases.length, suppressed: 0 },
      }, format));
      return 1;
    }
    if (process.argv.includes('--accept')) {
      writeFileSync(path.join(repositoryRoot, BASELINE_PATH), `${JSON.stringify(candidate.baseline, null, 2)}\n`);
    }
    process.stdout.write(format === 'json'
      ? `${JSON.stringify(candidate.baseline, null, 2)}\n`
      : `[clean-code] baseline ${process.argv.includes('--accept') ? 'accepted' : 'candidate'}: ${Object.keys(candidate.baseline.legacy.fileLines).length} legacy files\n`);
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
  const output = scope.base ? { ...report, base: scope.base } : report;
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
