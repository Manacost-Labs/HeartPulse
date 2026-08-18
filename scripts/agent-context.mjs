#!/usr/bin/env node

import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

import { validateModuleInventoryMetadata } from './check-module-boundaries.mjs';
import {
  isSafeMetadataText,
  normalizeRepositoryPath,
  readModuleInventory,
  relevantModuleExceptions,
  repositoryRoot,
  resolveModuleOrPathSelector,
  resolveRepositoryFile,
  singleLineDisplay,
  singleLineErrorMessage,
} from './lib/module-inventory.mjs';
import {
  publicRoutesForScope,
  readPublicRouteInventory,
} from './lib/public-route-inventory.mjs';

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

  const publicExports = [...exports].sort((left, right) => left.localeCompare(right));
  if (publicExports.some(exportLabel => !isSafeMetadataText(exportLabel))) {
    throw new Error(`Public API export label is unsafe in ${fileName}.`);
  }
  return publicExports;
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
  const metadata = validateModuleInventoryMetadata({
    rootDir: resolvedRoot,
    config: inventory,
  });
  if (!metadata.ok) {
    const details = metadata.errors.map(error => (
      `  [${singleLineDisplay(error.code)}] ${singleLineDisplay(error.message)}`
    ));
    throw new Error([
      'Module inventory metadata is invalid; refusing to emit untrusted context.',
      ...details,
    ].join('\n'));
  }
  const selection = resolveModuleOrPathSelector(inventory, selector, resolvedRoot);
  if (selection.kind === 'root') {
    const publicRouteInventory = readPublicRouteInventory(resolvedRoot);
    const modules = [...inventory.modules]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(module => ({
        id: module.id,
        runtime: module.runtime,
        root: module.root,
        purpose: module.purpose,
        owner: module.owner,
        publicEntry: module.publicEntry,
      }));
    const migrationAreas = [...inventory.migrationAreas]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(area => ({
        id: area.id,
        runtime: area.runtime,
        roots: [...area.roots].sort(),
        excludeRoots: [...area.excludeRoots].sort(),
        purpose: area.purpose,
        owner: area.owner,
        targetModules: [...area.targetModules].sort(),
        safeStarts: [...area.safeStarts].sort(),
      }));
    const publicRoutes = publicRoutesForScope({ mode: 'all' }, publicRouteInventory);
    const sharedRoots = Object.entries(inventory.sharedRoots)
      .flatMap(([runtime, roots]) => roots.map(sharedRoot => ({ runtime, root: sharedRoot })))
      .sort((left, right) => left.root.localeCompare(right.root));
    return {
      kind: 'root',
      id: 'root',
      runtime: 'mixed',
      root: '.',
      purpose: 'Aggregates every canonical module, shared root, migration area and public route.',
      owners: [...new Set([
        ...inventory.modules.map(module => module.owner),
        ...inventory.migrationAreas.map(area => area.owner),
      ])].sort(),
      modules,
      migrationAreas,
      sharedRoots,
      publicRoutes,
      focusedTests: [...new Set([
        ...inventory.modules.flatMap(module => module.focusedTests),
        ...inventory.migrationAreas.flatMap(area => area.focusedTests),
      ])].sort(),
      docs: [...new Set([
        ...inventory.modules.flatMap(module => module.docs),
        ...inventory.migrationAreas.flatMap(area => area.docs),
      ])].sort(),
      knownDebt: inventory.migrationAreas
        .flatMap(area => area.knownDebt.map(reason => ({ migrationAreaId: area.id, reason })))
        .sort((left, right) => (
          left.migrationAreaId.localeCompare(right.migrationAreaId)
          || left.reason.localeCompare(right.reason)
        )),
    };
  }

  if (selection.sharedRoot) {
    const runtimeInventoryModules = inventory.modules
      .filter(module => module.runtime === selection.sharedRuntime)
      .sort((left, right) => left.id.localeCompare(right.id));
    const runtimeInventoryMigrationAreas = inventory.migrationAreas
      .filter(area => area.runtime === selection.sharedRuntime)
      .sort((left, right) => left.id.localeCompare(right.id));
    const runtimeModules = runtimeInventoryModules.map(module => ({
      id: module.id,
      runtime: module.runtime,
      root: module.root,
      purpose: module.purpose,
      owner: module.owner,
      publicEntry: module.publicEntry,
    }));
    const runtimeMigrationAreas = runtimeInventoryMigrationAreas.map(area => ({
      id: area.id,
      runtime: area.runtime,
      roots: [...area.roots].sort(),
      purpose: area.purpose,
      owner: area.owner,
      safeStarts: [...area.safeStarts].sort(),
    }));
    return {
      kind: 'shared-root',
      id: `shared-root.${selection.sharedRuntime}`,
      runtime: selection.sharedRuntime,
      selectedPath: selection.path,
      root: selection.sharedRoot,
      purpose: 'Canonical cross-module code shared within one runtime.',
      owner: null,
      runtimeModules,
      runtimeMigrationAreas,
      focusedTests: [...new Set([
        ...runtimeInventoryModules.flatMap(module => module.focusedTests),
        ...runtimeInventoryMigrationAreas.flatMap(area => area.focusedTests),
      ])].sort(),
      docs: [...new Set([
        ...runtimeInventoryModules.flatMap(module => module.docs),
        ...runtimeInventoryMigrationAreas.flatMap(area => area.docs),
      ])].sort(),
      knownDebt: [...new Set([
        ...runtimeInventoryMigrationAreas.flatMap(area => area.knownDebt),
        'The canonical shared root has a structural boundary but still needs first-class ownership metadata.',
      ])].sort(),
    };
  }

  if (selection.migrationAreaId) {
    const area = inventory.migrationAreas
      .find(candidate => candidate.id === selection.migrationAreaId);
    if (!area) throw new Error(`Selected migration area is absent: ${selection.migrationAreaId}`);
    const publicRouteInventory = readPublicRouteInventory(resolvedRoot);
    const targetModules = area.targetModules
      .map(moduleId => inventory.modules.find(module => module.id === moduleId))
      .filter(Boolean)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(module => ({
        id: module.id,
        runtime: module.runtime,
        root: module.root,
        purpose: module.purpose,
        owner: module.owner,
        publicEntry: module.publicEntry,
      }));
    if (targetModules.length !== area.targetModules.length) {
      throw new Error(`Migration area ${area.id} references an unknown target module.`);
    }
    return {
      kind: 'migration-area',
      id: area.id,
      runtime: area.runtime,
      selectedPath: selection.path,
      roots: [...area.roots].sort(),
      excludeRoots: [...area.excludeRoots].sort(),
      purpose: area.purpose,
      owner: area.owner,
      targetModules,
      publicRoutes: publicRoutesForScope(area.routeScope, publicRouteInventory),
      safeStarts: [...area.safeStarts].sort(),
      focusedTests: [...area.focusedTests].sort(),
      docs: [...area.docs].sort(),
      knownDebt: [...area.knownDebt].sort(),
    };
  }

  const module = inventory.modules.find(candidate => candidate.id === selection.moduleId);
  if (!module) {
    throw new Error(`Context target is not owned by a module or migration area: ${selection.path}`);
  }
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
    kind: 'module',
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
  if (context.kind === 'root') {
    return [
      `Project context: ${context.modules.length} modules, ${context.sharedRoots.length} shared roots, ${context.migrationAreas.length} migration areas, ${context.publicRoutes.length} public routes`,
      `Root: ${context.root}`,
      `Purpose: ${context.purpose}`,
      ...linesFor('Owners', context.owners),
      ...linesFor('Modules', context.modules.map(module => (
        `${module.id} [${module.owner}] — ${module.root}`
      ))),
      ...linesFor('Migration areas', context.migrationAreas.map(area => (
        `${area.id} [${area.owner}] — roots: ${area.roots.join(', ')}; safe starts: ${area.safeStarts.join(', ')}`
      ))),
      ...linesFor('Canonical shared roots', context.sharedRoots.map(shared => (
        `${shared.root} [${shared.runtime}]`
      ))),
      ...linesFor('Public routes', context.publicRoutes.map(route => (
        `${route.pattern} (${route.id}) [${route.owner}]`
      ))),
      ...linesFor('Focused tests', context.focusedTests),
      ...linesFor('Documentation', context.docs),
      ...linesFor('Known debt', context.knownDebt.map(debt => (
        `${debt.migrationAreaId}: ${debt.reason}`
      ))),
    ].join('\n');
  }
  if (context.kind === 'shared-root') {
    return [
      `Shared root: ${context.id}`,
      `Runtime: ${context.runtime}`,
      `Selected path: ${context.selectedPath}`,
      `Root: ${context.root}`,
      `Purpose: ${context.purpose}`,
      'Owner: pending first-class shared ownership metadata',
      ...linesFor('Runtime modules', context.runtimeModules.map(module => (
        `${module.id} [${module.owner}] — ${module.root}`
      ))),
      ...linesFor('Runtime migration areas', context.runtimeMigrationAreas.map(area => (
        `${area.id} [${area.owner}] — roots: ${area.roots.join(', ')}; safe starts: ${area.safeStarts.join(', ')}`
      ))),
      ...linesFor('Conservative focused tests', context.focusedTests),
      ...linesFor('Documentation', context.docs),
      ...linesFor('Known debt', context.knownDebt),
    ].join('\n');
  }
  if (context.kind === 'migration-area') {
    return [
      `Migration area: ${context.id}`,
      `Runtime: ${context.runtime}`,
      `Selected path: ${context.selectedPath}`,
      `Purpose: ${context.purpose}`,
      `Owner: ${context.owner}`,
      ...linesFor('Roots', context.roots),
      ...linesFor('Excluded roots', context.excludeRoots),
      ...linesFor('Target modules', context.targetModules.map(module => (
        `${module.id} [${module.owner}] — ${module.root}`
      ))),
      ...linesFor('Public routes', context.publicRoutes.map(route => (
        `${route.pattern} (${route.id}) [${route.owner}]`
      ))),
      ...linesFor('Safe starts', context.safeStarts),
      ...linesFor('Focused tests', context.focusedTests),
      ...linesFor('Documentation', context.docs),
      ...linesFor('Known debt', context.knownDebt),
    ].join('\n');
  }
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
    process.stdout.write('Usage: node scripts/agent-context.mjs <module-id-or-path-or-root>\n');
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
    process.stderr.write(`[agent-context] ${singleLineErrorMessage(error)}\n`);
    process.exitCode = 1;
  }
}
