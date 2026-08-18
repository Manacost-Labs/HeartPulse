import {
  existsSync,
  globSync,
  lstatSync,
  readFileSync,
  realpathSync,
  readdirSync,
  statSync,
} from 'node:fs';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
} from 'node:path';
import { pathToFileURL } from 'node:url';

import ts from 'typescript';

import {
  focusedTestScriptId,
  packageScriptExists,
  packageScriptLifecycleHooks,
} from './lib/npm-script-policy.mjs';
import {
  isSafeMetadataText,
  pathBelongsToMigrationArea,
  singleLineDisplay,
  singleLineErrorMessage,
} from './lib/module-inventory.mjs';
import {
  publicRoutesForScope,
  readPublicRouteInventory,
} from './lib/public-route-inventory.mjs';

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs',
  '.css', '.scss', '.sass', '.less',
]);
const OWNERSHIP_EXTENSIONS = new Set([...SOURCE_EXTENSIONS, '.json', '.py']);
const CANONICAL_MODULE_ROOTS = ['src/modules', 'server/modules'];
const CANONICAL_SHARED_ROOTS = [
  { id: 'shared-root.client', runtime: 'client', root: 'src/shared' },
  { id: 'shared-root.server', runtime: 'server', root: 'server/shared' },
];
const MAX_EXCEPTION_AGE_DAYS = 180;
const EXCEPTION_CATEGORIES = [
  'missingPublicEntry',
  'internalImport',
  'moduleLegacyImport',
  'runtimeCrossing',
  'typeCycle',
];

function normalizePath(path) {
  return path.split(sep).join('/').replace(/^\.\//, '');
}

function projectPath(rootDir, absolutePath) {
  return normalizePath(relative(rootDir, absolutePath));
}

function isInside(path, root) {
  return path === root || path.startsWith(`${root}/`);
}

function isSafeRelativePath(candidate) {
  return isSafeMetadataText(candidate)
    && candidate !== '.'
    && !isAbsolute(candidate)
    && !candidate.includes('\\')
    && !/[?*\[\]{}]/.test(candidate)
    && candidate.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..')
    && posix.normalize(candidate) === candidate;
}

function sourceExtension(path) {
  for (const extension of SOURCE_EXTENSIONS) {
    if (path.endsWith(extension)) return extension;
  }
  return '';
}

function walkSourceFiles(rootDir) {
  const files = [];
  const errors = [];
  const visit = absolutePath => {
    const repositoryPath = projectPath(rootDir, absolutePath);
    if (!isSafeRelativePath(repositoryPath)) {
      addError(
        errors,
        'unsafe-source-path',
        `source path must be canonical and single-line: ${JSON.stringify(singleLineDisplay(repositoryPath))}`,
      );
      return;
    }
    let stats;
    try {
      stats = lstatSync(absolutePath);
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    if (stats.isSymbolicLink()) {
      addError(
        errors,
        'unsafe-source-symlink',
        `source trees must not contain symlinks: ${repositoryPath}`,
      );
      return;
    }
    if (stats.isDirectory()) {
      for (const entry of readdirSync(absolutePath, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'build' || entry.name === 'dist') continue;
        visit(join(absolutePath, entry.name));
      }
      return;
    }
    if (sourceExtension(absolutePath)) files.push(absolutePath);
  };

  for (const root of ['src', 'server', 'shared']) visit(join(rootDir, root));
  return {
    files: files.sort((left, right) => left.localeCompare(right)),
    errors,
  };
}

function ownershipExtension(path) {
  for (const extension of OWNERSHIP_EXTENSIONS) {
    if (path.endsWith(extension)) return extension;
  }
  return '';
}

function walkOwnershipFiles(rootDir) {
  const files = [];
  const errors = [];
  const visit = absolutePath => {
    const repositoryPath = projectPath(rootDir, absolutePath);
    if (!isSafeRelativePath(repositoryPath)) {
      addError(
        errors,
        'unsafe-ownership-path',
        `ownership path must be canonical and single-line: ${JSON.stringify(singleLineDisplay(repositoryPath))}`,
      );
      return;
    }
    let stats;
    try {
      stats = lstatSync(absolutePath);
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    if (stats.isSymbolicLink()) {
      addError(
        errors,
        'unsafe-migration-source-symlink',
        `migration ownership trees must not contain symlinks: ${repositoryPath}`,
      );
      return;
    }
    if (stats.isDirectory()) {
      for (const entry of readdirSync(absolutePath, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'build' || entry.name === 'dist') continue;
        visit(join(absolutePath, entry.name));
      }
      return;
    }
    if (ownershipExtension(absolutePath)) files.push(repositoryPath);
  };
  for (const ownershipRoot of ['src', 'server', 'shared', 'public/bg-legacy']) {
    visit(join(rootDir, ownershipRoot));
  }
  return {
    files: files.sort(),
    errors,
  };
}

function readCompilerOptions(rootDir) {
  const configPath = ts.findConfigFile(rootDir, ts.sys.fileExists, 'tsconfig.json');
  if (!configPath) {
    return {
      options: {},
      errors: [{ code: 'missing-tsconfig', message: 'tsconfig.json is required for module resolution' }],
    };
  }
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    return {
      options: {},
      errors: [{
        code: 'invalid-tsconfig',
        message: ts.flattenDiagnosticMessageText(config.error.messageText, ' '),
      }],
    };
  }
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath));
  return {
    options: parsed.options,
    errors: parsed.errors.map(error => ({
      code: 'invalid-tsconfig',
      message: ts.flattenDiagnosticMessageText(error.messageText, ' '),
    })),
  };
}

function candidateFiles(path) {
  const candidates = [path];
  if (/\.m?js$/.test(path)) {
    const withoutJs = path.replace(/\.m?js$/, '');
    candidates.push(`${withoutJs}.ts`, `${withoutJs}.tsx`, `${withoutJs}.mts`, `${withoutJs}.cts`);
  }
  if (!/\.[A-Za-z0-9]+$/.test(path)) {
    for (const extension of [
      '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs',
      '.css', '.scss', '.sass', '.less',
    ]) {
      candidates.push(`${path}${extension}`);
      candidates.push(join(path, `index${extension}`));
      candidates.push(join(dirname(path), `_${basename(path)}${extension}`));
    }
  }
  return candidates;
}

function resolvePathAlias(specifier, options, rootDir) {
  const paths = options.paths || {};
  const basePath = options.baseUrl || options.pathsBasePath || rootDir;
  for (const [pattern, replacements] of Object.entries(paths)) {
    const starIndex = pattern.indexOf('*');
    const prefix = starIndex < 0 ? pattern : pattern.slice(0, starIndex);
    const suffix = starIndex < 0 ? '' : pattern.slice(starIndex + 1);
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue;
    if (starIndex < 0 && specifier !== pattern) continue;
    const wildcard = starIndex < 0 ? '' : specifier.slice(prefix.length, specifier.length - suffix.length);
    for (const replacement of replacements) {
      const mapped = replacement.replace('*', wildcard);
      for (const candidate of candidateFiles(resolve(basePath, mapped))) {
        if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
      }
    }
  }
  return null;
}

