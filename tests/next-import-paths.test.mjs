import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '..');
// Kept free of nested quantifiers: comments inside `import(...)` are removed
// in a second, linear pass instead of inside the matching expression.
const staticSpecifierPattern = /(?:\bfrom\s*|\bimport\s+)['"]([^'"]+)['"]/g;
const dynamicImportPattern = /\bimport\s*\(([^)]*)\)/g;

function sourceFiles(directory, pattern) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (['.next', 'node_modules', 'vendor'].includes(entry.name)) return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path, pattern);
    return pattern.test(entry.name) ? [path] : [];
  });
}

function imports(file) {
  const source = readFileSync(file, 'utf8');
  const dynamic = [...source.matchAll(dynamicImportPattern)]
    .map(match => match[1].replace(/\/\*[\s\S]*?\*\//g, '').trim().match(/^['"]([^'"]+)['"]$/)?.[1])
    .filter(Boolean);
  return [...[...source.matchAll(staticSpecifierPattern)].map(match => match[1]), ...dynamic];
}

function repositoryPath(file, specifier) {
  if (specifier.startsWith('@/')) return specifier.slice(2);
  if (!specifier.startsWith('.')) return null;
  return relative(repositoryRoot, resolve(dirname(file), specifier)).split(sep).join('/');
}

const nextSources = sourceFiles(join(repositoryRoot, 'apps/public-web'), /\.(?:ts|tsx)$/);

test('the Next app imports outside its own folder through the @/ repository alias', () => {
  const violations = nextSources.flatMap(file => imports(file)
    .filter(specifier => specifier.startsWith('../') || specifier.includes('/../'))
    .map(specifier => `${relative(repositoryRoot, file)} -> ${specifier}`));
  assert.deepEqual(violations, [], 'replace parent-relative imports with @/<repository path>');
});

test('client components never import the server-side Express client', () => {
  const violations = nextSources
    .filter(file => /^\s*['"]use client['"]/.test(readFileSync(file, 'utf8')))
    .flatMap(file => imports(file)
      .filter(specifier => repositoryPath(file, specifier)?.replace(/\.tsx?$/, '') === 'apps/public-web/lib/expressApi')
      .map(specifier => `${relative(repositoryRoot, file)} -> ${specifier}`));
  assert.deepEqual(violations, []);
});

test('the Next app reaches Express over HTTP, never through server modules', () => {
  const violations = nextSources.flatMap(file => imports(file)
    .filter(specifier => repositoryPath(file, specifier)?.startsWith('server/'))
    .map(specifier => `${relative(repositoryRoot, file)} -> ${specifier}`));
  assert.deepEqual(violations, []);
});

test('legacy, server and shared code never depend on the Next composition root', () => {
  const dependents = ['src', 'server', 'shared']
    .flatMap(root => sourceFiles(join(repositoryRoot, root), /\.(?:ts|tsx|mjs|js)$/))
    .flatMap(file => imports(file)
      .filter(specifier => repositoryPath(file, specifier)?.startsWith('apps/'))
      .map(specifier => `${relative(repositoryRoot, file)} -> ${specifier}`));
  assert.deepEqual(dependents, []);
});
