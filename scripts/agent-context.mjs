#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const INVENTORY_PATH = 'config/module-boundaries.json';
const EXCEPTION_GROUPS = [
  'missingPublicEntry',
  'internalImport',
  'moduleLegacyImport',
  'runtimeCrossing',
  'typeCycle',
];

function repositoryRoot(cwd) {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 15_000,
  }).trim();
}

function normalizeRepositoryPath(value, root) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const relative = path.isAbsolute(raw) ? path.relative(root, raw) : raw;
  return path.posix.normalize(relative.replaceAll('\\', '/')).replace(/^\.\//, '').replace(/\/$/, '');
}

function resolveOwnedPath(root, relativePath) {
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Inventory path escapes the repository: ${relativePath}`);
  }
  return resolved;
}

function resolveRepositoryFile(root, relativePath, { required }) {
  const absolutePath = resolveOwnedPath(root, relativePath);
  if (!existsSync(absolutePath)) {
    if (required) throw new Error(`Required repository file is missing: ${relativePath}`);
    return null;
  }
  const stats = lstatSync(absolutePath);
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(`Repository file must be a regular file, not a symlink: ${relativePath}`);
  }
  const realRoot = realpathSync(root);
  const realFile = realpathSync(absolutePath);
  const realRelative = path.relative(realRoot, realFile);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    throw new Error(`Repository file resolves outside the repository: ${relativePath}`);
  }
  return realFile;
}

function readInventory(root) {
  let inventoryFile;
  try {
    inventoryFile = resolveRepositoryFile(root, INVENTORY_PATH, { required: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes('is missing')) {
      throw new Error(
        `Module inventory is missing at ${INVENTORY_PATH}. Run the Phase 0 module inventory task first.`,
      );
    }
    throw error;
  }
  if (!inventoryFile) {
    throw new Error(
      `Module inventory is missing at ${INVENTORY_PATH}. Run the Phase 0 module inventory task first.`,
    );
  }

  let inventory;
  try {
    inventory = JSON.parse(readFileSync(inventoryFile, 'utf8'));
  } catch (error) {
    throw new Error(
      `Module inventory is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!inventory || typeof inventory !== 'object'
    || inventory.schemaVersion !== 1 || !Array.isArray(inventory.modules)) {
    throw new Error('Module inventory must use schemaVersion 1 and contain a modules array.');
  }
  return inventory;
}

function collectBindingNames(name, names) {
  if (ts.isIdentifier(name)) {
    names.add(name.text);
    return;
  }
  for (const element of name.elements) {
    if (!ts.isOmittedExpression(element)) collectBindingNames(element.name, names);
  }
}

export function parsePublicExports(source, fileName = 'public.ts') {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const exports = new Set();

  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (!statement.exportClause) {
        const target = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
          ? statement.moduleSpecifier.text
          : '(unknown)';
        exports.add(`* from ${target}`);
      } else if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) exports.add(element.name.text);
      } else if (ts.isNamespaceExport(statement.exportClause)) {
        exports.add(statement.exportClause.name.text);
      }
      continue;
    }

    if (ts.isExportAssignment(statement)) {
      exports.add(statement.isExportEquals ? 'export=' : 'default');
      continue;
    }

    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) ?? [] : [];
    if (!modifiers.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (modifiers.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)) {
      exports.add('default');
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        collectBindingNames(declaration.name, exports);
      }
    } else if ('name' in statement && statement.name && ts.isIdentifier(statement.name)) {
      exports.add(statement.name.text);
    }
  }

  return [...exports].sort((left, right) => left.localeCompare(right));
}

function publicApiFor(module, root) {
  const entry = normalizeRepositoryPath(module.publicEntry, root);
  if (!entry) throw new Error(`Module ${module.id} does not declare publicEntry.`);
  const absoluteEntry = resolveRepositoryFile(root, entry, { required: false });
  if (!absoluteEntry) return { entry, exists: false, exports: [] };
  return {
    entry,
    exists: true,
    exports: parsePublicExports(readFileSync(absoluteEntry, 'utf8'), entry),
  };
}

function pathBelongsToModule(candidate, module) {
  if (typeof candidate !== 'string') return false;
  return candidate === module.id
    || candidate === module.root
    || candidate.startsWith(`${module.root}/`);
}