function resolveImport(specifier, sourcePath, options, rootDir) {
  const suffixIndex = specifier.search(/[?#]/);
  const resolvedSpecifier = suffixIndex < 0 ? specifier : specifier.slice(0, suffixIndex);
  const resolvedModule = ts.resolveModuleName(resolvedSpecifier, sourcePath, options, ts.sys).resolvedModule;
  const candidates = [];
  if (resolvedModule?.resolvedFileName) candidates.push(resolvedModule.resolvedFileName);

  if (resolvedSpecifier.startsWith('.')) {
    candidates.push(...candidateFiles(resolve(dirname(sourcePath), resolvedSpecifier)));
  } else {
    const alias = resolvePathAlias(resolvedSpecifier, options, rootDir);
    if (alias) candidates.push(alias);
  }

  for (const candidate of candidates) {
    if (!existsSync(candidate) || !statSync(candidate).isFile()) continue;
    const relativePath = projectPath(rootDir, resolve(candidate));
    if (relativePath.startsWith('../')
      || relativePath === '..'
      || relativePath.split('/').includes('node_modules')) continue;
    return relativePath;
  }
  return null;
}

function importClauseKind(node) {
  if (node.importClause?.isTypeOnly) return 'type';
  const bindings = node.importClause?.namedBindings;
  if (bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0
    && !node.importClause.name && bindings.elements.every(element => element.isTypeOnly)) {
    return 'type';
  }
  return 'runtime';
}

function exportDeclarationKind(node) {
  if (node.isTypeOnly) return 'type';
  if (node.exportClause && ts.isNamedExports(node.exportClause)
    && node.exportClause.elements.length > 0
    && node.exportClause.elements.every(element => element.isTypeOnly)) {
    return 'type';
  }
  return 'runtime';
}

function isImportMetaGlobCall(node) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false;
  const { expression } = node;
  return ['glob', 'globEager'].includes(expression.name.text)
    && ts.isMetaProperty(expression.expression)
    && expression.expression.keywordToken === ts.SyntaxKind.ImportKeyword
    && expression.expression.name.text === 'meta';
}

function staticGlobPatterns(argument) {
  if (argument && ts.isStringLiteralLike(argument)) return [argument.text];
  if (argument && ts.isArrayLiteralExpression(argument)
    && argument.elements.every(element => ts.isStringLiteralLike(element))) {
    return argument.elements.map(element => element.text);
  }
  return null;
}

function extractStyleImports(sourceText) {
  const imports = [];
  const withoutComments = sourceText.replace(/\/\*[\s\S]*?\*\//g, '');
  const importPattern = /@(?:import|use|forward)\s+(?:url\(\s*)?(?:(['"])(.*?)\1|([^'"\s);]+))\s*\)?[^;]*;/giu;
  for (const match of withoutComments.matchAll(importPattern)) {
    const specifier = match[2] || match[3];
    if (specifier) imports.push({ specifier, kind: 'runtime' });
  }
  return { imports, errors: [] };
}

function scriptKindForPath(sourcePath) {
  if (sourcePath.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (sourcePath.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (/\.(?:js|mjs|cjs)$/.test(sourcePath)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function extractImports(sourcePath, sourceText) {
  if (/\.(?:css|scss|sass|less)$/.test(sourcePath)) {
    return extractStyleImports(sourceText);
  }
  const sourceFile = ts.createSourceFile(
    sourcePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForPath(sourcePath),
  );
  const imports = [];
  const errors = [];
  const record = (specifier, kind) => {
    if (typeof specifier === 'string' && specifier.length > 0) imports.push({ specifier, kind });
  };

  for (const reference of sourceFile.referencedFiles) record(reference.fileName, 'type');

  const visit = node => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      record(node.moduleSpecifier.text, importClauseKind(node));
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      record(node.moduleSpecifier.text, exportDeclarationKind(node));
    } else if (ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)
      && node.moduleReference.expression
      && ts.isStringLiteralLike(node.moduleReference.expression)) {
      record(node.moduleReference.expression.text, node.isTypeOnly ? 'type' : 'runtime');
    } else if (isImportMetaGlobCall(node)) {
      const patterns = staticGlobPatterns(node.arguments[0]);
      if (!patterns || patterns.length === 0) {
        addError(
          errors,
          'dynamic-import-meta-glob',
          'import.meta.glob patterns must be static string literals',
        );
      } else {
        imports.push({ patterns, kind: 'runtime', glob: true });
      }
    } else if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const dynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const commonJsRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if ((dynamicImport || commonJsRequire) && ts.isStringLiteralLike(node.arguments[0])) {
        record(node.arguments[0].text, 'runtime');
      } else if (dynamicImport) {
        addError(errors, 'dynamic-module-import', 'dynamic import targets must be static string literals');
      } else if (commonJsRequire) {
        addError(errors, 'dynamic-require', 'require targets must be static string literals');
      }
    } else if (ts.isImportTypeNode(node)
      && ts.isLiteralTypeNode(node.argument)
      && ts.isStringLiteralLike(node.argument.literal)) {
      record(node.argument.literal.text, 'type');
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { imports, errors };
}

function aliasGlobPatterns(specifier, options, rootDir) {
  const paths = options.paths || {};
  const basePath = options.baseUrl || options.pathsBasePath || rootDir;
  const resolved = [];
  for (const [pattern, replacements] of Object.entries(paths)) {
    const starIndex = pattern.indexOf('*');
    const prefix = starIndex < 0 ? pattern : pattern.slice(0, starIndex);
    const suffix = starIndex < 0 ? '' : pattern.slice(starIndex + 1);
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue;
    if (starIndex < 0 && specifier !== pattern) continue;
    const wildcard = starIndex < 0 ? '' : specifier.slice(prefix.length, specifier.length - suffix.length);
    for (const replacement of replacements) {
      resolved.push(resolve(basePath, replacement.replace('*', wildcard)));
    }
  }
  return resolved;
}

function mapGlobPattern(pattern, sourcePath, options, rootDir) {
  const negated = pattern.startsWith('!');
  const specifier = negated ? pattern.slice(1) : pattern;
  let mapped;
  if (specifier.startsWith('.')) {
    mapped = [resolve(dirname(sourcePath), specifier)];
  } else if (specifier.startsWith('/')) {
    mapped = [resolve(rootDir, `.${specifier}`)];
  } else {
    mapped = aliasGlobPatterns(specifier, options, rootDir);
  }
  return mapped.map(absolutePattern => ({ absolutePattern, negated }));
}

function resolveImportGlob(patterns, sourcePath, options, rootDir) {
  const mappedPatterns = patterns.flatMap(pattern => mapGlobPattern(pattern, sourcePath, options, rootDir));
  const errors = [];
  if (mappedPatterns.length === 0) {
    addError(errors, 'unresolved-import-meta-glob', 'import.meta.glob pattern must be relative, root-relative or use a configured alias');
    return { targets: [], errors };
  }

  const matches = new Set();
  const applyPatterns = (patternsToApply, operation) => {
    for (const { absolutePattern } of patternsToApply) {
      const relativePattern = projectPath(rootDir, absolutePattern);
      if (relativePattern.startsWith('../') || relativePattern === '..') {
        addError(errors, 'unsafe-import-meta-glob', `import.meta.glob pattern escapes the repository: ${relativePattern}`);
        continue;
      }
      let found;
      try {
        found = globSync(absolutePattern);
      } catch (error) {
        addError(errors, 'invalid-import-meta-glob', `invalid import.meta.glob pattern: ${error.message}`);
        continue;
      }
      for (const absoluteTarget of found) {
        if (!existsSync(absoluteTarget)) continue;
        const targetStats = lstatSync(absoluteTarget);
        if (targetStats.isSymbolicLink()) {
          addError(errors, 'unsafe-import-meta-glob', `import.meta.glob target must not be a symlink: ${projectPath(rootDir, absoluteTarget)}`);
          continue;
        }
        if (!targetStats.isFile()) continue;
        const target = projectPath(rootDir, resolve(absoluteTarget));
        if (target.startsWith('../') || target === '..') {
          addError(errors, 'unsafe-import-meta-glob', `import.meta.glob target escapes the repository: ${target}`);
          continue;
        }
        if (operation === 'delete') matches.delete(target);
        else matches.add(target);
      }
    }
  };
  applyPatterns(mappedPatterns.filter(pattern => !pattern.negated), 'add');
  applyPatterns(mappedPatterns.filter(pattern => pattern.negated), 'delete');
  return { targets: [...matches].sort(), errors };
}

function buildEdges(rootDir, sourceFiles, compilerOptions) {
  const edges = new Map();
  const errors = [];
  for (const absoluteSource of sourceFiles) {
    const source = projectPath(rootDir, absoluteSource);
    const sourceText = readFileSync(absoluteSource, 'utf8');
    const extracted = extractImports(absoluteSource, sourceText);
    for (const error of extracted.errors) errors.push({ ...error, source });
    for (const imported of extracted.imports) {
      let targets;
      if (imported.glob) {
        const resolved = resolveImportGlob(imported.patterns, absoluteSource, compilerOptions, rootDir);
        targets = resolved.targets;
        for (const error of resolved.errors) errors.push({ ...error, source });
      } else {
        const target = resolveImport(imported.specifier, absoluteSource, compilerOptions, rootDir);
        targets = target ? [target] : [];
      }
      for (const target of targets) {
        if (!isSafeRelativePath(target)) {
          addError(
            errors,
            'unsafe-resolved-import-path',
            `resolved import path must be canonical and single-line: ${JSON.stringify(singleLineDisplay(target))}`,
          );
          continue;
        }
        const edge = { source, target, kind: imported.kind };
        const key = `${source}\0${target}`;
        const previous = edges.get(key);
        if (!previous || imported.kind === 'runtime') edges.set(key, edge);
      }
    }
  }
  return { edges: [...edges.values()].sort(compareEdges), errors };
}

function compareEdges(left, right) {
  return left.source.localeCompare(right.source)
    || left.target.localeCompare(right.target)
    || left.kind.localeCompare(right.kind);
}

function moduleForPath(modules, path) {
  return modules
    .filter(module => isInside(path, module.root))
    .sort((left, right) => right.root.length - left.root.length)[0] || null;
}

function isPublicModuleEntry(module, path) {
  return path === module.publicEntry
    || (typeof module.publicStyleEntry === 'string' && path === module.publicStyleEntry);
}

function sharedRuntimeForPath(sharedRoots, path) {
  for (const sharedRoot of Array.isArray(sharedRoots) ? sharedRoots : []) {
    if (typeof sharedRoot?.root === 'string' && isInside(path, sharedRoot.root)) {
      return sharedRoot.runtime;
    }
  }
  return null;
}

function pathBelongsToSharedRuntime(sharedRoots, runtime, path) {
  return (Array.isArray(sharedRoots) ? sharedRoots : []).some(sharedRoot => (
    sharedRoot?.runtime === runtime
      && typeof sharedRoot.root === 'string'
      && isInside(path, sharedRoot.root)
  ));
}

function projectRuntimeForPath(path) {
  if (isInside(path, 'src')) return 'client';
  if (isInside(path, 'server')) return 'server';
  return null;
}

function discoverModuleRoots(rootDir, moduleRoots) {
  const roots = [];
  for (const moduleRoot of moduleRoots) {
    const absoluteRoot = join(rootDir, moduleRoot);
    if (!existsSync(absoluteRoot)) continue;
    for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) roots.push(`${moduleRoot}/${entry.name}`);
    }
  }
  return roots.sort();
}

function tarjan(nodes, edges) {
  const adjacency = new Map([...nodes].map(node => [node, []]));
  for (const edge of edges) {
    if (adjacency.has(edge.source) && adjacency.has(edge.target)) adjacency.get(edge.source).push(edge.target);
  }
  for (const targets of adjacency.values()) targets.sort();

  let nextIndex = 0;
  const indices = new Map();
  const lowLinks = new Map();
  const stack = [];
  const onStack = new Set();
  const components = [];

  const visit = node => {
    indices.set(node, nextIndex);
    lowLinks.set(node, nextIndex);
    nextIndex += 1;
    stack.push(node);
    onStack.add(node);

    for (const target of adjacency.get(node)) {
      if (!indices.has(target)) {
        visit(target);
        lowLinks.set(node, Math.min(lowLinks.get(node), lowLinks.get(target)));
      } else if (onStack.has(target)) {
        lowLinks.set(node, Math.min(lowLinks.get(node), indices.get(target)));
      }
    }

    if (lowLinks.get(node) !== indices.get(node)) return;
    const component = [];
    while (stack.length) {
      const member = stack.pop();
      onStack.delete(member);
      component.push(member);
      if (member === node) break;
    }
    component.sort();
    const selfCycle = component.length === 1
      && edges.some(edge => edge.source === component[0] && edge.target === component[0]);
    if (component.length > 1 || selfCycle) components.push(component);
  };

  for (const node of [...nodes].sort()) if (!indices.has(node)) visit(node);
  return components.sort((left, right) => left.join('\0').localeCompare(right.join('\0')));
}

function describeCycles(sourceFiles, edges) {
  const sourceNodes = new Set(sourceFiles.map(path => normalizePath(path)));
  const graphEdges = edges.filter(edge => sourceNodes.has(edge.source) && sourceNodes.has(edge.target));
  const runtimeEdges = graphEdges.filter(edge => edge.kind === 'runtime');
  const runtimeComponents = tarjan(sourceNodes, runtimeEdges);
  const combinedComponents = tarjan(sourceNodes, graphEdges);
  const runtimeNodeSets = runtimeComponents.map(component => new Set(component));
  const typeComponents = combinedComponents.filter(component => !runtimeNodeSets.some(runtime => (
    runtime.size > 0 && [...runtime].every(node => component.includes(node))
  )));
  const describe = (component, kind) => {
    const nodeSet = new Set(component);
    return {
      source: component[0],
      target: component.at(-1),
      kind,
      nodes: component,
      edges: graphEdges.filter(edge => nodeSet.has(edge.source) && nodeSet.has(edge.target)).sort(compareEdges),
    };
  };
  return {
    runtime: runtimeComponents.map(component => describe(component, 'runtime-cycle')),
    typeInclusive: typeComponents.map(component => describe(component, 'type-cycle')),
  };
}

function edgeKey(edge) {
  return `${edge.source}\0${edge.target}\0${edge.kind}`;
}

function cycleKey(cycle) {
  return JSON.stringify({
    nodes: [...(cycle.nodes || [])].sort(),
    edges: [...(cycle.edges || [])].map(edge => ({
      source: edge.source,
      target: edge.target,
      kind: edge.kind,
    })).sort(compareEdges),
  });
}

function addError(errors, code, message, details = {}) {
  errors.push({ code, message, ...details });
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isRegularFile(path) {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

function repositoryEntryKind(rootDir, repositoryPath) {
  if (!isSafeRelativePath(repositoryPath)) return null;
  const absoluteRoot = realpathSync(rootDir);
  const absoluteEntry = resolve(rootDir, repositoryPath);
  let stats;
  try {
    stats = lstatSync(absoluteEntry);
  } catch {
    return null;
  }
  if (stats.isSymbolicLink() || (!stats.isFile() && !stats.isDirectory())) return null;
  let realEntry;
  try {
    realEntry = realpathSync(absoluteEntry);
  } catch {
    return null;
  }
  const realRelative = relative(absoluteRoot, realEntry);
  if (realRelative.startsWith('..') || isAbsolute(realRelative)) return null;
  return stats.isFile() ? 'file' : 'directory';
}

function repositoryEntryResolvesWithin(rootDir, repositoryPath, ownerRoot) {
  if (!isSafeRelativePath(repositoryPath) || !isSafeRelativePath(ownerRoot)) return false;
  try {
    const realEntry = realpathSync(resolve(rootDir, repositoryPath));
    const realOwnerRoot = realpathSync(resolve(rootDir, ownerRoot));
    const ownedRelative = relative(realOwnerRoot, realEntry);
    return ownedRelative === '' || (!ownedRelative.startsWith('..') && !isAbsolute(ownedRelative));
  } catch {
    return false;
  }
}

function migrationAreaOverlap(left, right) {
  if (!isRecord(left) || !isRecord(right)
    || !Array.isArray(left.roots) || !Array.isArray(right.roots)
    || !Array.isArray(left.excludeRoots) || !Array.isArray(right.excludeRoots)) {
    return null;
  }
  for (const leftRoot of left.roots) {
    if (typeof leftRoot !== 'string') continue;
    for (const rightRoot of right.roots) {
      if (typeof rightRoot !== 'string') continue;
      const intersectionRoot = isInside(leftRoot, rightRoot)
        ? leftRoot
        : isInside(rightRoot, leftRoot) ? rightRoot : null;
      if (!intersectionRoot) continue;
      const leftExcludesIntersection = left.excludeRoots.some(excludeRoot => (
        typeof excludeRoot === 'string' && isInside(intersectionRoot, excludeRoot)
      ));
      const rightExcludesIntersection = right.excludeRoots.some(excludeRoot => (
        typeof excludeRoot === 'string' && isInside(intersectionRoot, excludeRoot)
      ));
      if (!leftExcludesIntersection && !rightExcludesIntersection) {
        return { leftRoot, rightRoot, intersectionRoot };
      }
    }
  }
  return null;
}

function expectedMigrationRuntime(path) {
  if (isInside(path, 'src') || isInside(path, 'public/bg-legacy')) return 'client';
  if (isInside(path, 'server')) return 'server';
  if (isInside(path, 'shared')) return 'shared';
  return null;
}

function validateMigrationAreas(config, rootDir, modules, packageJson, errors) {
  const areas = Array.isArray(config.migrationAreas) ? config.migrationAreas : [];
  if (!Array.isArray(config.migrationAreas)) {
    addError(errors, 'invalid-migration-areas', 'schemaVersion 3 requires a migrationAreas array');
  }
  const ids = new Set();
  let publicRouteInventory = null;
  const routeInventory = () => {
    if (!publicRouteInventory) publicRouteInventory = readPublicRouteInventory(rootDir);
    return publicRouteInventory;
  };
  const moduleIds = new Set(modules.map(module => module.id));
  const protectedRoots = [
    ...CANONICAL_MODULE_ROOTS,
    ...CANONICAL_SHARED_ROOTS.map(sharedRoot => sharedRoot.root),
  ];

  for (const area of areas) {
    if (!isRecord(area)) {
      addError(errors, 'invalid-migration-area', 'every migration area must be an object');
      continue;
    }
    for (const field of ['id', 'runtime', 'purpose', 'owner']) {
      if (!isSafeMetadataText(area[field])) {
        addError(errors, 'invalid-migration-area', `migration area ${area.id || '<unknown>'} requires ${field}`);
      }
    }
    if (!/^(?:client|server|shared)\.[a-z][A-Za-z0-9]*$/.test(area.id ?? '')) {
      addError(errors, 'invalid-migration-area-id', `migration area has invalid id ${area.id}`);
    }
    if (ids.has(area.id)) addError(errors, 'duplicate-migration-area-id', `duplicate migration area id ${area.id}`);
    if (moduleIds.has(area.id)) {
      addError(
        errors,
        'duplicate-ownership-id',
        `migration area id must not collide with a module id: ${area.id}`,
      );
    }
    ids.add(area.id);
    if (!['client', 'server', 'shared'].includes(area.runtime)) {
      addError(errors, 'invalid-migration-runtime-root', `migration area ${area.id} has invalid runtime ${area.runtime}`);
    }

    const arrayFields = [
      'roots',
      'excludeRoots',
      'targetModules',
      'focusedTests',
      'docs',
      'safeStarts',
      'knownDebt',
    ];
    for (const field of arrayFields) {
      const value = area[field];
      const requiresItems = ['roots', 'focusedTests', 'docs', 'safeStarts', 'knownDebt'].includes(field);
      if (!Array.isArray(value)
        || (requiresItems && value.length === 0)
        || value.some(item => !isSafeMetadataText(item))
        || new Set(value).size !== value.length) {
        addError(errors, field === 'knownDebt' ? 'invalid-migration-debt' : 'invalid-migration-area',
          `migration area ${area.id} requires a ${requiresItems ? 'non-empty ' : ''}unique ${field} array`);
      }
    }
    const roots = Array.isArray(area.roots) ? area.roots : [];
    const excludeRoots = Array.isArray(area.excludeRoots) ? area.excludeRoots : [];
    for (const root of roots) {
      if (!isSafeRelativePath(root) || !repositoryEntryKind(rootDir, root)) {
        addError(errors, 'unsafe-migration-root', `migration area ${area.id} has unsafe or missing root ${root}`);
        continue;
      }
      if (expectedMigrationRuntime(root) !== area.runtime) {
        addError(errors, 'invalid-migration-runtime-root', `migration area ${area.id} runtime does not match ${root}`);
      }
      for (const protectedRoot of protectedRoots) {
        const includesProtected = isInside(protectedRoot, root);
        const insideProtected = isInside(root, protectedRoot);
        const protectedIsExcluded = excludeRoots.some(excludeRoot => (
          excludeRoot === protectedRoot || isInside(protectedRoot, excludeRoot)
        ));
        if ((insideProtected || includesProtected) && !protectedIsExcluded) {
          addError(
            errors,
            'migration-area-overlaps-architecture-root',
            `migration area ${area.id} overlaps protected root ${protectedRoot}`,
          );
        }
      }
    }
    for (let index = 0; index < roots.length; index += 1) {
      for (let other = index + 1; other < roots.length; other += 1) {
        if (isInside(roots[index], roots[other]) || isInside(roots[other], roots[index])) {
          addError(errors, 'invalid-migration-root', `migration area ${area.id} has nested roots`);
        }
      }
    }
    for (const excludeRoot of excludeRoots) {
      const isStrictChild = roots.some(root => excludeRoot !== root && isInside(excludeRoot, root));
      if (!isSafeRelativePath(excludeRoot)
        || !repositoryEntryKind(rootDir, excludeRoot)
        || !isStrictChild) {
        addError(
          errors,
          'invalid-migration-exclusion',
          `migration area ${area.id} exclusion must be an existing strict child: ${excludeRoot}`,
        );
      }
    }

    const targetModules = Array.isArray(area.targetModules) ? area.targetModules : [];
    for (const targetModuleId of targetModules) {
      const target = modules.find(module => module.id === targetModuleId);
      if (!target || (area.runtime !== 'shared' && target.runtime !== area.runtime)) {
        addError(errors, 'invalid-migration-target', `migration area ${area.id} has invalid target module ${targetModuleId}`);
      }
    }
    const focusedTests = Array.isArray(area.focusedTests) ? area.focusedTests : [];
    for (const command of focusedTests) {
      const script = focusedTestScriptId(command);
      if (!script) {
        addError(errors, 'invalid-focused-test-command', `migration area ${area.id} focusedTests must contain exact allowlisted npm run test:* commands`);
      } else if (!packageScriptExists(packageJson, script)) {
        addError(errors, 'missing-focused-test-script', `migration area ${area.id} references missing package script ${script}`);
      } else {
        const hooks = packageScriptLifecycleHooks(packageJson, script);
        if (hooks.length > 0) {
          addError(errors, 'focused-test-lifecycle-hook', `migration area ${area.id} focused test ${script} must not have pre/post lifecycle hooks`);
        }
      }
    }
    for (const artifact of Array.isArray(area.docs) ? area.docs : []) {
      if (!isSafeRelativePath(artifact) || repositoryEntryKind(rootDir, artifact) !== 'file') {
        addError(errors, 'missing-migration-artifact', `migration area ${area.id} documentation is missing: ${artifact}`);
      }
    }
    for (const safeStart of Array.isArray(area.safeStarts) ? area.safeStarts : []) {
      if (!isSafeRelativePath(safeStart)
        || repositoryEntryKind(rootDir, safeStart) !== 'file'
        || !pathBelongsToMigrationArea(safeStart, area)) {
        addError(errors, 'missing-migration-artifact', `migration area ${area.id} safe start is invalid: ${safeStart}`);
      }
    }
    try {
      if (area.routeScope?.mode === 'none') publicRoutesForScope(area.routeScope, { routes: [] });
      else publicRoutesForScope(area.routeScope, routeInventory());
    } catch (error) {
      addError(errors, 'invalid-migration-route-scope', `migration area ${area.id}: ${error.message}`);
    }
  }
  for (let index = 0; index < areas.length; index += 1) {
    for (let other = index + 1; other < areas.length; other += 1) {
      const overlap = migrationAreaOverlap(areas[index], areas[other]);
      if (!overlap) continue;
      addError(
        errors,
        'overlapping-migration-areas',
        `migration areas ${areas[index]?.id || '<unknown>'} and ${areas[other]?.id || '<unknown>'} have overlapping effective roots at ${overlap.intersectionRoot}`,
        overlap,
      );
    }
  }
  return areas.filter(isRecord);
}

function validateMigrationCoverage(areas, modules, ownershipFiles, errors) {
  const legacyFiles = ownershipFiles.filter(path => (
    !moduleForPath(modules, path)
    && !sharedRuntimeForPath(CANONICAL_SHARED_ROOTS, path)
  ));
  let orphaned = 0;
  let overlapping = 0;
  for (const source of legacyFiles) {
    const matches = areas.filter(area => pathBelongsToMigrationArea(source, area));
    if (matches.length === 0) {
      orphaned += 1;
      addError(errors, 'orphaned-migration-source', `product source has no migration owner: ${source}`, { source });
    } else if (matches.length > 1) {
      overlapping += 1;
      addError(
        errors,
        'overlapping-migration-source',
        `product source has multiple migration owners: ${source}`,
        { source, migrationAreas: matches.map(area => area.id).sort() },
      );
    }
  }
  return { orphaned, overlapping };
}

function readPackageJsonForValidation(rootDir, errors) {
  const packagePath = join(rootDir, 'package.json');
  if (!isRegularFile(packagePath)) {
    addError(errors, 'invalid-package-json', 'package.json must be a regular file');
    return {};
  }
  try {
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
    if (!isRecord(packageJson)) throw new Error('root value must be an object');
    return packageJson;
  } catch (error) {
    addError(errors, 'invalid-package-json', `package.json is invalid: ${error.message}`);
    return {};
  }
}

function expectedModuleIdentity(root) {
  if (typeof root !== 'string') return null;
  if (isInside(root, 'src/modules')) return { runtime: 'client', id: `client.${basename(root)}` };
  if (isInside(root, 'server/modules')) return { runtime: 'server', id: `server.${basename(root)}` };
  return null;
}

function isUsableModule(module) {
  return isRecord(module)
    && ['id', 'runtime', 'root', 'publicEntry'].every(field => (
      typeof module[field] === 'string' && module[field].length > 0
    ))
    && Array.isArray(module.dependencies);
}

function isUsableSharedRoot(sharedRoot) {
  return isRecord(sharedRoot)
    && ['id', 'runtime', 'root', 'purpose', 'owner'].every(field => (
      isSafeMetadataText(sharedRoot[field])
    ))
    && Array.isArray(sharedRoot.focusedTests)
    && Array.isArray(sharedRoot.docs)
    && Array.isArray(sharedRoot.safeStarts);
}

function validateSharedRoots(config, rootDir, modules, migrationAreas, packageJson, errors) {
  const sharedRoots = Array.isArray(config.sharedRoots) ? config.sharedRoots : [];
  const configuredIdentities = sharedRoots
    .filter(isRecord)
    .map(({ id, runtime, root }) => ({ id, runtime, root }))
    .sort((left, right) => String(left.root).localeCompare(String(right.root)));
  const canonicalIdentities = [...CANONICAL_SHARED_ROOTS]
    .sort((left, right) => left.root.localeCompare(right.root));
  if (JSON.stringify(configuredIdentities) !== JSON.stringify(canonicalIdentities)) {
    addError(
      errors,
      'invalid-boundary-roots',
      'moduleRoots and sharedRoots must match the canonical client/server architecture roots',
    );
  }

  const architectureIds = new Set([
    ...modules.map(module => module.id),
    ...migrationAreas.map(area => area.id),
  ]);
  const roots = new Set();
  for (const sharedRoot of sharedRoots) {
    if (!isRecord(sharedRoot)) {
      addError(errors, 'invalid-shared-root', 'every shared root inventory item must be an object');
      continue;
    }
    for (const field of ['id', 'runtime', 'root', 'purpose', 'owner']) {
      if (!isSafeMetadataText(sharedRoot[field])) {
        addError(
          errors,
          'invalid-shared-root',
          `shared root ${sharedRoot.id || '<unknown>'} requires ${field}`,
        );
      }
    }
    if (!['client', 'server'].includes(sharedRoot.runtime)) {
      addError(
        errors,
        'invalid-shared-root-runtime',
        `shared root ${sharedRoot.id || '<unknown>'} has invalid runtime ${sharedRoot.runtime}`,
      );
    }
    if (architectureIds.has(sharedRoot.id)) {
      addError(
        errors,
        'duplicate-ownership-id',
        `shared root id must not collide with another ownership id: ${sharedRoot.id}`,
      );
    }
    architectureIds.add(sharedRoot.id);
    if (roots.has(sharedRoot.root)) {
      addError(errors, 'duplicate-shared-root', `duplicate shared root ${sharedRoot.root}`);
    }
    roots.add(sharedRoot.root);
    if (!isSafeRelativePath(sharedRoot.root)
      || repositoryEntryKind(rootDir, sharedRoot.root) !== 'directory') {
      addError(
        errors,
        'missing-shared-root-artifact',
        `shared root ${sharedRoot.id || '<unknown>'} root is missing: ${sharedRoot.root}`,
      );
    }

    const focusedTests = Array.isArray(sharedRoot.focusedTests) ? sharedRoot.focusedTests : [];
    const docs = Array.isArray(sharedRoot.docs) ? sharedRoot.docs : [];
    const safeStarts = Array.isArray(sharedRoot.safeStarts) ? sharedRoot.safeStarts : [];
    if (!Array.isArray(sharedRoot.focusedTests)
      || !Array.isArray(sharedRoot.docs)
      || !Array.isArray(sharedRoot.safeStarts)
      || focusedTests.length === 0
      || docs.length === 0
      || safeStarts.length === 0
      || [...focusedTests, ...docs, ...safeStarts]
        .some(value => !isSafeMetadataText(value))) {
      addError(
        errors,
        'invalid-shared-root-ownership',
        `shared root ${sharedRoot.id || '<unknown>'} requires non-empty focusedTests, docs and safeStarts arrays`,
      );
    }
    for (const [field, values] of Object.entries({ focusedTests, docs, safeStarts })) {
      if (new Set(values).size !== values.length) {
        addError(
          errors,
          'invalid-shared-root-ownership',
          `shared root ${sharedRoot.id || '<unknown>'} has duplicate ${field} entries`,
        );
      }
    }
    for (const command of focusedTests) {
      const script = focusedTestScriptId(command);
      if (!script) {
        addError(
          errors,
          'invalid-focused-test-command',
          `shared root ${sharedRoot.id} focusedTests must contain exact allowlisted npm run test:* commands`,
        );
      } else if (!packageScriptExists(packageJson, script)) {
        addError(
          errors,
          'missing-focused-test-script',
          `shared root ${sharedRoot.id} references missing package script ${script}`,
        );
      } else {
        const hooks = packageScriptLifecycleHooks(packageJson, script);
        if (hooks.length > 0) {
          addError(
            errors,
            'focused-test-lifecycle-hook',
            `shared root ${sharedRoot.id} focused test ${script} must not have pre/post lifecycle hooks`,
          );
        }
      }
    }
    for (const artifact of docs) {
      if (!isSafeRelativePath(artifact) || repositoryEntryKind(rootDir, artifact) !== 'file') {
        addError(
          errors,
          'missing-shared-root-artifact',
          `shared root ${sharedRoot.id} documentation is missing: ${artifact}`,
        );
      }
    }
    for (const safeStart of safeStarts) {
      if (!isSafeRelativePath(safeStart)
        || repositoryEntryKind(rootDir, safeStart) !== 'file'
        || !isInside(safeStart, sharedRoot.root)
        || !repositoryEntryResolvesWithin(rootDir, safeStart, sharedRoot.root)) {
        addError(
          errors,
          'missing-shared-root-artifact',
          `shared root ${sharedRoot.id} safe start is invalid: ${safeStart}`,
        );
      }
    }
  }
  return sharedRoots.filter(isUsableSharedRoot);
}

function validateConfig(config, rootDir, discoveredRoots, errors) {
  if (config.schemaVersion !== 3) addError(errors, 'invalid-schema-version', 'module-boundaries schemaVersion must be 3');
  if (JSON.stringify(config.moduleRoots) !== JSON.stringify(CANONICAL_MODULE_ROOTS)) {
    addError(
      errors,
      'invalid-boundary-roots',
      'moduleRoots and sharedRoots must match the canonical client/server architecture roots',
    );
  }
  const modules = Array.isArray(config.modules) ? config.modules : [];
  const packageJson = readPackageJsonForValidation(rootDir, errors);
  const configuredRoots = modules
    .filter(isRecord)
    .map(module => module.root)
    .filter(root => typeof root === 'string')
    .sort();
  if (JSON.stringify(configuredRoots) !== JSON.stringify(discoveredRoots)) {
    addError(errors, 'module-inventory-mismatch', 'configured modules must exactly match module directories', {
      configured: configuredRoots,
      discovered: discoveredRoots,
    });
  }

  const ids = new Set();
  const roots = new Set();
  for (const module of modules) {
    if (!isRecord(module)) {
      addError(errors, 'invalid-module', 'every module inventory item must be an object');
      continue;
    }
    for (const field of ['id', 'runtime', 'root', 'purpose', 'owner', 'publicEntry']) {
      if (!isSafeMetadataText(module[field])) {
        addError(errors, 'invalid-module', `module ${module.id || '<unknown>'} requires ${field}`);
      }
    }
    if (!['client', 'server'].includes(module.runtime)) {
      addError(errors, 'invalid-module-runtime', `module ${module.id} has invalid runtime ${module.runtime}`);
    }
    const expectedIdentity = expectedModuleIdentity(module.root);
    if (!expectedIdentity || module.runtime !== expectedIdentity.runtime) {
      addError(
        errors,
        'invalid-module-runtime-root',
        `module ${module.id} runtime must match its canonical module root`,
      );
    }
    if (!expectedIdentity || module.id !== expectedIdentity.id) {
      addError(
        errors,
        'invalid-module-id',
        `module id must be derived from its canonical root: ${expectedIdentity?.id || '<invalid-root>'}`,
      );
    }
    if (ids.has(module.id)) addError(errors, 'duplicate-module-id', `duplicate module id ${module.id}`);
    if (roots.has(module.root)) addError(errors, 'duplicate-module-root', `duplicate module root ${module.root}`);
    ids.add(module.id);
    roots.add(module.root);
    const expectedPublicEntry = `${module.root}/public.ts`;
    if (module.publicEntry !== expectedPublicEntry) {
      addError(errors, 'invalid-public-entry', `module ${module.id} publicEntry must be ${expectedPublicEntry}`);
    } else {
      const absolutePublicEntry = join(rootDir, expectedPublicEntry);
      if (existsSync(absolutePublicEntry)
        && repositoryEntryKind(rootDir, expectedPublicEntry) !== 'file') {
        addError(errors, 'invalid-public-entry', `module ${module.id} publicEntry must be a regular repository file`);
      }
    }
    if (module.publicStyleEntry !== undefined) {
      const expectedPublicStyleEntry = `${module.root}/public.css`;
      if (module.runtime !== 'client' || module.publicStyleEntry !== expectedPublicStyleEntry) {
        addError(
          errors,
          'invalid-public-style-entry',
          `client module ${module.id} publicStyleEntry must be ${expectedPublicStyleEntry}`,
        );
      } else if (repositoryEntryKind(rootDir, expectedPublicStyleEntry) !== 'file') {
        addError(
          errors,
          'invalid-public-style-entry',
          `module ${module.id} publicStyleEntry must be a regular file`,
        );
      }
    }
    const dependencies = Array.isArray(module.dependencies) ? module.dependencies : [];
    const focusedTests = Array.isArray(module.focusedTests) ? module.focusedTests : [];
    const docs = Array.isArray(module.docs) ? module.docs : [];
    if (!Array.isArray(module.dependencies) || !Array.isArray(module.focusedTests) || !Array.isArray(module.docs)
      || focusedTests.length === 0 || docs.length === 0
      || [...dependencies, ...focusedTests, ...docs].some(value => !isSafeMetadataText(value))) {
      addError(errors, 'invalid-module-ownership', `module ${module.id} requires dependencies, focusedTests and docs arrays`);
    }
    for (const command of focusedTests) {
      const script = focusedTestScriptId(command);
      if (!script) {
        addError(
          errors,
          'invalid-focused-test-command',
          `module ${module.id} focusedTests must contain exact allowlisted npm run test:* commands`,
        );
      } else if (!packageScriptExists(packageJson, script)) {
        addError(
          errors,
          'missing-focused-test-script',
          `module ${module.id} references missing package script ${script}`,
        );
      } else {
        const hooks = packageScriptLifecycleHooks(packageJson, script);
        if (hooks.length > 0) {
          addError(
            errors,
            'focused-test-lifecycle-hook',
            `module ${module.id} focused test ${script} must not have pre/post lifecycle hooks`,
          );
        }
      }
    }
    for (const artifact of docs) {
      if (!isSafeRelativePath(artifact) || repositoryEntryKind(rootDir, artifact) !== 'file') {
        addError(errors, 'missing-module-artifact', `module ${module.id} ownership artifact is missing: ${artifact}`);
      }
    }
  }

  for (const module of modules) {
    if (!isRecord(module) || !Array.isArray(module.dependencies)) continue;
    for (const dependency of module.dependencies || []) {
      const target = modules.find(candidate => isRecord(candidate) && candidate.id === dependency);
      if (!target || target.id === module.id) {
        addError(errors, 'invalid-module-dependency', `module ${module.id} has invalid dependency ${dependency}`);
      } else if (target.runtime !== module.runtime) {
        addError(errors, 'invalid-module-dependency', `module ${module.id} cannot declare cross-runtime dependency ${dependency}`);
      }
    }
  }
  const migrationAreas = validateMigrationAreas(
    config,
    rootDir,
    modules.filter(isUsableModule),
    packageJson,
    errors,
  );
  const sharedRoots = validateSharedRoots(
    config,
    rootDir,
    modules.filter(isUsableModule),
    migrationAreas,
    packageJson,
    errors,
  );
  return { migrationAreas, sharedRoots };
}

export function validateModuleInventoryMetadata({
  rootDir = process.cwd(),
  config,
  now = new Date(),
} = {}) {
  const absoluteRoot = resolve(rootDir);
  const errors = [];
  if (!isRecord(config)) {
    addError(errors, 'invalid-config-shape', 'module-boundaries inventory must contain an object');
    return {
      ok: false,
      modules: [],
      migrationAreas: [],
      sharedRoots: [],
      errors,
    };
  }
  const discoveredRoots = discoverModuleRoots(absoluteRoot, CANONICAL_MODULE_ROOTS);
  const { migrationAreas, sharedRoots } = validateConfig(
    config,
    absoluteRoot,
    discoveredRoots,
    errors,
  );
  validateExceptionMetadata(config, errors, now);
  const modules = (Array.isArray(config?.modules) ? config.modules : [])
    .filter(isUsableModule);
  return {
    ok: errors.length === 0,
    modules,
    migrationAreas,
    sharedRoots,
    errors,
  };
}

function validateDeclaredDependencies(modules, edges, errors) {
  const actualDependencies = new Map(modules.map(module => [module.id, new Set()]));
  for (const edge of edges) {
    const sourceModule = moduleForPath(modules, edge.source);
    const targetModule = moduleForPath(modules, edge.target);
    if (sourceModule && targetModule && sourceModule.id !== targetModule.id) {
      actualDependencies.get(sourceModule.id)?.add(targetModule.id);
    }
  }
  for (const module of modules) {
    for (const dependency of module.dependencies) {
      if (!actualDependencies.get(module.id)?.has(dependency)) {
        addError(
          errors,
          'stale-module-dependency',
          `${module.id} declares unused dependency ${dependency}`,
          { source: module.id, target: dependency },
        );
      }
    }
  }
}

function isIsoCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isValidCycleException(entry) {
  if (!Array.isArray(entry.nodes) || entry.nodes.length === 0 || !Array.isArray(entry.edges)) return false;
  if (entry.nodes.some(node => typeof node !== 'string')) return false;
  if (entry.edges.some(edge => (
    !isRecord(edge)
    || typeof edge.source !== 'string'
    || typeof edge.target !== 'string'
    || !['runtime', 'type'].includes(edge.kind)
  ))) return false;
  const nodes = [...entry.nodes].sort();
  return entry.source === nodes[0]
    && entry.target === nodes.at(-1)
    && entry.kind === 'type-cycle';
}

function isValidEdgeException(category, entry) {
  const validKind = category === 'missingPublicEntry'
    ? entry.kind === 'missing-public-entry'
    : ['runtime', 'type'].includes(entry.kind);
  return typeof entry.source === 'string'
    && entry.source.length > 0
    && typeof entry.target === 'string'
    && entry.target.length > 0
    && validKind;
}

function exceptionKey(category, entry, entryIndex) {
  if (category === 'typeCycle') {
    return isValidCycleException(entry) ? cycleKey(entry) : `invalid-cycle-${entryIndex}`;
  }
  return isValidEdgeException(category, entry) ? edgeKey(entry) : `invalid-edge-${entryIndex}`;
}

function validateExceptionMetadata(config, errors, now) {
  const budgets = isRecord(config?.allowlistBudgets) ? config.allowlistBudgets : {};
  const exceptions = isRecord(config?.exceptions) ? config.exceptions : {};
  const today = now.toISOString().slice(0, 10);

  for (const category of EXCEPTION_CATEGORIES) {
    const configuredEntries = exceptions[category];
    const entries = Array.isArray(configuredEntries) ? configuredEntries : [];
    if (!Array.isArray(configuredEntries)) {
      addError(
        errors,
        'invalid-exception-metadata',
        `${category} exceptions must be an array`,
        { category },
      );
    }
    const budget = budgets[category];
    if (!Number.isInteger(budget) || budget < 0 || budget !== entries.length) {
      addError(errors, 'exception-budget-mismatch', `${category} budget must equal its exact exception count`, {
        category,
        budget,
        exceptions: entries.length,
      });
    }

    const exceptionKeys = new Map();
    for (const [entryIndex, entry] of entries.entries()) {
      if (!isRecord(entry)) {
        addError(errors, 'invalid-exception-metadata', `${category} exceptions must be objects`);
        continue;
      }
      const validCycle = category !== 'typeCycle' || isValidCycleException(entry);
      if (!validCycle) {
        addError(
          errors,
          'invalid-cycle-exception',
          'typeCycle exception source, target, kind, nodes and edges must describe the exact cycle',
          { category },
        );
      }
      if (category !== 'typeCycle' && !isValidEdgeException(category, entry)) {
        addError(
          errors,
          'invalid-exception-metadata',
          `${category} exceptions require exact source, target and kind metadata`,
          { category },
        );
      }
      const cycleNodes = Array.isArray(entry.nodes) ? entry.nodes : [];
      const cycleEdges = Array.isArray(entry.edges) ? entry.edges.filter(isRecord) : [];
      const paths = category === 'typeCycle'
        ? [
            entry.source,
            entry.target,
            ...cycleNodes,
            ...cycleEdges.flatMap(edge => [edge.source, edge.target]),
          ]
        : [entry.source, entry.target];
      if (paths.some(path => !isSafeRelativePath(path))) {
        addError(errors, 'unsafe-exception', `${category} exception paths must be exact, safe repository paths`);
      }
      if (!isSafeMetadataText(entry.owner)
        || !isSafeMetadataText(entry.reason)
        || !isIsoCalendarDate(entry.expiresOn)) {
        addError(errors, 'invalid-exception-metadata', `${category} exceptions require owner, reason and ISO expiresOn`);
      } else if (entry.expiresOn < today) {
        addError(errors, 'expired-exception', `${category} exception expired on ${entry.expiresOn}`, { category });
      } else if ((Date.parse(`${entry.expiresOn}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`))
        > MAX_EXCEPTION_AGE_DAYS * 24 * 60 * 60 * 1000) {
        addError(
          errors,
          'exception-expiry-too-distant',
          `${category} exception expiry must be within ${MAX_EXCEPTION_AGE_DAYS} days`,
          { category },
        );
      }
      const key = exceptionKey(category, entry, entryIndex);
      if (exceptionKeys.has(key)) addError(errors, 'duplicate-exception', `duplicate ${category} exception`, { category });
      exceptionKeys.set(key, entry);
    }
  }
}

function validateExceptionGraph(config, violations, errors) {
  const exceptions = isRecord(config?.exceptions) ? config.exceptions : {};
  for (const category of EXCEPTION_CATEGORIES) {
    const entries = Array.isArray(exceptions[category]) ? exceptions[category] : [];
    const actual = violations[category];
    const actualKeys = new Map(actual.map(item => [
      category === 'typeCycle' ? cycleKey(item) : edgeKey(item),
      item,
    ]));
    const exceptionKeys = new Map();
    for (const [entryIndex, entry] of entries.entries()) {
      if (!isRecord(entry)) continue;
      const key = exceptionKey(category, entry, entryIndex);
      exceptionKeys.set(key, entry);
      if (!actualKeys.has(key)) {
        addError(
          errors,
          'stale-exception',
          `${category} exception no longer matches the graph`,
          { category, exception: entry },
        );
      }
    }
    for (const [key, item] of actualKeys) {
      if (!exceptionKeys.has(key)) {
        addError(
          errors,
          'unapproved-boundary',
          `unapproved ${category} violation`,
          { category, violation: item },
        );
      }
    }
  }
}

export function analyzeModuleBoundaries({
  rootDir = process.cwd(),
  configPath = 'config/module-boundaries.json',
  now = new Date(),
} = {}) {
  const absoluteRoot = resolve(rootDir);
  const absoluteConfig = resolve(absoluteRoot, configPath);
  const errors = [];
  let config;
  try {
    config = JSON.parse(readFileSync(absoluteConfig, 'utf8'));
  } catch (error) {
    return {
      ok: false,
      counts: { modules: 0, migrationAreas: 0, sources: 0, ownershipSources: 0, edges: 0, orphanedMigrationSource: 0, overlappingMigrationSource: 0, missingPublicEntry: 0, internalImport: 0, moduleLegacyImport: 0, runtimeCrossing: 0, typeCycle: 0, runtimeCycle: 0 },
      violations: { missingPublicEntry: [], internalImport: [], moduleLegacyImport: [], runtimeCrossing: [], typeCycle: [] },
      cycles: { runtime: [], typeInclusive: [] },
      edges: [],
      errors: [{ code: 'invalid-config', message: singleLineErrorMessage(error) }],
    };
  }

  const sharedRoots = CANONICAL_SHARED_ROOTS;
  const configuredModules = Array.isArray(config?.modules) ? config.modules : [];
  const metadata = validateModuleInventoryMetadata({ rootDir: absoluteRoot, config, now });
  errors.push(...metadata.errors);
  const migrationAreas = metadata.migrationAreas;
  const modules = metadata.modules;

  const sourceScan = walkSourceFiles(absoluteRoot);
  errors.push(...sourceScan.errors);
  const absoluteSourceFiles = sourceScan.files;
  const sourceFiles = absoluteSourceFiles.map(path => projectPath(absoluteRoot, path));
  const ownershipScan = walkOwnershipFiles(absoluteRoot);
  errors.push(...ownershipScan.errors);
  const migrationCoverage = validateMigrationCoverage(
    migrationAreas,
    modules,
    ownershipScan.files,
    errors,
  );
  const compilerConfig = readCompilerOptions(absoluteRoot);
  errors.push(...compilerConfig.errors);
  const graph = buildEdges(absoluteRoot, absoluteSourceFiles, compilerConfig.options);
  errors.push(...graph.errors);
  const edges = graph.edges;
  validateDeclaredDependencies(modules, edges, errors);

  const violations = {
    missingPublicEntry: [],
    internalImport: [],
    moduleLegacyImport: [],
    runtimeCrossing: [],
    typeCycle: [],
  };

  for (const module of modules) {
    const expectedPublicEntry = `${module.root}/public.ts`;
    const absolutePublicEntry = join(absoluteRoot, expectedPublicEntry);
    if (repositoryEntryKind(absoluteRoot, expectedPublicEntry) !== 'file') {
      violations.missingPublicEntry.push({
        source: module.root,
        target: expectedPublicEntry,
        kind: 'missing-public-entry',
        module: module.id,
      });
    }
  }

  for (const edge of edges) {
    const sourceModule = moduleForPath(modules, edge.source);
    const targetModule = moduleForPath(modules, edge.target);
    const sourceSharedRuntime = sharedRuntimeForPath(sharedRoots, edge.source);
    const sourceRuntime = projectRuntimeForPath(edge.source);
    const targetRuntime = projectRuntimeForPath(edge.target);

    if (sourceRuntime && targetRuntime && sourceRuntime !== targetRuntime) {
      violations.runtimeCrossing.push(edge);
    }

    if (targetModule && sourceModule?.id !== targetModule.id && !isPublicModuleEntry(targetModule, edge.target)) {
      violations.internalImport.push(edge);
    }

    if (sourceModule && targetModule && sourceModule.id !== targetModule.id) {
      if (sourceModule.runtime !== targetModule.runtime) {
        addError(errors, 'cross-runtime-import', `${sourceModule.id} imports ${targetModule.id} across runtimes`, { edge });
      }
      if (!(sourceModule.dependencies || []).includes(targetModule.id)) {
        addError(errors, 'undeclared-module-dependency', `${sourceModule.id} must declare dependency on ${targetModule.id}`, { edge });
      }
    }

    if (sourceModule && !targetModule) {
      const allowedShared = pathBelongsToSharedRuntime(sharedRoots, sourceModule.runtime, edge.target);
      if (!allowedShared) violations.moduleLegacyImport.push(edge);
    }

    if (sourceSharedRuntime) {
      const allowedShared = pathBelongsToSharedRuntime(sharedRoots, sourceSharedRuntime, edge.target);
      if (!allowedShared) {
        addError(errors, 'shared-back-dependency', `${edge.source} imports outside ${sourceSharedRuntime} shared roots`, { edge });
      }
    }
  }

  violations.internalImport = [...new Map(violations.internalImport.map(edge => [edgeKey(edge), edge])).values()].sort(compareEdges);
  violations.moduleLegacyImport = [...new Map(violations.moduleLegacyImport.map(edge => [edgeKey(edge), edge])).values()].sort(compareEdges);
  violations.runtimeCrossing = [...new Map(violations.runtimeCrossing.map(edge => [edgeKey(edge), edge])).values()].sort(compareEdges);
  violations.missingPublicEntry.sort(compareEdges);

  const cycles = describeCycles(sourceFiles, edges);
  violations.typeCycle = cycles.typeInclusive;
  for (const cycle of cycles.runtime) {
    addError(errors, 'runtime-cycle', `runtime import cycle: ${cycle.nodes.join(' -> ')}`, { cycle });
  }

  validateExceptionGraph(config, violations, errors);

  return {
    ok: errors.length === 0,
    counts: {
      modules: configuredModules.length,
      migrationAreas: migrationAreas.length,
      sources: sourceFiles.length,
      ownershipSources: ownershipScan.files.length,
      edges: edges.length,
      orphanedMigrationSource: migrationCoverage.orphaned,
      overlappingMigrationSource: migrationCoverage.overlapping,
      missingPublicEntry: violations.missingPublicEntry.length,
      internalImport: violations.internalImport.length,
      moduleLegacyImport: violations.moduleLegacyImport.length,
      runtimeCrossing: violations.runtimeCrossing.length,
      typeCycle: cycles.typeInclusive.length,
      runtimeCycle: cycles.runtime.length,
    },
    violations,
    cycles,
    edges,
    errors,
  };
}

export function formatModuleBoundaryReport(report) {
  const { counts } = report;
  const lines = [
    `[module-boundaries] ${counts.modules} modules, ${counts.migrationAreas || 0} migration areas, ${counts.sources || 0} graph sources, ${counts.ownershipSources || 0} owned sources, ${counts.edges} resolved edges`,
    `[module-boundaries] migration coverage: orphaned=${counts.orphanedMigrationSource || 0}, overlapping=${counts.overlappingMigrationSource || 0}`,
    `[module-boundaries] exceptions: missing-public=${counts.missingPublicEntry}, internal=${counts.internalImport}, module-legacy=${counts.moduleLegacyImport}, runtime-crossing=${counts.runtimeCrossing}, type-cycles=${counts.typeCycle}`,
    `[module-boundaries] runtime cycles: ${counts.runtimeCycle}`,
  ];
  for (const error of report.errors) {
    const subject = error.violation || error.edge || error.exception;
    const detail = subject?.source && subject?.target
      ? `: ${subject.source} -> ${subject.target}${subject.kind ? ` (${subject.kind})` : ''}`
      : error.cycle?.nodes?.length
        ? `: ${error.cycle.nodes.join(' -> ')}`
        : '';
    lines.push(`  [${singleLineDisplay(error.code)}] ${singleLineDisplay(error.message)}${singleLineDisplay(detail)}`);
  }
  lines.push(report.ok ? '[module-boundaries] dependency contract passed' : '[module-boundaries] dependency contract failed');
  return lines.join('\n');
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  const args = process.argv.slice(2);
  let rootDir = process.cwd();
  let configPath = 'config/module-boundaries.json';
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--root') rootDir = args[++index];
    else if (args[index] === '--config') configPath = args[++index];
    else {
      console.error(`Unknown argument: ${singleLineDisplay(args[index])}`);
      process.exit(2);
    }
  }
  const report = analyzeModuleBoundaries({ rootDir, configPath });
  console.log(formatModuleBoundaryReport(report));
  if (!report.ok) process.exit(1);
}
