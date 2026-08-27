import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import ts from 'typescript';

import {
  discoverTestFiles,
  loadTestRegistry,
} from './test-suite-runner.mjs';

const PRODUCT_ROOTS = ['src', 'server', 'shared'];
const PRODUCT_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.js',
  '.jsx',
  '.mjs',
  '.ts',
  '.tsx',
]);
const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const GENERATED_DIRECTORY_NAMES = new Set([
  '.git',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'storybook-static',
]);
const DEFAULT_LARGE_CODE_LINES = 500;
const DEFAULT_LARGE_STYLE_LINES = 1_000;
const TS_SUPPRESSION_PATTERN = /@ts-(?:ignore|expect-error|nocheck)\b/g;
const CSS_IMPORTANT_PATTERN = /!important\b/g;
const NODE_BUILTIN_IMPORTS = new Set([
  ...builtinModules,
  ...builtinModules.map(moduleName => `node:${moduleName}`),
]);

function isPlatformImport(specifier) {
  return NODE_BUILTIN_IMPORTS.has(specifier)
    || /^(?:express|react(?:\/|$)|react-dom(?:\/|$))/.test(specifier);
}

function relativePath(repositoryRoot, absolutePath) {
  return path.relative(repositoryRoot, absolutePath).split(path.sep).join('/');
}

function physicalLines(source) {
  if (source.length === 0) return 0;
  return source.endsWith('\n')
    ? source.slice(0, -1).split('\n').length
    : source.split('\n').length;
}

function collectFiles(directory, files) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (GENERATED_DIRECTORY_NAMES.has(entry.name)) continue;
      collectFiles(path.join(directory, entry.name), files);
      continue;
    }
    if (entry.isFile() && PRODUCT_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(path.join(directory, entry.name));
    }
  }
}

function productFiles(repositoryRoot) {
  const files = [];
  for (const root of PRODUCT_ROOTS) {
    const absoluteRoot = path.join(repositoryRoot, root);
    if (existsSync(absoluteRoot)) collectFiles(absoluteRoot, files);
  }
  return files.sort((left, right) => relativePath(repositoryRoot, left).localeCompare(
    relativePath(repositoryRoot, right),
    'en',
  ));
}

function scriptKind(file) {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (file.endsWith('.js') || file.endsWith('.mjs') || file.endsWith('.cjs')) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function importIsTypeOnly(node) {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    if (!clause) return false;
    if (clause.isTypeOnly) return true;
    if (clause.name || !clause.namedBindings || ts.isNamespaceImport(clause.namedBindings)) return false;
    return clause.namedBindings.elements.length > 0
      && clause.namedBindings.elements.every(element => element.isTypeOnly);
  }
  return ts.isExportDeclaration(node) && node.isTypeOnly;
}

function sourceMetrics(file, source) {
  const metrics = {
    explicitAny: 0,
    imports: [],
    inlineStyles: 0,
    rawFetch: 0,
    suppressions: (source.match(TS_SUPPRESSION_PATTERN) ?? []).length,
  };
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(file));

  function visit(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) metrics.explicitAny += 1;
    if (ts.isJsxAttribute(node) && node.name.text === 'style') metrics.inlineStyles += 1;

    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        metrics.imports.push({
          specifier: node.moduleSpecifier.text,
          typeOnly: importIsTypeOnly(node),
        });
      }
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword
        && node.arguments[0]
        && ts.isStringLiteral(node.arguments[0])) {
        metrics.imports.push({ specifier: node.arguments[0].text, typeOnly: false });
      } else if (ts.isIdentifier(node.expression)
        && node.expression.text === 'require'
        && node.arguments[0]
        && ts.isStringLiteral(node.arguments[0])) {
        metrics.imports.push({ specifier: node.arguments[0].text, typeOnly: false });
      }

      const directFetch = ts.isIdentifier(node.expression) && node.expression.text === 'fetch';
      const propertyFetch = ts.isPropertyAccessExpression(node.expression)
        && node.expression.name.text === 'fetch'
        && ts.isIdentifier(node.expression.expression)
        && ['globalThis', 'window'].includes(node.expression.expression.text);
      if (directFetch || propertyFetch) metrics.rawFetch += 1;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return metrics;
}

