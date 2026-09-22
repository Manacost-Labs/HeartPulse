import {
  existsSync,
  globSync,
  lstatSync,
  readFileSync,
  statSync,
} from 'node:fs';
import {
  basename,
  dirname,
  join,
  resolve,
} from 'node:path';

import ts from 'typescript';

import { singleLineDisplay } from './diagnostic-text-policy.mjs';
import { compareEdges } from './module-boundary-edges.mjs';
import { isSafeRelativePath, projectPath } from './repository-path-policy.mjs';
import { extractImports } from './module-import-parser.mjs';

export function readCompilerOptions(rootDir) {
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
    errors.push({
      code: 'unresolved-import-meta-glob',
      message: 'import.meta.glob pattern must be relative, root-relative or use a configured alias',
    });
    return { targets: [], errors };
  }

  const matches = new Set();
  const applyPatterns = (patternsToApply, operation) => {
    for (const { absolutePattern } of patternsToApply) {
      const relativePattern = projectPath(rootDir, absolutePattern);
      if (relativePattern.startsWith('../') || relativePattern === '..') {
        errors.push({
          code: 'unsafe-import-meta-glob',
          message: `import.meta.glob pattern escapes the repository: ${relativePattern}`,
        });
        continue;
      }
      let found;
      try {
        found = globSync(absolutePattern);
      } catch (error) {
        errors.push({
          code: 'invalid-import-meta-glob',
          message: `invalid import.meta.glob pattern: ${error.message}`,
        });
        continue;
      }
      for (const absoluteTarget of found) {
        if (!existsSync(absoluteTarget)) continue;
        const targetStats = lstatSync(absoluteTarget);
        if (targetStats.isSymbolicLink()) {
          errors.push({
            code: 'unsafe-import-meta-glob',
            message: `import.meta.glob target must not be a symlink: ${projectPath(rootDir, absoluteTarget)}`,
          });
          continue;
        }
        if (!targetStats.isFile()) continue;
        const target = projectPath(rootDir, resolve(absoluteTarget));
        if (target.startsWith('../') || target === '..') {
          errors.push({
            code: 'unsafe-import-meta-glob',
            message: `import.meta.glob target escapes the repository: ${target}`,
          });
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

export function buildEdges(rootDir, sourceFiles, compilerOptions) {
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
          errors.push({
            code: 'unsafe-resolved-import-path',
            message: `resolved import path must be canonical and single-line: ${JSON.stringify(singleLineDisplay(target))}`,
          });
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