function exceptionBelongsToModule(category, exception, module) {
  if (category === 'missingPublicEntry') {
    return exception.module === module.id
      || pathBelongsToModule(exception.source, module)
      || pathBelongsToModule(exception.target, module);
  }
  if (category === 'typeCycle') {
    return (exception.nodes ?? []).some(node => pathBelongsToModule(node, module))
      || (exception.edges ?? []).some(edge => (
        pathBelongsToModule(edge.source, module) || pathBelongsToModule(edge.target, module)
      ));
  }
  return pathBelongsToModule(exception.source, module)
    || pathBelongsToModule(exception.target, module);
}

function relevantExceptions(inventory, module) {
  const groups = inventory.exceptions ?? {};
  const relevant = [];
  for (const category of EXCEPTION_GROUPS) {
    if (!Array.isArray(groups[category])) continue;
    for (const exception of groups[category]) {
      if (exceptionBelongsToModule(category, exception, module)) {
        relevant.push({ category, ...exception });
      }
    }
  }
  return relevant;
}

function moduleBySelector(inventory, selector, root) {
  const normalizedSelector = normalizeRepositoryPath(selector, root);
  const module = inventory.modules.find(candidate => (
    candidate.id === selector
    || normalizeRepositoryPath(candidate.root, root) === normalizedSelector
  ));
  if (!module) {
    const choices = inventory.modules.map(candidate => candidate.id).sort().join(', ');
    throw new Error(`Unknown module "${selector}". Available module ids: ${choices || '(none)'}.`);
  }
  return {
    ...module,
    root: normalizeRepositoryPath(module.root, root),
  };
}

export function loadAgentContext({ repositoryRoot: root, selector }) {
  const resolvedRoot = realpathSync(path.resolve(root));
  const inventory = readInventory(resolvedRoot);
  const module = moduleBySelector(inventory, selector, resolvedRoot);
  for (const field of ['id', 'runtime', 'root', 'purpose', 'owner', 'publicEntry']) {
    if (typeof module[field] !== 'string' || !module[field].trim()) {
      throw new Error(`Module inventory entry ${module.id || '(unknown)'} has invalid ${field}.`);
    }
  }
  for (const field of ['dependencies', 'focusedTests', 'docs']) {
    if (!Array.isArray(module[field]) || module[field].some(value => typeof value !== 'string')) {
      throw new Error(`Module inventory entry ${module.id} has invalid ${field}.`);
    }
  }

  return {
    id: module.id,
    runtime: module.runtime,
    root: module.root,
    purpose: module.purpose,
    owner: module.owner,
    publicApi: publicApiFor(module, resolvedRoot),
    dependencies: [...module.dependencies],
    focusedTests: [...module.focusedTests],
    docs: [...module.docs],
    exceptions: relevantExceptions(inventory, module),
  };
}

function linesFor(label, values) {
  return [
    `${label}:`,
    ...(values.length > 0 ? values.map(value => `  - ${value}`) : ['  - (none)']),
  ];
}

function formatException(exception) {
  let subject = exception.module ?? '';
  if (exception.source || exception.target) {
    subject = `${exception.source ?? '?'} -> ${exception.target ?? '?'}`;
    if (exception.kind) subject += ` (${exception.kind})`;
  } else if (Array.isArray(exception.nodes)) {
    subject = exception.nodes.join(' <-> ');
  }
  return [
    `[${exception.category}] ${subject}`.trim(),
    exception.reason,
    exception.owner ? `owner: ${exception.owner}` : null,
    exception.expiresOn ? `expires: ${exception.expiresOn}` : null,
  ].filter(Boolean).join('; ');
}

export function formatAgentContext(context) {
  const publicApiLines = context.publicApi.exists
    ? linesFor('Public API', context.publicApi.exports)
    : ['Public API: missing'];
  return [
    `Module: ${context.id}`,
    `Runtime: ${context.runtime}`,
    `Root: ${context.root}`,
    `Purpose: ${context.purpose}`,
    `Owner: ${context.owner}`,
    `Public API entry: ${context.publicApi.entry}`,
    ...publicApiLines,
    ...linesFor('Dependencies', context.dependencies),
    ...linesFor('Focused tests', context.focusedTests),
    ...linesFor('Documentation', context.docs),
    ...linesFor('Exceptions', context.exceptions.map(formatException)),
  ].join('\n');
}

export function main(args = process.argv.slice(2), cwd = process.cwd()) {
  if (args.length !== 1 || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write('Usage: node scripts/agent-context.mjs <module-id-or-root>\n');
    return args[0] === '--help' || args[0] === '-h' ? 0 : 1;
  }
  const root = repositoryRoot(cwd);
  process.stdout.write(`${formatAgentContext(loadAgentContext({ repositoryRoot: root, selector: args[0] }))}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`[agent-context] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
