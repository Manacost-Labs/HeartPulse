import {
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { analyzeSourceMetrics } from '../architecture-baseline.mjs';
import { collectFunctionSizes } from '../check-function-size-budgets.mjs';
import { CLEAN_CODE_ROOTS, isAuthoredSource } from './source-scope.mjs';

const IGNORED_DIRECTORIES = new Set([
  '.git',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'storybook-static',
  'vendor',
]);

function relativePath(repositoryRoot, absolutePath) {
  return path.relative(repositoryRoot, absolutePath).split(path.sep).join('/');
}

function collectFiles(directory, repositoryRoot, files) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) {
        collectFiles(path.join(directory, entry.name), repositoryRoot, files);
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
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (/\.(?:[cm]?js)$/.test(file)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
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

function fileSnapshot(repositoryRoot, file) {
  const source = readFileSync(path.join(repositoryRoot, file), 'utf8');
  const metrics = analyzeSourceMetrics(file, source);
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
    metrics: {
      explicitAny: metrics.explicitAny,
      typeScriptSuppressions: metrics.suppressions,
      nonNullAssertions: metrics.nonNullAssertions,
      frontendRawFetch: file.startsWith('src/') ? metrics.rawFetch : 0,
    },
    parseDiagnostics: sourceFile.parseDiagnostics.map(diagnostic => diagnosticEntry(sourceFile, diagnostic)),
  };
}

export function collectCleanCodeSnapshot(repositoryRoot) {
  const absoluteRoot = path.resolve(repositoryRoot);
  const files = [];
  for (const root of CLEAN_CODE_ROOTS) {
    const directory = path.join(absoluteRoot, root);
    if (existsSync(directory)) collectFiles(directory, absoluteRoot, files);
  }
  files.sort((left, right) => left.localeCompare(right, 'en'));
  return {
    files: files.map(file => fileSnapshot(absoluteRoot, file)),
    functions: collectFunctionSizes(absoluteRoot, { roots: CLEAN_CODE_ROOTS })
      .filter(entry => isAuthoredSource(entry.file)),
  };
}