function resolutionCandidates(fromFile, specifier) {
  const requested = path.resolve(path.dirname(fromFile), specifier);
  const extension = path.extname(requested);
  const withoutJavaScriptExtension = /\.(?:c|m)?jsx?$/.test(extension)
    ? requested.slice(0, -extension.length)
    : requested;
  return [
    requested,
    ...CODE_EXTENSIONS.map(candidate => `${requested}${candidate}`),
    ...CODE_EXTENSIONS.map(candidate => `${withoutJavaScriptExtension}${candidate}`),
    ...CODE_EXTENSIONS.map(candidate => path.join(requested, `index${candidate}`)),
    ...CODE_EXTENSIONS.map(candidate => path.join(withoutJavaScriptExtension, `index${candidate}`)),
  ];
}

function resolveProductImport(fromFile, specifier, productFileSet) {
  if (!specifier.startsWith('.')) return null;
  return resolutionCandidates(fromFile, specifier).find(candidate => productFileSet.has(candidate)) ?? null;
}

function moduleIdentity(file) {
  const parts = file.split('/');
  const modulesIndex = parts.indexOf('modules');
  if (modulesIndex < 1 || !parts[modulesIndex + 1]) return null;
  return {
    domain: parts[modulesIndex + 1],
    environment: parts.slice(0, modulesIndex).join('/'),
    internalPath: parts.slice(modulesIndex + 2).join('/'),
  };
}

function isPublicModuleEntry(identity) {
  return identity.internalPath === 'public.ts'
    || identity.internalPath === 'public.tsx'
    || /^public\/index\.[cm]?[jt]sx?$/.test(identity.internalPath);
}

function boundaryViolations(imports) {
  const violations = [];
  for (const entry of imports) {
    const sourceModule = moduleIdentity(entry.file);
    const targetModule = entry.target ? moduleIdentity(entry.target) : null;
    const add = (rule) => violations.push({
      rule,
      file: entry.file,
      import: entry.specifier,
      ...(entry.target ? { target: entry.target } : {}),
    });

    if (entry.file.startsWith('shared/') && (
      isPlatformImport(entry.specifier)
      || entry.target?.startsWith('src/modules/')
      || entry.target?.startsWith('server/modules/')
    )) add('root-shared-platform-import');

    if (entry.file.startsWith('server/shared/') && entry.target?.startsWith('server/modules/')) {
      add('server-shared-module-import');
    }
    if (entry.file.startsWith('src/') && entry.target?.startsWith('server/')) {
      add('client-to-server-import');
    }
    if (sourceModule && entry.target?.startsWith(`${sourceModule.environment}/app/`)) {
      add('domain-to-app-import');
    }
    if (sourceModule && targetModule
      && sourceModule.environment === targetModule.environment
      && sourceModule.domain !== targetModule.domain
      && !isPublicModuleEntry(targetModule)) {
      add('cross-module-internal-import');
    }
    if (sourceModule && /(?:^|\/)model\//.test(sourceModule.internalPath)
      && (isPlatformImport(entry.specifier)
        || entry.target?.includes('/api/')
        || entry.target?.includes('/repository/'))) {
      add('model-platform-import');
    }
  }
  return violations.sort((left, right) => (
    left.rule.localeCompare(right.rule, 'en')
    || left.file.localeCompare(right.file, 'en')
    || left.import.localeCompare(right.import, 'en')
  ));
}

