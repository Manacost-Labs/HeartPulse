#!/usr/bin/env node

import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

import {
  moduleBySelector,
  normalizeRepositoryPath,
  readModuleInventory,
  relevantModuleExceptions,
  repositoryRoot,
  resolveRepositoryFile,
} from './lib/module-inventory.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
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

function publicStyleEntryFor(module, root) {
  const entry = normalizeRepositoryPath(module.publicStyleEntry, root);
  if (!entry) return null;
  resolveRepositoryFile(root, entry, { required: true });
  return entry;
}

export function loadAgentContext({ repositoryRoot: root, selector }) {
  const resolvedRoot = realpathSync(path.resolve(root));
  const inventory = readModuleInventory(resolvedRoot);
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
    publicStyleEntry: publicStyleEntryFor(module, resolvedRoot),
    dependencies: [...module.dependencies],
    focusedTests: [...module.focusedTests],
    docs: [...module.docs],
    exceptions: relevantModuleExceptions(inventory, module),
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
    ...(context.publicStyleEntry ? [`Public style entry: ${context.publicStyleEntry}`] : []),
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