function cycleComponents(graph) {
  const indexByNode = new Map();
  const lowLinkByNode = new Map();
  const stack = [];
  const onStack = new Set();
  const components = [];
  let nextIndex = 0;

  function visit(node) {
    indexByNode.set(node, nextIndex);
    lowLinkByNode.set(node, nextIndex);
    nextIndex += 1;
    stack.push(node);
    onStack.add(node);

    for (const target of [...(graph.get(node) ?? [])].sort()) {
      if (!indexByNode.has(target)) {
        visit(target);
        lowLinkByNode.set(node, Math.min(lowLinkByNode.get(node), lowLinkByNode.get(target)));
      } else if (onStack.has(target)) {
        lowLinkByNode.set(node, Math.min(lowLinkByNode.get(node), indexByNode.get(target)));
      }
    }

    if (lowLinkByNode.get(node) !== indexByNode.get(node)) return;
    const component = [];
    while (stack.length > 0) {
      const member = stack.pop();
      onStack.delete(member);
      component.push(member);
      if (member === node) break;
    }
    component.sort();
    if (component.length > 1 || graph.get(component[0])?.has(component[0])) components.push(component);
  }

  for (const node of [...graph.keys()].sort()) {
    if (!indexByNode.has(node)) visit(node);
  }
  return components.sort((left, right) => left.join('\0').localeCompare(right.join('\0'), 'en'));
}

function inducedGraph(graph, nodes) {
  const allowed = new Set(nodes);
  return new Map(nodes.map(node => [
    node,
    new Set([...(graph.get(node) ?? [])].filter(target => allowed.has(target))),
  ]));
}

function dependencyMetrics(repositoryRoot, files, fileAnalyses) {
  const productFileSet = new Set(files);
  const allGraph = new Map();
  const runtimeGraph = new Map();
  const imports = [];

  for (const file of files.filter(candidate => CODE_EXTENSIONS.includes(path.extname(candidate)))) {
    const sourceFile = relativePath(repositoryRoot, file);
    allGraph.set(sourceFile, new Set());
    runtimeGraph.set(sourceFile, new Set());
    for (const entry of fileAnalyses.get(file).imports) {
      const resolved = resolveProductImport(file, entry.specifier, productFileSet);
      const target = resolved ? relativePath(repositoryRoot, resolved) : null;
      imports.push({ file: sourceFile, ...entry, ...(target ? { target } : {}) });
      if (!target) continue;
      allGraph.get(sourceFile).add(target);
      if (!entry.typeOnly) runtimeGraph.get(sourceFile).add(target);
    }
  }

  const runtimeCycles = cycleComponents(runtimeGraph);
  const typeOnlyCycles = cycleComponents(allGraph).filter(component => (
    cycleComponents(inducedGraph(runtimeGraph, component)).length === 0
  ));
  return {
    boundaryViolations: boundaryViolations(imports),
    runtimeCycles,
    typeOnlyCycles,
  };
}

function testMetrics(repositoryRoot) {
  const discovered = discoverTestFiles(repositoryRoot);
  const registryPath = path.join(repositoryRoot, 'tests', 'test-suites.json');
  if (!existsSync(registryPath)) {
    return {
      discovered: discovered.length,
      registered: 0,
      excluded: 0,
      unclassified: discovered.length,
      notExecuted: discovered.length,
    };
  }
  const registry = loadTestRegistry(registryPath);
  const registered = new Set(registry.suites.flatMap(suite => suite.files));
  const excluded = new Set(registry.exclusions.map(exclusion => exclusion.file));
  const unclassified = discovered.filter(file => !registered.has(file) && !excluded.has(file));
  return {
    discovered: discovered.length,
    registered: registered.size,
    excluded: excluded.size,
    unclassified: unclassified.length,
    notExecuted: unclassified.length + excluded.size,
  };
}

function bundleMetrics(repositoryRoot) {
  const assetsRoot = path.join(repositoryRoot, 'dist', 'assets');
  if (!existsSync(assetsRoot)) return { available: false, assetCount: 0, rawBytes: 0, gzipBytes: 0, largestAssets: [] };
  const assets = readdirSync(assetsRoot, { withFileTypes: true })
    .filter(entry => entry.isFile() && /\.(?:css|js)$/.test(entry.name))
    .map(entry => {
      const absolutePath = path.join(assetsRoot, entry.name);
      const source = readFileSync(absolutePath);
      return {
        file: relativePath(repositoryRoot, absolutePath),
        bytes: statSync(absolutePath).size,
        gzipBytes: gzipSync(source, { level: 9 }).length,
      };
    })
    .sort((left, right) => right.bytes - left.bytes || left.file.localeCompare(right.file, 'en'));
  return {
    available: true,
    assetCount: assets.length,
    rawBytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
    gzipBytes: assets.reduce((sum, asset) => sum + asset.gzipBytes, 0),
    largestAssets: assets.slice(0, 10),
  };
}

function countMetricEntries(fileEntries, key) {
  const entries = fileEntries
    .filter(entry => entry[key] > 0)
    .map(entry => ({ file: entry.file, count: entry[key] }));
  return {
    count: entries.reduce((sum, entry) => sum + entry.count, 0),
    files: entries.map(entry => entry.file),
  };
}

export function analyzeArchitecture(repositoryRoot, options = {}) {
  const absoluteRoot = path.resolve(repositoryRoot);
  const largeCodeLines = options.largeCodeLines ?? DEFAULT_LARGE_CODE_LINES;
  const largeStyleLines = options.largeStyleLines ?? DEFAULT_LARGE_STYLE_LINES;
  const files = productFiles(absoluteRoot);
  const fileAnalyses = new Map();
  const fileEntries = files.map(file => {
    const source = readFileSync(file, 'utf8');
    const extension = path.extname(file);
    const analysis = CODE_EXTENSIONS.includes(extension)
      ? sourceMetrics(file, source)
      : { explicitAny: 0, imports: [], inlineStyles: 0, rawFetch: 0, suppressions: 0 };
    fileAnalyses.set(file, analysis);
    return {
      file: relativePath(absoluteRoot, file),
      lines: physicalLines(source),
      rawFetch: analysis.rawFetch,
      inlineStyles: analysis.inlineStyles,
      explicitAny: analysis.explicitAny,
      suppressions: analysis.suppressions,
      cssImportant: extension === '.css' ? (source.match(CSS_IMPORTANT_PATTERN) ?? []).length : 0,
    };
  });

  const largeFiles = fileEntries
    .filter(entry => entry.lines > (entry.file.endsWith('.css') ? largeStyleLines : largeCodeLines))
    .map(({ file, lines }) => ({ file, lines }))
    .sort((left, right) => right.lines - left.lines || left.file.localeCompare(right.file, 'en'));
  const rawFetch = countMetricEntries(fileEntries, 'rawFetch');
  const frontendRawFetchFiles = fileEntries.filter(entry => entry.file.startsWith('src/') && entry.rawFetch > 0);

  return {
    schemaVersion: 1,
    definitions: {
      productRoots: PRODUCT_ROOTS,
      productExtensions: [...PRODUCT_EXTENSIONS].sort(),
      largeFileThresholds: { code: largeCodeLines, style: largeStyleLines },
    },
    source: {
      productFiles: files.length,
      lines: fileEntries.reduce((sum, entry) => sum + entry.lines, 0),
      largeFiles,
      rawFetch: {
        calls: rawFetch.count,
        files: rawFetch.files,
        frontendCalls: frontendRawFetchFiles.reduce((sum, entry) => sum + entry.rawFetch, 0),
        frontendFiles: frontendRawFetchFiles.map(entry => entry.file),
      },
      typeScriptSuppressions: countMetricEntries(fileEntries, 'suppressions'),
      explicitAny: countMetricEntries(fileEntries, 'explicitAny'),
      cssImportant: countMetricEntries(fileEntries, 'cssImportant'),
      inlineStyles: countMetricEntries(fileEntries, 'inlineStyles'),
    },
    dependencies: dependencyMetrics(absoluteRoot, files, fileAnalyses),
    tests: testMetrics(absoluteRoot),
    bundle: bundleMetrics(absoluteRoot),
  };
}

function main() {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const baseline = analyzeArchitecture(repositoryRoot);
  process.stdout.write(`${JSON.stringify(baseline, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) main();
